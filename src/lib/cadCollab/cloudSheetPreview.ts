/**
 * CAD-Ausschnitte der Projektmappe direkt aus dem Cloudstand.
 *
 * Auf einem neuen Gerät (oder nach Änderungen auf einem anderen Gerät) muss
 * die Mappe den aktuellen CAD-Stand zeigen, ohne dass zuerst CAD geöffnet
 * wird. Dazu werden die Blattszenen aus dem objektweisen Cloudstand gebaut –
 * im selben Format, das CAD beim Speichern in `project.sheets` ablegt.
 *
 * Grundsätze:
 *  - Während geprüft/geladen wird, zeigt die Mappe einen Ladezustand statt
 *    eines möglicherweise veralteten Ausschnitts.
 *  - Ungesicherte CAD-Arbeit dieses Geräts wird nie überdeckt.
 *  - Der gespeicherte CAD-Arbeitsstand und dessen Cloud-Merkzettel bleiben
 *    unberührt – CAD gleicht sich beim Öffnen wie gewohnt selbst ab.
 *  - Keine Dauerverbindung: eine Abfrage beim Öffnen/Zurückkehren.
 */
import { accountGeneration, currentAccount, sessionIsCurrent } from "@/lib/accountStorage";
import { loadLocalScene } from "@/cad/persist/localScenePersist";
import { reportProjectSyncSource } from "@/lib/projectSync";
import { classifyCloudError } from "@/lib/networkClient";
import { useSyncExternalStore } from "react";
import { baselineKey, BASELINE_SEP, hashText, hasBaseline, loadBaseline, validateBaseline } from "@/lib/cloudBaseline";
import { projectAccessStore } from "@/lib/projectAccess";
import { projectStore, type Sheet } from "@/lib/projectStore";
import { fetchLatestSeq, fetchObjectState } from "./opsRepo";
import { indexSnapshot } from "./sceneDiff";
import {
  CAD_LIBRARY_SHEET_ID,
  CAD_STRUCTURE_SHEET_ID,
  type CadObjectOp,
} from "./types";

/* ---------------------------------------------------------- reine Teile */

export interface CloudSheetScene {
  id: string;
  name: string;
  scale: string;
  sceneJson?: string;
}

export interface CloudSheetsResult {
  sheets: CloudSheetScene[];
  labelsJson?: string;
}

function stripOrder(payload: Record<string, unknown>) {
  const { __order: _order, ...rest } = payload;
  void _order;
  return rest;
}

/** Baut Blätter + Blattszenen aus dem objektweisen Cloudstand. */
export function buildSheetsFromCloud(state: CadObjectOp[]): CloudSheetsResult {
  const scenes = new Map<string, Record<string, unknown[]>>();
  const sheetRows: { order: number; data: Record<string, unknown> }[] = [];
  const labelRows: { order: number; data: Record<string, unknown> }[] = [];
  for (const op of state) {
    if (op.changeType === "delete" || !op.payload) continue;
    if (op.sheetId === CAD_LIBRARY_SHEET_ID) continue;
    if (op.sheetId === CAD_STRUCTURE_SHEET_ID) {
      const order = typeof op.payload.__order === "number" ? op.payload.__order : 0;
      const row = { order, data: stripOrder(op.payload) };
      if (op.objectKind === "sheets") sheetRows.push(row);
      else if (op.objectKind === "labels") labelRows.push(row);
      continue;
    }
    const scene = scenes.get(op.sheetId) ?? {};
    (scene[op.objectKind] ??= []).push(op.payload);
    scenes.set(op.sheetId, scene);
  }
  sheetRows.sort((a, b) => a.order - b.order);
  labelRows.sort((a, b) => a.order - b.order);
  const sheets: CloudSheetScene[] = sheetRows.map(({ data }) => {
    const id = String(data.id);
    const scene = scenes.get(id);
    return {
      id,
      name: typeof data.name === "string" && data.name ? data.name : "Sheet",
      scale: typeof data.scaleValue === "number" ? `1:${data.scaleValue}` : (typeof data.scaleKey === "string" ? data.scaleKey : "1:100"),
      sceneJson: scene ? JSON.stringify(scene) : undefined,
    };
  });
  return {
    sheets,
    labelsJson: labelRows.length ? JSON.stringify(labelRows.map((r) => r.data)) : undefined,
  };
}

/** Hat dieses Gerät CAD-Arbeit, die noch nicht in der Cloud gesichert ist? */
export function hasUnsavedLocalCad(snapshot: string | null, baseline: Map<string, string>, baselineExists: boolean): boolean {
  const index = indexSnapshot(snapshot);
  let content = 0;
  const localKeys = new Set<string>();
  for (const [sheetId, kinds] of index) {
    for (const [kind, byId] of kinds) {
      for (const [objectId, json] of byId) {
        localKeys.add(`${sheetId}${BASELINE_SEP}${kind}${BASELINE_SEP}${objectId}`);
        const isContent = sheetId !== CAD_LIBRARY_SHEET_ID && sheetId !== CAD_STRUCTURE_SHEET_ID;
        if (isContent) content += 1;
        if (!baselineExists) continue;
        if (baseline.get(`${sheetId}${BASELINE_SEP}${kind}${BASELINE_SEP}${objectId}`) !== hashText(json)) return true;
      }
    }
  }
  if (baselineExists && [...baseline.keys()].some(key => !localKeys.has(key))) return true;
  return !baselineExists && content > 0;
}

/* ---------------------------------------------------------- Ladezustand */

const loading = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => { version += 1; listeners.forEach((fn) => fn()); };

function setLoading(projectId: string, on: boolean) {
  if (on === loading.has(projectId)) return;
  if (on) loading.add(projectId); else loading.delete(projectId);
  emit();
}

export function isCloudSheetLoading(projectId: string | undefined): boolean {
  return !!projectId && loading.has(projectId);
}

export function useCloudSheetLoading(projectId: string | undefined): boolean {
  useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    () => version,
    () => version,
  );
  return isCloudSheetLoading(projectId);
}

/* ---------------------------------------------------------- Abgleich */

const seenKey = (projectId: string) => `pixuna.cloudsheets.${projectId}.seq`;
const inflight = new Map<string, Promise<void>>();

/**
 * Prüft den CAD-Cloudstand und aktualisiert die Blattszenen der Mappe.
 * `showLoading`: sofort Ladezustand zeigen (beim Öffnen), sonst erst, wenn
 * tatsächlich ein neuerer Stand geladen wird.
 */
export function refreshCadSheetsFromCloud(projectId: string, showLoading = true): Promise<void> {
  const key = `${currentAccount()}:${accountGeneration()}:${projectId}`;
  const running = inflight.get(key);
  if (running) return running;
  const job = run(projectId, showLoading).finally(() => {
    inflight.delete(key);
    setLoading(projectId, false);
  });
  inflight.set(key, job);
  return job;
}

async function run(projectId: string, showLoading: boolean): Promise<void> {
  const access = projectAccessStore.accessFor(projectId);
  if (!access.cloud || access.role === null) return;
  const owner = currentAccount(), epoch = accountGeneration();
  const baseKey = baselineKey("cad", projectId);
  try {
    validateBaseline(baseKey);
    const snapshot = (await loadLocalScene(projectId))?.snapshot ?? null;
    if (!sessionIsCurrent(owner, epoch)) return;
    if (hasUnsavedLocalCad(snapshot, loadBaseline(baseKey), hasBaseline(baseKey))) return;
    if (showLoading) setLoading(projectId, true);
    const latestSeq = await fetchLatestSeq(projectId);
    if (!sessionIsCurrent(owner, epoch)) return;
    const seen = Number(localStorage.getItem(seenKey(projectId)) ?? "0") || 0;
    const cadSeen = Number(localStorage.getItem(`${baseKey}.seq`) ?? "0") || 0;
    if (latestSeq <= Math.max(seen, cadSeen)) return;
    setLoading(projectId, true);
    const state = await fetchObjectState(projectId);
    if (!sessionIsCurrent(owner, epoch)) return;
    const latestLocal = (await loadLocalScene(projectId))?.snapshot ?? null;
    if (!sessionIsCurrent(owner, epoch) || latestLocal !== snapshot) return;
    const built = buildSheetsFromCloud(state);
    if (!built.sheets.length) return;
    applySheets(projectId, built);
    try { localStorage.setItem(seenKey(projectId), String(latestSeq)); } catch { /* entbehrlich */ }
  } catch (error) {
    if (sessionIsCurrent(owner, epoch)) reportProjectSyncSource(projectId, "cad", { error: classifyCloudError(error, "CAD-Cloudstand konnte nicht geprüft werden.").message });
  }
}

function applySheets(projectId: string, built: CloudSheetsResult) {
  const project = projectStore.getState().projects.find((p) => p.id === projectId);
  if (!project) return;
  const prevById = new Map(project.sheets.map((s) => [s.id, s] as const));
  const sheets: Sheet[] = built.sheets.map((s) => {
    const prev = prevById.get(s.id);
    return {
      ...(prev ?? {}),
      id: s.id,
      name: s.name,
      scale: s.scale,
      thumbnail: prev?.thumbnail,
      sceneJson: s.sceneJson,
      labelsJson: built.labelsJson ?? prev?.labelsJson,
    } as Sheet;
  });
  projectStore.applyCloudSheets(projectId, sheets);
}
