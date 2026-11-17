import { useState } from 'preact/hooks';

/**
 * How the step cards are arranged on wide screens (900 px and wider; narrower screens always get
 * one column). A display preference of this device: kept in localStorage, not in the app state,
 * so Export/Import never carry it to a device with another screen.
 */
export type Layout = 'game-side' | 'columns';
const KEY = 'fanfare.layout';

export function loadLayout(): Layout {
  try { return localStorage.getItem(KEY) === 'columns' ? 'columns' : 'game-side'; } catch { return 'game-side'; }
}

export function saveLayout(layout: Layout): void {
  try { localStorage.setItem(KEY, layout); } catch { /* private mode: this session only */ }
}

export function useLayout(): [Layout, (l: Layout) => void] {
  const [layout, setLayout] = useState(loadLayout);
  return [layout, (l: Layout) => { setLayout(l); saveLayout(l); }];
}
