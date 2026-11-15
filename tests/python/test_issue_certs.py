"""--issue-certs (certificates for the Docker setup) and the Docker entrypoint's copy of the risk list."""
import importlib.util
import os
import re
import sys
import tempfile
import time
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location('fanfare_local', REPO / 'scripts' / 'fanfare-local.py')
fl = importlib.util.module_from_spec(_spec)
sys.modules.setdefault('fanfare_local', fl)
_spec.loader.exec_module(fl)


class IssueCerts(unittest.TestCase):
    def setUp(self):
        if not fl.available_backends():
            self.skipTest('no openssl / cryptography')
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.base = Path(tmp.name)
        self.cfg = self.base / 'cfg'
        self.out_dir = self.base / 'certs'
        self.logs = []

    def run_cli(self, *args, interactive=False, ask=lambda p: ''):
        return fl.start(['--config-dir', str(self.cfg), *args], out=self.logs.append, ask=ask, interactive=interactive)

    def issue(self, *extra, **kw):
        return self.run_cli('--issue-certs', str(self.out_dir), '--name', 'fanfare.local', '--ip', '192.168.1.20',
                            *extra, **kw)

    def test_writes_only_certificate_files_and_never_the_ca_key(self):
        self.assertIsNone(self.issue('--accept-ca-risk'))
        self.assertEqual(sorted(p.name for p in self.out_dir.iterdir()),
                         ['expires.txt', 'hosts.txt', 'server.crt', 'server.key'])
        key = (self.out_dir / 'server.key').read_bytes()
        self.assertNotEqual(key, (self.cfg / 'ca.key').read_bytes())
        if os.name != 'nt':
            self.assertEqual((self.out_dir / 'server.key').stat().st_mode & 0o777, 0o600)
        self.assertTrue((self.cfg / 'ca.key').exists())
        self.assertEqual((self.out_dir / 'hosts.txt').read_text().split(), ['fanfare.local', '192.168.1.20'])
        text = '\n'.join(self.logs)
        self.assertIn(fl.fingerprint_of(self.cfg / 'ca.crt'), text)
        self.assertIn('Valid until', text)
        self.assertIn('--forget-ca', text)
        for risk in fl.RISKS['en']:
            self.assertIn(risk, text)

    def test_validity_is_at_most_825_days(self):
        self.issue('--accept-ca-risk')
        left = int((self.out_dir / 'expires.txt').read_text()) - time.time()
        self.assertLessEqual(left, 825 * 86400 + 3600)
        self.assertGreater(left, 700 * 86400)

    def test_unreadable_expiry_is_written_as_unknown(self):
        orig = fl._not_after
        fl._not_after = lambda path: None
        self.addCleanup(setattr, fl, '_not_after', orig)
        self.issue('--accept-ca-risk')
        self.assertEqual((self.out_dir / 'expires.txt').read_text().strip(), 'unknown')
        self.assertIn('Valid until: unknown', '\n'.join(self.logs))

    def test_names_outside_the_constraints_are_skipped_and_printed(self):
        self.run_cli('--issue-certs', str(self.out_dir), '--name', 'fanfare.local', '--name', 'example.org',
                     '--ip', '8.8.8.8', '--accept-ca-risk')
        self.assertEqual((self.out_dir / 'hosts.txt').read_text().split(), ['fanfare.local'])
        self.assertIn('8.8.8.8, example.org', '\n'.join(self.logs))

    def test_nothing_certifiable_is_an_error_and_writes_nothing(self):
        with self.assertRaises(fl.StartError):
            self.run_cli('--issue-certs', str(self.out_dir), '--name', 'example.org', '--accept-ca-risk')
        self.assertFalse(self.out_dir.exists())

    def test_gate_without_terminal_and_without_flag_refuses(self):
        with self.assertRaises(fl.StartError):
            self.issue()
        self.assertFalse(self.out_dir.exists())
        self.assertFalse(self.cfg.exists())
        self.assertIn(fl.RISKS['en'][0], '\n'.join(self.logs))

    def test_gate_typed_no_refuses_and_typed_yes_issues(self):
        with self.assertRaises(fl.StartError):
            self.issue(interactive=True, ask=lambda p: 'no')
        self.assertFalse(self.out_dir.exists())
        self.issue(interactive=True, ask=lambda p: 'yes')
        self.assertTrue((self.out_dir / 'server.crt').exists())

    def test_existing_ca_needs_no_new_prompt(self):
        self.issue('--accept-ca-risk')
        self.logs.clear()
        self.issue()
        self.assertNotIn(fl.RISKS['en'][0], '\n'.join(self.logs))

    def test_output_folder_must_not_be_the_ca_folder(self):
        with self.assertRaises(fl.StartError):
            self.run_cli('--issue-certs', str(self.cfg), '--name', 'fanfare.local', '--accept-ca-risk')


class EntrypointRisks(unittest.TestCase):
    def test_entrypoint_prints_the_risk_list_verbatim(self):
        text = re.sub(r'\s+', ' ', (REPO / 'docker' / 'entrypoint.sh').read_text())
        for risk in fl.RISKS['en']:
            self.assertIn(re.sub(r'\s+', ' ', risk), text)


if __name__ == '__main__':
    unittest.main()
