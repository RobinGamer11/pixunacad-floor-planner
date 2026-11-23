/** Browser-local isolation only; server authorization remains enforced by RLS. */
const PREFIX = "pixuna.account.";
const runtime = globalThis as typeof globalThis & { __pixunaAccount?: { account: string | null; generation: number; installed: boolean } };
const identity = runtime.__pixunaAccount ??= { account: null, generation: 0, installed: false };
const flushers = new Set<() => Promise<void>>();
export const currentAccount = () => identity.account;
export const accountGeneration = () => identity.generation;
export const sessionIsCurrent = (id: string | null, epoch: number) => id === identity.account && epoch === identity.generation;
export function accountRecordKey(id: string, projectId: string) { return `${id}\u0001${projectId}`; }
export function scopedStorageKey(id: string, key: string) { return `${PREFIX}${encodeURIComponent(id)}.${key}`; }
export function activateAccount(id: string | null) { if (id !== identity.account) { identity.account = id; identity.generation++; } }
export function registerLocalFlusher(fn: () => Promise<void>) { flushers.add(fn); return () => { flushers.delete(fn); }; }
export async function flushAccountWrites() { await Promise.all([...flushers].map(fn => fn())); }
function isolated(key: string) {
  return (key.startsWith("pixuna.") || key.startsWith("pixuna:")) && !key.startsWith(PREFIX)
    && !key.startsWith("pixuna.supabase.") && !key.startsWith("pixuna.legal.")
    && !key.startsWith("pixuna.external-content-consent.");
}

/** Installed before store modules are evaluated. Unowned legacy keys remain untouched. */
export function installAccountStorage() {
  if (typeof window === "undefined" || typeof Storage === "undefined") return;
  if (identity.installed) return;
  identity.installed = true;
  const proto = Storage.prototype;
  const get = proto.getItem;
  const set = proto.setItem;
  const remove = proto.removeItem;
  const keyAt = proto.key;
  const length = Object.getOwnPropertyDescriptor(proto, "length")?.get;
  for (const [storage, key] of [[window.sessionStorage, "pixuna.supabase.session.session.v1"], [window.localStorage, "pixuna.supabase.session.v1"]] as const) {
    try {
      const stored = JSON.parse(get.call(storage, key) ?? "null");
      if (stored?.accessToken && stored?.refreshToken && typeof stored?.user?.id === "string") { activateAccount(stored.user.id); break; }
    } catch { /* malformed auth is not ownership evidence */ }
  }
  const visibleKeys = (storage: Storage) => {
    const account = identity.account;
    const keys: string[] = [];
    const prefix = account ? `${PREFIX}${encodeURIComponent(account)}.` : null;
    for (let i = 0; i < (length?.call(storage) ?? 0); i++) {
      const key = keyAt.call(storage, i);
      if (!key) continue;
      if (prefix && key.startsWith(prefix)) keys.push(key.slice(prefix.length));
      else if (!key.startsWith(PREFIX) && !isolated(key)) keys.push(key);
    }
    return keys;
  };
  proto.getItem = function(key) { const account = identity.account; return isolated(key) ? (account ? get.call(this, scopedStorageKey(account, key)) : null) : get.call(this, key); };
  proto.setItem = function(key, value) {
    const account = identity.account;
    if (isolated(key)) {
      if (!account) throw new Error("Kein aktives Konto – lokale Daten bleiben unverändert.");
      set.call(this, scopedStorageKey(account, key), value);
    } else set.call(this, key, value);
  };
  proto.removeItem = function(key) { const account = identity.account; if (isolated(key)) { if (account) remove.call(this, scopedStorageKey(account, key)); } else remove.call(this, key); };
  proto.clear = function() { for (const key of visibleKeys(this)) this.removeItem(key); };
  proto.key = function(index) { return visibleKeys(this)[index] ?? null; };
  if (length) Object.defineProperty(proto, "length", { configurable: true, get() { return visibleKeys(this).length; } });
}

installAccountStorage();