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
