/** Player device key (docs/round2-contract.md §1.1). Stored per Porteur in localStorage. */
export const DEVICE_KEY_HEADER = "x-zelqane-device-key";

const KEY_PATTERN = /^tpd_[A-Za-z0-9_-]{43}$/;

function storageKey(supportId: number): string {
  return `zelqane.ecran.cle.${supportId}`;
}

export function isDeviceKey(value: unknown): value is string {
  return typeof value === "string" && KEY_PATTERN.test(value);
}

export function readDeviceKey(supportId: number): string | null {
  try {
    const value = window.localStorage.getItem(storageKey(supportId));
    return isDeviceKey(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeDeviceKey(supportId: number, key: string): boolean {
  if (!isDeviceKey(key)) return false;
  try {
    window.localStorage.setItem(storageKey(supportId), key);
    return true;
  } catch {
    return false;
  }
}

export function clearDeviceKey(supportId: number): void {
  try {
    window.localStorage.removeItem(storageKey(supportId));
  } catch {
    // Storage unavailable (private mode): nothing to clear.
  }
}
