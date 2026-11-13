import { useState } from 'preact/hooks';
import type { Lang } from '../domain/model';
import { t } from '../i18n';
import type { UiStrings } from '../i18n';

const MEDIA: Record<number, { motion: string; still: string }> = {
  1: { motion: 'add-players.gif', still: '02-players.png' },
  2: { motion: 'announce.gif', still: '03-announcements.png' },
  3: { motion: 'score.gif', still: '04-game.png' },
  4: { motion: '05-sounds.png', still: '05-sounds.png' },
  5: { motion: '06-save.png', still: '06-save.png' },
};

function prefersReducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
}

/** Toggle under a step hint; the image element only exists (and loads) while open. */
export function ShowMe({ lang, step }: { lang: Lang; step: 1 | 2 | 3 | 4 | 5 }) {
  const [open, setOpen] = useState(false);
  const file = prefersReducedMotion() ? MEDIA[step].still : MEDIA[step].motion;
  const id = `showme${step}`;
  return (
    <div class="show-me">
      <button type="button" class="show-me-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>
        {open ? t(lang, 'hideMe') : t(lang, 'showMe')}
      </button>
      {open && (
        <figure id={id} class="show-me-figure">
          <img src={`./manual/media/${lang}/${file}`} alt={t(lang, `mediaAlt${step}` as keyof UiStrings)} loading="lazy" />
        </figure>
      )}
    </div>
  );
}
