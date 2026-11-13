export function isPrecached(path: string): boolean;
export function buildPrecache(files: { path: string; hash: string }[]): { entries: { url: string; hash: string }[]; version: string };
