import type { Lang } from '../domain/model';
import { t } from '../i18n';
import type { Layout } from './layout';

/** Picks the wide-screen layout; CSS shows it only at 900 px and wider. */
export function LayoutSwitch({ lang, layout, onChange }: { lang: Lang; layout: Layout; onChange: (l: Layout) => void }) {
  const option = (value: Layout, label: 'layoutGameSide' | 'layoutColumns') => (
    <button type="button" aria-pressed={layout === value} onClick={() => onChange(value)}>{t(lang, label)}</button>
  );
  return (
    <div class="layout-switch" role="group" aria-label={t(lang, 'layoutLabel')}>
      {option('game-side', 'layoutGameSide')}
      {option('columns', 'layoutColumns')}
    </div>
  );
}
