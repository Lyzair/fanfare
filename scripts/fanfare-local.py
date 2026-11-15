#!/usr/bin/env python3
"""Serve Fanfare from your own computer. No internet needed, nothing leaves this machine.

    python3 fanfare-local.py [FOLDER] [--port N] [--lan [--https]] [--open] [--forget-ca]

Python 3.9 or newer, standard library only. HTTPS for --lan needs either the `openssl`
command or the `cryptography` Python package (to create a private local certificate).
HTTPS is opt-in and asks first: it creates a local certificate authority whose key stays on
this computer (see the risks it prints). `--forget-ca` removes it again.
The server only answers GET and HEAD, never lists folders, never contacts the internet,
and logs nothing but "METHOD /path STATUS" (no addresses, no query strings).
"""
import argparse
import datetime
import hashlib
import html
import ipaddress
import os
import re
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import webbrowser
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote

HTTP_PORTS = range(8080, 8100)    # default 8080, then 8081..8099 if busy
HTTPS_PORTS = range(8443, 8464)   # default 8443, then 8444..8463 if busy

# Same policy as index.html (the page also carries it as a <meta> tag).
CSP = ("default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; "
       "media-src 'self' blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; "
       "worker-src 'self' blob:; object-src 'none'; base-uri 'self'")

CA_NAME = 'fanfare-local CA'
CA_PATH = '/fanfare-ca.crt'
TRUST_PATH = '/trust.html'
CA_DAYS = 3650
SERVER_DAYS = 825

_TEXT = '; charset=utf-8'
MIME = {
    '.html': 'text/html' + _TEXT, '.htm': 'text/html' + _TEXT, '.js': 'text/javascript' + _TEXT,
    '.mjs': 'text/javascript' + _TEXT, '.css': 'text/css' + _TEXT, '.json': 'application/json' + _TEXT,
    '.webmanifest': 'application/manifest+json' + _TEXT, '.txt': 'text/plain' + _TEXT,
    '.md': 'text/markdown' + _TEXT, '.map': 'application/json' + _TEXT, '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.ico': 'image/x-icon', '.wasm': 'application/wasm',
    '.onnx': 'application/octet-stream', '.data': 'application/octet-stream',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.zip': 'application/zip',
    '.crt': 'application/x-x509-ca-cert',
}


def guess_type(name):
    """MIME type by extension; fixed table so the result never depends on the OS registry."""
    return MIME.get(os.path.splitext(name)[1].lower(), 'application/octet-stream')


class StartError(Exception):
    """Startup problem with a message that is fit to show to the user."""


class PortError(StartError):
    pass


class CertError(StartError):
    pass


class NoBackend(CertError):
    pass


# ----------------------------------------------------------------------------- ports

def _can_bind(host, port):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        if os.name == 'nt' and hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            s.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        s.bind((host, port))
        return True
    except OSError:
        return False
    finally:
        s.close()


def pick_port(host, requested, first, last):
    """An explicit port is used as is (or fails); otherwise first..last (inclusive), first free."""
    if requested is not None:
        if requested != 0 and not _can_bind(host, requested):
            raise PortError('Port %d is already in use. Choose another one with --port, '
                            'or leave --port out to pick a free port automatically.' % requested)
        return requested
    for port in range(first, last + 1):
        if _can_bind(host, port):
            return port
    raise PortError('No free port between %d and %d. Close the program that uses them, '
                    'or choose a port with --port.' % (first, last))


# ----------------------------------------------------------------------------- network facts

def lan_ipv4s():
    """Non-loopback IPv4 addresses of this machine, the main outgoing one first."""
    found = []

    def add(ip):
        try:
            a = ipaddress.IPv4Address(ip)
        except ValueError:
            return
        if not (a.is_loopback or a.is_link_local or a.is_unspecified or a.is_multicast) and str(a) not in found:
            found.append(str(a))

    try:  # connecting a UDP socket sends no packet; it only asks the OS for the route
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))
        add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            add(info[4][0])
    except OSError:
        pass
    for cmd in (['ip', '-4', '-o', 'addr'], ['ifconfig']):
        if shutil.which(cmd[0]):
            try:
                out = subprocess.run(cmd, capture_output=True, text=True, timeout=5).stdout
                for m in re.finditer(r'\binet (\d+\.\d+\.\d+\.\d+)', out):
                    add(m.group(1))
                break
            except (OSError, subprocess.SubprocessError):
                pass
    return found


def host_names():
    names = ['localhost']
    host = socket.gethostname().strip().lower()
    if re.fullmatch(r'[a-z0-9]([a-z0-9.-]*[a-z0-9])?', host or ''):
        # only <host>.local: the CA is name-constrained and may not vouch for other names
        names.append(host if host.endswith('.local') else host.split('.')[0] + '.local')
    return list(dict.fromkeys(names))


def config_dir(platform=None, env=None, home=None):
    """Per-user folder for the local CA and keys (never inside the served folder)."""
    platform = platform or sys.platform
    env = os.environ if env is None else env
    home = home or Path.home()
    if platform.startswith('win'):
        return Path(env.get('APPDATA') or (Path(home) / 'AppData' / 'Roaming')) / 'fanfare-local'
    if platform == 'darwin':
        return Path(home) / 'Library' / 'Application Support' / 'fanfare-local'
    return Path(env.get('XDG_CONFIG_HOME') or (Path(home) / '.config')) / 'fanfare-local'


# ----------------------------------------------------------------------------- certificates

@dataclass
class Certs:
    ca_cert: Path
    ca_key: Path
    server_cert: Path
    server_key: Path
    fingerprint: str
    skipped: tuple = ()   # addresses/names left out because the CA may not vouch for them
    notices: tuple = ()   # things the user should know (e.g. CA replaced: phones must re-trust)

# The local CA is name-constrained (RFC 5280): even a stolen CA key can only vouch for
# private-network addresses, localhost and *.local.
PERMITTED_NETS = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10', '127.0.0.0/8']
PERMITTED_DNS = ['localhost', 'local']
CA_MARKER = 'ca-name-constrained-v1'


def _permitted_ip(ip):
    a = ipaddress.IPv4Address(ip)
    return any(a in ipaddress.IPv4Network(n) for n in PERMITTED_NETS)


def _permitted_dns(name):
    return any(name == d or name.endswith('.' + d) for d in PERMITTED_DNS)


def fingerprint_of(cert_path):
    der = ssl.PEM_cert_to_DER_cert(Path(cert_path).read_text(encoding='ascii'))
    h = hashlib.sha256(der).hexdigest().upper()
    return ':'.join(h[i:i + 2] for i in range(0, len(h), 2))


def available_backends():
    out = []
    if shutil.which('openssl'):
        out.append('openssl')
    try:
        import cryptography.x509  # noqa: F401
        out.append('cryptography')
    except Exception:  # missing or broken install: just not available
        pass
    return out


def _private(path):
    if os.name != 'nt':
        os.chmod(path, 0o600)


def _write_private(path, data):
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'wb') as f:
        f.write(data)
    _private(path)


def _sans(ips, names):
    """Split into (ips, names, skipped): only what the name-constrained CA is allowed to cover."""
    keep_ips, keep_names, skipped = [], [], []
    for i in ips:
        ip = str(ipaddress.IPv4Address(i))
        (keep_ips if _permitted_ip(ip) else skipped).append(ip)
    for n in names:
        n = n.lower()
        ok = re.fullmatch(r'[a-z0-9.-]+', n) and _permitted_dns(n)
        (keep_names if ok else skipped).append(n)
    return keep_ips, keep_names, skipped


def _nc_openssl():
    return 'nameConstraints=critical,' + ','.join(
        ['permitted;IP:%s/%s' % (str(n.network_address), str(n.netmask))
         for n in map(ipaddress.IPv4Network, PERMITTED_NETS)] + ['permitted;DNS:%s' % d for d in PERMITTED_DNS])


def _openssl_supports_not_before():
    """True for OpenSSL 3.4+ (`x509 -not_before`); older OpenSSL and LibreSSL lack it."""
    try:
        helptext = subprocess.run(['openssl', 'x509', '-help'], capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return False
    return '-not_before' in helptext.stdout + helptext.stderr


def _openssl_dates(days):
    """Extra x509 arguments: notBefore one day back (clock skew) with total validity <= days.
    Needs OpenSSL 3.4+; otherwise the certificate simply starts now (-days)."""
    if not _openssl_supports_not_before():
        return ['-days', str(days)]
    start = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)
    fmt = '%Y%m%d%H%M%SZ'
    return ['-not_before', start.strftime(fmt), '-not_after', (start + datetime.timedelta(days=days)).strftime(fmt)]


def _run_openssl(args, cwd):
    try:
        subprocess.run(['openssl'] + args, cwd=str(cwd), check=True, capture_output=True, timeout=120)
    except (OSError, subprocess.SubprocessError) as e:
        detail = getattr(e, 'stderr', b'') or b''
        raise CertError('openssl failed: %s %s' % (e, detail.decode('utf-8', 'replace').strip()))


def _openssl_ca(cfg):
    conf = cfg / 'ca.tmp.cnf'
    conf.write_text('[req]\ndistinguished_name=dn\nprompt=no\nx509_extensions=v3_ca\n'
                    '[dn]\nCN=%s\n[v3_ca]\nbasicConstraints=critical,CA:TRUE,pathlen:0\n'
                    'keyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n%s\n' % (CA_NAME, _nc_openssl()))
    try:
        _run_openssl(['genrsa', '-out', 'ca.key', '2048'], cfg)
        _private(cfg / 'ca.key')
        _run_openssl(['req', '-new', '-x509', '-key', 'ca.key', '-sha256', '-days', str(CA_DAYS),
                      '-config', conf.name, '-out', 'ca.crt'], cfg)
    finally:
        conf.unlink()


def _openssl_server(cfg, ips, names):
    conf = cfg / 'srv.tmp.cnf'
    alt = ['DNS.%d=%s' % (i + 1, n) for i, n in enumerate(names)] + \
          ['IP.%d=%s' % (i + 1, ip) for i, ip in enumerate(ips)]
    conf.write_text('[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=fanfare-local server\n'
                    '[v3_srv]\nbasicConstraints=critical,CA:FALSE\n'
                    'keyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n'
                    'subjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\nsubjectAltName=@alt\n'
                    '[alt]\n' + '\n'.join(alt) + '\n')
    try:
        _run_openssl(['genrsa', '-out', 'server.key', '2048'], cfg)
        _private(cfg / 'server.key')
        _run_openssl(['req', '-new', '-key', 'server.key', '-config', conf.name, '-out', 'server.tmp.csr'], cfg)
        _run_openssl(['x509', '-req', '-in', 'server.tmp.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key',
                      '-CAcreateserial', '-CAserial', 'ca.tmp.srl'] + _openssl_dates(SERVER_DAYS) + ['-sha256',
                      '-extfile', conf.name, '-extensions', 'v3_srv', '-out', 'server.crt'], cfg)
    finally:
        for name in (conf.name, 'server.tmp.csr', 'ca.tmp.srl'):
            (cfg / name).unlink(missing_ok=True)


def _crypto_ca(cfg):
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, CA_NAME)])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=CA_DAYS))
            .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
            .add_extension(x509.KeyUsage(digital_signature=False, content_commitment=False, key_encipherment=False,
                                         data_encipherment=False, key_agreement=False, key_cert_sign=True,
                                         crl_sign=True, encipher_only=False, decipher_only=False), critical=True)
            .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
            .add_extension(x509.NameConstraints(
                permitted_subtrees=[x509.IPAddress(ipaddress.IPv4Network(n)) for n in PERMITTED_NETS]
                + [x509.DNSName(d) for d in PERMITTED_DNS], excluded_subtrees=None), critical=True)
            .sign(key, hashes.SHA256()))
    _write_private(cfg / 'ca.key', key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    (cfg / 'ca.crt').write_bytes(cert.public_bytes(serialization.Encoding.PEM))


def _crypto_server(cfg, ips, names):
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
    ca_cert = x509.load_pem_x509_certificate((cfg / 'ca.crt').read_bytes())
    ca_key = serialization.load_pem_private_key((cfg / 'ca.key').read_bytes(), password=None)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    not_before = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)
    sans = [x509.DNSName(n) for n in names] + [x509.IPAddress(ipaddress.IPv4Address(i)) for i in ips]
    cert = (x509.CertificateBuilder()
            .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'fanfare-local server')]))
            .issuer_name(ca_cert.subject).public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(not_before)
            .not_valid_after(not_before + datetime.timedelta(days=SERVER_DAYS))  # Apple: <= 825 days in total
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(x509.KeyUsage(digital_signature=True, content_commitment=False, key_encipherment=True,
                                         data_encipherment=False, key_agreement=False, key_cert_sign=False,
                                         crl_sign=False, encipher_only=False, decipher_only=False), critical=True)
            .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
            .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
            .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
            .add_extension(x509.SubjectAlternativeName(sans), critical=False)
            .sign(ca_key, hashes.SHA256()))
    _write_private(cfg / 'server.key', key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    (cfg / 'server.crt').write_bytes(cert.public_bytes(serialization.Encoding.PEM))


BACKENDS = {'openssl': (_openssl_ca, _openssl_server), 'cryptography': (_crypto_ca, _crypto_server)}


def _age_days(path):
    return (datetime.datetime.now().timestamp() - path.stat().st_mtime) / 86400


def ensure_certs(cfg, ips, names, backend=None):
    """Create (or reuse) the local CA and a server certificate whose SANs match ips + names.

    The CA is created once. The server certificate is regenerated when the address list
    changes or it gets old. All files live in `cfg` (a private per-user folder).
    """
    if backend is None:
        found = available_backends()
        if not found:
            raise NoBackend('neither the openssl command nor the cryptography package is available')
        backend = found[0]
    make_ca, make_server = BACKENDS[backend]
    cfg = Path(cfg)
    ips, names, skipped = _sans(ips, names)
    notices = []
    old_umask = os.umask(0o077) if os.name != 'nt' else None
    try:
        cfg.mkdir(parents=True, exist_ok=True)
        if os.name != 'nt':
            os.chmod(cfg, 0o700)
        ca_crt, ca_key = cfg / 'ca.crt', cfg / 'ca.key'
        marker = cfg / 'ca.marker'
        had_ca = ca_crt.exists() and ca_key.exists()
        unconstrained = had_ca and (not marker.exists() or marker.read_text().strip() != CA_MARKER)
        new_ca = not had_ca or unconstrained or _age_days(ca_crt) > CA_DAYS - 365
        if new_ca:
            make_ca(cfg)
            marker.write_text(CA_MARKER + '\n')
            if had_ca:
                notices.append('The local CA was replaced (%s). Phones must open /trust.html again to trust the new one; '
                               'remove the old "fanfare-local CA" from their settings.'
                               % ('it had no name constraints' if unconstrained else 'it was about to expire'))
        wanted = '\n'.join(['ip:' + i for i in ips] + ['dns:' + n for n in names]) + '\n'
        san_file, srv_crt, srv_key = cfg / 'san.txt', cfg / 'server.crt', cfg / 'server.key'
        stale = (new_ca or not (srv_crt.exists() and srv_key.exists()) or not san_file.exists()
                 or san_file.read_text() != wanted or _age_days(srv_crt) > SERVER_DAYS - 125)
        if stale:
            make_server(cfg, ips, names)
            san_file.write_text(wanted)
    finally:
        if old_umask is not None:
            os.umask(old_umask)
    return Certs(ca_crt, ca_key, srv_crt, srv_key, fingerprint_of(ca_crt), tuple(skipped), tuple(notices))


# ----------------------------------------------------------------------------- risks, opt-in, removal

RISKS = {
    'en': [
        "Phones that trust this certificate trust everything signed with this laptop's key. Thanks to name constraints "
        "this is limited to local network addresses, but that includes routers, NAS drives and smart-home devices on that Wi-Fi.",
        "The key is stored unencrypted on this computer. Anyone with access to this computer or user account could create "
        "fake certificates for local devices. Only use this on a computer you trust.",
        "Remove it when you no longer need it: run start-fanfare with --forget-ca on the laptop (or: python3 fanfare-local.py "
        "--forget-ca), and remove the certificate on each phone (Android: Settings > Security > Encryption & credentials > "
        "User credentials; iPhone: Settings > General > VPN & Device Management > profile > Remove).",
        "Without HTTPS, Fanfare still works over Wi-Fi, but phones can't use offline mode or the microphone.",
        "Simpler alternatives: the online demo on the phone, or Fanfare directly on the laptop with the speakers. "
        "No certificate is needed for those.",
    ],
    'de': [
        "Handys, die diesem Zertifikat vertrauen, vertrauen allem, was mit dem Schlüssel dieses Laptops signiert wird. Durch "
        "Namensbeschränkungen gilt das nur für Adressen im lokalen Netz, aber dazu gehören Router, NAS-Laufwerke und "
        "Smart-Home-Geräte in diesem WLAN.",
        "Der Schlüssel liegt unverschlüsselt auf diesem Computer. Wer Zugriff auf diesen Computer oder dieses Benutzerkonto "
        "hat, könnte gefälschte Zertifikate für lokale Geräte erstellen. Nutze das nur auf einem Computer, dem du vertraust.",
        "Entferne es, wenn du es nicht mehr brauchst: start-fanfare mit --forget-ca auf dem Laptop starten (oder: python3 "
        "fanfare-local.py --forget-ca) und das Zertifikat auf jedem Handy löschen (Android: Einstellungen > Sicherheit > "
        "Verschlüsselung und Anmeldedaten > Nutzerzertifikate; iPhone: Einstellungen > Allgemein > VPN und Geräteverwaltung "
        "> Profil > Entfernen).",
        "Ohne HTTPS funktioniert Fanfare im WLAN trotzdem, aber Handys können weder den Offline-Modus noch das Mikrofon nutzen.",
        "Einfachere Alternativen: die Online-Demo auf dem Handy oder Fanfare direkt auf dem Laptop mit den Lautsprechern. "
        "Dafür ist kein Zertifikat nötig.",
    ],
}
REMOVAL = {
    'en': "Remove it later. Android: Settings > Security > Encryption & credentials > User credentials > fanfare-local CA > "
          "Remove. iPhone: Settings > General > VPN & Device Management > fanfare-local CA > Remove Profile. "
          "Laptop: run start-fanfare with --forget-ca.",
    'de': "Später entfernen. Android: Einstellungen > Sicherheit > Verschlüsselung und Anmeldedaten > Nutzerzertifikate > "
          "fanfare-local CA > Entfernen. iPhone: Einstellungen > Allgemein > VPN und Geräteverwaltung > fanfare-local CA > "
          "Profil entfernen. Laptop: start-fanfare mit --forget-ca starten.",
}
CA_FILES = ['ca.crt', 'ca.key', 'ca.marker', 'san.txt', 'server.crt', 'server.key']


def ca_is_current(cfg):
    """True when a CA with the current name constraints already exists (no new CA is created)."""
    cfg = Path(cfg)
    marker = cfg / 'ca.marker'
    return (cfg / 'ca.crt').exists() and (cfg / 'ca.key').exists() and marker.exists() \
        and marker.read_text().strip() == CA_MARKER


def _yes(ask, prompt):
    try:
        return ask(prompt).strip().lower() == 'yes'
    except EOFError:
        return False


def confirm_new_ca(accept_risk, out, ask, interactive):
    """Creating the CA needs an explicit yes (or --accept-ca-risk when there is no terminal)."""
    out('You asked for HTTPS. That needs a local certificate authority (CA) on this computer. Read this first:')
    for i, text in enumerate(RISKS['en'], 1):
        out('  %d. %s' % (i, text))
    if accept_risk:
        out('  --accept-ca-risk given: creating the certificate authority.')
        return True
    if not interactive:
        out('No terminal to ask on, so no certificate authority was created. Using plain http. '
            'To accept the risks, add --accept-ca-risk.')
        return False
    if _yes(ask, 'Type yes to create a local certificate authority: '):
        return True
    out('No certificate authority was created. Using plain http.')
    return False


def forget_ca(cfg, yes, out, ask, interactive):
    """Delete the CA, the server certificate and all keys from the config folder."""
    cfg = Path(cfg)
    present = [n for n in CA_FILES if (cfg / n).exists()]
    if not present:
        out('No local certificate authority found in %s. Nothing to remove.' % cfg)
        return False
    if not yes:
        if not interactive:
            raise StartError('This deletes the local certificate authority and keys in %s. Add --yes to confirm.' % cfg)
        out('This deletes the local certificate authority and the keys in %s.' % cfg)
        if not _yes(ask, 'Type yes to delete them: '):
            out('Nothing was deleted.')
            return False
    for n in present:
        (cfg / n).unlink()
    try:
        cfg.rmdir()
    except OSError:
        pass
    out('Deleted the local certificate authority and keys. Now remove the certificate on each phone:')
    out('  ' + REMOVAL['en'])
    return True


# ----------------------------------------------------------------------------- trust page

def trust_page(fingerprint, csp=CSP):
    fp = fingerprint
    return ('''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="%(csp)s">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fanfare: trust this laptop</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.55;max-width:42rem;margin:0 auto;padding:16px;color:#1a1a1a;background:#fff}
h1{font-size:1.5rem}h2{font-size:1.2rem;margin-top:2rem;border-top:1px solid #ccc;padding-top:1rem}
code{word-break:break-all;font-family:ui-monospace,Menlo,Consolas,monospace}
.btn{display:inline-block;padding:.7em 1.2em;background:#1b6e3c;color:#fff;border-radius:8px;text-decoration:none;font-weight:700}
.fp{padding:.6em;background:#eef3ee;border-radius:6px}
@media (prefers-color-scheme:dark){body{background:#151515;color:#ececec}h2{border-color:#444}.fp{background:#232b24}}
</style></head><body>
<h1>Fanfare: trust this laptop</h1>
<p>This laptop uses its own private certificate, so your phone can open Fanfare safely over Wi-Fi. Install it once. Then offline mode and the microphone work.</p>
<p><a class="btn" href="/fanfare-ca.crt">Download certificate</a></p>
<p>Fingerprint (SHA-256). It must match the one shown in the laptop's terminal:</p>
<p class="fp"><code>%(fp)s</code></p>
<h2>Read this first</h2>
<ul>%(risks_en)s</ul>
<h2>Android</h2>
<ol><li>Tap <b>Download certificate</b> above.</li>
<li>Open <b>Settings</b>, then <b>Security</b> (or <b>Security and privacy</b>), then <b>More security settings</b>, then <b>Encryption and credentials</b>.</li>
<li>Tap <b>Install a certificate</b>, then <b>CA certificate</b>, confirm the warning, and pick the downloaded file <code>fanfare-ca.crt</code>.</li>
<li>Reload Fanfare in Chrome.</li></ol>
<h2>iPhone / iPad (iOS)</h2>
<ol><li>Open this page in <b>Safari</b> and tap <b>Download certificate</b>. Allow the download.</li>
<li>Open <b>Settings</b>, tap <b>Profile Downloaded</b> (or <b>General, VPN &amp; Device Management</b>), choose <b>fanfare-local CA</b>, tap <b>Install</b>.</li>
<li>Open <b>Settings, General, About, Certificate Trust Settings</b> and switch on full trust for <b>fanfare-local CA</b>.</li>
<li>Reload Fanfare in Safari.</li></ol>
<p>Only install this if the fingerprint above matches your laptop.</p>
<h2>Remove it</h2>
<p>%(remove_en)s</p>

<h1 lang="de">Fanfare: Diesem Laptop vertrauen</h1>
<p lang="de">Dieser Laptop nutzt sein eigenes privates Zertifikat, damit dein Handy Fanfare im WLAN sicher öffnen kann. Installiere es einmal. Danach funktionieren der Offline-Modus und das Mikrofon.</p>
<p lang="de"><a class="btn" href="/fanfare-ca.crt">Zertifikat herunterladen</a></p>
<p lang="de">Fingerabdruck (SHA-256). Er muss mit dem im Terminal des Laptops übereinstimmen:</p>
<p class="fp"><code>%(fp)s</code></p>
<h2 lang="de">Bitte zuerst lesen</h2>
<ul lang="de">%(risks_de)s</ul>
<h2 lang="de">Android</h2>
<ol lang="de"><li>Tippe oben auf <b>Zertifikat herunterladen</b>.</li>
<li>Öffne <b>Einstellungen</b>, dann <b>Sicherheit</b> (oder <b>Sicherheit und Datenschutz</b>), <b>Weitere Sicherheitseinstellungen</b>, <b>Verschlüsselung und Anmeldedaten</b>.</li>
<li>Tippe auf <b>Zertifikat installieren</b>, dann <b>CA-Zertifikat</b>, bestätige die Warnung und wähle die Datei <code>fanfare-ca.crt</code>.</li>
<li>Lade Fanfare in Chrome neu.</li></ol>
<h2 lang="de">iPhone / iPad (iOS)</h2>
<ol lang="de"><li>Öffne diese Seite in <b>Safari</b> und tippe auf <b>Zertifikat herunterladen</b>. Erlaube den Download.</li>
<li>Öffne <b>Einstellungen</b>, tippe auf <b>Profil geladen</b> (oder <b>Allgemein, VPN und Geräteverwaltung</b>), wähle <b>fanfare-local CA</b> und tippe auf <b>Installieren</b>.</li>
<li>Öffne <b>Einstellungen, Allgemein, Info, Zertifikatsvertrauenseinstellungen</b> und aktiviere das volle Vertrauen für <b>fanfare-local CA</b>.</li>
<li>Lade Fanfare in Safari neu.</li></ol>
<p lang="de">Installiere das nur, wenn der Fingerabdruck oben zu deinem Laptop passt.</p>
<h2 lang="de">Entfernen</h2>
<p lang="de">%(remove_de)s</p>
</body></html>
''' % {'csp': csp, 'fp': fp,
          'risks_en': ''.join('<li>%s</li>' % html.escape(t) for t in RISKS['en']),
          'risks_de': ''.join('<li>%s</li>' % html.escape(t) for t in RISKS['de']),
          'remove_en': html.escape(REMOVAL['en']), 'remove_de': html.escape(REMOVAL['de'])}).encode('utf-8')


# ----------------------------------------------------------------------------- server

class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    timeout = 30
    server_version = 'fanfare-local'
    sys_version = ''

    def handle_one_request(self):
        if isinstance(self.request, ssl.SSLSocket) and not getattr(self, '_hs', False):
            self._hs = True
            self.request.settimeout(self.timeout)
            self.request.do_handshake()
        super().handle_one_request()

    # privacy: the only thing ever logged is "METHOD /path STATUS"
    def log_message(self, *args):
        pass

    def log_request(self, code='-', size='-'):
        path = re.sub(r'[\x00-\x1f\x7f]', '', self.path.split('?', 1)[0].split('#', 1)[0])[:200]
        method = re.sub(r'[^A-Z]', '', (self.command or '')[:10])
        self.server.log('%s %s %s' % (method, path, code))

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', self.server.csp)
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def _reply(self, status, body=b'', ctype='text/plain; charset=utf-8', headers=(), head=False):
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        for k, v in headers:
            self.send_header(k, v)
        self.end_headers()
        if not head:
            self.wfile.write(body)

    def _method_not_allowed(self):
        self._reply(405, b'Method not allowed\n', headers=[('Allow', 'GET, HEAD')])

    def __getattr__(self, name):
        # every method other than GET/HEAD (even unknown ones like PROPFIND) -> 405, not the base class's 501
        if name.startswith('do_'):
            return self._method_not_allowed
        raise AttributeError(name)

    def do_GET(self):
        self._serve(head=False)

    def do_HEAD(self):
        self._serve(head=True)

    def _segments(self):
        """URL path -> safe list of segments, or None when it tries to escape or is malformed."""
        raw = self.path.split('?', 1)[0].split('#', 1)[0]
        if not raw.startswith('/'):
            return None
        path = unquote(raw, errors='strict')
        if '\x00' in path or '\\' in path:
            return None
        segs = [s for s in path.split('/') if s not in ('', '.')]
        if any(s == '..' or ':' in s for s in segs):
            return None
        return segs

    def _serve(self, head):
        try:
            segs = self._segments()
        except UnicodeDecodeError:
            segs = None
        if segs is None:
            return self._reply(400, b'Bad request\n', head=head)
        url = '/' + '/'.join(segs)
        if url in (CA_PATH, TRUST_PATH):
            extra = self.server.extras.get(url)
            if extra is None:  # only served over HTTPS
                return self._reply(404, b'Not found\n', head=head)
            return self._reply(200, extra[1], extra[0], head=head)
        if url.lower().endswith('.key'):
            return self._reply(404, b'Not found\n', head=head)
        root = self.server.root
        target = os.path.realpath(os.path.join(root, *segs))
        if os.path.normcase(os.path.commonpath([root, target])) != os.path.normcase(root):
            return self._reply(404, b'Not found\n', head=head)
        if os.path.isdir(target):
            index = os.path.join(target, 'index.html')
            if not os.path.isfile(index):
                return self._reply(404, b'Not found\n', head=head)
            if not self.path.split('?', 1)[0].endswith('/') and segs:
                return self._reply(301, b'', headers=[('Location', quote(url) + '/')], head=head)
            target = index
        if not os.path.isfile(target):
            return self._reply(404, b'Not found\n', head=head)
        try:
            with open(target, 'rb') as f:
                size = os.fstat(f.fileno()).st_size
                self.send_response(200)
                self.send_header('Content-Type', guess_type(target))
                self.send_header('Content-Length', str(size))
                self.end_headers()
                if not head:
                    shutil.copyfileobj(f, self.wfile, 256 * 1024)
        except OSError:  # unreadable file, or the client went away mid-transfer
            self.close_connection = True


class FanfareServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = os.name != 'nt'

    def __init__(self, address, root, log=None, extras=None, ssl_context=None):
        self.root = os.path.realpath(root)
        self.csp = CSP
        self.extras = extras or {}
        self.ssl_context = ssl_context
        self.log = log or (lambda message: print(message, flush=True))
        super().__init__(address, Handler)

    def get_request(self):
        sock, addr = super().get_request()
        if self.ssl_context is not None:  # handshake happens in the handler thread, not here
            sock = self.ssl_context.wrap_socket(sock, server_side=True, do_handshake_on_connect=False)
        return sock, addr

    def handle_error(self, request, client_address):
        pass  # the default prints the client's address; failed handshakes are routine


class Running:
    def __init__(self, primary, scheme, urls, fingerprint=None, loopback=None, local_url=None):
        self.primary, self.scheme, self.urls = primary, scheme, urls
        self.fingerprint, self.loopback, self.local_url = fingerprint, loopback, local_url
        self._threads = []
        self._serving = []

    def _servers(self):
        return [s for s in (self.primary, self.loopback) if s is not None]

    def _thread(self, server):
        t = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': 0.1}, daemon=True)
        self._serving.append(server)
        t.start()
        self._threads.append(t)

    def serve_in_threads(self):
        for s in self._servers():
            self._thread(s)

    def serve_forever(self):
        if self.loopback is not None:
            self._thread(self.loopback)
        self._serving.append(self.primary)
        try:
            self.primary.serve_forever(poll_interval=0.2)
        except KeyboardInterrupt:
            pass
        finally:
            self.close()

    def close(self):
        for s in self._servers():
            if s in self._serving:
                s.shutdown()
            s.server_close()
        self._serving = []


def _parser():
    p = argparse.ArgumentParser(prog='fanfare-local.py', description='Serve Fanfare from this computer, offline.')
    p.add_argument('folder', nargs='?', help='folder to serve (default: the folder this script is in)')
    p.add_argument('--port', type=int, help='port (default 8080, or 8443 with HTTPS; a busy default moves on to the next free port)')
    p.add_argument('--lan', action='store_true', help='also reachable from phones on the same Wi-Fi (plain http)')
    p.add_argument('--https', action='store_true',
                   help='with --lan: serve HTTPS with a local certificate authority (asks first; phones then work offline '
                        'and can use the microphone; read the risks it prints)')
    p.add_argument('--http', action='store_true', help=argparse.SUPPRESS)  # old name for the default, still accepted
    p.add_argument('--accept-ca-risk', action='store_true',
                   help='with --https: create the certificate authority without asking (for scripts / no terminal)')
    p.add_argument('--forget-ca', action='store_true',
                   help='delete the local certificate authority and keys from this computer, then exit')
    p.add_argument('--yes', action='store_true', help='with --forget-ca: do not ask for confirmation')
    p.add_argument('--open', action='store_true', help='open the browser')
    p.add_argument('--config-dir', help='where the local CA and keys are kept (default: your user config folder)')
    return p


def say(message):
    print(message, flush=True)  # flushed so wrappers and pipes see it immediately


def start(argv, out=say, ask=input, interactive=None):
    args = _parser().parse_args(argv)
    if interactive is None:
        interactive = bool(sys.stdin and sys.stdin.isatty())
    if args.https and not args.lan:
        raise StartError('--https only makes sense together with --lan.')
    if args.https and args.http:
        raise StartError('Choose either --https or --http, not both.')
    root = Path(args.folder).resolve() if args.folder else Path(__file__).resolve().parent
    if not root.is_dir():
        raise StartError('Folder not found: %s' % root)
    cfg = Path(args.config_dir).resolve() if args.config_dir else config_dir()
    if cfg == root or root in cfg.parents:
        raise StartError('The certificate folder must not be inside the served folder (%s).' % cfg)

    if args.forget_ca:
        forget_ca(cfg, args.yes, out, ask, interactive)
        return None

    host = '0.0.0.0' if args.lan else '127.0.0.1'
    https = args.lan and args.https
    certs = None
    ips = lan_ipv4s() if args.lan else []
    if https:
        if not available_backends():
            out('HTTPS is not available: neither the "openssl" command nor the Python package "cryptography" was found.\n'
                '  To get HTTPS for phones, install OpenSSL, or run: pip install cryptography\n'
                '  Falling back to plain http for now.')
            https = False
        elif not ca_is_current(cfg) and not confirm_new_ca(args.accept_ca_risk, out, ask, interactive):
            https = False
        else:
            if ca_is_current(cfg):
                out('Using the local certificate authority in %s. Remove it any time with: '
                    'start-fanfare --forget-ca (or: python3 fanfare-local.py --forget-ca)' % cfg)
            certs = ensure_certs(cfg, ips, host_names())
            for note in certs.notices:
                out('NOTICE: ' + note)
            if certs.skipped:
                out('Left out of the certificate (outside private/local ranges, which the local CA is limited to): '
                    + ', '.join(certs.skipped))
    first, last = (HTTPS_PORTS if https else HTTP_PORTS)[0], (HTTPS_PORTS if https else HTTP_PORTS)[-1]
    port = pick_port(host, args.port, first, last)

    extras, ctx = {}, None
    if https:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2
        ctx.load_cert_chain(str(certs.server_cert), str(certs.server_key))
        extras = {CA_PATH: (guess_type('x.crt'), certs.ca_cert.read_bytes()),
                  TRUST_PATH: ('text/html; charset=utf-8', trust_page(certs.fingerprint))}
    try:
        server = FanfareServer((host, port), root, out, extras, ctx)
    except OSError as e:
        raise PortError('Could not start on port %d: %s' % (port, e.strerror or e))
    port = server.server_address[1]
    scheme = 'https' if https else 'http'

    loopback = None
    local_url = '%s://localhost:%d' % (scheme, port)
    if https:  # the laptop itself uses plain http on localhost: a secure context without any certificate prompt
        try:
            loopback = FanfareServer(('127.0.0.1', pick_port('127.0.0.1', None, HTTP_PORTS[0], HTTP_PORTS[-1])), root, out)
            local_url = 'http://localhost:%d' % loopback.server_address[1]
        except OSError:
            loopback = None
        except StartError:
            loopback = None

    urls = ['%s://%s:%d' % (scheme, ip, port) for ip in ips] if args.lan else []
    out('Fanfare is running. Serving %s' % root)
    out('  This computer:  %s' % local_url)
    if args.lan:
        if urls:
            out('  Phones/tablets: %s' % urls[0])
            for extra in urls[1:]:
                out('                  %s  (other network)' % extra)
        else:
            out('  No network address found. Is this computer connected to Wi-Fi?')
        if https:
            out('  SHA-256 of the local CA: %s' % certs.fingerprint)
            if urls:
                out('  Phones: open %s/trust.html once to trust this laptop (needed for offline mode and the microphone)' % urls[0])
        else:
            out('  Note: over plain http, phones cannot use offline mode (the service worker needs https), '
                'and the microphone is blocked. For HTTPS add --https (it explains the risks and asks first).')
    out('  Stop with Ctrl+C.')
    running = Running(server, scheme, urls, certs.fingerprint if certs else None, loopback, local_url)
    if args.open:
        webbrowser.open(local_url)
    return running


def main(argv=None):
    try:
        running = start(sys.argv[1:] if argv is None else argv)
    except StartError as e:
        sys.stderr.write('Error: %s\n' % e)
        return 2
    if running is None:  # --forget-ca
        return 0
    running.serve_forever()
    return 0


if __name__ == '__main__':
    sys.exit(main())
