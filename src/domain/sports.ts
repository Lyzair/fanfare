import type { SportId } from './model';

export interface SportDef {
  id: SportId;
  icon: string;
  /** Background colour with at least 4.5:1 contrast against white text. */
  accent: string;
  fieldPlayers: number;
  positionCount: number;
}

export const SPORT_IDS: SportId[] = ['football', 'handball', 'basketball', 'volleyball', 'fieldhockey', 'icehockey', 'floorball'];

export const SPORTS: Record<SportId, SportDef> = {
  football: { id: 'football', icon: '⚽', accent: '#1a7431', fieldPlayers: 11, positionCount: 4 },
  handball: { id: 'handball', icon: '🤾', accent: '#be123c', fieldPlayers: 7, positionCount: 7 },
  basketball: { id: 'basketball', icon: '🏀', accent: '#b45309', fieldPlayers: 5, positionCount: 5 },
  volleyball: { id: 'volleyball', icon: '🏐', accent: '#a16207', fieldPlayers: 6, positionCount: 5 },
  fieldhockey: { id: 'fieldhockey', icon: '🏑', accent: '#0f766e', fieldPlayers: 11, positionCount: 4 },
  icehockey: { id: 'icehockey', icon: '🏒', accent: '#3730a3', fieldPlayers: 6, positionCount: 4 },
  floorball: { id: 'floorball', icon: '🏑', accent: '#6d28d9', fieldPlayers: 6, positionCount: 4 },
};
