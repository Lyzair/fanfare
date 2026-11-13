import type { AppState, CustomSound, Lang, Player, Roster, SoundSlot, SportId, TemplateKey } from '../domain/model';
import { parsePlayerLines } from '../domain/roster';
import { defaultTemplates, getPack } from '../i18n';
import { VOICES, defaultVoiceFor } from '../tts/voices';

export type Action =
  | { type: 'setSport'; sport: SportId } | { type: 'setLang'; lang: Lang } | { type: 'setVoice'; voiceId: string }
  | { type: 'setMatch'; home?: string; opponent?: string; homeSayAs?: string; opponentSayAs?: string } | { type: 'togglePositions'; on: boolean }
  | { type: 'addPlayers'; text: string; onField: boolean }
  | { type: 'updatePlayer'; id: string; patch: Partial<Omit<Player, 'id'>> }
  | { type: 'removePlayer'; id: string } | { type: 'restorePlayer'; player: Player; index: number } | { type: 'movePlayer'; id: string; delta: -1 | 1 }
  | { type: 'setTemplate'; key: TemplateKey; text: string } | { type: 'resetTemplates' }
  | { type: 'setSoundsEnabled'; on: boolean }
  | { type: 'setCustomSound'; slot: SoundSlot; sound: CustomSound | null }
  | { type: 'replaceAll'; state: AppState };

function defaultRoster(sport: SportId, lang: Lang): Roster {
  return { homeTeam: '', homeSayAs: '', opponent: '', opponentSayAs: '', showPositions: false, players: [], templates: defaultTemplates(sport, lang) };
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
      return withRoster(s, r => ({
        ...r,
        showPositions: r.showPositions || parsed.some(p => p.position !== ''),
        players: [...r.players, ...parsed.map(p => ({ ...p, id: crypto.randomUUID(), onField: a.onField, customText: null, sayAs: '' }))],
      }));
    }
    case 'updatePlayer': {
      const patch = { ...a.patch };
      if (patch.name !== undefined) {
        patch.name = patch.name.trim();
        if (patch.name === '') return s;
      }
      if (typeof patch.customText === 'string' && patch.customText.trim() === '') patch.customText = null;
      return withRoster(s, r => ({ ...r, players: r.players.map(p => (p.id === a.id ? { ...p, ...patch } : p)) }));
    }
    case 'removePlayer': return withRoster(s, r => ({ ...r, players: r.players.filter(p => p.id !== a.id) }));
    case 'restorePlayer': {
      if (currentRoster(s).players.some(p => p.id === a.player.id)) return s;
      return withRoster(s, r => {
        const players = [...r.players];
        players.splice(Math.min(Math.max(a.index, 0), players.length), 0, a.player);
        return { ...r, players };
      });
    }
    case 'movePlayer': {
      const r = currentRoster(s);
      const i = r.players.findIndex(p => p.id === a.id), j = i + a.delta;
      if (i < 0 || j < 0 || j >= r.players.length) return s;
      const players = [...r.players];
      [players[i], players[j]] = [players[j], players[i]];
      return withRoster(s, r2 => ({ ...r2, players }));
    }
    case 'setTemplate': return withRoster(s, r => ({ ...r, templates: { ...r.templates, [a.key]: a.text } }));
    case 'resetTemplates': return withRoster(s, r => ({ ...r, templates: defaultTemplates(s.sport, s.lang) }));
    case 'setSoundsEnabled': return { ...s, soundsEnabled: a.on };
    case 'setCustomSound': {
      const customSounds = { ...s.customSounds };
      if (a.sound) customSounds[a.slot] = a.sound; else delete customSounds[a.slot];
      return { ...s, customSounds };
    }
    case 'replaceAll': return a.state;
  }
}
