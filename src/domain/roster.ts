export interface ParsedPlayer { name: string; number: string; position: string }

const HAS_LETTER = /\p{L}/u;
const NON_NAME_TOKEN = /^[\d\p{P}\p{Pd}]+$/u;
const TABLE_HEADINGS = new Set(['spieler', 'einsätze', 'einsatzminuten', 'tore', 'player', 'appearances', 'minutes', 'goals']);

const norm = (s: string) => s.toLowerCase().replace(/:\s*$/, '').trim();

function isTableHeader(line: string): boolean {
  const words = line.split(' ').filter(w => HAS_LETTER.test(w));
  return words.length > 0 && words.every(w => TABLE_HEADINGS.has(w.toLowerCase()));
}

/** "k.A." / "k. A." followed only by non-letter tokens (hidden player in a fussball.de table). */
function isHiddenPlayer(line: string): boolean {
  const m = /^k\.\s?a\.?(?=\s|$)(.*)$/i.exec(line);
  return !!m && !HAS_LETTER.test(m[1]);
}

export function parsePlayerLines(text: string, positions: string[], staffHeadings: string[]): ParsedPlayer[] {
  let lines = text.split(/[\n;]/).map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l);
  if (lines.length === 1 && lines[0].includes(',')) {
    lines = lines[0].split(',').map(l => l.trim()).filter(l => l);
  }
  const posByKey = new Map(positions.map(p => [norm(p), p]));
  const staffKeys = new Set(staffHeadings.map(norm));

  const out: ParsedPlayer[] = [];
  let position = '';
  let skipping = false;
  for (const line of lines) {
    if (!HAS_LETTER.test(line) && !isHiddenPlayer(line)) continue;
    if (line.length > 80 || /http|www\.|@/i.test(line)) continue;
    const key = norm(line);
    const heading = posByKey.get(key);
    if (heading !== undefined) { position = heading; skipping = false; continue; }
    if (staffKeys.has(key)) { skipping = true; continue; }
    if (skipping) continue;
    if (isHiddenPlayer(line) || isTableHeader(line)) continue;

    let number = '';
    let rest = line;
    const m = /^#?(\d{1,3})(?:\s+|\.\s*)(\S.*)$/.exec(rest);
    if (m) { number = m[1]; rest = m[2]; }
    const tokens = rest.split(' ');
    while (tokens.length > 1 && NON_NAME_TOKEN.test(tokens[tokens.length - 1])) tokens.pop();
    rest = tokens.join(' ');
    if (!HAS_LETTER.test(rest)) continue;
    out.push({ name: rest, number, position });
  }

  const oneComma = (n: string) => n.split(',').length === 2;
  if (out.length >= 2 && out.every(p => oneComma(p.name))) {
    for (const p of out) {
      const [last, first] = p.name.split(',').map(s => s.trim());
      p.name = `${first} ${last}`.trim();
    }
  }
  return out.map(p => ({ ...p, name: p.name.slice(0, 60) }));
}
