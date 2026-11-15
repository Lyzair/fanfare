import { useContext, useMemo, useRef, useState } from 'preact/hooks';
import type { Lang } from '../domain/model';
import { hasRespell } from '../domain/respell';
import type { Suggestions, SuggestOptions } from '../domain/respell/suggest';
import { t } from '../i18n';
import type { UiStrings } from '../i18n';
import { VOICES } from '../tts/voices';
import { ESPEAK_VOICES, defaultEspeakVoice, isEspeakVoice } from '../tts/espeakVoices';
import { playVoiceText } from './actions';
import { fill } from './fill';
import { PlaybackError } from './PlaybackError';
import { ServicesContext } from './types';

type RunOptions = Omit<SuggestOptions, 'phonemize'>;
export type RunSuggest = (o: RunOptions) => Promise<Suggestions>;

/** Loads the phonemizer (and its wasm) only when ✨ is first used. */
const runReal: RunSuggest = async (o) => {
  const [{ suggest }, { phonemize }] = await Promise.all([import('../domain/respell/suggest'), import('../tts/phonemize')]);
  return suggest({ ...o, phonemize });
};

export interface SuggestPanelProps {
  lang: Lang;
  voiceId: string;
  /** The display name. */
  name: string;
  origSpelling: string;
  /** '' = the team language. */
  nameLang: string;
  onFields: (patch: { origSpelling?: string; nameLang?: string }) => void;
  /** Fills the "Say it like…" field. */
  onUse: (text: string) => void;
  run?: RunSuggest;
}

/** Native language names ("polski", "Türkçe"), falling back to the code. */
function languageOptions(): Array<{ code: string; label: string }> {
  return ESPEAK_VOICES.map(({ code, tag }) => {
    let label = code;
    try {
      const n = new Intl.DisplayNames([tag], { type: 'language' }).of(tag);
      if (n) label = n;
    } catch { /* keep the code */ }
    return { code, label };
  }).sort((a, b) => a.label.localeCompare(b.label));
}

const dots = (level: 1 | 2 | 3) => '●'.repeat(level) + '○'.repeat(3 - level);

/** ✨ Suggest: the toggle button and the panel under the "Say it like…" field. */
export default function SuggestPanel(p: SuggestPanelProps) {
  const tr = (k: keyof UiStrings) => t(p.lang, k);
  const services = useContext(ServicesContext);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [hearError, setHearError] = useState<unknown>(null);
  const [result, setResult] = useState<Suggestions | null>(null);
  const ticket = useRef(0);
  const options = useMemo(languageOptions, []);

  const voiceLang = VOICES.find(v => v.id === p.voiceId)?.lang ?? p.lang;
  const supported = hasRespell(voiceLang);
  const nameVoice = isEspeakVoice(p.nameLang) ? p.nameLang : defaultEspeakVoice(p.lang);
  const spelling = p.origSpelling !== '' ? p.origSpelling : p.name;

  const find = async () => {
    const mine = ++ticket.current;
    setBusy(true); setError(false); setResult(null);
    try {
      const r = await (p.run ?? runReal)({ name: p.name, origSpelling: spelling, nameVoice, targetLang: voiceLang });
      if (mine === ticket.current) setResult(r);
    } catch {
      if (mine === ticket.current) setError(true);
    } finally {
      if (mine === ticket.current) setBusy(false);
    }
  };

  const hear = (text: string) => {
    if (!services) return;
    playVoiceText({ ...services, onStart: () => setHearError(null), onError: e => setHearError(e ?? true) }, p.voiceId, text);
  };

  const level = (l: 1 | 2 | 3) => (l === 3 ? tr('suggestClose3') : l === 2 ? tr('suggestClose2') : tr('suggestClose1'));
  const row = (text: string, l: 1 | 2 | 3, plain: boolean) => (
    <li class="suggest-row" key={`${plain ? 'plain' : 'c'}-${text}`}>
      <button type="button" aria-label={fill(tr('suggestHearOne'), { text })} title={fill(tr('suggestHearOne'), { text })} onClick={() => hear(text)}>▶</button>
      <span class="suggest-text">{text}{plain && <span class="hint"> ({tr('suggestPlain')})</span>}</span>
      <span class={`closeness c${l}`} role="img" aria-label={level(l)} title={level(l)}>{dots(l)}</span>
      {!plain && (
        <button type="button" class="suggest-use" aria-label={fill(tr('suggestUseFor'), { text })} onClick={() => p.onUse(text)}>{tr('suggestUse')}</button>
      )}
    </li>
  );

  return (
    <div class="suggest">
      <button type="button" class="suggest-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>{tr('suggestButton')}</button>
      {open && (
        <div class="suggest-body">
          {!supported ? <p class="hint">{tr('suggestUnavailable')}</p> : (
            <>
              <label class="stack">{tr('suggestLang')}
                <select value={nameVoice} onChange={e => p.onFields({ nameLang: e.currentTarget.value })}>
                  {options.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
                </select>
              </label>
              <label class="stack">{tr('suggestOrig')}
                <input value={spelling} maxLength={80} onInput={e => p.onFields({ origSpelling: e.currentTarget.value })} />
              </label>
              <p class="hint">{tr('suggestOrigHint')}</p>
              <button type="button" class="suggest-run" disabled={busy} onClick={() => void find()}>{tr('suggestRun')}</button>
              {busy && <p role="status" class="suggest-busy"><span class="spinner" aria-hidden="true" />{tr('suggestBusy')}</p>}
              {error && <p role="alert" class="error">{tr('suggestError')}</p>}
              <PlaybackError lang={p.lang} error={hearError} />
              {result && (
                <>
                  <ul class="suggest-list">
                    {row(result.baseline.text, result.baseline.level, true)}
                    {result.candidates.map(c => row(c.text, c.level, false))}
                  </ul>
                  {result.candidates.length === 0 && <p class="hint">{tr('suggestNone')}</p>}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
