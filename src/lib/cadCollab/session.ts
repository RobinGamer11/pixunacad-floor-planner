/**
 * CAD-Kollaborationssitzung.
 *
 * Verbindet ein geöffnetes CAD-Projekt mit der gemeinsamen Datenbasis:
 *  - erkennt lokale Änderungen je Objekt und sendet sie einzeln,
 *  - empfängt fremde Änderungen und wendet sie objektweise an,
 *  - überträgt flüchtige Live-Vorschauen und Präsenz (nie gespeichert).
 *
 * Die Revision je Objekt vergibt ausschließlich die Datenbank. Dadurch
 * entsteht bei gleichzeitiger Bearbeitung desselben Objekts in allen Browsern
 * derselbe Endstand; abgewiesen wird höchstens dieses eine Objekt.
 *
 * Der bisherige gemeinsame Gesamtstand bleibt unangetastet und dient
 * weiterhin als Erststand und Sicherheitskopie.
 */
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getNetworkClient } from "@/lib/networkClient";
import { projectAccessStore } from "@/lib/projectAccess";
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
import { applyLibraryOp } from "./applyLibraryOps";
import { applyOpToScene } from "./applyOps";
import { diffSceneIndexes, indexSnapshot, type SceneIndex } from "./sceneDiff";
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
  isLibraryKind,
  presenceColor,
  type CadLibraryKind,
  type CadObjectKind,
  type CadObjectOp,
  type CadPresenceUser,
  type CadPreviewMessage,
  type LocalCadOp,
} from "./types";

const SEND_DEBOUNCE_MS = 400;
const PREVIEW_THROTTLE_MS = 80;
const LOCK_HEARTBEAT_MS = 12_000;
const LOCK_SWEEP_MS = 5_000;
/** Nachlaufzeit, bevor nach dem Weggang der letzten Person abgeschaltet wird. */
export const COLLAB_GRACE_MS = 45_000;

/**
 * Betriebsmodus der Zusammenarbeit:
 *  - "off":     persönliches Projekt ohne Cloud-Eintrag – keinerlei Verbindung.
 *  - "local":   in der Cloud geführt, keine weiteren Mitglieder – keine
 *               Verbindung; Sicherung ausschließlich per Klick.
 *  - "standby": geteilt, aber allein online – nur eine minimale Anwesenheitsmeldung.
 *  - "live":    mindestens zwei Personen – volle Objektsynchronisierung.
 */
export type CollabMode = "off" | "local" | "standby" | "live";

/** Minimale Sicht auf die CAD-Anwendung – kein Zugriff auf Interna der Werkzeuge. */
export interface CollabCadApp {
  scenesById: Map<string, unknown>;
  activeSheetId: string;
  renderer?: { render(): void };
  libraryDefinitions?: unknown[];
  libraryFolders?: unknown[];
  onLibraryChange?: () => void;
  /** Serialisierungsstand der gesamten Zeichnung (bestehende Methode). */
  serializeForCollab(): string | null;
}

/** Fremde Bearbeitungsmarkierung für ein Objekt. */
export interface ObjectLockInfo {
  sheetId: string;
  objectId: string;
  displayName: string;
  color: string;
  expiresAt: number;
}

export interface CollabStatus {
  /** Verbindung steht (mindestens Anwesenheitsmeldung). */
  connected: boolean;
  /** Aktueller Betriebsmodus. */
  mode: CollabMode;
  /** Migration fehlt oder kein Zugriff – CAD arbeitet rein lokal weiter. */
  unavailable: boolean;
  /** Andere Personen auf demselben Projekt. */
  peers: CadPresenceUser[];
  /** objectId → Person, die es gerade bearbeitet. */
  editingByObject: Map<string, CadPresenceUser>;
  /** objectId → dauerhafte, serverseitige Bearbeitungsmarkierung. */
  locksByObject: Map<string, ObjectLockInfo>;
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
  /** Dauerhafte, minimale Anwesenheitsverbindung (erkennt einen Beitritt). */
  private presence: RealtimeChannel | null = null;
  /** Nur im Live-Betrieb: Objektänderungen, Sperren und Vorschauen. */
  private channel: RealtimeChannel | null = null;
  private mode: CollabMode = "off";
  private activating = false;
  private graceTimer = 0;
  private lastIndex: SceneIndex = new Map();
  /** sheetId|objectId → serverseitig bestätigte Revision. */
  private revisions = new Map<string, number>();
  private sendTimer = 0;
  private lastSeq = 0;
  private applyingRemote = false;
  private destroyed = false;
  private lastPreviewAt = 0;
  private flushing = false;
  private flushAgain = false;
  private ownLocks = new Map<string, { sheetId: string; objectId: string }>();
  /** Objekte, für die gerade eine flüchtige Vorschau läuft. */
  private previewed = new Map<string, LocalCadOp>();
  private heartbeatTimer = 0;
  private sweepTimer = 0;
  /** Zuletzt in der Cloud bestätigter Objektstand (nur Prüfsummen). */
  private cloudHashes: BaselineHashes = new Map();
  private baseKey = "";
  private revisionsLoaded = false;
  private saving = false;
  private unregisterSync: (() => void) | null = null;
  private status: CollabStatus = {
    connected: false,
    mode: "off",
    unavailable: false,
    peers: [],
    editingByObject: new Map(),
    locksByObject: new Map(),
  };

  constructor(opts: CollabSessionOptions) {
    this.opts = opts;
  }

  /**
   * Startet die Sitzung gemäß der zentralen Richtlinie.
   *
   * Ohne Cloud-Eintrag passiert gar nichts. Ohne weitere Teammitglieder wird
   * lokal gearbeitet und nur auf Klick gesichert. Sind Mitglieder vorhanden,
   * läuft eine minimale Anwesenheitsverbindung; die volle Synchronisierung
   * schaltet sich erst zu, sobald wirklich jemand anderes im Projekt arbeitet.
   */
  async start(): Promise<void> {
    const { projectId } = this.opts;
    const access = projectAccessStore.accessFor(projectId);
    if (!access.shared || access.role === null) return; // rein lokales Projekt
    this.baseKey = baselineKey("cad", projectId);
    this.cloudHashes = loadBaseline(this.baseKey);
    this.lastIndex = indexSnapshot(this.opts.app.serializeForCollab());
    this.unregisterSync = registerProjectSyncSource(projectId, "cad", {
      save: () => this.saveToCloud(),
    });

    this.mode = projectAccessStore.otherMemberCount(projectId) === 0 ? "local" : "standby";
    this.setStatus({ mode: this.mode });

    // Beim Öffnen den gemeinsamen Objektstand holen – aber nur, wenn lokal
    // nichts Ungesichertes wartet. Eigene Arbeit wird nie überschrieben.
    const firstOpen = !hasBaseline(this.baseKey);
    if (firstOpen || this.pendingOps().length === 0) {
      await this.pullRemoteState();
    }
    this.refreshDirty();
    if (this.mode === "standby") this.connectPresence();
  }

  /** Nur Anwesenheit – keine Objektdaten, keine Cursor, keine Sperren. */
  private connectPresence() {
    const client = getNetworkClient();
    if (!client || this.destroyed) return;
    const { projectId, userId, displayName } = this.opts;

    this.presence = client
      .channel(`cad-presence:${projectId}`, { config: { presence: { key: userId } } })
      .on("presence", { event: "sync" }, () => this.readPresence())
      .subscribe(async (state) => {
        if (state !== "SUBSCRIBED") return;
        this.setStatus({ connected: true, unavailable: false });
        await this.presence?.track({
          userId,
          displayName,
          sheetId: this.opts.app.activeSheetId,
          cursor: null,
          editingObjectId: null,
          color: presenceColor(userId),
        });
      });
  }

  /* ------------------------------------------- Cloud-Sicherung (ein Weg) */

  /** Flacher Objektindex: Schlüssel → JSON-Text des Objekts. */
  private flatten(index: SceneIndex): Map<string, string> {
    const out = new Map<string, string>();
    for (const [sheetId, kinds] of index) {
      for (const [kind, byId] of kinds) {
        for (const [objectId, json] of byId) {
          out.set(`${sheetId}${BASELINE_SEP}${kind}${BASELINE_SEP}${objectId}`, json);
        }
      }
    }
    return out;
  }

  /** Objekte, die sich seit dem letzten bestätigten Cloud-Stand geändert haben. */
  private pendingOps(): LocalCadOp[] {
    const current = this.flatten(indexSnapshot(this.opts.app.serializeForCollab()));
    const ops: LocalCadOp[] = [];
    for (const [key, json] of current) {
      if (this.cloudHashes.get(key) === hashText(json)) continue;
      const [sheetId, kind, objectId] = key.split(BASELINE_SEP);
      ops.push({
        sheetId,
        objectId,
        objectKind: kind as CadObjectKind,
        changeType: this.cloudHashes.has(key) ? "update" : "create",
        payload: JSON.parse(json) as Record<string, unknown>,
      });
    }
    for (const key of this.cloudHashes.keys()) {
      if (current.has(key)) continue;
      const [sheetId, kind, objectId] = key.split(BASELINE_SEP);
      ops.push({ sheetId, objectId, objectKind: kind as CadObjectKind, changeType: "delete", payload: null });
    }
    // Bibliotheksdefinitionen zuerst: eine Instanz darf nie ohne Geometrie ankommen.
    ops.sort((a, b) => Number(isLibraryKind(b.objectKind)) - Number(isLibraryKind(a.objectKind)));
    return ops;
  }

  /** Merkt einen Objektstand als „in der Cloud bestätigt“. */
  private noteCloudObject(op: LocalCadOp, payload: Record<string, unknown> | null) {
    const key = `${op.sheetId}${BASELINE_SEP}${op.objectKind}${BASELINE_SEP}${op.objectId}`;
    if (payload) this.cloudHashes.set(key, hashText(JSON.stringify(payload)));
    else this.cloudHashes.delete(key);
  }

  /** Im Live-Betrieb gilt der laufende Stand als bestätigt. */
  private baselineFromCurrent() {
    const current = this.flatten(indexSnapshot(this.opts.app.serializeForCollab()));
    this.cloudHashes = new Map();
    for (const [key, json] of current) this.cloudHashes.set(key, hashText(json));
    if (this.baseKey) saveBaseline(this.baseKey, this.cloudHashes);
  }

  private refreshDirty() {
    if (this.mode === "off") return;
    const dirty = this.mode === "live" ? false : this.pendingOps().length > 0;
    this.report({ dirty });
  }

  private report(partial: Parameters<typeof reportProjectSyncSource>[2]) {
    if (!this.baseKey) return;
    reportProjectSyncSource(this.opts.projectId, "cad", partial);
  }

  /** Holt den gemeinsamen Objektstand (reines Lesen). */
  private async pullRemoteState(): Promise<void> {
    try {
      const state = await fetchObjectState(this.opts.projectId);
      this.revisions = new Map(state.map((op) => [`${op.sheetId}|${op.objectId}`, op.objectVersion]));
      this.revisionsLoaded = true;
      if (state.length) this.applyRemoteOps(state);
      this.lastSeq = await fetchLatestSeq(this.opts.projectId);
      this.lastIndex = indexSnapshot(this.opts.app.serializeForCollab());
      this.baselineFromCurrent();
    } catch (error) {
      this.setStatus({ unavailable: isCollabSchemaMissing(error) });
    }
  }

  /**
   * Manuelle Sicherung: überträgt ausschließlich die geänderten Objekte.
   * Ein vollständiger Projekt-Schnappschuss wird nie geschrieben.
   */
  async saveToCloud(): Promise<void> {
    if (this.destroyed || this.mode === "off" || this.mode === "live" || this.saving) return;
    const { projectId } = this.opts;
    if (!projectAccessStore.canEdit(projectId)) return;
    const ops = this.pendingOps();
    if (ops.length === 0) { this.report({ dirty: false, error: null }); return; }
    this.saving = true;
    this.report({ saving: true, error: null });
    try {
      if (!this.revisionsLoaded) {
        this.revisions = await fetchObjectRevisions(projectId);
        this.revisionsLoaded = true;
      }
      for (const op of ops) {
        await this.writeOne(op);
        if (this.destroyed) return;
      }
      saveBaseline(this.baseKey, this.cloudHashes);
      this.lastIndex = indexSnapshot(this.opts.app.serializeForCollab());
      this.report({ saving: false, dirty: this.pendingOps().length > 0, lastSavedAt: Date.now(), error: null });
    } catch (error) {
      saveBaseline(this.baseKey, this.cloudHashes);
      this.setStatus({ unavailable: isCollabSchemaMissing(error) });
      this.report({
        saving: false,
        dirty: true,
        error: isCollabSchemaMissing(error)
          ? "Die Cloud-Sicherung ist für dieses Projekt noch nicht eingerichtet."
          : "Die Cloud-Sicherung ist fehlgeschlagen. Deine Arbeit ist lokal gespeichert.",
      });
    } finally {
      this.saving = false;
    }
  }

  /**
   * Schaltet die objektbasierte Zusammenarbeit ein, sobald eine zweite Person
   * im Projekt arbeitet: erst die eigenen offenen Änderungen objektweise
   * abgleichen, dann den gemeinsamen Stand laden, daraus die gemeinsame
   * Ausgangsbasis bilden, danach Einzeloperationen und Vorschauen.
   */
  private async goLive(): Promise<void> {
    if (this.destroyed || this.mode === "live" || this.activating) return;
    window.clearTimeout(this.graceTimer);
    this.graceTimer = 0;
    this.activating = true;
    const { projectId } = this.opts;
    try {
      // Einmaliger Abgleich der eigenen offenen Änderungen – objektweise und
      // mit Revisionsschutz, damit fremde Stände nie überschrieben werden.
      await this.saveToCloud();
      // Gemeinsamen Objektstand laden – nicht die gesamte Änderungshistorie.
      const state = await fetchObjectState(projectId);
      this.revisions = new Map(state.map((op) => [`${op.sheetId}|${op.objectId}`, op.objectVersion]));
      this.revisionsLoaded = true;
      this.applyRemoteOps(state);
      this.lastSeq = await fetchLatestSeq(projectId);
      this.lastIndex = indexSnapshot(this.opts.app.serializeForCollab());
      this.setLocks(await fetchObjectLocks(projectId));
    } catch (error) {
      this.activating = false;
      this.setStatus({ unavailable: isCollabSchemaMissing(error) });
      return;
    }
    this.mode = "live";
    this.activating = false;
    this.setStatus({ mode: "live" });
    this.baselineFromCurrent();
    this.report({ mode: "live", dirty: false, saving: false, error: null });
    this.trackPresence();
    this.connect();
    this.startTimers();
  }

  /** Nachlauf starten, wenn die letzte andere Person das Projekt verlässt. */
  private scheduleStandby() {
    if (this.mode !== "live" || this.graceTimer) return;
    this.graceTimer = window.setTimeout(() => {
      this.graceTimer = 0;
      void this.goStandby();
    }, COLLAB_GRACE_MS);
  }

  /** Zurück zum normalen Speicherweg: keine Operationen, keine Sperren. */
  private async goStandby(): Promise<void> {
    if (this.mode !== "live") return;
    this.mode = "standby";
    window.clearTimeout(this.sendTimer);
    window.clearInterval(this.heartbeatTimer);
    window.clearInterval(this.sweepTimer);
    this.heartbeatTimer = 0;
    this.sweepTimer = 0;
    this.previewed.clear();
    await this.unlockAll();
    const client = getNetworkClient();
    if (client && this.channel) await client.removeChannel(this.channel);
    this.channel = null;
    this.setStatus({ mode: "standby", locksByObject: new Map() });
    this.trackPresence();
  }


  private connect() {
    const client = getNetworkClient();
    if (!client || this.destroyed) return;
    const { projectId, userId } = this.opts;

    this.channel = client
      .channel(`cad-collab:${projectId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cad_object_ops", filter: `project_id=eq.${projectId}` },
        (msg) => {
          const op = rowToOp(msg.new as never);
          if (op.actorId === userId) {
            // Eigene Änderung: nur die bestätigte Revision übernehmen.
            this.revisions.set(`${op.sheetId}|${op.objectId}`, op.objectVersion);
            this.lastSeq = Math.max(this.lastSeq, op.seq);
            return;
          }
          this.applyRemoteOps([op]);
          this.lastSeq = Math.max(this.lastSeq, op.seq);
          this.lastIndex = indexSnapshot(this.opts.app.serializeForCollab());
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cad_object_locks", filter: `project_id=eq.${projectId}` },
        () => { void this.refreshLocks(); },
      )
      .on("broadcast", { event: "preview" }, ({ payload }) => {
        const msg = payload as CadPreviewMessage;
        if (!msg || msg.userId === userId) return;
        this.applyPreview(msg);
      })
      .subscribe(async (state) => {
        if (state !== "SUBSCRIBED") return;
        this.setStatus({ connected: true, unavailable: false });
        // Nach (Wieder-)Verbindung nur die kurze Lücke nachholen.
        try {
          const missed = await fetchOpsSince(projectId, this.lastSeq);
          if (missed.length) {
            this.applyRemoteOps(missed);
            this.lastSeq = missed[missed.length - 1].seq;
            this.lastIndex = indexSnapshot(this.opts.app.serializeForCollab());
          }
          await this.refreshLocks();
        } catch { /* CAD arbeitet lokal weiter */ }
      });
  }

  private startTimers() {
    this.heartbeatTimer = window.setInterval(() => { void this.renewOwnLocks(); }, LOCK_HEARTBEAT_MS);
    this.sweepTimer = window.setInterval(() => this.sweepExpiredLocks(), LOCK_SWEEP_MS);
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
    // Solo-Betrieb: nichts übertragen – nur den Hinweis auf offene Änderungen
    // aktualisieren. Gesichert wird ausschließlich per Klick.
    if (this.mode !== "live") {
      this.lastIndex = indexSnapshot(this.opts.app.serializeForCollab());
      this.refreshDirty();
      return;
    }
    if (this.flushing) { this.flushAgain = true; return; }
    const { projectId } = this.opts;
    if (!projectAccessStore.canEdit(projectId)) return;
    this.flushing = true;
    try {
      const nextIndex = indexSnapshot(this.opts.app.serializeForCollab());
      const ops = diffSceneIndexes(this.lastIndex, nextIndex);
      this.lastIndex = nextIndex;
      if (ops.length === 0) return;
      // Bibliotheksdefinitionen zuerst: eine Instanz darf nie ohne Geometrie
      // bei der Gegenseite ankommen.
      ops.sort((a, b) => Number(isLibraryKind(b.objectKind)) - Number(isLibraryKind(a.objectKind)));
      for (const op of ops) {
        await this.writeOne(op);
        if (this.destroyed) return;
      }
    } catch (error) {
      if (!isCollabSchemaMissing(error)) console.error("CAD-Live-Änderung nicht gespeichert:", error);
      this.setStatus({ unavailable: isCollabSchemaMissing(error) });
    } finally {
      this.flushing = false;
      if (this.flushAgain) {
        this.flushAgain = false;
        this.notifyLocalChange();
      }
    }
  }

  /** Schreibt eine Änderung und behandelt einen möglichen Konflikt. */
  private async writeOne(op: LocalCadOp): Promise<void> {
    const key = `${op.sheetId}|${op.objectId}`;
    const base = this.revisions.get(key) ?? 0;
    const result = await writeObject(this.opts.projectId, op, base);
    this.revisions.set(key, result.revision);
    if (result.accepted) return;
    // Konflikt: ausschließlich dieses eine Objekt wird auf den gültigen
    // Serverstand zurückgesetzt – die übrige Zeichnung bleibt unberührt.
    this.applyRemoteOps([
      {
        id: `conflict-${key}`,
        projectId: this.opts.projectId,
        sheetId: op.sheetId,
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
    this.lastIndex = indexSnapshot(this.opts.app.serializeForCollab());
  }

  /* --------------------------------------------------- Fremde Änderungen */

  private applyRemoteOps(ops: CadObjectOp[]) {
    if (ops.length === 0) return;
    this.applyingRemote = true;
    let changed = false;
    try {
      for (const op of ops) {
        const key = `${op.sheetId}|${op.objectId}`;
        const known = this.revisions.get(key) ?? 0;
        if (op.objectVersion < known) continue; // älterer Stand gewinnt nie
        this.revisions.set(key, Math.max(known, op.objectVersion));

        if (isLibraryKind(op.objectKind)) {
          const host = this.opts.app as unknown as {
            libraryDefinitions: unknown[];
            libraryFolders: unknown[];
            onLibraryChange?: () => void;
          };
          if (!host.libraryDefinitions || !host.libraryFolders) continue;
          changed = applyLibraryOp(
            host,
            op.objectKind as CadLibraryKind,
            op.objectId,
            op.changeType,
            op.payload,
          ) || changed;
          continue;
        }

        const scene = this.opts.app.scenesById.get(op.sheetId);
        if (!scene) continue;
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

  /**
   * Flüchtige Vorschau aller gerade veränderten Objekte während einer
   * laufenden Geste (Verschieben, Drehen, Skalieren, Referenzstrecke,
   * Bibliotheks- und Dokumenttransformation). Es wird nichts gespeichert.
   */
  previewLocalChanges(): void {
    if (this.mode !== "live" || !this.channel || this.applyingRemote) return;
    if (!projectAccessStore.canEdit(this.opts.projectId)) return;
    const now = Date.now();
    if (now - this.lastPreviewAt < PREVIEW_THROTTLE_MS) return;
    this.lastPreviewAt = now;
    const ops = diffSceneIndexes(this.lastIndex, indexSnapshot(this.opts.app.serializeForCollab()));
    for (const op of ops) {
      if (isLibraryKind(op.objectKind)) continue; // Definitionen nie als Vorschau
      this.previewed.set(`${op.sheetId}|${op.objectId}`, op);
      this.emitPreview(op.sheetId, op.objectId, op.objectKind, op.payload);
    }
  }

  /**
   * Beendet eine Vorschau ohne dauerhafte Änderung (Escape): Die Gegenseite
   * erhält eine leere Vorschau und sieht damit wieder den bestätigten Stand.
   */
  cancelPreview(): void {
    for (const op of this.previewed.values()) {
      this.emitPreview(op.sheetId, op.objectId, op.objectKind, null);
    }
    this.previewed.clear();
  }

  /** Nach dem Loslassen: die dauerhafte Änderung übernimmt die Darstellung. */
  finishPreview(): void {
    this.previewed.clear();
  }

  /** Gedrosselte, flüchtige Vorschau während des Ziehens (nichts gespeichert). */
  sendPreview(sheetId: string, objectId: string, objectKind: CadObjectKind, payload: Record<string, unknown> | null) {
    if (this.mode !== "live" || !this.channel) return;
    const now = Date.now();
    if (payload && now - this.lastPreviewAt < PREVIEW_THROTTLE_MS) return;
    this.lastPreviewAt = now;
    this.emitPreview(sheetId, objectId, objectKind, payload);
  }

  private emitPreview(
    sheetId: string,
    objectId: string,
    objectKind: CadObjectKind,
    payload: Record<string, unknown> | null,
  ) {
    if (!this.channel) return;
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
    if (!msg.payload) {
      // Abbruch (Escape): bestätigten Stand dieses Objekts wieder herstellen.
      void this.restoreObject(msg.sheetId, msg.objectId, msg.objectKind);
      return;
    }
    this.applyingRemote = true;
    try {
      applyOpToScene(scene as never, msg.objectKind, msg.objectId, "update", msg.payload);
    } finally {
      this.applyingRemote = false;
    }
    this.opts.requestRender();
  }

  /** Holt genau ein Objekt frisch vom Server (nach Abbruch einer Vorschau). */
  private async restoreObject(sheetId: string, objectId: string, kind: CadObjectKind): Promise<void> {
    const client = getNetworkClient();
    if (!client) return;
    try {
      const { data } = await client
        .from("cad_object_state")
        .select("payload,deleted,revision")
        .eq("project_id", this.opts.projectId)
        .eq("sheet_id", sheetId)
        .eq("object_id", objectId)
        .maybeSingle();
      if (!data) return;
      const row = data as { payload: Record<string, unknown> | null; deleted: boolean; revision: number };
      this.revisions.delete(`${sheetId}|${objectId}`);
      this.applyRemoteOps([
        {
          id: `restore-${objectId}`,
          projectId: this.opts.projectId,
          sheetId,
          objectId,
          objectKind: kind,
          changeType: row.deleted ? "delete" : "update",
          payload: row.payload,
          objectVersion: Number(row.revision ?? 0),
          actorId: null,
          createdAt: new Date().toISOString(),
          seq: this.lastSeq,
        },
      ]);
    } catch { /* weicher Pfad */ }
  }

  /* -------------------------------------------- Präsenz & Bearbeitungshinweis */

  /**
   * Meldet die eigene Position/Seite/Bearbeitung (nicht dauerhaft gespeichert).
   * Im Standby (nur eine aktive Person) wird bewusst nichts gesendet: die
   * einmalige Startmeldung beim Verbinden reicht, um einen Beitritt zu erkennen.
   */
  updatePresence(partial: Partial<Pick<CadPresenceUser, "sheetId" | "cursor" | "editingObjectId">>) {
    if (this.mode !== "live") return;
    this.trackPresence(partial);
  }

  /** Einmalige Presence-Meldung (Verbindungsaufbau, Moduswechsel). */
  private trackPresence(partial?: Partial<Pick<CadPresenceUser, "sheetId" | "cursor" | "editingObjectId">>) {
    if (!this.presence || !this.status.connected) return;
    const quiet = this.mode !== "live";
    void this.presence.track({
      userId: this.opts.userId,
      displayName: this.opts.displayName,
      color: presenceColor(this.opts.userId),
      sheetId: this.opts.app.activeSheetId,
      cursor: null,
      editingObjectId: null,
      ...partial,
      ...(quiet ? { cursor: null, editingObjectId: null } : {}),
    });
  }


  /** Weiche Bearbeitungssperre setzen. */
  async lockObject(sheetId: string, objectId: string): Promise<void> {
    this.updatePresence({ sheetId, editingObjectId: objectId });
    if (this.mode !== "live") return; // allein: keine Sperren setzen
    if (!projectAccessStore.canEdit(this.opts.projectId)) return;
    this.ownLocks.set(`${sheetId}|${objectId}`, { sheetId, objectId });
    try {
      await claimObjectLock(this.opts.projectId, sheetId, objectId, this.opts.userId, this.opts.displayName);
    } catch { /* weicher Hinweis – Fehler blockieren die Arbeit nicht */ }
  }

  async unlockObject(sheetId: string, objectId: string): Promise<void> {
    this.updatePresence({ sheetId, editingObjectId: null });
    if (this.mode !== "live") return;
    this.ownLocks.delete(`${sheetId}|${objectId}`);
    try {
      await releaseObjectLock(this.opts.projectId, sheetId, objectId);
    } catch { /* weicher Hinweis */ }
  }

  /** Alle eigenen Markierungen lösen (Werkzeugwechsel, Abwählen, Verlassen). */
  async unlockAll(): Promise<void> {
    const locks = [...this.ownLocks.values()];
    this.ownLocks.clear();
    this.updatePresence({ editingObjectId: null });
    for (const lock of locks) {
      try { await releaseObjectLock(this.opts.projectId, lock.sheetId, lock.objectId); } catch { /* weich */ }
    }
  }

  private async renewOwnLocks(): Promise<void> {
    if (this.destroyed || this.mode !== "live" || this.ownLocks.size === 0) return;
    for (const lock of this.ownLocks.values()) {
      try {
        await claimObjectLock(
          this.opts.projectId, lock.sheetId, lock.objectId, this.opts.userId, this.opts.displayName,
        );
      } catch { /* weich */ }
    }
  }

  private async refreshLocks(): Promise<void> {
    try { this.setLocks(await fetchObjectLocks(this.opts.projectId)); } catch { /* weich */ }
  }

  private setLocks(rows: RemoteLock[]) {
    const map = new Map<string, ObjectLockInfo>();
    for (const row of rows) {
      if (row.userId === this.opts.userId) continue;
      map.set(row.objectId, {
        sheetId: row.sheetId,
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
    const peers: CadPresenceUser[] = [];
    const editing = new Map<string, CadPresenceUser>();
    for (const key of Object.keys(raw)) {
      const entry = (raw as Record<string, unknown[]>)[key]?.[0] as CadPresenceUser | undefined;
      if (!entry || entry.userId === this.opts.userId) continue;
      peers.push(entry);
      if (entry.editingObjectId) editing.set(entry.editingObjectId, entry);
    }
    this.setStatus({ peers, editingByObject: editing });

    // Erst wenn wirklich jemand anderes im Projekt ist, wird die
    // objektbasierte Synchronisierung eingeschaltet – und beim Weggang der
    // letzten Person mit Nachlaufzeit wieder beendet.
    if (peers.length > 0) {
      window.clearTimeout(this.graceTimer);
      this.graceTimer = 0;
      if (this.mode === "standby") void this.goLive();
    } else if (this.mode === "live") {
      this.scheduleStandby();
    }
  }

  /* ------------------------------------------------------------- Zustand */

  getStatus(): CollabStatus { return this.status; }

  /** Bekannter Stand eines Objekts (für die Darstellung fremder Markierungen). */
  getObjectJson(sheetId: string, objectId: string): string | null {
    const kinds = this.lastIndex.get(sheetId);
    if (!kinds) return null;
    for (const byId of kinds.values()) {
      const json = byId.get(objectId);
      if (json) return json;
    }
    return null;
  }

  private setStatus(partial: Partial<CollabStatus>) {
    this.status = { ...this.status, ...partial };
    this.opts.onStatus?.(this.status);
  }

  destroy() {
    this.destroyed = true;
    window.clearTimeout(this.sendTimer);
    window.clearInterval(this.heartbeatTimer);
    window.clearInterval(this.sweepTimer);
    window.clearTimeout(this.graceTimer);
    void this.unlockAll();
    const client = getNetworkClient();
    if (client && this.channel) void client.removeChannel(this.channel);
    if (client && this.presence) void client.removeChannel(this.presence);
    this.channel = null;
    this.presence = null;
  }
}
