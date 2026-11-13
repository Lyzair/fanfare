"""Unit tests for scripts/fanfare-local.py (stdlib unittest, Python >= 3.9)."""
import http.client
import importlib.util
import os
import re
import socket
import ssl
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location('fanfare_local', REPO / 'scripts' / 'fanfare-local.py')
fl = importlib.util.module_from_spec(_spec)
sys.modules['fanfare_local'] = fl
_spec.loader.exec_module(fl)

LAN_IP = '192.168.1.23'
HOSTS = ['localhost', 'testhost', 'testhost.local']


def index_csp():
    html = (REPO / 'index.html').read_text(encoding='utf-8')
    return re.search(r'http-equiv="Content-Security-Policy"\s+content="([^"]+)"', html).group(1)


class TempDirCase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        base = Path(self._tmp.name)
        self.root = base / 'site'
        self.root.mkdir()
        self.cfg = base / 'config'
        (self.root / 'index.html').write_text('<h1>hello</h1>', encoding='utf-8')
        (self.root / 'a.txt').write_text('A', encoding='utf-8')
        (self.root / 'sub').mkdir()
        (self.root / 'sub' / 'secret-listing-name.dat').write_bytes(b'x')
        (base / 'outside.txt').write_text('OUTSIDE', encoding='utf-8')
        self.logs = []

    def run_server(self, *args, lan_ips=(LAN_IP,)):
        argv = [str(self.root), '--config-dir', str(self.cfg), *args]
        with mock.patch.object(fl, 'lan_ipv4s', return_value=list(lan_ips)), \
                mock.patch.object(fl, 'host_names', return_value=list(HOSTS)):
            running = fl.start(argv, out=self.logs.append)
        running.serve_in_threads()
        self.addCleanup(running.close)
        return running

    def get(self, running, path, method='GET', https=False, **kw):
        port = running.primary.server_address[1]
        if https:
            ctx = ssl.create_default_context(cafile=str(self.cfg / 'ca.crt'))
            conn = http.client.HTTPSConnection('localhost', port, context=ctx, timeout=10)
        else:
            conn = http.client.HTTPConnection('127.0.0.1', port, timeout=10)
        conn.putrequest(method, path, skip_host=False)
        conn.endheaders()
        resp = conn.getresponse()
        body = resp.read()
        conn.close()
        return resp, body


class MimeTests(unittest.TestCase):
    def test_required_types(self):
        t = fl.guess_type
        self.assertTrue(t('x.js').startswith('text/javascript'))
        self.assertTrue(t('x.mjs').startswith('text/javascript'))
        self.assertEqual(t('x.wasm'), 'application/wasm')
        self.assertEqual(t('x.onnx'), 'application/octet-stream')
        self.assertEqual(t('x.data'), 'application/octet-stream')
        self.assertIn('manifest', t('manifest.webmanifest'))
        self.assertTrue(t('index.html').startswith('text/html'))
        self.assertEqual(t('fanfare-ca.crt'), 'application/x-x509-ca-cert')
        self.assertEqual(t('mystery.zzz'), 'application/octet-stream')


class PortTests(unittest.TestCase):
    def busy(self):
        s = socket.socket()
        s.bind(('127.0.0.1', 0))
        s.listen(1)
        self.addCleanup(s.close)
        return s.getsockname()[1]

    def test_free_default_is_used(self):
        s = socket.socket()
        s.bind(('127.0.0.1', 0))
        port = s.getsockname()[1]
        s.close()
        self.assertEqual(fl.pick_port('127.0.0.1', None, port, port + 5), port)

    def test_busy_default_falls_back_to_next(self):
        port = self.busy()
        chosen = fl.pick_port('127.0.0.1', None, port, port + 30)
        self.assertGreater(chosen, port)

    def test_explicit_busy_port_fails_without_fallback(self):
        port = self.busy()
        with self.assertRaises(fl.PortError) as cm:
            fl.pick_port('127.0.0.1', port, 8080, 8099)
        self.assertIn(str(port), str(cm.exception))

    def test_all_busy_in_range_fails(self):
        port = self.busy()
        with self.assertRaises(fl.PortError):
            fl.pick_port('127.0.0.1', None, port, port)

    def test_defaults_match_rulings(self):
        self.assertEqual((fl.HTTP_PORTS.start, fl.HTTP_PORTS.stop - 1), (8080, 8099))
        self.assertEqual((fl.HTTPS_PORTS.start, fl.HTTPS_PORTS.stop - 1), (8443, 8463))


class ConfigDirTests(unittest.TestCase):
    def test_per_platform(self):
        self.assertEqual(fl.config_dir('linux', {}, Path('/home/u')), Path('/home/u/.config/fanfare-local'))
        self.assertEqual(fl.config_dir('linux', {'XDG_CONFIG_HOME': '/x'}, Path('/home/u')), Path('/x/fanfare-local'))
        self.assertEqual(fl.config_dir('darwin', {}, Path('/Users/u')),
                         Path('/Users/u/Library/Application Support/fanfare-local'))
        self.assertEqual(fl.config_dir('win32', {'APPDATA': 'C:\\A'}, Path('C:\\u')), Path('C:\\A') / 'fanfare-local')


class HttpServerTests(TempDirCase):
    def test_default_bind_is_loopback(self):
        r = self.run_server('--port', '0')
        self.assertEqual(r.primary.server_address[0], '127.0.0.1')
        self.assertEqual(r.scheme, 'http')

    def test_lan_http_binds_all_interfaces_and_warns(self):
        r = self.run_server('--lan', '--http', '--port', '0')
        self.assertEqual(r.primary.server_address[0], '0.0.0.0')
        text = '\n'.join(self.logs)
        self.assertIn(LAN_IP, text)
        self.assertIn('offline', text.lower())

    def test_serves_index_and_files_with_headers(self):
        r = self.run_server('--port', '0')
        resp, body = self.get(r, '/')
        self.assertEqual((resp.status, body), (200, b'<h1>hello</h1>'))
        self.assertTrue(resp.getheader('Content-Type').startswith('text/html'))
        self.assertEqual(resp.getheader('X-Content-Type-Options'), 'nosniff')
        self.assertEqual(resp.getheader('Content-Security-Policy'), index_csp())
        resp, body = self.get(r, '/a.txt?x=1')
        self.assertEqual((resp.status, body), (200, b'A'))

    def test_head_has_no_body(self):
        r = self.run_server('--port', '0')
        resp, body = self.get(r, '/a.txt', method='HEAD')
        self.assertEqual((resp.status, body), (200, b''))
        self.assertEqual(resp.getheader('Content-Length'), '1')

    def test_directory_redirect_and_no_listing(self):
        r = self.run_server('--port', '0')
        resp, _ = self.get(r, '/sub')
        self.assertEqual(resp.status, 404)
        resp, body = self.get(r, '/sub/')
        self.assertEqual(resp.status, 404)
        self.assertNotIn(b'secret-listing-name', body)
        (self.root / 'sub' / 'index.html').write_text('sub', encoding='utf-8')
        resp, _ = self.get(r, '/sub')
        self.assertEqual(resp.status, 301)
        self.assertEqual(resp.getheader('Location'), '/sub/')

    def test_path_traversal_rejected(self):
        r = self.run_server('--port', '0')
        for p in ['/../outside.txt', '/%2e%2e/outside.txt', '/%2E%2E%2foutside.txt', '/sub/../../outside.txt',
                  '/..%5coutside.txt', '/sub/%2e%2e/%2e%2e/outside.txt', '//etc/passwd', '/%00', '/C:/Windows/win.ini']:
            resp, body = self.get(r, p)
            self.assertIn(resp.status, (400, 403, 404), p)
            self.assertNotIn(b'OUTSIDE', body, p)

    def test_open_redirect_impossible(self):
        (self.root / 'sub' / 'index.html').write_text('sub', encoding='utf-8')
        r = self.run_server('--port', '0')
        resp, _ = self.get(r, '//sub')
        loc = resp.getheader('Location')
        if loc is not None:
            self.assertFalse(loc.startswith('//'), loc)

    @unittest.skipIf(os.name == 'nt', 'symlinks need privileges on Windows')
    def test_symlink_escaping_root_rejected(self):
        os.symlink(self.root.parent / 'outside.txt', self.root / 'link.txt')
        r = self.run_server('--port', '0')
        resp, body = self.get(r, '/link.txt')
        self.assertEqual(resp.status, 404)
        self.assertNotIn(b'OUTSIDE', body)

    def test_only_get_and_head(self):
        r = self.run_server('--port', '0')
        for m in ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']:
            resp, _ = self.get(r, '/a.txt', method=m)
            self.assertEqual(resp.status, 405, m)
            self.assertEqual(resp.getheader('Allow'), 'GET, HEAD')

    def test_log_only_method_path_status(self):
        lines = []
        r = self.run_server('--port', '0')
        r.primary.log = lines.append
        self.get(r, '/a.txt?secret=1')
        self.get(r, '/missing')
        self.assertEqual(lines, ['GET /a.txt 200', 'GET /missing 404'])

    def test_trust_files_not_served_over_http(self):
        r = self.run_server('--port', '0')
        for p in ['/fanfare-ca.crt', '/trust.html']:
            resp, _ = self.get(r, p)
            self.assertEqual(resp.status, 404, p)

    def test_config_dir_inside_served_root_refused(self):
        with self.assertRaises(fl.StartError):
            fl.start([str(self.root), '--config-dir', str(self.root / 'cfg'), '--port', '0'], out=print)

    def test_missing_root_refused(self):
        with self.assertRaises(fl.StartError):
            fl.start([str(self.root / 'nope'), '--port', '0'], out=print)

    def test_explicit_busy_port_raises(self):
        s = socket.socket()
        s.bind(('127.0.0.1', 0))
        s.listen(1)
        self.addCleanup(s.close)
        with self.assertRaises(fl.PortError):
            fl.start([str(self.root), '--port', str(s.getsockname()[1])], out=print)


class FallbackTests(TempDirCase):
    def test_lan_without_backend_falls_back_to_http(self):
        with mock.patch.object(fl, 'available_backends', return_value=[]):
            r = self.run_server('--lan', '--port', '0')
        self.assertEqual(r.scheme, 'http')
        text = '\n'.join(self.logs)
        self.assertIn('openssl', text.lower())
        self.assertIn('cryptography', text.lower())
        self.assertFalse(self.cfg.exists())


BACKENDS = fl.available_backends()


class CertTests(TempDirCase):
    def test_at_least_one_backend_on_this_machine(self):
        self.assertTrue(BACKENDS, 'install openssl or the cryptography package to run the TLS tests')

    def test_each_backend_generates_a_working_chain(self):
        ran = 0
        for name in ['openssl', 'cryptography']:
            if name not in BACKENDS:
                continue
            ran += 1
            with self.subTest(backend=name):
                cfg = Path(self._tmp.name) / ('cfg-' + name)
                certs = fl.ensure_certs(cfg, [LAN_IP, '10.0.0.5'], HOSTS, backend=name)
                self.assertRegex(certs.fingerprint, r'^([0-9A-F]{2}:){31}[0-9A-F]{2}$')
                self.assertTrue(certs.ca_cert.exists() and certs.server_key.exists())
                if os.name != 'nt':
                    for key in (certs.ca_key, certs.server_key):
                        self.assertEqual(key.stat().st_mode & 0o777, 0o600, key.name)
                    self.assertEqual(cfg.stat().st_mode & 0o077, 0, 'config dir must be private')
                self.handshake(certs, LAN_IP)
                self.handshake(certs, '10.0.0.5')
                for host in HOSTS:
                    self.handshake(certs, host)
                with self.assertRaises(ssl.SSLCertVerificationError):
                    self.handshake(certs, '192.168.9.9')
                self.assertIn(b'CERTIFICATE', certs.ca_cert.read_bytes())
                self.assertNotIn(b'PRIVATE', certs.ca_cert.read_bytes())
                self.assertEqual(fl.fingerprint_of(certs.ca_cert), certs.fingerprint)
        if not ran:
            self.skipTest('no certificate backend available')

    def test_ca_constraints_with_openssl_text(self):
        if 'openssl' not in BACKENDS:
            self.skipTest('openssl missing')
        import subprocess
        for name in BACKENDS:
            certs = fl.ensure_certs(Path(self._tmp.name) / ('c-' + name), [LAN_IP], HOSTS, backend=name)
            out = subprocess.run(['openssl', 'x509', '-in', str(certs.ca_cert), '-noout', '-text'],
                                 capture_output=True, text=True, check=True).stdout
            self.assertIn('CA:TRUE, pathlen:0', out, name)
            self.assertIn('Certificate Sign', out, name)
            self.assertIn('fanfare-local CA', out, name)
            out = subprocess.run(['openssl', 'x509', '-in', str(certs.server_cert), '-noout', '-text'],
                                 capture_output=True, text=True, check=True).stdout
            self.assertIn('IP Address:' + LAN_IP, out, name)
            self.assertIn('DNS:testhost.local', out, name)

    def test_server_cert_regenerated_when_ip_changes_but_ca_kept(self):
        if not BACKENDS:
            self.skipTest('no backend')
        a = fl.ensure_certs(self.cfg, [LAN_IP], HOSTS)
        ca_before, srv_before = a.ca_cert.read_bytes(), a.server_cert.read_bytes()
        same = fl.ensure_certs(self.cfg, [LAN_IP], HOSTS)
        self.assertEqual(same.server_cert.read_bytes(), srv_before)
        b = fl.ensure_certs(self.cfg, ['172.16.0.9'], HOSTS)
        self.assertEqual(b.ca_cert.read_bytes(), ca_before)
        self.assertNotEqual(b.server_cert.read_bytes(), srv_before)
        self.assertEqual(b.fingerprint, a.fingerprint)
        self.handshake(b, '172.16.0.9')

    def handshake(self, certs, name):
        """Run a TLS handshake against a throwaway server using the generated cert and verify as `name`."""
        sctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        sctx.load_cert_chain(str(certs.server_cert), str(certs.server_key))
        listener = socket.socket()
        listener.bind(('127.0.0.1', 0))
        listener.listen(1)
        self.addCleanup(listener.close)

        def serve():
            try:
                c, _ = listener.accept()
                with sctx.wrap_socket(c, server_side=True) as s:
                    s.recv(1)
            except OSError:
                pass
        t = threading.Thread(target=serve, daemon=True)
        t.start()
        cctx = ssl.create_default_context(cafile=str(certs.ca_cert))
        raw = socket.create_connection(listener.getsockname(), timeout=10)
        try:
            with cctx.wrap_socket(raw, server_hostname=name) as s:
                s.send(b'x')
        finally:
            raw.close()
            t.join(5)


@unittest.skipUnless(BACKENDS, 'no certificate backend available')
class HttpsServerTests(TempDirCase):
    def start_https(self):
        r = self.run_server('--lan', '--port', '0')
        self.assertEqual(r.scheme, 'https')
        return r

    def test_https_serves_app_and_trust_extras(self):
        r = self.start_https()
        resp, body = self.get(r, '/', https=True)
        self.assertEqual((resp.status, body), (200, b'<h1>hello</h1>'))
        resp, body = self.get(r, '/fanfare-ca.crt', https=True)
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.getheader('Content-Type'), 'application/x-x509-ca-cert')
        self.assertEqual(body, (self.cfg / 'ca.crt').read_bytes())
        self.assertNotIn(b'PRIVATE', body)
        resp, body = self.get(r, '/trust.html', https=True)
        self.assertEqual(resp.status, 200)
        page = body.decode('utf-8')
        self.assertIn(r.fingerprint, page)
        self.assertIn('Android', page)
        self.assertIn('iOS', page)
        self.assertIn('Zertifikat', page)  # German section
        self.assertNotIn('<script', page.lower())
        self.assertEqual(resp.getheader('Content-Security-Policy'), index_csp())

    def test_keys_are_never_served(self):
        r = self.start_https()
        for p in ['/ca.key', '/server.key', '/fanfare-ca.key', '/../config/ca.key', '/anything.key']:
            resp, body = self.get(r, p, https=True)
            self.assertIn(resp.status, (400, 404), p)
            self.assertNotIn(b'PRIVATE', body, p)
        (self.root / 'leaked.key').write_text('-----BEGIN PRIVATE KEY-----', encoding='utf-8')
        resp, _ = self.get(r, '/leaked.key', https=True)
        self.assertEqual(resp.status, 404)

    def test_startup_output(self):
        r = self.start_https()
        text = '\n'.join(self.logs)
        self.assertIn('https://' + LAN_IP + ':', text)
        self.assertIn(r.fingerprint, text)
        self.assertIn('/trust.html once to trust this laptop (needed for offline mode and the microphone)', text)

    def test_loopback_http_companion_serves_the_app(self):
        r = self.start_https()
        self.assertIsNotNone(r.loopback)
        port = r.loopback.server_address[1]
        c = http.client.HTTPConnection('127.0.0.1', port, timeout=10)
        c.request('GET', '/a.txt')
        self.assertEqual(c.getresponse().read(), b'A')
        c.close()

    def test_plain_http_to_https_port_does_not_hang_server(self):
        r = self.start_https()
        s = socket.create_connection(('127.0.0.1', r.primary.server_address[1]), timeout=5)
        s.sendall(b'GET / HTTP/1.1\r\n\r\n')
        s.close()
        resp, _ = self.get(r, '/a.txt', https=True)
        self.assertEqual(resp.status, 200)


if __name__ == '__main__':
    unittest.main()
