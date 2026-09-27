/**
 * Cloudweiter Papierkorb für Cloudprojekte.
 *
 * Die Cloud (`network_projects.deleted_at`) ist die verbindliche Quelle:
 *  - Löschen  → `deleted_at` setzen (Inhalte bleiben erhalten).
 *  - Wiederherstellen → `deleted_at` leeren.
 *  - Endgültig löschen → Projektzeile löschen (Inhalte folgen per Kaskade).
 *
 * Lokale Aktionen werden als „offen“ vermerkt, bis die Cloud sie bestätigt.
 * Dadurch setzt ein späterer Abgleich eine offline ausgeführte Aktion nie
 * zurück. Rein lokale Projekte (ohne Cloudbasis) bleiben unberührt.
 */
import { getNetworkClient } from "@/lib/networkClient";
import { projectAccessStore } from "@/lib/projectAccess";
import { projectStore } from "@/lib/projectStore";

export type TrashOp = "delete" | "restore" | "purge";

const PENDING_KEY = "pixuna.cloudTrash.pending.v1";
const KNOWN_KEY = "pixuna.cloudTrash.known.v1";

type Pending = Record<string, { op: TrashOp; at: string; deferred?: boolean }>;

const SEEN_KEY = "pixuna.cloudTrash.seenDeleted.v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* entbehrlich */ }
}

export function loadPendingTrash(): Pending { return read<Pending>(PENDING_KEY, {}); }

/** Projekte, die auf diesem Gerät schon einmal als eigenes Cloudprojekt bekannt waren. */
function loadKnown(): Record<string, true> { return read<Record<string, true>>(KNOWN_KEY, {}); }

/* -------------------------------------------------------- reine Regeln */

export interface TrashFacts {
  /** Cloud kennt das Projekt (null = Projektzeile fehlt). */
  cloudPresent: boolean;
  cloudDeletedAt: string | null;
  localPresent: boolean;
  localDeletedAt: string | null;
  pending: TrashOp | null;
  /** Das Projekt war auf diesem Gerät schon als eigenes Cloudprojekt bekannt. */
  knownOwned: boolean;
}

export type TrashAction =
  | { type: "none" }
  | { type: "mirror"; deletedAt: string | null }
  | { type: "purgeLocal" };

/** Was ist lokal zu tun, damit dieses Gerät dem Cloudstand folgt? */
export function decideTrash(f: TrashFacts): TrashAction {
  if (f.pending) return { type: "none" }; // eigene Aktion wartet noch auf die Cloud
  if (!f.cloudPresent) {
    return f.knownOwned && f.localPresent ? { type: "purgeLocal" } : { type: "none" };
  }
  if (!f.localPresent) return { type: "none" };
  const cloudDeleted = !!f.cloudDeletedAt;
  const localDeleted = !!f.localDeletedAt;
  if (cloudDeleted === localDeleted) return { type: "none" };
  return { type: "mirror", deletedAt: f.cloudDeletedAt };
}

/* -------------------------------------------------------- Cloud-Aufrufe */

async function push(projectId: string, op: TrashOp): Promise<boolean> {
  const client = getNetworkClient();
  if (!client) return false;
  try {
    if (op === "purge") {
      const { error } = await client.from("network_projects").delete().eq("id", projectId);
      return !error;
    }
    const { error } = await client
      .from("network_projects")
      .update({ deleted_at: op === "delete" ? new Date().toISOString() : null })
      .eq("id", projectId);
    return !error;
  } catch { return false; }
}

function isCloudProject(projectId: string): boolean {
  const access = projectAccessStore.accessFor(projectId);
  return access.cloud && access.role !== null;
}

/** Lokale Papierkorb-Aktion vermerken und an die Cloud übertragen. */
export function recordTrashOp(op: TrashOp, projectId: string): void {
  if (!isCloudProject(projectId)) {
    // Noch nicht (oder noch nicht bekannt) als Cloudprojekt registriert:
    // Aktion vormerken und nach erfolgreicher Registrierung nachholen,
    // damit die Löschung nicht verloren geht.
    const pending = loadPendingTrash();
    pending[projectId] = { op, at: new Date().toISOString(), deferred: true };
    write(PENDING_KEY, pending);
    return;
  }
  // Nur Besitzer (endgültig löschen) bzw. Besitzer/Admins (Papierkorb) wirken
  // cloudweit – für alle anderen bleibt es wie bisher eine lokale Aktion.
  const role = projectAccessStore.accessFor(projectId).role;
  if (op === "purge" ? role !== "owner" : role !== "owner" && role !== "admin") return;
  const pending = loadPendingTrash();
  pending[projectId] = { op, at: new Date().toISOString() };
  write(PENDING_KEY, pending);
  void flushPendingTrash();
}

let flushing: Promise<void> | null = null;
export function flushPendingTrash(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    const pending = loadPendingTrash();
    let changed = false;
    const access = projectAccessStore.getState();
    for (const [id, entry] of Object.entries(pending)) {
      if (entry.deferred) {
        // Erst übertragen, wenn das Projekt als eigenes Cloudprojekt feststeht.
        if (!access.ready || !isCloudProject(id)) continue;
        const role = projectAccessStore.accessFor(id).role;
        if (entry.op === "purge" ? role !== "owner" : role !== "owner" && role !== "admin") {
          delete pending[id]; changed = true; continue;
        }
      }
      if (await push(id, entry.op)) {
        delete pending[id];
        changed = true;
      }
    }
    if (changed) {
      write(PENDING_KEY, pending);
      void projectAccessStore.reload();
    }
  })().finally(() => { flushing = null; });
  return flushing;
}

/** Lokale Projekte an den cloudweiten Papierkorbstatus angleichen. */
export function reconcileCloudTrash(): void {
  const access = projectAccessStore.getState();
  if (!access.ready) return;
  const pending = loadPendingTrash();
  const known = loadKnown();
  let knownChanged = false;
  const localById = new Map(projectStore.getState().projects.map((p) => [p.id, p] as const));

  const cloudIds = new Set<string>();
  access.byProject.forEach((a, id) => {
    if (a.role === null) return;
    cloudIds.add(id);
    if (a.role === "owner" && !known[id]) { known[id] = true; knownChanged = true; }
  });
  const trashKnown = access.deletedAtByProject.size > 0 || cloudIds.size === 0;
  const seen = read<Record<string, true>>(SEEN_KEY, {});
  let seenChanged = false;
  let migrated = false;
  access.deletedAtByProject.forEach((_v, id) => { if (!seen[id]) { seen[id] = true; seenChanged = true; } });

  const ids = new Set<string>([...cloudIds, ...Object.keys(known)]);
  for (const id of ids) {
    const local = localById.get(id);
    const action = decideTrash({
      cloudPresent: cloudIds.has(id),
      cloudDeletedAt: access.deletedAtByProject.get(id) ?? null,
      localPresent: !!local,
      localDeletedAt: local?.deletedAt ?? null,
      pending: pending[id]?.op ?? null,
      knownOwned: !!known[id],
    });
    if (action.type === "purgeLocal") {
      projectStore.purgeProjectFromCloud(id);
      delete known[id];
      knownChanged = true;
    } else if (action.type === "mirror" && trashKnown) {
      const role = access.byProject.get(id)?.role;
      if (!action.deletedAt && local?.deletedAt && !seen[id] && (role === "owner" || role === "admin")) {
        // Alter Fall: lokal gelöscht, aber nie in der Cloud angekommen →
        // Löschhinweis einmalig in den Cloud-Papierkorb übernehmen.
        pending[id] = { op: "delete", at: local.deletedAt };
        migrated = true;
      } else {
        projectStore.applyCloudTrash(id, action.deletedAt);
        if (!action.deletedAt && seen[id]) { delete seen[id]; seenChanged = true; }
      }
    }
    if (!cloudIds.has(id) && known[id] && !local) { delete known[id]; knownChanged = true; }
  }
  if (knownChanged) write(KNOWN_KEY, known);
  if (seenChanged) write(SEEN_KEY, seen);
  if (migrated) { write(PENDING_KEY, pending); void flushPendingTrash(); }
  else if (Object.values(pending).some((e) => e.deferred)) void flushPendingTrash();
}
