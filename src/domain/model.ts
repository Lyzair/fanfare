export type Lang = 'de' | 'en' | 'fr' | 'es' | 'it' | 'nl' | 'pl' | 'tr' | 'uk' | 'ar';
export type SportId = 'football' | 'handball' | 'basketball' | 'volleyball' | 'fieldhockey' | 'icehockey' | 'floorball';
export type SoundSlot = 'score' | 'intro';
export type TemplateKey = 'intro' | 'field' | 'bench' | 'score';

export interface Player {
  id: string;
  name: string;
  number: string;
  position: string;
  onField: boolean;
  customText: string | null;
  /** How the voice should say the name (empty = say the name itself). */
  sayAs: string;
}

export interface Roster {
  homeTeam: string;
  homeSayAs: string;
  opponent: string;
  opponentSayAs: string;
  showPositions: boolean;
  players: Player[];
  templates: Record<TemplateKey, string>;
}

/** The audio blob is stored separately, keyed by slot. */
export interface CustomSound {
  name: string;
  mime: string;
}

export interface AppState {
  version: 1;
  sport: SportId;
  lang: Lang;
  voiceId: string;
  soundsEnabled: boolean;
  rosters: Partial<Record<SportId, Roster>>;
  customSounds: Partial<Record<SoundSlot, CustomSound>>;
}
