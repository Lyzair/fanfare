/** Hash-verified download used by the SW install (pure: fetch and hashing are injected). */
export type CacheMode = 'no-store' | 'reload';

export interface Fetched { response: Response; body: ArrayBuffer }

/**
 * Fetch, check the body against the build hash, refetch bypassing every cache once on mismatch.
 *
 * The first attempt bypasses the HTTP cache (`no-store`): a request that writes the
 * HTTP cache while the page fetches the same file (first visit, "Prepare
 * voices") fails with ERR_CACHE_WRITE_FAILURE. The page itself is served from
 * Cache Storage once installed, so nothing is downloaded twice later. The build
 * hash catches a stale copy.
 */
export async function fetchVerified(
  url: string,
  hash: string,
  doFetch: (url: string, mode: CacheMode) => Promise<Response>,
  hashOf: (body: ArrayBuffer) => Promise<string>,
): Promise<Fetched> {
  for (const mode of ['no-store', 'reload'] as CacheMode[]) {
    const response = await doFetch(url, mode);
    if (!response.ok) throw new Error(`precache ${url}: HTTP ${response.status}`);
    const body = await response.arrayBuffer();
    if ((await hashOf(body)) === hash) return { response, body };
  }
  throw new Error(`precache ${url}: content does not match the build`);
}
