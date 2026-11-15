"""Static checks for the hosting manual, the reverse-proxy examples under deploy/ and the Raspberry Pi
installer (Task 28). Container-based validation lives in tests/hosting/validate.sh and
tests/raspberry-pi/dry-run.sh."""
import importlib.util
import os
import re
import shutil
import subprocess
import tempfile
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
        for f in ('deploy/traefik/dynamic.yml', 'deploy/raspberry-pi/dynamic.yml', 'deploy/traefik/compose.labels.yaml'):
            self.assertIn(CSP, read(f), f)

    def test_npm_snippet_leaves_headers_alone(self):
        conf = re.sub(r'#.*', '', read('deploy/nginx-proxy-manager/custom.conf'))
        self.assertIn('access_log off;', conf)
        self.assertNotIn('add_header', conf)
        self.assertNotIn('proxy_hide_header', conf)

    def test_traefik_has_no_api_or_dashboard(self):
        for f in ('deploy/traefik/traefik.yml', 'deploy/raspberry-pi/traefik.yml', 'deploy/traefik/compose.labels.yaml',
                  'deploy/traefik/compose.yaml', 'deploy/raspberry-pi/compose.yaml'):
            text = re.sub(r'(?m)#.*$', '', read(f))
            for banned in ('api:', 'insecure', 'dashboard', '--api'):
                self.assertNotIn(banned, text, f)

    def test_labels_traefik_is_hardened(self):
        labels = read('deploy/traefik/compose.labels.yaml')
        for word in ('read_only: true', 'cap_drop: [ALL]', 'no-new-privileges:true'):
            self.assertIn(word, labels)

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

    def test_root_owned_layout(self):
        self.assertIn('REPO=/opt/fanfare', self.sh)
        self.assertIn('chown -R root:root', self.sh)
        self.assertIn('git -C "$REPO" pull --ff-only', self.sh)
        self.assertNotIn('safe.directory', self.sh)
        self.assertNotRegex(self.sh, r'(?m)^\s*git pull')

    def test_image_tar_mode_and_hostname(self):
        self.assertIn('MODE=tar', self.sh)
        self.assertIn('--hostname', self.sh)
        self.assertNotIn('192.168.1.20', self.sh)

    # ---- what a user of the Pi controls must not reach root (run as a dry run in a made-up checkout)

    def dry_run(self, origin, *args):
        if not (shutil.which('bash') and shutil.which('git')):
            self.skipTest('needs bash and git')
        tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, tmp, True)
        os.makedirs(os.path.join(tmp, 'deploy', 'raspberry-pi'))
        os.makedirs(os.path.join(tmp, '.git'))
        shutil.copy(ROOT / 'deploy' / 'raspberry-pi' / 'install.sh', os.path.join(tmp, 'deploy', 'raspberry-pi'))
        if origin is not None:
            with open(os.path.join(tmp, '.git', 'config'), 'w') as f:
                f.write('[remote "origin"]\n\turl = %s\n' % origin)
        r = subprocess.run(['bash', os.path.join(tmp, 'deploy', 'raspberry-pi', 'install.sh'), '--dry-run', *args],
                           capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr)
        return r.stdout

    def test_https_origin_is_cloned_with_end_of_options(self):
        out = self.dry_run('https://example.org/club/fanfare.git')
        self.assertIn('+ git clone -- https://example.org/club/fanfare.git /opt/fanfare', out)
        self.assertIn('HAS_REMOTE=1', out)
        self.assertNotIn('tar -C', out)

    def test_other_origins_are_never_used_by_root(self):
        for origin in ('file:///home/pi/repo', '/home/pi/repo', '../repo', 'ssh://git@example.org/x.git',
                       'git@example.org:x.git', 'ext::sh -c touch% /tmp/x', '--upload-pack=touch /tmp/x',
                       'http://example.org/x.git'):
            out = self.dry_run(origin)
            self.assertNotIn('git clone', out, origin)
            self.assertIn('is not an https:// address', out, origin)
            self.assertIn('tar -C', out, origin)  # the copy path
            self.assertIn('HAS_REMOTE=0', out, origin)

    def test_no_origin_takes_the_copy_path(self):
        out = self.dry_run(None)
        self.assertNotIn('git clone', out)
        self.assertIn('HAS_REMOTE=0', out)

    def test_no_update_disables_an_earlier_timer(self):
        out = self.dry_run(None, '--no-update')
        self.assertIn('systemctl disable --now fanfare-update.timer', out)
        self.assertNotIn('enable --now fanfare-update.timer', out.replace('disable --now', ''))
        self.assertNotIn('write /etc/systemd/system/fanfare-update.timer', out)
        self.assertRegex(self.sh, r'(?s)--no-update\)\..*?systemctl disable --now fanfare-update\.timer 2>/dev/null \|\| true')

    def test_root_python_is_isolated_and_clone_ends_options(self):
        self.assertIn("python3 -I - <<'PY'", self.sh)
        self.assertNotRegex(self.sh, r'python3 - <<')
        self.assertIn('git clone -- "$ORIGIN" "$REPO"', self.sh)
        self.assertNotRegex(self.sh, r'git clone "\$ORIGIN"')

    def test_links_that_leave_the_copy_stop_the_installer(self):
        if not shutil.which('bash'):
            self.skipTest('needs bash')
        fn = re.search(r'(?ms)^check_links\(\) \{.*?^\}$', self.sh).group(0)
        self.assertRegex(self.sh, r'(?m)^  check_links$')  # and it is called in a real run
        tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, tmp, True)
        repo = os.path.join(os.path.realpath(tmp), 'opt')
        os.makedirs(os.path.join(repo, 'deploy'))
        outside = os.path.join(tmp, 'user.yaml')
        open(outside, 'w').close()
        open(os.path.join(repo, 'inside.txt'), 'w').close()
        os.symlink('../inside.txt', os.path.join(repo, 'deploy', 'ok-link'))

        def check():
            return subprocess.run(['bash', '-c', fn + '\ncheck_links\necho passed'], env={**os.environ, 'REPO': repo},
                                  capture_output=True, text=True, timeout=30)
        r = check()
        self.assertEqual((r.returncode, r.stdout.strip()), (0, 'passed'), r.stderr)
        os.symlink(outside, os.path.join(repo, 'deploy', 'compose.yaml'))
        r = check()
        self.assertEqual(r.returncode, 1)
        self.assertIn('deploy/compose.yaml is a link that leads outside', r.stderr)
        self.assertNotIn('passed', r.stdout)
        os.remove(os.path.join(repo, 'deploy', 'compose.yaml'))
        os.symlink('/nonexistent/dir/x', os.path.join(repo, 'dangling'))
        self.assertEqual(check().returncode, 1)
        os.remove(os.path.join(repo, 'dangling'))
        os.symlink(repo + '-sibling', os.path.join(repo, 'sibling'))  # same prefix, different folder
        self.assertEqual(check().returncode, 1)


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
