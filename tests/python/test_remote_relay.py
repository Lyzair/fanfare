"""Tests for the phone-remote relay in scripts/fanfare-local.py (stdlib unittest, Python >= 3.9)."""
import hmac
import http.client
import json
import re
import socket
import ssl
import threading
import time
import unittest
from contextlib import contextmanager
from unittest import mock

import test_fanfare_local as base

fl = base.fl

PAGE = '<!doctype html><html><head><meta charset="utf-8"><title>x</title></head><body>app</body></html>'
URL = 'http://192.168.1.23:8080'

SNAPSHOT = {
    'sport': 'football', 'scoreWord': 'Goal', 'hasGuests': True, 'playing': False, 'activated': True,
    'home': {'name': 'FC Example', 'players': [{'id': 'p1', 'name': 'Lea'}, {'id': 'p2', 'name': 'Tom'}]},
    'guest': {'name': 'SV Sample', 'players': [{'id': 'g1', 'name': 'Pat'}]},
}


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


def drain(stream):
    out = []
    while True:
        try:
            out.append(stream.q.get_nowait())
        except Exception:
            return out


class RelayTests(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.relay = fl.Relay(clock=self.clock, urls=[URL], secure=False)

    def session(self):
        return self.relay.create_session()

    def test_session_has_six_digit_code_and_long_random_tokens(self):
        s = self.session()
        self.assertRegex(s['code'], r'^\d{6}$')
        self.assertEqual(s['expiresIn'], 600)
        self.assertGreaterEqual(len(s['speakerToken']), 32)  # token_urlsafe(24) is 32 characters
        status, p = self.relay.pair(s['code'])
        self.assertEqual(status, 200)
        self.assertGreaterEqual(len(p['token']), 32)
        self.assertNotEqual(p['token'], s['speakerToken'])
        s2 = self.session()
        self.assertNotEqual(s2['speakerToken'], s['speakerToken'])

    def test_tokens_come_from_secrets(self):
        with mock.patch.object(fl.secrets, 'token_urlsafe', wraps=fl.secrets.token_urlsafe) as m:
            self.session()
        self.assertTrue(m.called)
        self.assertTrue(all(c.args[0] >= 24 for c in m.call_args_list))

    def test_code_expires_after_ten_minutes_unused(self):
        s = self.session()
        self.clock.advance(599)
        status, _ = self.relay.pair('000000' if s['code'] != '000000' else '000001')
        self.assertEqual(status, 403)
        self.clock.advance(2)
        status, p = self.relay.pair(s['code'])
        self.assertEqual(status, 410)
        self.assertEqual(p['error'], 'expired')

    def test_code_is_single_use_and_a_fresh_one_is_offered_to_the_speaker(self):
        s = self.session()
        speaker = self.relay.open_stream(s['speakerToken'])
        drain(speaker)
        status, _ = self.relay.pair(s['code'])
        self.assertEqual(status, 200)
        events = dict(drain(speaker))
        self.assertIn('code', events)
        self.assertNotEqual(events['code']['code'], s['code'])
        self.assertEqual(events['remotes'], {'count': 0})  # paired, but not connected yet
        status, p = self.relay.pair(s['code'])  # the used code is dead
        self.assertEqual(status, 403)
        status, _ = self.relay.pair(events['code']['code'])
        self.assertEqual(status, 200)

    def test_five_wrong_attempts_lock_the_session(self):
        s = self.session()
        wrong = '000000' if s['code'] != '000000' else '000001'
        for i in range(5):
            status, p = self.relay.pair(wrong)
            self.assertEqual(status, 403)
            self.assertEqual(p['attemptsLeft'], 4 - i)
        status, p = self.relay.pair(s['code'])  # even the right code is refused now
        self.assertEqual(status, 423)
        self.assertEqual(p['error'], 'locked')

    def test_new_code_lifts_the_pairing_lock_and_the_speaker_is_told(self):
        s = self.session()
        speaker = self.relay.open_stream(s['speakerToken'])
        drain(speaker)
        wrong = '000000' if s['code'] != '000000' else '000001'
        for _ in range(5):
            self.relay.pair(wrong)
        self.assertIn(('locked', {}), drain(speaker))
        self.assertEqual(self.relay.pair(s['code'])[0], 423)
        status, p = self.relay.new_code(s['speakerToken'])
        self.assertEqual(status, 200)
        self.assertEqual(self.relay.session.wrong, 0)
        self.assertEqual(self.relay.pair(p['code'])[0], 200)  # unlocked
        for _ in range(4):  # and the counter really restarted
            self.assertEqual(self.relay.pair(wrong)[0], 403)

    def test_a_stranger_cannot_keep_the_speaker_locked_out(self):
        s = self.session()
        wrong = '000000' if s['code'] != '000000' else '000001'
        for _ in range(7):
            self.relay.pair(wrong)
        code = self.relay.new_code(s['speakerToken'])[1]['code']
        self.assertEqual(self.relay.pair(code)[0], 200)

    def test_at_most_two_streams_per_token(self):
        s = self.session()
        tok = self.pair(s)
        a = self.relay.open_stream(tok)
        b = self.relay.open_stream(tok)
        self.assertIsNotNone(a)
        self.assertIsNotNone(b)
        self.assertIs(self.relay.open_stream(tok), fl.Relay.TOO_MANY)
        self.relay.close_stream(a)  # a slot is free again; the older stream stayed untouched
        self.assertIsNotNone(self.relay.open_stream(tok))
        self.assertIsNone(self.relay.open_stream('nope'))
        sp = [self.relay.open_stream(s['speakerToken']) for _ in range(2)]
        self.assertTrue(all(sp))
        self.assertIs(self.relay.open_stream(s['speakerToken']), fl.Relay.TOO_MANY)

    def test_a_stream_nobody_reads_is_cut_instead_of_growing(self):
        s = self.session()
        remote = self.relay.open_stream(self.pair(s))
        self.assertEqual(remote.q.maxsize, 100)
        for i in range(500):
            self.relay.set_state(s['speakerToken'], dict(SNAPSHOT, scoreWord='w%d' % i))
        self.assertLessEqual(remote.q.qsize(), 100)
        items = drain(remote)
        self.assertIsNone(items[-1])  # the stream was closed on overflow
        self.relay.set_state(s['speakerToken'], SNAPSHOT)  # and nothing more is queued
        self.assertEqual(drain(remote), [])

    def test_malformed_codes_are_rejected_without_counting(self):
        s = self.session()
        for bad in ['', '12345', '1234567', 'abcdef', None, 123456]:
            status, _ = self.relay.pair(bad)
            self.assertEqual(status, 400, repr(bad))
        status, _ = self.relay.pair(s['code'])
        self.assertEqual(status, 200)

    def test_code_comparison_is_constant_time(self):
        s = self.session()
        with mock.patch.object(fl.hmac, 'compare_digest', wraps=hmac.compare_digest) as m:
            self.relay.pair('000000' if s['code'] != '000000' else '000001')
            self.relay.pair(s['code'])
        self.assertGreaterEqual(m.call_count, 2)

    def test_pair_without_session_is_refused(self):
        status, _ = self.relay.pair('123456')
        self.assertEqual(status, 403)

    def pair(self, s):
        """Pairs a remote and returns its token; always uses the latest code."""
        code = s['code']
        status, p = self.relay.pair(code)
        self.assertEqual(status, 200, p)
        s['code'] = self.relay.session.code
        return p['token']

    def test_at_most_three_remotes(self):
        s = self.session()
        tokens = [self.pair(s) for _ in range(3)]
        status, p = self.relay.pair(s['code'])
        self.assertEqual(status, 429)
        self.assertEqual(p['error'], 'full')
        # a full session does not burn the code
        self.assertEqual(self.relay.session.code, s['code'])
        self.assertEqual(len(set(tokens)), 3)

    def test_idle_remote_slots_are_freed_after_two_minutes(self):
        s = self.session()
        for _ in range(3):
            self.pair(s)
        self.clock.advance(121)
        status, _ = self.relay.pair(s['code'])
        self.assertEqual(status, 200)

    def test_remote_count_counts_open_streams(self):
        s = self.session()
        speaker = self.relay.open_stream(s['speakerToken'])
        a, b = self.pair(s), self.pair(s)
        drain(speaker)
        sa = self.relay.open_stream(a)
        self.assertEqual(drain(speaker)[-1], ('remotes', {'count': 1}))
        sb = self.relay.open_stream(b)
        self.assertEqual(drain(speaker)[-1], ('remotes', {'count': 2}))
        self.relay.close_stream(sa)
        self.assertEqual(drain(speaker)[-1], ('remotes', {'count': 1}))
        self.relay.close_stream(sb)

    def test_command_allowlist(self):
        s = self.session()
        speaker = self.relay.open_stream(s['speakerToken'])
        tok = self.pair(s)
        drain(speaker)
        good = [
            ({'cmd': 'announce', 'args': {'part': 'all'}}, {'cmd': 'announce', 'args': {'part': 'all'}}),
            ({'cmd': 'announce', 'args': {'part': 'guests'}}, None),
            ({'cmd': 'announce', 'args': {'part': 'home'}}, None),
            ({'cmd': 'score', 'args': {'team': 'home'}}, {'cmd': 'score', 'args': {'team': 'home'}}),
            ({'cmd': 'score', 'args': {'team': 'guest', 'player': 'g1'}}, None),
            ({'cmd': 'stop'}, {'cmd': 'stop', 'args': {}}),
            ({'cmd': 'sound', 'args': {'slot': 'intro'}}, None),
            ({'cmd': 'sound', 'args': {'slot': 'score'}}, None),
            ({'cmd': 'player', 'args': {'id': 'p1'}}, None),
        ]
        for body, expected in good:
            self.clock.advance(1)
            status, _ = self.relay.command(tok, body)
            self.assertEqual(status, 200, body)
            ev, data = drain(speaker)[-1]
            self.assertEqual(ev, 'command')
            if expected:
                self.assertEqual(data, expected)
        bad = [
            None, [], 'stop', {}, {'cmd': 'eval'}, {'cmd': 'delete'}, {'cmd': 7}, {'cmd': 'announce'},
            {'cmd': 'announce', 'args': {'part': 'everyone'}},
            {'cmd': 'score', 'args': {'team': 'both'}},
            {'cmd': 'score', 'args': {'team': 'home', 'player': '../../x'}},
            {'cmd': 'score', 'args': {'team': 'home', 'player': 5}},
            {'cmd': 'sound', 'args': {'slot': 'other'}},
            {'cmd': 'player', 'args': {}},
            {'cmd': 'player', 'args': {'id': 'a b'}},
            {'cmd': 'stop', 'args': 'x'},
            {'cmd': '__proto__', 'args': {}},
        ]
        for body in bad:
            self.clock.advance(1)
            status, _ = self.relay.command(tok, body)
            self.assertEqual(status, 400, body)
            self.assertEqual(drain(speaker), [], body)  # nothing reaches the speaker

    def test_unknown_args_are_dropped_before_forwarding(self):
        s = self.session()
        speaker = self.relay.open_stream(s['speakerToken'])
        tok = self.pair(s)
        drain(speaker)
        self.relay.command(tok, {'cmd': 'score', 'args': {'team': 'home', 'evil': '<script>'}})
        self.assertEqual(drain(speaker)[-1], ('command', {'cmd': 'score', 'args': {'team': 'home'}}))

    def test_command_rate_limit_five_per_second_per_remote(self):
        s = self.session()
        speaker = self.relay.open_stream(s['speakerToken'])
        a, b = self.pair(s), self.pair(s)
        drain(speaker)
        stop = {'cmd': 'stop'}
        self.assertEqual([self.relay.command(a, stop)[0] for _ in range(6)], [200] * 5 + [429])
        self.assertEqual(self.relay.command(b, stop)[0], 200)  # another remote has its own budget
        self.clock.advance(1.01)
        self.assertEqual(self.relay.command(a, stop)[0], 200)

    def test_command_needs_a_valid_remote_token(self):
        s = self.session()
        self.relay.open_stream(s['speakerToken'])
        for tok in [None, '', 'nope', s['speakerToken']]:  # the speaker token is not a remote token
            self.assertEqual(self.relay.command(tok, {'cmd': 'stop'})[0], 401, tok)

    def test_command_without_a_speaker_connected(self):
        s = self.session()
        tok = self.pair(s)
        status, p = self.relay.command(tok, {'cmd': 'stop'})
        self.assertEqual(status, 409)
        self.assertEqual(p['error'], 'speaker-offline')

    def test_state_is_whitelisted_and_forwarded_to_remotes(self):
        s = self.session()
        self.relay.open_stream(s['speakerToken'])
        tok = self.pair(s)
        remote = self.relay.open_stream(tok)
        self.assertEqual(drain(remote)[0][0], 'state')
        dirty = json.loads(json.dumps(SNAPSHOT))
        dirty['hint'] = 'SECRET-HINT'
        dirty['home']['players'][0].update({'number': '7', 'position': 'GK', 'customText': 'SECRET-TEXT', 'hint': 'x'})
        dirty['home']['bench'] = [{'id': 'b1', 'name': 'Benchy'}]
        dirty['templates'] = {'intro': 'SECRET-TEMPLATE'}
        dirty['guest']['players'][0]['sayAs'] = 'SECRET-SAYAS'
        status, _ = self.relay.set_state(s['speakerToken'], dirty)
        self.assertEqual(status, 200)
        ev, data = drain(remote)[-1]
        self.assertEqual(ev, 'state')
        self.assertEqual(data['state'], SNAPSHOT)
        self.assertTrue(data['online'])
        text = json.dumps(data)
        for leaked in ['SECRET', 'number', 'position', 'customText', 'Benchy', 'bench', 'templates']:
            self.assertNotIn(leaked, text)

    def test_new_remote_gets_the_latest_state_immediately(self):
        s = self.session()
        self.relay.set_state(s['speakerToken'], SNAPSHOT)
        remote = self.relay.open_stream(self.pair(s))
        ev, data = drain(remote)[0]
        self.assertEqual(ev, 'state')
        self.assertEqual(data['state'], SNAPSHOT)

    def test_state_needs_the_speaker_token(self):
        s = self.session()
        tok = self.pair(s)
        for bad in [None, '', 'x', tok]:
            self.assertEqual(self.relay.set_state(bad, SNAPSHOT)[0], 401)
        self.assertEqual(self.relay.set_state(s['speakerToken'], 'nonsense')[0], 400)

    def test_remote_sees_speaker_going_offline_and_back(self):
        s = self.session()
        speaker = self.relay.open_stream(s['speakerToken'])
        remote = self.relay.open_stream(self.pair(s))
        self.assertTrue(drain(remote)[0][1]['online'])
        self.relay.close_stream(speaker)
        self.assertFalse(drain(remote)[-1][1]['online'])
        self.relay.open_stream(s['speakerToken'])
        self.assertTrue(drain(remote)[-1][1]['online'])

    def test_ending_the_session_closes_every_stream_and_kills_the_tokens(self):
        s = self.session()
        speaker = self.relay.open_stream(s['speakerToken'])
        tok = self.pair(s)
        remote = self.relay.open_stream(tok)
        drain(speaker), drain(remote)
        self.assertTrue(self.relay.end_session(s['speakerToken']))
        self.assertEqual(drain(remote)[-2:], [('ended', {}), None])
        self.assertEqual(drain(speaker)[-1], None)
        self.assertEqual(self.relay.command(tok, {'cmd': 'stop'})[0], 401)
        self.assertIsNone(self.relay.open_stream(tok))
        self.assertIsNone(self.relay.open_stream(s['speakerToken']))
        self.assertEqual(self.relay.pair(s['code'])[0], 403)
        self.assertFalse(self.relay.end_session(s['speakerToken']))

    def test_end_needs_the_speaker_token(self):
        s = self.session()
        tok = self.pair(s)
        self.assertFalse(self.relay.end_session(tok))
        self.assertFalse(self.relay.end_session('x'))
        self.assertEqual(self.relay.command(tok, {'cmd': 'stop'})[0], 409)  # still alive

    def test_a_new_session_invalidates_the_old_one(self):
        s = self.session()
        tok = self.pair(s)
        remote = self.relay.open_stream(tok)
        drain(remote)
        s2 = self.session()
        self.assertEqual(drain(remote)[-1], None)
        self.assertEqual(self.relay.command(tok, {'cmd': 'stop'})[0], 401)
        self.assertEqual(self.relay.set_state(s['speakerToken'], SNAPSHOT)[0], 401)
        self.assertEqual(self.relay.pair(s['code'])[0], 403 if s['code'] != s2['code'] else 200)

    def test_new_code_keeps_the_session(self):
        s = self.session()
        tok = self.pair(s)
        self.clock.advance(700)
        status, p = self.relay.new_code(s['speakerToken'])
        self.assertEqual(status, 200)
        self.assertEqual(self.relay.command(tok, {'cmd': 'stop'})[0], 409)  # old remote still valid
        self.assertEqual(self.relay.pair(p['code'])[0], 200)
        self.assertEqual(self.relay.new_code('bad')[0], 401)

    def test_end_all_closes_streams(self):
        s = self.session()
        speaker = self.relay.open_stream(s['speakerToken'])
        drain(speaker)
        self.relay.end_all()
        self.assertEqual(drain(speaker)[-1], None)

    def test_health(self):
        h = self.relay.health()
        self.assertEqual(h, {'fanfare': 'local', 'urls': [URL], 'secure': False})
        self.assertEqual(fl.Relay(urls=['https://10.0.0.2:8443'], secure=True).health()['secure'], True)


class RelayHttpTests(base.TempDirCase):
    def setUp(self):
        super().setUp()
        (self.root / 'index.html').write_text(PAGE, encoding='utf-8')

    def start(self, *args):
        r = self.run_server('--lan', '--port', '0', *args)
        self.lines = []
        r.primary.log = self.lines.append
        return r

    def conn(self, r, loopback=True):
        return http.client.HTTPConnection('127.0.0.1', r.primary.server_address[1], timeout=10)

    def call(self, r, method, path, body=None, headers=None, raw=None, ctype='application/json'):
        c = self.conn(r)
        h = dict(headers or {})
        data = raw
        if body is not None:
            data = json.dumps(body).encode()
        if data is not None and ctype:
            h.setdefault('Content-Type', ctype)
        c.request(method, path, body=data, headers=h)
        resp = c.getresponse()
        text = resp.read()
        c.close()
        try:
            parsed = json.loads(text)
        except ValueError:
            parsed = None
        return resp, parsed

    @contextmanager
    def peer(self, ip):
        with mock.patch.object(fl.Handler, 'client_ip', lambda self: ip):
            yield

    def create(self, r, **kw):
        resp, p = self.call(r, 'POST', '/remote/session', {}, **kw)
        self.assertEqual(resp.status, 200, p)
        return p

    class Sse:
        """Reads one event stream in a thread: .events gets (name, data) tuples; .closed is set on EOF."""

        def __init__(self, case, r, token):
            self.events, self.comments, self.headers = [], [], {}
            self.closed = threading.Event()
            self.sock = socket.create_connection(('127.0.0.1', r.primary.server_address[1]), timeout=10)
            port = r.primary.server_address[1]
            self.sock.sendall(('GET /remote/events?token=%s HTTP/1.1\r\nHost: 127.0.0.1:%d\r\n\r\n' % (token, port)).encode())
            self.fp = self.sock.makefile('rb')
            self.status = int(self.fp.readline().split()[1])
            while True:
                line = self.fp.readline().decode().strip()
                if not line:
                    break
                k, _, v = line.partition(':')
                self.headers[k.lower()] = v.strip()
            self.t = threading.Thread(target=self.read, daemon=True)
            self.t.start()

        def read(self):
            name = None
            try:
                while True:
                    line = self.fp.readline()
                    if not line:
                        break
                    line = line.decode().rstrip('\n')
                    if line.startswith(':'):
                        self.comments.append(line)
                    elif line.startswith('event: '):
                        name = line[7:]
                    elif line.startswith('data: '):
                        self.events.append((name, json.loads(line[6:])))
            except (OSError, ValueError):
                pass
            self.closed.set()

        def wait(self, name, timeout=5):
            end = time.time() + timeout
            while time.time() < end:
                for ev in self.events:
                    if ev[0] == name:
                        return ev[1]
                time.sleep(0.02)
            raise AssertionError('no %s event; got %r' % (name, self.events))

        def wait_for(self, name, predicate, timeout=5):
            """Polls until the newest `name` event satisfies `predicate`; returns its data.

            The reader thread may still be behind the server when a request returns, so asserting
            on the newest event right away is a race: older events of the same name are already there.
            """
            end = time.time() + timeout
            while time.time() < end:
                newest = [d for n, d in list(self.events) if n == name][-1:]
                if newest and predicate(newest[0]):
                    return newest[0]
                time.sleep(0.02)
            raise AssertionError('no matching %s event; got %r' % (name, self.events))

        def last(self, name, timeout=5):
            self.wait(name, timeout)
            return [d for n, d in self.events if n == name][-1]

        def close(self):
            try:
                self.sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            self.sock.close()

    def stream(self, r, token):
        s = self.Sse(self, r, token)
        self.addCleanup(s.close)
        return s

    # ---- endpoints and who may call them

    def test_health_describes_where_phones_connect(self):
        r = self.start()
        resp, p = self.call(r, 'GET', '/remote/health')
        self.assertEqual(resp.status, 200)
        self.assertTrue(resp.getheader('Content-Type').startswith('application/json'))
        port = r.primary.server_address[1]
        self.assertEqual(p, {'fanfare': 'local', 'urls': ['http://%s:%d' % (base.LAN_IP, port)], 'secure': False})

    def test_health_without_lan_has_no_phone_address(self):
        r = self.run_server('--port', '0')
        resp, p = self.call(r, 'GET', '/remote/health')
        self.assertEqual(p['urls'], [])

    def test_https_run_reports_https_address_and_companion_shares_the_relay(self):
        if not base.BACKENDS:
            self.skipTest('no certificate backend')
        r = self.run_server('--lan', '--https', '--accept-ca-risk', '--port', '0')
        self.assertEqual(r.scheme, 'https')
        c = http.client.HTTPConnection('127.0.0.1', r.loopback.server_address[1], timeout=10)
        c.request('GET', '/remote/health')
        health = json.loads(c.getresponse().read())
        c.close()
        self.assertTrue(health['secure'])
        self.assertTrue(health['urls'][0].startswith('https://%s:' % base.LAN_IP))
        # speaker on the plain companion, phone on the HTTPS port: one shared session
        c = http.client.HTTPConnection('127.0.0.1', r.loopback.server_address[1], timeout=10)
        c.request('POST', '/remote/session', b'{}', {'Content-Type': 'application/json'})
        sess = json.loads(c.getresponse().read())
        c.close()
        ctx = ssl.create_default_context(cafile=str(self.cfg / 'ca.crt'))
        s = http.client.HTTPSConnection('localhost', r.primary.server_address[1], context=ctx, timeout=10)
        s.request('POST', '/remote/pair', json.dumps({'code': sess['code']}), {'Content-Type': 'application/json'})
        resp = s.getresponse()
        self.assertEqual(resp.status, 200)
        self.assertIn('token', json.loads(resp.read()))
        s.close()

    def test_session_only_from_a_loopback_peer_with_a_loopback_host(self):
        r = self.start()
        port = r.primary.server_address[1]
        with self.peer('192.168.1.50'):  # a phone / anyone on the LAN: refused whatever it sends
            for headers in [{}, {'X-Fanfare-Speaker-Secret': 'anything'}, {'Host': 'localhost:%d' % port},
                            {'Host': '127.0.0.1:%d' % port}, {'X-Fanfare-Speaker-Token': 'x'}]:
                resp, _ = self.call(r, 'POST', '/remote/session', {}, headers=headers)
                self.assertEqual(resp.status, 403, headers)
        self.assertIsNone(r.primary.relay.session)
        for ip in ['127.0.0.1', '::1', '::ffff:127.0.0.1']:
            with self.peer(ip):
                resp, p = self.call(r, 'POST', '/remote/session', {})
                self.assertEqual(resp.status, 200, ip)
                self.assertRegex(p['code'], r'^\d{6}$')
        for host in ['localhost:%d' % port, '127.0.0.1:%d' % port, '[::1]:%d' % port]:
            resp, _ = self.call(r, 'POST', '/remote/session', {}, headers={'Host': host})
            self.assertEqual(resp.status, 200, host)

    def test_loopback_peer_with_a_rebinding_host_is_refused(self):
        r = self.start()
        port = r.primary.server_address[1]
        for host in ['evil.example:%d' % port, 'evil.example', '192.168.1.23:%d' % port, 'testhost.local:%d' % port,
                     'localhost:%d' % (port + 1), 'localhost:80', 'localhost.evil.example:%d' % port, '']:
            resp, _ = self.call(r, 'POST', '/remote/session', {}, headers={'Host': host})
            self.assertEqual(resp.status, 403, host)
        self.assertIsNone(r.primary.relay.session)
        # the other speaker-only endpoints apply the same rule
        s = self.create(r)
        for method, path in [('POST', '/remote/state'), ('DELETE', '/remote/session'), ('POST', '/remote/code')]:
            resp, _ = self.call(r, method, path, {}, headers={'Host': 'evil.example:%d' % port,
                                                              'X-Fanfare-Speaker-Token': s['speakerToken']})
            self.assertEqual(resp.status, 403, path)
        resp, _ = self.call(r, 'GET', '/remote/events?token=' + s['speakerToken'], headers={'Host': 'evil.example:%d' % port})
        self.assertEqual(resp.status, 403)
        self.assertIsNotNone(r.primary.relay.session)  # nothing was ended

    def test_there_is_no_speaker_secret_anywhere(self):
        r = self.start()
        self.assertFalse(hasattr(r.primary.relay, 'speaker_secret'))
        for path in ['/', '/index.html', '/a.txt', '/remote/health']:
            for ip in ['127.0.0.1', '192.168.1.50']:
                with self.peer(ip):
                    c = self.conn(r)
                    c.request('GET', path, headers={'Sec-Fetch-Dest': 'document'})
                    resp = c.getresponse()
                    body = resp.read()
                    c.close()
                self.assertNotIn(b'secret', body.lower(), path)
                self.assertNotIn(b'<meta name="fanfare', body, path)
                self.assertEqual(body, PAGE.encode() if path in ('/', '/index.html') else body)
        resp, _ = self.call(r, 'GET', '/')
        self.assertEqual(resp.status, 200)
        self.assertEqual(int(resp.getheader('Content-Length')), len(PAGE.encode()))

    def test_phone_cannot_use_speaker_endpoints_with_a_stolen_remote_token(self):
        r = self.start()
        s = self.create(r)
        with self.peer('192.168.1.50'):
            resp, p = self.call(r, 'POST', '/remote/pair', {'code': s['code']})
            self.assertEqual(resp.status, 200)
            tok = p['token']
            for method, path in [('POST', '/remote/state'), ('DELETE', '/remote/session'), ('POST', '/remote/code')]:
                for headers in [{'X-Fanfare-Speaker-Token': tok}, {'X-Fanfare-Speaker-Token': s['speakerToken']}, {}]:
                    resp, _ = self.call(r, method, path, {}, headers=headers)
                    self.assertEqual(resp.status, 403, (path, headers))  # not a loopback peer: refused outright
            resp, _ = self.call(r, 'GET', '/remote/events?token=' + s['speakerToken'])
            self.assertEqual(resp.status, 403)
            resp, _ = self.call(r, 'GET', '/remote/events?token=nope')
            self.assertEqual(resp.status, 403)
        self.assertIsNotNone(r.primary.relay.session)

    def test_content_type_origin_and_host_checks(self):
        r = self.start()
        resp, _ = self.call(r, 'POST', '/remote/session', {}, ctype='text/plain')  # a cross-site "simple" request
        self.assertEqual(resp.status, 415)
        resp, _ = self.call(r, 'POST', '/remote/session', {}, ctype=None)
        self.assertEqual(resp.status, 415)
        resp, _ = self.call(r, 'POST', '/remote/session', {}, headers={'Origin': 'https://evil.example'})
        self.assertEqual(resp.status, 403)
        port = r.primary.server_address[1]
        resp, _ = self.call(r, 'POST', '/remote/session', {}, headers={'Origin': 'http://127.0.0.1:%d' % port})
        self.assertEqual(resp.status, 200)
        # DNS rebinding: a public name that resolves to this laptop is not an accepted Host
        resp, _ = self.call(r, 'POST', '/remote/session', {}, headers={'Host': 'evil.example:%d' % port})
        self.assertEqual(resp.status, 403)
        for host in ['localhost:%d' % port, '[::1]:%d' % port]:
            resp, _ = self.call(r, 'POST', '/remote/session', {}, headers={'Host': host})
            self.assertEqual(resp.status, 200, host)
        # phones may use the LAN address or a .local name for the pairing and the stream
        for host in ['192.168.1.23:%d' % port, 'testhost.local:%d' % port]:
            resp, _ = self.call(r, 'POST', '/remote/pair', {'code': '000000'}, headers={'Host': host})
            self.assertEqual(resp.status, 403, host)
            self.assertNotEqual(resp.getheader('Content-Type', '').count('json'), 0)

    def test_oversized_and_broken_bodies(self):
        r = self.start()
        resp, _ = self.call(r, 'POST', '/remote/session', raw=b'x' * 70000)
        self.assertEqual(resp.status, 413)
        resp, _ = self.call(r, 'POST', '/remote/session', {})
        self.assertEqual(resp.status, 200)
        resp, _ = self.call(r, 'POST', '/remote/pair', raw=b'{nope')
        self.assertEqual(resp.status, 400)
        resp, _ = self.call(r, 'POST', '/remote/pair', raw=b'[1]')
        self.assertEqual(resp.status, 400)

    def test_every_other_method_and_path_stays_405(self):
        r = self.start()
        for method, path in [('POST', '/a.txt'), ('POST', '/'), ('DELETE', '/a.txt'), ('PUT', '/remote/session'),
                             ('PATCH', '/remote/pair'), ('GET', '/remote/session'), ('GET', '/remote/pair'),
                             ('GET', '/remote/command'), ('POST', '/remote/health'), ('POST', '/remote/events'),
                             ('DELETE', '/remote/pair'), ('PROPFIND', '/remote/session'), ('OPTIONS', '/remote/session'),
                             ('HEAD', '/remote/session')]:
            resp, _ = self.call(r, method, path)
            self.assertEqual(resp.status, 405, '%s %s' % (method, path))
        resp, _ = self.call(r, 'POST', '/a.txt')
        self.assertEqual(resp.getheader('Allow'), 'GET, HEAD')
        resp, _ = self.call(r, 'PUT', '/remote/session')
        self.assertEqual(resp.getheader('Allow'), 'POST, DELETE')

    def test_unknown_remote_get_is_a_plain_404_and_traversal_still_blocked(self):
        r = self.start()
        resp, _ = self.call(r, 'GET', '/remote/nothing')
        self.assertEqual(resp.status, 404)
        resp, _ = self.call(r, 'GET', '/remote/../../outside.txt')
        self.assertIn(resp.status, (400, 404))

    # ---- the whole flow over real HTTP

    def test_full_flow_pair_command_state_end(self):
        r = self.start()
        s = self.create(r)
        speaker = self.stream(r, s['speakerToken'])
        speaker.wait('remotes')
        resp, p = self.call(r, 'POST', '/remote/pair', {'code': s['code']})
        self.assertEqual(resp.status, 200)
        tok = p['token']
        code2 = speaker.wait('code')['code']
        self.assertNotEqual(code2, s['code'])
        remote = self.stream(r, tok)
        self.assertTrue(remote.headers['content-type'].startswith('text/event-stream'))
        speaker.wait_for('remotes', lambda d: d == {'count': 1})
        self.assertFalse(remote.wait('state')['online'] is False)
        # remote -> speaker
        resp, _ = self.call(r, 'POST', '/remote/command', {'cmd': 'score', 'args': {'team': 'home', 'player': 'p1'}},
                            headers={'X-Fanfare-Remote': tok})
        self.assertEqual(resp.status, 200)
        self.assertEqual(speaker.wait('command'), {'cmd': 'score', 'args': {'team': 'home', 'player': 'p1'}})
        # speaker -> remote
        resp, _ = self.call(r, 'POST', '/remote/state', SNAPSHOT, headers={'X-Fanfare-Speaker-Token': s['speakerToken']})
        self.assertEqual(resp.status, 200)
        remote.wait_for('state', lambda d: d.get('state') == SNAPSHOT)
        # end: both streams close
        resp, _ = self.call(r, 'DELETE', '/remote/session', headers={'X-Fanfare-Speaker-Token': s['speakerToken']})
        self.assertEqual(resp.status, 200)
        self.assertTrue(remote.closed.wait(5))
        self.assertTrue(speaker.closed.wait(5))
        self.assertIn('ended', [n for n, _ in remote.events])
        resp, _ = self.call(r, 'POST', '/remote/command', {'cmd': 'stop'}, headers={'X-Fanfare-Remote': tok})
        self.assertEqual(resp.status, 401)

    def test_http_status_codes_for_pairing_and_commands(self):
        r = self.start()
        s = self.create(r)
        wrong = '000000' if s['code'] != '000000' else '000001'
        resp, p = self.call(r, 'POST', '/remote/pair', {'code': wrong})
        self.assertEqual((resp.status, p['error']), (403, 'wrong-code'))
        resp, p = self.call(r, 'POST', '/remote/pair', {'code': 'abc'})
        self.assertEqual(resp.status, 400)
        for _ in range(4):
            self.call(r, 'POST', '/remote/pair', {'code': wrong})
        resp, p = self.call(r, 'POST', '/remote/pair', {'code': s['code']})
        self.assertEqual((resp.status, p['error']), (423, 'locked'))
        resp, _ = self.call(r, 'POST', '/remote/command', {'cmd': 'stop'}, headers={'X-Fanfare-Remote': 'x'})
        self.assertEqual(resp.status, 401)

    def test_rate_limit_over_http(self):
        r = self.start()
        s = self.create(r)
        speaker = self.stream(r, s['speakerToken'])
        speaker.wait('remotes')
        tok = self.call(r, 'POST', '/remote/pair', {'code': s['code']})[1]['token']
        codes = [self.call(r, 'POST', '/remote/command', {'cmd': 'stop'}, headers={'X-Fanfare-Remote': tok})[0].status
                 for _ in range(8)]
        self.assertEqual(codes.count(429), 3, codes)

    def test_keep_alive_comments_are_sent(self):
        r = self.start()
        r.primary.relay.keepalive = 0.2
        s = self.create(r)
        speaker = self.stream(r, s['speakerToken'])
        deadline = time.time() + 5
        while time.time() < deadline and not speaker.comments:
            time.sleep(0.05)
        self.assertTrue(speaker.comments and speaker.comments[0].startswith(': '))

    def test_third_stream_for_a_token_is_429_and_the_older_ones_stay(self):
        r = self.start()
        s = self.create(r)
        speaker = self.stream(r, s['speakerToken'])
        speaker.wait('remotes')
        tok = self.call(r, 'POST', '/remote/pair', {'code': s['code']})[1]['token']
        a, b = self.stream(r, tok), self.stream(r, tok)
        self.assertEqual((a.status, b.status), (200, 200))
        resp, p = self.call(r, 'GET', '/remote/events?token=' + tok)
        self.assertEqual((resp.status, p['error']), (429, 'too-many-streams'))
        self.assertFalse(a.closed.is_set())
        self.assertFalse(b.closed.is_set())

    def test_speaker_is_told_when_pairing_locks_and_new_code_unlocks(self):
        r = self.start()
        s = self.create(r)
        speaker = self.stream(r, s['speakerToken'])
        speaker.wait('remotes')
        wrong = '000000' if s['code'] != '000000' else '000001'
        for _ in range(5):
            self.call(r, 'POST', '/remote/pair', {'code': wrong})
        speaker.wait('locked')
        resp, p = self.call(r, 'POST', '/remote/code', {}, headers={'X-Fanfare-Speaker-Token': s['speakerToken']})
        self.assertEqual(resp.status, 200)
        resp, _ = self.call(r, 'POST', '/remote/pair', {'code': p['code']})
        self.assertEqual(resp.status, 200)

    def test_default_keep_alive_is_fifteen_seconds(self):
        self.assertEqual(fl.Relay().keepalive, 15)

    def test_shutting_the_server_down_closes_streams(self):
        r = self.run_server('--lan', '--port', '0')
        s = self.create(r)
        speaker = self.stream(r, s['speakerToken'])
        speaker.wait('remotes')
        r.close()
        self.assertTrue(speaker.closed.wait(5))

    def test_a_dropped_stream_is_forgotten(self):
        r = self.start()
        r.primary.relay.keepalive = 0.1
        s = self.create(r)
        speaker = self.stream(r, s['speakerToken'])
        speaker.wait('remotes')
        tok = self.call(r, 'POST', '/remote/pair', {'code': s['code']})[1]['token']
        remote = self.Sse(self, r, tok)
        speaker.wait('remotes')
        speaker.wait_for('remotes', lambda d: d == {'count': 1})
        remote.close()  # the phone goes away
        speaker.wait_for('remotes', lambda d: d == {'count': 0})

    # ---- privacy

    def test_logs_contain_only_method_path_status(self):
        r = self.start()
        s = self.create(r)
        speaker = self.stream(r, s['speakerToken'])
        speaker.wait('remotes')
        p = self.call(r, 'POST', '/remote/pair', {'code': s['code']})[1]
        tok = p['token']
        self.call(r, 'POST', '/remote/pair', {'code': '000000'})
        self.call(r, 'POST', '/remote/command', {'cmd': 'stop'}, headers={'X-Fanfare-Remote': tok})
        remote = self.stream(r, tok)
        self.call(r, 'POST', '/remote/state', SNAPSHOT, headers={'X-Fanfare-Speaker-Token': s['speakerToken']})
        self.call(r, 'DELETE', '/remote/session', headers={'X-Fanfare-Speaker-Token': s['speakerToken']})
        remote.closed.wait(5)
        time.sleep(0.2)
        log = '\n'.join(self.lines)
        for secret in [s['speakerToken'], tok, s['code'], 'Lea', 'FC Example', '127.0.0.1']:
            self.assertNotIn(secret, log)
        self.assertNotIn('?', log)
        self.assertGreater(len(self.lines), 5)
        for line in self.lines:
            self.assertRegex(line, r'^[A-Z]+ /[A-Za-z0-9_./-]* \d{3}$')
        self.assertIn('GET /remote/events 200', self.lines)
        self.assertIn('POST /remote/pair 403', self.lines)

    def test_nothing_about_sessions_is_written_to_disk(self):
        import os
        before = sorted(os.listdir(self.root)), (sorted(os.listdir(self.cfg)) if self.cfg.exists() else [])
        r = self.start()
        s = self.create(r)
        self.call(r, 'POST', '/remote/pair', {'code': s['code']})
        after = sorted(os.listdir(self.root)), (sorted(os.listdir(self.cfg)) if self.cfg.exists() else [])
        self.assertEqual(before, after)


if __name__ == '__main__':
    unittest.main()
