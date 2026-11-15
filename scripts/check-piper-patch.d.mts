export const PIPER_DIST: string;
export const PIPER_GLUE: string;
export function checkPiperChunks(files: Record<string, string>): string[];
export function checkPiperSource(source: string): string[];
export function assertPiperPatched(path: string): Promise<void>;
