/**
 * Kollaborationssitzung der Projektmappe.
 *
 * Eigene, schlanke Schicht neben der CAD-Zusammenarbeit: Sie erkennt
 * Änderungen an einzelnen Seiten und Seitenelementen, schreibt nur das
 * betroffene Objekt, empfängt fremde Änderungen einzeln und überträgt
 * flüchtige Vorschauen sowie Präsenz. Der gemeinsame Gesamtstand bleibt
 * ausschließlich Erststand und Sicherheitskopie.
 */
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getNetworkClient } from "@/lib/networkClient";
import { projectAccessStore } from "@/lib/projectAccess";
import { COLLAB_GRACE_MS, type CollabMode } from "@/lib/cadCollab/session";
import { projectStore, type Project } from "@/lib/projectStore";
import {
  baselineKey,
  hasBaseline,
  hashText,
  loadBaseline,
  saveBaseline,
  BASELINE_SEP,
  type BaselineHashes,
} from "@/lib/cloudBaseline";
import { registerProjectSyncSource, reportProjectSyncSource } from "@/lib/projectSync";
import { applyMappeOp } from "./apply";
import { diffMappeIndexes, indexProject, type MappeIndex } from "./diff";
import {
  claimObjectLock,
  fetchLatestSeq,
  fetchObjectLocks,
  fetchObjectRevisions,
  fetchObjectState,
  fetchOpsSince,
  isCollabSchemaMissing,
  releaseObjectLock,
  rowToOp,
  writeObject,
  type RemoteLock,
} from "./opsRepo";
import {
  presenceColor,
  type LocalMappeOp,
  type MappeObjectOp,
  type MappePresenceUser,
  type MappePreviewMessage,
} from "./types";

const SEND_DEBOUNCE_MS = 400;
const PREVIEW_THROTTLE_MS = 80;
const LOCK_HEARTBEAT_MS = 12_000;
const LOCK_SWEEP_MS = 5_000;

export interface MappeLockInfo {
  pageId: string;
  objectId: string;
  displayName: string;
  color: string;
  expiresAt: number;
}

export interface MappeCollabStatus {
  connected: boolean;
  /** Betriebsmodus: allein, Bereitschaft oder echte Zusammenarbeit. */
  mode: CollabMode;
  /** Migration fehlt oder kein Zugriff – die Projektmappe arbeitet lokal weiter. */
  unavailable: boolean;
  peers: MappePresenceUser[];
  /** objectId → fremde Bearbeitungsmarkierung. */
  locksByObject: Map<string, MappeLockInfo>;
  /** objectId, an dem gerade eine fremde Vorschau läuft. */
  previewByObject: Map<string, MappePreviewMessage>;
}

export interface MappeSessionOptions {
  projectId: string;
  userId: string;
  displayName: string;
  /** Element, in dem die Person gerade selbst tippt (Text/Tabelle). */
  getProtectedObjectId?: () => string | null;
  onFieldConflict?: (objectId: string) => void;
  onStatus?: (status: MappeCollabStatus) => void;
}

function currentProject(projectId: string): Project | null {
  return projectStore.getState().projects.find((p) => p.id === projectId) ?? null;
}

export class MappeCollabSession {
  private opts: MappeSessionOptions;
  private presence: RealtimeChannel | null = null;
  private channel: RealtimeChannel | null = null;
  private mode: CollabMode = "off";
  private activating = false;
  private graceTimer = 0;
  private lastIndex: MappeIndex = new Map();
  private revisions = new Map<string, number>();
  private unsubscribe: (() => void) | null = null;
  private sendTimer = 0;
  private lastSeq = 0;
  private applyingRemote = false;
  private destroyed = false;
  private flushing = false;
  private flushAgain = false;
  private lastPreviewAt = 0;
  private previewed = new Map<string, LocalMappeOp>();
  private ownLocks = new Map<string, { pageId: string; objectId: string }>();
  private heartbeatTimer = 0;
  private sweepTimer = 0;
  private currentPageId: string | null = null;
  private status: MappeCollabStatus = {
    connected: false,
    mode: "off",
    unavailable: false,
    peers: [],
    locksByObject: new Map(),
    previewByObject: new Map(),
  };

  constructor(opts: MappeSessionOptions) {
    this.opts = opts;
  }

  /**
   * Startet die Mappen-Zusammenarbeit gestuft: ohne weitere Mitglieder gar
   * nicht, allein nur mit einer minimalen Anwesenheitsmeldung, und erst bei
   * einer zweiten aktiven Person mit Einzeloperationen.
   */
  async start(): Promise<void> {
    const { projectId, userId, displayName } = this.opts;
    const access = projectAccessStore.accessFor(projectId);
    if (!access.shared || access.role === null) return; // rein persönliche Mappe
    if (projectAccessStore.otherMemberCount(projectId) === 0) return; // allein
    this.lastIndex = indexProject(currentProject(projectId));
    this.mode = "standby";
    this.setStatus({ mode: "standby" });

    const client = getNetworkClient();
    if (!client) return;
    this.presence = client
      .channel(`mappe-presence:${projectId}`, { config: { presence: { key: userId } } })
      .on("presence", { event: "sync" }, () => this.readPresence())
      .subscribe(async (state) => {
        if (state !== "SUBSCRIBED") return;
        this.setStatus({ connected: true, unavailable: false });
        await this.presence?.track({
          userId,
          displayName,
          color: presenceColor(userId),
          pageId: this.currentPageId,
          editingObjectId: null,
        } satisfies MappePresenceUser);
      });
  }

  /** Umschalten in die echte Zusammenarbeit (gemeinsamer Stand zuerst). */
  private async goLive(): Promise<void> {
    if (this.destroyed || this.mode === "live" || this.activating) return;
    window.clearTimeout(this.graceTimer);
    this.graceTimer = 0;
    this.activating = true;
    const { projectId } = this.opts;
    try {
      const state = await fetchObjectState(projectId);
      this.revisions = new Map(state.map((op) => [`${op.pageId}|${op.objectId}`, op.objectVersion]));
      this.applyRemoteOps(state);
      this.lastSeq = await fetchLatestSeq(projectId);
      this.lastIndex = indexProject(currentProject(projectId));
      this.setLocks(await fetchObjectLocks(projectId));
    } catch (error) {
      this.activating = false;
      this.setStatus({ unavailable: isCollabSchemaMissing(error) });
      return;
    }
    this.mode = "live";
    this.activating = false;
    this.setStatus({ mode: "live" });
    this.trackPresence();
    this.unsubscribe = projectStore.subscribe(() => this.notifyLocalChange());

    this.connect();
    this.heartbeatTimer = window.setInterval(() => { void this.renewOwnLocks(); }, LOCK_HEARTBEAT_MS);
    this.sweepTimer = window.setInterval(() => this.sweepExpiredLocks(), LOCK_SWEEP_MS);
  }

  private scheduleStandby() {
    if (this.mode !== "live" || this.graceTimer) return;
    this.graceTimer = window.setTimeout(() => {
      this.graceTimer = 0;
      void this.goStandby();
    }, COLLAB_GRACE_MS);
  }

  /** Zurück zum normalen Speicherweg der Projektmappe. */
  private async goStandby(): Promise<void> {
    if (this.mode !== "live") return;
    this.mode = "standby";
    window.clearTimeout(this.sendTimer);
    window.clearInterval(this.heartbeatTimer);
    window.clearInterval(this.sweepTimer);
    this.heartbeatTimer = 0;
    this.sweepTimer = 0;
    this.previewed.clear();
    this.unsubscribe?.();
    this.unsubscribe = null;
    await this.unlockAll();
    const client = getNetworkClient();
    if (client && this.channel) await client.removeChannel(this.channel);
    this.channel = null;
    this.setStatus({ mode: "standby", locksByObject: new Map(), previewByObject: new Map() });
    this.trackPresence();
  }


  private connect() {
    const client = getNetworkClient();
    if (!client || this.destroyed) return;
    const { projectId, userId, displayName } = this.opts;

    this.channel = client
      .channel(`mappe-collab:${projectId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mappe_object_ops", filter: `project_id=eq.${projectId}` },
        (msg) => {
          const op = rowToOp(msg.new as never);
          this.lastSeq = Math.max(this.lastSeq, op.seq);
          if (op.actorId === userId) {
            this.revisions.set(`${op.pageId}|${op.objectId}`, op.objectVersion);
            return;
          }
          this.applyRemoteOps([op]);
          this.lastIndex = indexProject(currentProject(projectId));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mappe_object_locks", filter: `project_id=eq.${projectId}` },
        () => { void this.refreshLocks(); },
      )
      .on("broadcast", { event: "preview" }, ({ payload }) => {
        const msg = payload as MappePreviewMessage;
        if (!msg || msg.userId === userId) return;
        const map = new Map(this.status.previewByObject);
        if (msg.payload) map.set(msg.objectId, msg);
        else map.delete(msg.objectId);
        this.setStatus({ previewByObject: map });
      })
      .subscribe(async (state) => {
        if (state !== "SUBSCRIBED") return;
        this.setStatus({ connected: true, unavailable: false });
        try {
          const missed = await fetchOpsSince(projectId, this.lastSeq);
          if (missed.length) {
            this.applyRemoteOps(missed);
            this.lastSeq = missed[missed.length - 1].seq;
            this.lastIndex = indexProject(currentProject(projectId));
          }
          await this.refreshLocks();
        } catch { /* lokal weiterarbeiten */ }
      });
  }

  /* --------------------------------------------------- Lokale Änderungen */

  notifyLocalChange() {
    if (this.destroyed || this.applyingRemote) return;
    window.clearTimeout(this.sendTimer);
    this.sendTimer = window.setTimeout(() => { void this.flush(); }, SEND_DEBOUNCE_MS);
  }

  private async flush(): Promise<void> {
    if (this.destroyed || this.applyingRemote) return;
    if (this.mode !== "live") {
      this.lastIndex = indexProject(currentProject(this.opts.projectId));
      return;
    }
    if (this.flushing) { this.flushAgain = true; return; }
    const { projectId } = this.opts;
    if (!projectAccessStore.canEdit(projectId)) return;
    this.flushing = true;
    try {
      const nextIndex = indexProject(currentProject(projectId));
      const ops = diffMappeIndexes(this.lastIndex, nextIndex);
      this.lastIndex = nextIndex;
      for (const op of ops) {
        await this.writeOne(op);
        if (this.destroyed) return;
      }
    } catch (error) {
      if (!isCollabSchemaMissing(error)) console.error("Projektmappen-Änderung nicht gespeichert:", error);
      this.setStatus({ unavailable: isCollabSchemaMissing(error) });
    } finally {
      this.flushing = false;
      if (this.flushAgain) { this.flushAgain = false; this.notifyLocalChange(); }
    }
  }

  private async writeOne(op: LocalMappeOp): Promise<void> {
    const key = `${op.pageId}|${op.objectId}`;
    const base = this.revisions.get(key) ?? 0;
    const result = await writeObject(this.opts.projectId, op, base);
    this.revisions.set(key, result.revision);
    if (result.accepted) return;
    // Konflikt: ausschließlich dieses eine Objekt übernimmt den Serverstand.
    this.applyRemoteOps([
      {
        id: `conflict-${key}`,
        projectId: this.opts.projectId,
        pageId: op.pageId,
        objectId: op.objectId,
        objectKind: op.objectKind,
        changeType: result.deleted ? "delete" : "update",
        payload: result.payload,
        objectVersion: result.revision,
        actorId: null,
        createdAt: new Date().toISOString(),
        seq: this.lastSeq,
      },
    ]);
    this.opts.onFieldConflict?.(op.objectId);
    this.lastIndex = indexProject(currentProject(this.opts.projectId));
  }

  /* --------------------------------------------------- Fremde Änderungen */

  private applyRemoteOps(ops: MappeObjectOp[]) {
    if (ops.length === 0) return;
    const protectedId = this.opts.getProtectedObjectId?.() ?? null;
    this.applyingRemote = true;
    try {
      for (const op of ops) {
        const key = `${op.pageId}|${op.objectId}`;
        const known = this.revisions.get(key) ?? 0;
        if (op.objectVersion < known) continue;
        this.revisions.set(key, Math.max(known, op.objectVersion));
        const project = currentProject(this.opts.projectId);
        if (!project) continue;
        const next = applyMappeOp(project, op, {
          protectedObjectId: protectedId,
          onFieldConflict: this.opts.onFieldConflict,
        });
        // Übernahme ohne Rückgängig-Schritt: Werkzeug, Auswahl und geöffnete
        // Bearbeitung der anderen Person bleiben unberührt.
        if (next) projectStore.applySharedProject(next);
      }
    } finally {
      this.applyingRemote = false;
    }
  }

  /* ------------------------------------------------------- Live-Vorschau */

  /** Flüchtige Vorschau eines Elements während Verschieben/Größe/Drehen. */
  sendPreview(pageId: string, objectId: string, payload: Record<string, unknown> | null) {
    if (this.mode !== "live" || !this.channel) return;
    if (!projectAccessStore.canEdit(this.opts.projectId)) return;
    const now = Date.now();
    if (payload && now - this.lastPreviewAt < PREVIEW_THROTTLE_MS) return;
    this.lastPreviewAt = now;
    if (payload) this.previewed.set(objectId, { pageId, objectId, objectKind: "element", changeType: "update", payload });
    else this.previewed.delete(objectId);
    void this.channel.send({
      type: "broadcast",
      event: "preview",
      payload: {
        pageId, objectId, payload,
        userId: this.opts.userId, displayName: this.opts.displayName,
      } satisfies MappePreviewMessage,
    });
  }

  /** Abbruch (Escape): Gegenseite sieht wieder den bestätigten Stand. */
  cancelPreview() {
    for (const op of [...this.previewed.values()]) this.sendPreview(op.pageId, op.objectId, null);
    this.previewed.clear();
  }

  /** Nach dem Loslassen übernimmt die dauerhafte Einzeländerung. */
  finishPreview() {
    for (const op of [...this.previewed.values()]) this.sendPreview(op.pageId, op.objectId, null);
    this.previewed.clear();
  }

  /* --------------------------------------- Präsenz & Bearbeitungshinweise */

  setPage(pageId: string | null) {
    this.currentPageId = pageId;
    this.updatePresence({ pageId });
  }

  /**
   * Im Standby (nur eine aktive Person) wird bewusst nichts gesendet – die
   * einmalige Startmeldung beim Verbinden genügt, um einen Beitritt zu erkennen.
   */
  updatePresence(partial: Partial<Pick<MappePresenceUser, "pageId" | "editingObjectId">>) {
    if (this.mode !== "live") return;
    this.trackPresence(partial);
  }

  /** Einmalige Presence-Meldung (Verbindungsaufbau, Moduswechsel). */
  private trackPresence(partial?: Partial<Pick<MappePresenceUser, "pageId" | "editingObjectId">>) {
    if (!this.presence || !this.status.connected) return;
    const quiet = this.mode !== "live";
    void this.presence.track({
      userId: this.opts.userId,
      displayName: this.opts.displayName,
      color: presenceColor(this.opts.userId),
      pageId: this.currentPageId,
      editingObjectId: null,
      ...partial,
      ...(quiet ? { editingObjectId: null } : {}),
    } satisfies MappePresenceUser);
  }


  async lockObject(pageId: string, objectId: string): Promise<void> {
    this.updatePresence({ pageId, editingObjectId: objectId });
    if (this.mode !== "live") return; // allein: keine Sperren setzen
    if (!projectAccessStore.canEdit(this.opts.projectId)) return;
    this.ownLocks.set(`${pageId}|${objectId}`, { pageId, objectId });
    try {
      await claimObjectLock(this.opts.projectId, pageId, objectId, this.opts.userId, this.opts.displayName);
    } catch { /* weicher Hinweis */ }
  }

  async unlockObject(pageId: string, objectId: string): Promise<void> {
    this.updatePresence({ pageId, editingObjectId: null });
    if (this.mode !== "live") return;
    this.ownLocks.delete(`${pageId}|${objectId}`);
    try { await releaseObjectLock(this.opts.projectId, pageId, objectId); } catch { /* weich */ }
  }

  async unlockAll(): Promise<void> {
    const locks = [...this.ownLocks.values()];
    this.ownLocks.clear();
    this.updatePresence({ editingObjectId: null });
    for (const lock of locks) {
      try { await releaseObjectLock(this.opts.projectId, lock.pageId, lock.objectId); } catch { /* weich */ }
    }
  }

  private async renewOwnLocks(): Promise<void> {
    if (this.destroyed || this.mode !== "live" || this.ownLocks.size === 0) return;
    for (const lock of this.ownLocks.values()) {
      try {
        await claimObjectLock(
          this.opts.projectId, lock.pageId, lock.objectId, this.opts.userId, this.opts.displayName,
        );
      } catch { /* weich */ }
    }
  }

  private async refreshLocks(): Promise<void> {
    try { this.setLocks(await fetchObjectLocks(this.opts.projectId)); } catch { /* weich */ }
  }

  private setLocks(rows: RemoteLock[]) {
    const map = new Map<string, MappeLockInfo>();
    for (const row of rows) {
      if (row.userId === this.opts.userId) continue;
      map.set(row.objectId, {
        pageId: row.pageId,
        objectId: row.objectId,
        displayName: row.displayName,
        color: presenceColor(row.userId),
        expiresAt: new Date(row.expiresAt).getTime(),
      });
    }
    this.setStatus({ locksByObject: map });
  }

  private sweepExpiredLocks() {
    const now = Date.now();
    let changed = false;
    const map = new Map(this.status.locksByObject);
    for (const [id, info] of map) {
      if (info.expiresAt <= now) { map.delete(id); changed = true; }
    }
    if (changed) this.setStatus({ locksByObject: map });
  }

  private readPresence() {
    const raw = this.presence?.presenceState() ?? {};
    const peers: MappePresenceUser[] = [];
    for (const key of Object.keys(raw)) {
      const entry = (raw as Record<string, unknown[]>)[key]?.[0] as MappePresenceUser | undefined;
      if (!entry || entry.userId === this.opts.userId) continue;
      peers.push(entry);
    }
    this.setStatus({ peers });

    if (peers.length > 0) {
      window.clearTimeout(this.graceTimer);
      this.graceTimer = 0;
      if (this.mode === "standby") void this.goLive();
    } else if (this.mode === "live") {
      this.scheduleStandby();
    }
  }

  getStatus(): MappeCollabStatus { return this.status; }

  private setStatus(partial: Partial<MappeCollabStatus>) {
    this.status = { ...this.status, ...partial };
    this.opts.onStatus?.(this.status);
  }

  destroy() {
    this.destroyed = true;
    window.clearTimeout(this.sendTimer);
    window.clearInterval(this.heartbeatTimer);
    window.clearInterval(this.sweepTimer);
    this.unsubscribe?.();
    this.unsubscribe = null;
    void this.unlockAll();
    const client = getNetworkClient();
    window.clearTimeout(this.graceTimer);
    if (client && this.channel) void client.removeChannel(this.channel);
    if (client && this.presence) void client.removeChannel(this.presence);
    this.channel = null;
    this.presence = null;
  }
}
