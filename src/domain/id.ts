/**
 * A fresh random id. `crypto.randomUUID` only exists in secure contexts; on a plain-http LAN
 * address (fanfare-local --lan, the Raspberry Pi appliance) only `getRandomValues` is there.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
