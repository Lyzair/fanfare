import { SPORTS, SPORT_IDS } from '../domain/sports';

/** Per-sport accent colours, generated from SPORTS so they live in one place. */
export const ACCENT_CSS = SPORT_IDS.map(id => `[data-sport="${id}"]{--accent:${SPORTS[id].accent}}`).join('\n');
