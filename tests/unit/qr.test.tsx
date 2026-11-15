import { render } from '@testing-library/preact';
import { QrCode, qrMatrix } from '../../src/remote/qr';

test('QR matrix for a LAN address has finder patterns and is deterministic', () => {
  const m = qrMatrix('http://192.168.1.23:8080/#remote');
  expect(m.length).toBeGreaterThanOrEqual(25);
  expect(m.every(row => row.length === m.length)).toBe(true);
  for (const [r, c] of [[0, 0], [0, m.length - 7], [m.length - 7, 0]]) {
    expect(m[r].slice(c, c + 7)).toEqual([true, true, true, true, true, true, true]); // top edge of a finder pattern
    expect(m[r + 3][c + 3]).toBe(true);
    expect(m[r + 1][c + 1]).toBe(false);
  }
  expect(qrMatrix('http://192.168.1.23:8080/#remote')).toEqual(m);
  expect(qrMatrix('http://192.168.1.24:8080/#remote')).not.toEqual(m);
});

test('QrCode renders an accessible svg with a quiet zone, using no external resources', () => {
  const { container } = render(<QrCode text="https://10.0.0.7:8443/#remote" label="QR code for the phone remote" />);
  const svg = container.querySelector('svg')!;
  expect(svg.getAttribute('role')).toBe('img');
  expect(svg.getAttribute('aria-label')).toBe('QR code for the phone remote');
  expect(svg.querySelector('path')!.getAttribute('d')!.length).toBeGreaterThan(100);
  expect(svg.querySelector('rect')!.getAttribute('fill')).toBe('#fff');
  expect(container.innerHTML).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
});
