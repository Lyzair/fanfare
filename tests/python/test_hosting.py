"""Static checks for the hosting manual, the reverse-proxy examples under deploy/ and the Raspberry Pi
installer (Task 28). Container-based validation lives in tests/hosting/validate.sh and
tests/raspberry-pi/dry-run.sh."""
import importlib.util
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')


def load_local():
    spec = importlib.util.spec_from_file_location('fanfare_local', ROOT / 'scripts' / 'fanfare-local.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


FL = load_local()
CSP = re.search(r'http-equiv="Content-Security-Policy"\s+content="([^"]*)"', read('index.html')).group(1)
DEPLOY_FILES = [
    'deploy/caddy/Caddyfile', 'deploy/caddy/Caddyfile.domain', 'deploy/caddy/Caddyfile.local-ca',
    'deploy/traefik/compose.yaml', 'deploy/traefik/traefik.yml', 'deploy/traefik/dynamic.yml',
    'deploy/traefik/dynamic-tls.yml', 'deploy/traefik/compose.labels.yaml',
    'deploy/nginx-proxy-manager/README.md', 'deploy/nginx-proxy-manager/custom.conf',
    'deploy/raspberry-pi/README.md', 'deploy/raspberry-pi/README.de.md', 'deploy/raspberry-pi/install.sh',
    'deploy/raspberry-pi/compose.yaml', 'deploy/raspberry-pi/compose.https.yaml',
    'deploy/raspberry-pi/traefik.yml', 'deploy/raspberry-pi/dynamic.yml', 'deploy/raspberry-pi/dynamic-tls.yml',
    'docs/self-hosting.md', 'docs/self-hosting.de.md',
]


class Files(unittest.TestCase):
    def test_files_exist(self):
        for f in DEPLOY_FILES:
            self.assertTrue((ROOT / f).is_file(), f)


class Risks(unittest.TestCase):
    def test_risk_text_verbatim(self):
        for f in ('docs/self-hosting.md', 'deploy/raspberry-pi/README.md', 'deploy/raspberry-pi/install.sh',
                  'deploy/nginx-proxy-manager/README.md'):
            text = read(f)
            for r in FL.RISKS['en']:
                self.assertIn(r, text, f)
        for f in ('docs/self-hosting.de.md', 'deploy/raspberry-pi/README.de.md'):
            text = read(f)
            for r in FL.RISKS['de']:
                self.assertIn(r, text, f)

    def test_local_ca_only_via_fanfare_local(self):
        for f in DEPLOY_FILES:
            if not (ROOT / f).is_file() or f.endswith('install.sh'):
                continue
            text = read(f)
            for banned in ('tls internal', 'mkcert', 'certResolver: internal'):
                self.assertNotIn(banned, re.sub(r'(?im)^.*\b(never|nicht|not)\b.*$', '', text), f)
        self.assertIn('--issue-certs', read('deploy/raspberry-pi/install.sh'))
        self.assertIn('--issue-certs', read('deploy/traefik/dynamic-tls.yml'))


class Privacy(unittest.TestCase):
    def test_no_access_logs(self):
        for f in ('deploy/traefik/traefik.yml', 'deploy/raspberry-pi/traefik.yml'):
            self.assertNotIn('accessLog', re.sub(r'#.*', '', read(f)), f)
        self.assertIn('access_log off;', read('deploy/nginx-proxy-manager/custom.conf'))
        for f in ('deploy/caddy/Caddyfile', 'deploy/caddy/Caddyfile.domain', 'deploy/caddy/Caddyfile.local-ca'):
            self.assertIn('exclude http.log.error', read(f), f)

    def test_csp_identical(self):
        for f in ('deploy/traefik/dynamic.yml', 'deploy/raspberry-pi/dynamic.yml',
                  'deploy/nginx-proxy-manager/custom.conf'):
            self.assertIn(CSP, read(f), f)

    def test_no_docker_socket_on_pi_or_default_traefik(self):
        for f in ('deploy/raspberry-pi/compose.yaml', 'deploy/raspberry-pi/compose.https.yaml',
                  'deploy/raspberry-pi/traefik.yml', 'deploy/traefik/compose.yaml', 'deploy/traefik/traefik.yml'):
            self.assertNotIn('docker.sock', read(f), f)
            self.assertNotIn('docker:', read(f).replace('docker.io', ''), f) if f.endswith('traefik.yml') else None
        labels = read('deploy/traefik/compose.labels.yaml')
        self.assertIn('docker.sock', labels)
        self.assertRegex(labels.lower(), r'root')  # the warning


class Installer(unittest.TestCase):
    def setUp(self):
        self.sh = read('deploy/raspberry-pi/install.sh')

    def test_strict_and_flags(self):
        self.assertIn('set -euo pipefail', self.sh)
        for flag in ('--dry-run', '--no-update', '--https', '--accept-ca-risk', '--image-tar'):
            self.assertIn(flag, self.sh)

    def test_steps(self):
        for word in ('unattended-upgrades', 'Remove-Unused-Dependencies', '04:00', 'docker.io', 'avahi-daemon',
                     'log-driver', 'SystemMaxUse', 'fanfare-update.timer', 'OnCalendar=weekly'):
            self.assertIn(word, self.sh)
        self.assertNotRegex(self.sh, r'curl[^\n]*\|\s*(ba)?sh')
        self.assertNotIn('get.docker.com', self.sh)

    def test_not_https_by_default(self):
        self.assertRegex(self.sh, r'HTTPS=0')


class Wiring(unittest.TestCase):
    def test_dockerfile_multiarch(self):
        d = read('Dockerfile')
        self.assertIn('FROM --platform=$BUILDPLATFORM node:', d)

    def test_ci(self):
        ci = read('.github/workflows/pages.yml')
        self.assertIn('linux/amd64,linux/arm64', ci)
        self.assertIn('shellcheck', ci)
        self.assertIn('tests/hosting/validate.sh', ci)
        self.assertIn('tests/raspberry-pi/dry-run.sh', ci)

    def test_manuals_point_to_pi(self):
        for lang in ('ar', 'de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'tr', 'uk'):
            md = read('docs/manual/%s.md' % lang)
            self.assertIn('deploy/raspberry-pi/README%s.md' % ('.de' if lang == 'de' else ''), md, lang)
            self.assertNotRegex(md, r'https?://')

    def test_self_hosting_sections(self):
        for f in ('docs/self-hosting.md', 'docs/self-hosting.de.md'):
            t = read(f)
            for w in ('Traefik', 'Nginx Proxy Manager', 'Caddy', 'Raspberry Pi', 'access_log off', 'application/wasm'):
                self.assertIn(w, t, f)


if __name__ == '__main__':
    unittest.main()
