/** A plain object (not null, not an array): the first check on untrusted or stored data. */
export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
