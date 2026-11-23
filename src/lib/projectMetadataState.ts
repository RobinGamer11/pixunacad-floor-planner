export interface MetadataBaseline { name: string; updatedAt: string; dirty: boolean; conflict?: boolean }
const listeners = new Set<() => void>();
export function readMetadata(id: string): MetadataBaseline | null {
  try { return JSON.parse(localStorage.getItem(`pixuna.projectmeta.${id}`) ?? "null"); } catch { return null; }
}
export function writeMetadata(id: string, value: MetadataBaseline) {
  localStorage.setItem(`pixuna.projectmeta.${id}`, JSON.stringify(value));
  listeners.forEach(fn => fn());
}
export function subscribeMetadata(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function markNameChanged(id: string, previous: string) {
  const base = readMetadata(id);
  writeMetadata(id, { name: base?.name ?? previous, updatedAt: base?.updatedAt ?? "", dirty: true, conflict: base?.conflict });
}
export function metadataDecision(base: MetadataBaseline | null, localName: string, remoteName: string, remoteTime: string): "keep" | "adopt" | "conflict" {
  if (base?.dirty) return localName === remoteName ? "adopt" : base.name === remoteName && base.updatedAt === remoteTime ? "keep" : "conflict";
  if (!base && localName !== remoteName && !["Projekt", "Neues Projekt"].includes(localName)) return "conflict";
  if (["Projekt", "Neues Projekt"].includes(remoteName) && !["Projekt", "Neues Projekt"].includes(localName)) return "keep";
  return "adopt";
}