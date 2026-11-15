import qrcode from 'qrcode-generator';

/** QR modules (true = dark) for a text. Generated locally by the bundled MIT `qrcode-generator`. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

const QUIET = 4; // modules of white around the code, as the QR standard asks

/** The code as inline SVG: dark modules on white (also in dark mode, scanners need that). */
export function QrCode({ text, label, size = 216 }: { text: string; label: string; size?: number }) {
  const m = qrMatrix(text);
  const n = m.length + 2 * QUIET;
  let d = '';
  m.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) { c++; continue; }
      let end = c;
      while (end < row.length && row[end]) end++;
      d += `M${c + QUIET} ${r + QUIET}h${end - c}v1h-${end - c}z`;
      c = end;
    }
  });
  return (
    <svg class="qr" role="img" aria-label={label} viewBox={`0 0 ${n} ${n}`} width={size} height={size} shape-rendering="crispEdges">
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
