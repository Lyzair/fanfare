export type Lang = 'de' | 'en' | 'fr' | 'es' | 'it' | 'nl' | 'pl' | 'tr' | 'uk' | 'ar';
export type SportId = 'football' | 'handball' | 'basketball' | 'volleyball' | 'fieldhockey' | 'icehockey' | 'floorball';
export type SoundSlot = 'score' | 'intro';
export type TemplateKey = 'intro' | 'field' | 'bench' | 'score' | 'guestIntro' | 'guestScore';
/** Which team's list an edit applies to: our own (`players`) or the guests (`guestPlayers`). */
export type Side = 'home' | 'guest';

export interface Player {
  id: string;
  name: string;
  number: string;
  position: string;
  onField: boolean;
  customText: string | null;
  /** How the voice should say the name (empty = say the name itself). */
  sayAs: string;
  /** The name in its own spelling/script, for Suggest ('' = the display name). */
  origSpelling: string;
  /** eSpeak voice code of the name's language ('' = the team language). */
  nameLang: string;
}

export interface Roster {
  homeTeam: string;
  homeSayAs: string;
  homeOrigSpelling: string;
  homeNameLang: string;
  opponent: string;
  opponentSayAs: string;
  opponentOrigSpelling: string;
  opponentNameLang: string;
  showPositions: boolean;
  players: Player[];
  /** The visiting team, announced before ours. Empty = no guests. */
  guestPlayers: Player[];
  templates: Record<TemplateKey, string>;
}

/** The audio blob is stored separately, keyed by slot. */
/** What one coach sends to the other: names only, no clips or settings. */
export interface TeamFile {
  fanfareTeam: 1;
  sport: SportId;
  teamName: string;
  teamSayAs: string;
  teamOrigSpelling: string;
  teamNameLang: string;
  players: Array<Pick<Player, 'name' | 'number' | 'position' | 'onField' | 'sayAs' | 'origSpelling' | 'nameLang'>>;
}

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
  /** The user's own local voice server (Fanfare Studio), or null. Only ever a localhost URL. */
  localTts: { url: string } | null;
}
