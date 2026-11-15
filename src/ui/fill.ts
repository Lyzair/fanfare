/** Replaces `{name}` placeholders in a UI string. */
export const fill = (tpl: string, vars: Record<string, string | number>): string =>
  tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
