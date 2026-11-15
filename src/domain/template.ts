import type { Player, Roster } from './model';

const PLACEHOLDER = /\{(\w+)\}/g;

/** Fills `{key}` placeholders; `[...]` sections vanish if a known placeholder inside is empty. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  const isKnown = (key: string) => Object.prototype.hasOwnProperty.call(vars, key);
  const withSections = template.replace(/\[([^\[\]]*)\]/g, (_m, inner: string) => {
    for (const m of inner.matchAll(PLACEHOLDER)) {
      if (isKnown(m[1]) && vars[m[1]].trim() === '') return '';
    }
    return inner;
  });
  const filled = withSections.replace(PLACEHOLDER, (whole, key: string) =>
    isKnown(key) ? vars[key].trim() : whole,
  );
  return filled.replace(/ {2,}/g, ' ').trim();
}

function varsFor(player: Player | null, roster: Roster): Record<string, string> {
  return {
    name: player?.name ?? '',
    number: player?.number ?? '',
    position: roster.showPositions ? (player?.position ?? '') : '',
    home: roster.homeTeam,
    opponent: roster.opponent,
  };
}

export function calloutText(player: Player, roster: Roster): string {
  if (player.customText !== null) return player.customText;
  const template = player.onField ? roster.templates.field : roster.templates.bench;
  return renderTemplate(template, varsFor(player, roster));
}

export function scoreText(scorer: Player | null, roster: Roster): string {
  return renderTemplate(roster.templates.score, varsFor(scorer, roster));
}

export function introText(roster: Roster): string {
  return renderTemplate(roster.templates.intro, varsFor(null, roster));
}

export function guestIntroText(roster: Roster): string {
  return renderTemplate(roster.templates.guestIntro, varsFor(null, roster));
}

export function guestScoreText(scorer: Player | null, roster: Roster): string {
  return renderTemplate(roster.templates.guestScore, varsFor(scorer, roster));
}

const WORD_END = /[\p{L}\p{N}]$/u;
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * What the voice should read: every player's name, the home team and the opponent are replaced by
 * their non-empty "say it like" hint. Longest names first, whole words only, case-sensitive, and all
 * replacements happen in a single pass so a hint is never re-matched.
 */
export function speechText(displayText: string, roster: Roster): string {
  const hints = new Map<string, string>();
  const add = (name: string, sayAs: string) => {
    const n = name.trim();
    if (n && sayAs.trim() && !hints.has(n)) hints.set(n, sayAs.trim());
  };
  for (const p of [...roster.players, ...roster.guestPlayers]) add(p.name, p.sayAs);
  add(roster.homeTeam, roster.homeSayAs);
  add(roster.opponent, roster.opponentSayAs);
  if (hints.size === 0) return displayText;
  const names = [...hints.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  // "Not after a letter or digit" is checked by hand: a lookbehind in the pattern needs Safari 16.4.
  const re = new RegExp(`(?:${names.join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  let out = '', done = 0;
  for (let m = re.exec(displayText); m; m = re.exec(displayText)) {
    if (WORD_END.test(displayText.slice(0, m.index))) {
      re.lastIndex = m.index + String.fromCodePoint(displayText.codePointAt(m.index)!).length; // inside a word: look on from the next character
      continue;
    }
    out += displayText.slice(done, m.index) + (hints.get(m[0]) ?? m[0]);
    done = re.lastIndex;
  }
  return out + displayText.slice(done);
}
