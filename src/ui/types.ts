import { createContext } from 'preact';
import type { AppState } from '../domain/model';
import type { Action } from '../state/reducer';
import type { AudioQueue } from '../audio/queue';
import type { SpeechCache } from '../tts/speechCache';

export type PanelProps = { state: AppState; dispatch: (a: Action) => void };

export interface Services { queue: AudioQueue; speech: SpeechCache }

export const ServicesContext = createContext<Services | null>(null);
