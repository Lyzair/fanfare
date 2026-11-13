import type { AppState, CustomSound, Lang, Player, Roster, Side, SoundSlot, SportId, TeamFile, TemplateKey } from '../domain/model';
import { parsePlayerLines } from '../domain/roster';
import { defaultTemplates, getPack } from '../i18n';
import { VOICES, defaultVoiceFor } from '../tts/voices';

export type Action =
  | { type: 'setSport'; sport: SportId } | { type: 'setLang'; lang: Lang } | { type: 'setVoice'; voiceId: string }
  | { type: 'setMatch'; home?: string; opponent?: string; homeSayAs?: string; opponentSayAs?: string } | { type: 'togglePositions'; on: boolean }
  // `side` picks the list an edit applies to; omitted = our own team
  | { type: 'addPlayers'; text: string; onField: boolean; side?: Side }
  | { type: 'updatePlayer'; id: string; patch: Partial<Omit<Player, 'id'>>; side?: Side }
  | { type: 'removePlayer'; id: string; side?: Side } | { type: 'restorePlayer'; player: Player; index: number; side?: Side }
  | { type: 'movePlayer'; id: string; delta: -1 | 1; side?: Side }
  | { type: 'importGuestTeam'; team: TeamFile } | { type: 'clearGuests' }
  | { type: 'setTemplate'; key: TemplateKey; text: string } | { type: 'resetTemplates' }
  | { type: 'setSoundsEnabled'; on: boolean }
  | { type: 'setCustomSound'; slot: SoundSlot; sound: CustomSound | null }
  | { type: 'replaceAll'; state: AppState };

function defaultRoster(sport: SportId, lang: Lang): Roster {
  return { homeTeam: '', homeSayAs: '', opponent: '', opponentSayAs: '', showPositions: false, players: [], guestPlayers: [], templates: defaultTemplates(sport, lang) };
}

export function initialState(lang: Lang = 'en'): AppState {
  return {
    version: 1, sport: 'football', lang, voiceId: defaultVoiceFor(lang), soundsEnabled: true,
    rosters: { football: defaultRoster('football', lang) }, customSounds: {},
  };
}

export function currentRoster(s: AppState): Roster {
  return s.rosters[s.sport] ?? defaultRoster(s.sport, s.lang);
}

/** Older saved states and exports predate the guest team: give them the defaults. */
function withGuestDefaults(s: AppState): AppState {
  const rosters: AppState['rosters'] = {};
  for (const [sport, r] of Object.entries(s.rosters) as [SportId, Roster][]) {
    const defaults = defaultTemplates(sport, s.lang);
    rosters[sport] = {
      ...r, guestPlayers: r.guestPlayers ?? [],
      templates: { ...r.templates, guestIntro: r.templates.guestIntro ?? defaults.guestIntro, guestScore: r.templates.guestScore ?? defaults.guestScore },
    };
  }
  return { ...s, rosters };
}

const listKey = (side: Side | undefined) => (side === 'guest' ? 'guestPlayers' : 'players');

/** Applies `fn` to one team's player list. */
function withPlayers(s: AppState, side: Side | undefined, fn: (players: Player[]) => Player[]): AppState {
  const key = listKey(side);
  return withRoster(s, r => ({ ...r, [key]: fn(r[key]) }));
}

function withRoster(s: AppState, fn: (r: Roster) => Roster): AppState {
  return { ...s, rosters: { ...s.rosters, [s.sport]: fn(currentRoster(s)) } };
}

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'setSport':
      return { ...s, sport: a.sport, rosters: { ...s.rosters, [a.sport]: s.rosters[a.sport] ?? defaultRoster(a.sport, s.lang) } };
    case 'setLang': {
      const rosters: AppState['rosters'] = {};
      for (const [sport, r] of Object.entries(s.rosters) as [SportId, Roster][]) {
        const oldDefaults = defaultTemplates(sport, s.lang), newDefaults = defaultTemplates(sport, a.lang);
        const templates = { ...r.templates };
        for (const k of Object.keys(templates) as TemplateKey[]) {
          if (templates[k] === oldDefaults[k]) templates[k] = newDefaults[k];
        }
        rosters[sport] = { ...r, templates };
      }
      const voiceOk = VOICES.some(v => v.id === s.voiceId && v.lang === a.lang);
      return { ...s, lang: a.lang, rosters, voiceId: voiceOk ? s.voiceId : defaultVoiceFor(a.lang) };
    }
    case 'setVoice': return { ...s, voiceId: a.voiceId };
    case 'setMatch':
      return withRoster(s, r => ({
        ...r, homeTeam: a.home ?? r.homeTeam, opponent: a.opponent ?? r.opponent,
        homeSayAs: a.homeSayAs ?? r.homeSayAs, opponentSayAs: a.opponentSayAs ?? r.opponentSayAs,
      }));
    case 'togglePositions': return withRoster(s, r => ({ ...r, showPositions: a.on }));
    case 'addPlayers': {
      const parsed = parsePlayerLines(a.text, getPack(s.lang).sports[s.sport].positions, getPack(s.lang).staffHeadings);
      if (parsed.length === 0) return s;
      const added = parsed.map(p => ({ ...p, id: crypto.randomUUID(), onField: a.onField, customText: null, sayAs: '' }));
      return withPlayers(withRoster(s, r => ({ ...r, showPositions: r.showPositions || parsed.some(p => p.position !== '') })), a.side, ps => [...ps, ...added]);
    }
    case 'updatePlayer': {
      const patch = { ...a.patch };
      if (patch.name !== undefined) {
        patch.name = patch.name.trim();
        if (patch.name === '') return s;
      }
      if (typeof patch.customText === 'string' && patch.customText.trim() === '') patch.customText = null;
      return withPlayers(s, a.side, ps => ps.map(p => (p.id === a.id ? { ...p, ...patch } : p)));
    }
    case 'removePlayer': return withPlayers(s, a.side, ps => ps.filter(p => p.id !== a.id));
    case 'restorePlayer': {
      if (currentRoster(s)[listKey(a.side)].some(p => p.id === a.player.id)) return s;
      return withPlayers(s, a.side, ps => {
        const players = [...ps];
        players.splice(Math.min(Math.max(a.index, 0), players.length), 0, a.player);
        return players;
      });
    }
    case 'movePlayer': {
      const list = currentRoster(s)[listKey(a.side)];
      const i = list.findIndex(p => p.id === a.id), j = i + a.delta;
      if (i < 0 || j < 0 || j >= list.length) return s;
      return withPlayers(s, a.side, ps => {
        const players = [...ps];
        [players[i], players[j]] = [players[j], players[i]];
        return players;
      });
    }
    case 'importGuestTeam': {
      if (a.team.sport !== s.sport) return s;
      const guestPlayers = a.team.players.map(p => ({ ...p, id: crypto.randomUUID(), customText: null }));
      return withRoster(s, r => ({
        ...r, guestPlayers,
        showPositions: r.showPositions || guestPlayers.some(p => p.position !== ''),
        opponent: a.team.teamName.trim() ? a.team.teamName : r.opponent,
        opponentSayAs: a.team.teamName.trim() ? a.team.teamSayAs : r.opponentSayAs,
      }));
    }
    case 'clearGuests': return withRoster(s, r => ({ ...r, guestPlayers: [] }));
    case 'setTemplate': return withRoster(s, r => ({ ...r, templates: { ...r.templates, [a.key]: a.text } }));
    case 'resetTemplates': return withRoster(s, r => ({ ...r, templates: defaultTemplates(s.sport, s.lang) }));
    case 'setSoundsEnabled': return { ...s, soundsEnabled: a.on };
    case 'setCustomSound': {
      const customSounds = { ...s.customSounds };
      if (a.sound) customSounds[a.slot] = a.sound; else delete customSounds[a.slot];
      return { ...s, customSounds };
    }
    case 'replaceAll': return withGuestDefaults(a.state);
  }
}
