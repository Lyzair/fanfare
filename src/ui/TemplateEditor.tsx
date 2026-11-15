import { useRef } from 'preact/hooks';
import type { Lang, TemplateKey } from '../domain/model';
import { t } from '../i18n';
import type { UiStrings } from '../i18n';
import type { Action } from '../state/reducer';
import { fill } from './fill';

const PLACEHOLDERS = ['name', 'number', 'position', 'home', 'opponent'] as const;
const TEMPLATE_KEYS: { key: TemplateKey; label: keyof UiStrings }[] = [
  { key: 'guestIntro', label: 'guestIntroLabel' },
  { key: 'intro', label: 'templateIntro' },
  { key: 'field', label: 'templateField' },
  { key: 'bench', label: 'templateBench' },
  { key: 'score', label: 'templateScore' },
  { key: 'guestScore', label: 'templateGuestScore' },
];

interface Props { lang: Lang; templates: Record<TemplateKey, string>; dispatch: (a: Action) => void }

/** "Change the standard texts": one text box per callout; the chips insert a placeholder at the caret. */
export function TemplateEditor({ lang, templates, dispatch }: Props) {
  const tr = (k: keyof UiStrings) => t(lang, k);
  const boxes = useRef<Partial<Record<TemplateKey, HTMLTextAreaElement | null>>>({});
  const lastFocused = useRef<TemplateKey>('field');

  const insertChip = (name: string) => {
    const key = lastFocused.current;
    const el = boxes.current[key];
    const value = templates[key];
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;
    const ins = `{${name}}`;
    dispatch({ type: 'setTemplate', key, text: value.slice(0, start) + ins + value.slice(end) });
    const caret = start + ins.length;
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(caret, caret); });
  };

  return (
    <details class="help templates">
      <summary>{tr('templatesTitle')}</summary>
      <p class="hint">{tr('templatesHelp')}</p>
      <div class="chips">
        {PLACEHOLDERS.map(n => (
          <button type="button" class="chip" key={n} aria-label={fill(tr('insertPlaceholder'), { placeholder: `{${n}}` })}
            onMouseDown={e => e.preventDefault()} onClick={() => insertChip(n)}>{`{${n}}`}</button>
        ))}
      </div>
      {TEMPLATE_KEYS.map(({ key, label }) => (
        <label class="stack" key={key}>{tr(label)}
          <textarea rows={3} value={templates[key]}
            ref={el => { boxes.current[key] = el; }}
            onFocus={() => { lastFocused.current = key; }}
            onInput={e => dispatch({ type: 'setTemplate', key, text: e.currentTarget.value })} />
        </label>
      ))}
      <button type="button" onClick={() => dispatch({ type: 'resetTemplates' })}>{tr('resetTemplates')}</button>
    </details>
  );
}
