export interface TarEntry { src: string; name: string; mode: number; mtime: Date }
export function writeTarGz(outPath: string, entries: TarEntry[]): Promise<void>;
