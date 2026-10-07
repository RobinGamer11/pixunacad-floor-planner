/**
 * Verwaltung laufender Rasterjobs je App. Ohne Abhängigkeiten (keine Zyklen).
 * Jeder Job hat eine eindeutige Action-ID; späte Ergebnisse nach Abbruch
 * werden über `signal.cancelled` verworfen.
 */
export interface RasterJobSignal { cancelled: boolean; reason?: string }

export interface RasterJobHandle {
  id: string;
  signal: RasterJobSignal;
  cancel(reason: string): void;
}

const jobsByApp = new WeakMap<object, Set<RasterJobHandle>>();
const chainByLayer = new WeakMap<object, Promise<unknown>>();
let seq = 0;

export function newRasterActionId(): string {
  seq += 1;
  return `ra-${Date.now().toString(36)}-${seq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function registerRasterJob(app: object): RasterJobHandle {
  const signal: RasterJobSignal = { cancelled: false };
  const handle: RasterJobHandle = {
    id: newRasterActionId(),
    signal,
    cancel(reason) { if (!signal.cancelled) { signal.cancelled = true; signal.reason = reason; } },
  };
  let set = jobsByApp.get(app);
  if (!set) { set = new Set(); jobsByApp.set(app, set); }
  set.add(handle);
  return handle;
}

export function unregisterRasterJob(app: object, h: RasterJobHandle) {
  jobsByApp.get(app)?.delete(h);
}

/** Bricht alle laufenden Jobs einer App ab (Undo/Redo, Cloud-Eingang, Unmount). */
export function cancelRasterJobs(app: object, reason: string): number {
  const set = jobsByApp.get(app);
  if (!set) return 0;
  let n = 0;
  for (const h of set) { if (!h.signal.cancelled) { h.cancel(reason); n++; } }
  return n;
}

export function activeRasterJobIds(app: object): Set<string> {
  return new Set([...(jobsByApp.get(app) ?? [])].map((h) => h.id));
}

export function hasRunningRasterJobs(app: object): boolean {
  return (jobsByApp.get(app)?.size ?? 0) > 0;
}

/** Schreibende Jobs derselben Ebene laufen nacheinander, nie verschachtelt. */
export function serializeOnLayer<T>(layer: object, fn: () => Promise<T>): Promise<T> {
  const prev = chainByLayer.get(layer) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  chainByLayer.set(layer, next.catch(() => undefined));
  return next;
}
