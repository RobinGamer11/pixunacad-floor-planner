/**
 * CAD-Kollaborationssitzung.
 *
 * Verbindet ein geöffnetes CAD-Projekt mit der gemeinsamen Datenbasis:
 *  - erkennt lokale Änderungen je Objekt und sendet sie einzeln,
 *  - empfängt fremde Änderungen und wendet sie objektweise an,
 *  - überträgt flüchtige Live-Vorschauen und Präsenz (nie gespeichert).
 *
 * Der bisherige gemeinsame Gesamtstand bleibt unangetastet und dient
 * weiterhin als Erststand und Sicherheitskopie.
 */
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getNetworkClient } from "@/lib/networkClient";
import { projectAccessStore } from "@/lib/projectAccess";
import { applyOpToScene } from "./applyOps";
import { diffSceneIndexes, indexSnapshot, type SceneIndex } from "./sceneDiff";
import {
  claimObjectLock,
  fetchLatestSeq,
  fetchOpsSince,
  insertOps,
  isCollabSchemaMissing,
  releaseObjectLock,
  rowToOp,
} from "./opsRepo";
import {
  presenceColor,
  type CadObjectKind,
  type CadObjectOp,
  type CadPresenceUser,
  type CadPreviewMessage,
  type LocalCadOp,
} from "./types";

const SEND_DEBOUNCE_MS = 400;
const PREVIEW_THROTTLE_MS = 80;

/** Minimale Sicht auf die CAD-Anwendung – kein Zugriff auf Interna der Werkzeuge. */
export interface CollabCadApp {
  scenesById: Map<string, unknown>;
  activeSheetId: string;
  renderer?: { render(): void };
  /** Serialisierungsstand der gesamten Zeichnung (bestehende Methode). */
  serializeForCollab(): string | null;
}

export interface CollabStatus {
  /** Live-Verbindung steht. */
  connected: boolean;
  /** Migration fehlt oder kein Zugriff – CAD arbeitet rein lokal weiter. */
  unavailable: boolean;
  /** Andere Personen auf demselben Projekt. */
  peers: CadPresenceUser[];
  /** objectId → Person, die es gerade bearbeitet. */
  editingByObject: Map<string, CadPresenceUser>;
}

export interface CollabSessionOptions {
  projectId: string;
  userId: string;
  displayName: string;
  app: CollabCadApp;
  /** Neuzeichnen anfordern, ohne Auswahl oder Werkzeug zu verändern. */
  requestRender: () => void;
  onStatus?: (status: CollabStatus) => void;
}

export class CadCollabSession {
  private opts: CollabSessionOptions;
  private channel: RealtimeChannel | null = null;
  private lastIndex: SceneIndex = new Map();
  private versions = new Map<string, number>();
  private sendTimer = 0;
  private lastSeq = 0;
  private applyingRemote = false;
  private destroyed = false;
  private lastPreviewAt = 0;
  private status: CollabStatus = {
    connected: false,
    unavailable: false,
    peers: [],
    editingByObject: new Map(),
  };

  constructor(opts: CollabSessionOptions) {
    this.opts = opts;
  }

  /** Startet die Sitzung: sicherer Stand zuerst, danach fehlende Änderungen. */
  async start(): Promise<void> {
    const { projectId } = this.opts;
    const access = projectAccessStore.accessFor(projectId);
    if (!access.shared || access.role === null) return; // rein lokales Projekt
    this.lastIndex = indexSnapshot(this.opts.app.serializeForCollab());
    try {
      this.lastSeq = await fetchLatestSeq(projectId);
      const missed = await fetchOpsSince(projectId, 0);
      this.applyRemoteOps(missed);
      this.lastSeq = missed.length ? missed[missed.length - 1].seq : this.lastSeq;
      this.lastIndex = indexSnapshot(this.opts.app.serializeForCollab());
    } catch (error) {
      this.setStatus({ unavailable: isCollabSchemaMissing(error) });
      return;
    }
    this.connect();
  }

  private connect() {
    const client = getNetworkClient();
    if (!client || this.destroyed) return;
    const { projectId, userId, displayName } = this.opts;

    this.channel = client
      .channel(`cad-collab:${projectId}`, { config: { presence: { key: userId } } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cad_object_ops", filter: `project_id=eq.${projectId}` },
        (msg) => {
          const op = rowToOp(msg.new as never);
          if (op.actorId === userId) return; // eigene Änderung nie zurückspielen
          this.applyRemoteOps([op]);
          this.lastSeq = Math.max(this.lastSeq, op.seq);
          this.lastIndex = indexSnapshot(this.opts.app.serializeForCollab());
        },
      )
      .on("broadcast", { event: "preview" }, ({ payload }) => {
        const msg = payload as CadPreviewMessage;
        if (!msg || msg.userId === userId) return;
        this.applyPreview(msg);
      })
      .on("presence", { event: "sync" }, () => this.readPresence())
      .subscribe(async (state) => {
        if (state !== "SUBSCRIBED") return;
        this.setStatus({ connected: true, unavailable: false });
        await this.channel?.track({
          userId,
          displayName,
          sheetId: this.opts.app.activeSheetId,
          cursor: null,
          editingObjectId: null,
          color: presenceColor(userId),
        });
        // Nach (Wieder-)Verbindung fehlende Änderungen nachholen.
        try {
          const missed = await fetchOpsSince(projectId, this.lastSeq);
          if (missed.length) {
            this.applyRemoteOps(missed);
            this.lastSeq = missed[missed.length - 1].seq;
            this.lastIndex = indexSnapshot(this.opts.app.serializeForCollab());
          }
        } catch { /* CAD arbeitet lokal weiter */ }
      });
  }

  /* --------------------------------------------------- Lokale Änderungen */

  /**
   * Meldet, dass sich die Zeichnung geändert haben könnte (z. B. nach einem
   * Verlaufsschritt). Der Vergleich findet gebündelt und verzögert statt.
   */
  notifyLocalChange() {
    if (this.destroyed || this.applyingRemote) return;
    window.clearTimeout(this.sendTimer);
    this.sendTimer = window.setTimeout(() => { void this.flush(); }, SEND_DEBOUNCE_MS);
  }

  private async flush(): Promise<void> {
    if (this.destroyed || this.applyingRemote) return;
    const { projectId, userId } = this.opts;
    if (!projectAccessStore.canEdit(projectId)) return;
    const nextIndex = indexSnapshot(this.opts.app.serializeForCollab());
    const ops = diffSceneIndexes(this.lastIndex, nextIndex);
    this.lastIndex = nextIndex;
    if (ops.length === 0) return;
    try {
      await insertOps(projectId, ops, userId, (op) => this.bumpVersion(op));
    } catch (error) {
      // Kein stiller Datenverlust: beim nächsten Versuch erneut vergleichen.
      if (!isCollabSchemaMissing(error)) console.error("CAD-Live-Änderung nicht gespeichert:", error);
      this.setStatus({ unavailable: isCollabSchemaMissing(error) });
    }
  }

  private bumpVersion(op: LocalCadOp): number {
    const key = `${op.sheetId}|${op.objectId}`;
    const next = (this.versions.get(key) ?? 0) + 1;
    this.versions.set(key, next);
    return next;
  }

  /* --------------------------------------------------- Fremde Änderungen */

  private applyRemoteOps(ops: CadObjectOp[]) {
    if (ops.length === 0) return;
    this.applyingRemote = true;
    let changed = false;
    try {
      for (const op of ops) {
        const scene = this.opts.app.scenesById.get(op.sheetId);
        if (!scene) continue;
        const key = `${op.sheetId}|${op.objectId}`;
        const known = this.versions.get(key) ?? 0;
        if (op.objectVersion < known) continue; // älterer Stand gewinnt nie
        this.versions.set(key, Math.max(known, op.objectVersion));
        changed = applyOpToScene(
          scene as never,
          op.objectKind as CadObjectKind,
          op.objectId,
          op.changeType,
          op.payload,
        ) || changed;
      }
    } finally {
      this.applyingRemote = false;
    }
    if (changed) this.opts.requestRender();
  }

  /* ------------------------------------------------------- Live-Vorschau */

  /** Gedrosselte, flüchtige Vorschau während des Ziehens (nichts gespeichert). */
  sendPreview(sheetId: string, objectId: string, objectKind: CadObjectKind, payload: Record<string, unknown> | null) {
    if (!this.channel || !this.status.connected) return;
    const now = Date.now();
    if (payload && now - this.lastPreviewAt < PREVIEW_THROTTLE_MS) return;
    this.lastPreviewAt = now;
    void this.channel.send({
      type: "broadcast",
      event: "preview",
      payload: {
        sheetId, objectId, objectKind, payload,
        userId: this.opts.userId, displayName: this.opts.displayName,
      } satisfies CadPreviewMessage,
    });
  }

  private applyPreview(msg: CadPreviewMessage) {
    const scene = this.opts.app.scenesById.get(msg.sheetId);
    if (!scene) return;
    if (!msg.payload) return; // Abbruch: der gespeicherte Stand gilt weiter
    this.applyingRemote = true;
    try {
      applyOpToScene(scene as never, msg.objectKind, msg.objectId, "update", msg.payload);
    } finally {
      this.applyingRemote = false;
    }
    this.opts.requestRender();
  }

  /* -------------------------------------------- Präsenz & Bearbeitungshinweis */

  /** Meldet die eigene Position/Seite/Bearbeitung (nicht dauerhaft gespeichert). */
  updatePresence(partial: Partial<Pick<CadPresenceUser, "sheetId" | "cursor" | "editingObjectId">>) {
    if (!this.channel || !this.status.connected) return;
    void this.channel.track({
      userId: this.opts.userId,
      displayName: this.opts.displayName,
      color: presenceColor(this.opts.userId),
      sheetId: this.opts.app.activeSheetId,
      cursor: null,
      editingObjectId: null,
      ...partial,
    });
  }

  /** Weiche Bearbeitungssperre setzen. */
  async lockObject(sheetId: string, objectId: string): Promise<void> {
    this.updatePresence({ sheetId, editingObjectId: objectId });
    try {
      await claimObjectLock(this.opts.projectId, sheetId, objectId, this.opts.userId, this.opts.displayName);
    } catch { /* weicher Hinweis – Fehler blockieren die Arbeit nicht */ }
  }

  async unlockObject(sheetId: string, objectId: string): Promise<void> {
    this.updatePresence({ sheetId, editingObjectId: null });
    try {
      await releaseObjectLock(this.opts.projectId, sheetId, objectId);
    } catch { /* weicher Hinweis */ }
  }

  private readPresence() {
    const raw = this.channel?.presenceState() ?? {};
    const peers: CadPresenceUser[] = [];
    const editing = new Map<string, CadPresenceUser>();
    for (const key of Object.keys(raw)) {
      const entry = (raw as Record<string, unknown[]>)[key]?.[0] as CadPresenceUser | undefined;
      if (!entry || entry.userId === this.opts.userId) continue;
      peers.push(entry);
      if (entry.editingObjectId) editing.set(entry.editingObjectId, entry);
    }
    this.setStatus({ peers, editingByObject: editing });
  }

  /* ------------------------------------------------------------- Zustand */

  getStatus(): CollabStatus { return this.status; }

  private setStatus(partial: Partial<CollabStatus>) {
    this.status = { ...this.status, ...partial };
    this.opts.onStatus?.(this.status);
  }

  destroy() {
    this.destroyed = true;
    window.clearTimeout(this.sendTimer);
    const client = getNetworkClient();
    if (client && this.channel) void client.removeChannel(this.channel);
    this.channel = null;
  }
}
