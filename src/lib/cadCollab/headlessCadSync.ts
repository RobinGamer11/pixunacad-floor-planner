import { loadLocalScene } from "@/cad/persist/localScenePersist";
import { accountGeneration, currentAccount, sessionIsCurrent } from "@/lib/accountStorage";
import { BASELINE_SEP, baselineKey, hasBaseline, hashText, loadBaseline, saveBaseline } from "@/lib/cloudBaseline";
import { classifyCloudError } from "@/lib/networkClient";
import { fetchObjectState, isCollabSchemaMissing, writeObject } from "./opsRepo";
import { indexSnapshot, type SceneIndex } from "./sceneDiff";
import type { CadObjectKind, CadObjectOp } from "./types";

interface LocalObjectDiff {
  sheetId: string;
  objectKind: CadObjectKind;
  objectId: string;
  changeType: "create" | "update" | "delete";
  payload: Record<string, unknown> | null;
}

function buildRemoteIndex(ops: CadObjectOp[]): { index: SceneIndex; revisions: Map<string, number> } {
  const index: SceneIndex = new Map();
  const revisions = new Map<string, number>();
  for (const op of ops) {
    const key = `${op.sheetId}|${op.objectId}`;
    revisions.set(key, Math.max(revisions.get(key) ?? 0, op.objectVersion));
    if (op.changeType === "delete" || !op.payload) continue;
    let byKind = index.get(op.sheetId);
    if (!byKind) {
      byKind = new Map<CadObjectKind, Map<string, string>>();
      index.set(op.sheetId, byKind);
    }
    let byId = byKind.get(op.objectKind);
    if (!byId) {
      byId = new Map<string, string>();
      byKind.set(op.objectKind, byId);
    }
    byId.set(op.objectId, JSON.stringify(op.payload));
  }
  return { index, revisions };
}

/**
 * Synchronisiert ausstehende lokale CAD-Änderungen direkt aus dem dauerhaft
 * gespeicherten Szenenstand in die Cloud – ohne einen unsichtbaren CAD-Editor zu starten.
 */
export async function syncLocalCadToCloud(projectId: string): Promise<{ pushed: number }> {
  const owner = currentAccount();
  const epoch = accountGeneration();
  const local = await loadLocalScene(projectId);
  if (!local?.snapshot) return { pushed: 0 };
  if (!sessionIsCurrent(owner, epoch)) throw new Error("Kontositzung wurde gewechselt.");

  const localIndex = indexSnapshot(local.snapshot);
  if (localIndex.size === 0) return { pushed: 0 };

  const baseKey = baselineKey("cad", projectId);
  const baselineExists = hasBaseline(baseKey);
  const baseline = loadBaseline(baseKey);

  let remoteOps: CadObjectOp[];
  try {
    remoteOps = await fetchObjectState(projectId);
  } catch (err) {
    if (isCollabSchemaMissing(err)) return { pushed: 0 };
    throw new Error(classifyCloudError(err, "CAD-Cloudstand konnte nicht geprüft werden.").message);
  }
  if (!sessionIsCurrent(owner, epoch)) throw new Error("Kontositzung wurde gewechselt.");

  const { index: remoteIndex, revisions } = buildRemoteIndex(remoteOps);

  if (!baselineExists && remoteIndex.size > 0) {
    throw new Error("CAD-Zeichnung weicht vom Cloudstand ab (keine gemeinsame Ausgangsbasis). Bitte Zeichnung öffnen und Stand wählen.");
  }

  const ops: LocalObjectDiff[] = [];
  const nextBaseline = new Map(baseline);

  // 1. Lokal neu angelegte oder geänderte Objekte gegenüber der gespeicherten Baseline bestimmen.
  for (const [sheetId, byKind] of localIndex) {
    for (const [objectKind, byId] of byKind) {
      for (const [objectId, json] of byId) {
        const bKey = `${sheetId}${BASELINE_SEP}${objectKind}${BASELINE_SEP}${objectId}`;
        const localHash = hashText(json);
        const baseHash = baseline.get(bKey);
        if (baselineExists && baseHash === localHash) continue;

        const remoteJson = remoteIndex.get(sheetId)?.get(objectKind)?.get(objectId);
        const remoteHash = remoteJson !== undefined ? hashText(remoteJson) : undefined;
        if (remoteHash === localHash) {
          nextBaseline.set(bKey, localHash);
          continue;
        }
        if (!baseHash && remoteHash !== undefined) {
          throw new Error("CAD-Zeichnung weicht vom Cloudstand ab. Bitte Zeichnung öffnen und Stand wählen.");
        }
        if (baseHash && remoteHash !== baseHash) {
          throw new Error("CAD-Zeichnung weicht vom Cloudstand ab. Bitte Zeichnung öffnen und Stand wählen.");
        }
        ops.push({
          sheetId,
          objectKind,
          objectId,
          changeType: baseHash ? "update" : "create",
          payload: JSON.parse(json) as Record<string, unknown>,
        });
      }
    }
  }

  // 2. Lokal gelöschte Objekte gegenüber der gespeicherten Baseline bestimmen.
  if (baselineExists) {
    for (const [bKey, baseHash] of baseline) {
      const parts = bKey.split(BASELINE_SEP);
      if (parts.length !== 3) continue;
      const [sheetId, rawKind, objectId] = parts;
      const objectKind = rawKind as CadObjectKind;
      if (localIndex.get(sheetId)?.get(objectKind)?.has(objectId)) continue;

      const remoteJson = remoteIndex.get(sheetId)?.get(objectKind)?.get(objectId);
      if (remoteJson === undefined) {
        nextBaseline.delete(bKey);
        continue;
      }
      if (hashText(remoteJson) !== baseHash) {
        throw new Error("CAD-Zeichnung weicht vom Cloudstand ab. Bitte Zeichnung öffnen und Stand wählen.");
      }
      ops.push({
        sheetId,
        objectKind,
        objectId,
        changeType: "delete",
        payload: null,
      });
    }
  }

  if (ops.length === 0) {
    if (nextBaseline.size !== baseline.size) saveBaseline(baseKey, nextBaseline);
    return { pushed: 0 };
  }

  let pushed = 0;
  for (const op of ops) {
    if (!sessionIsCurrent(owner, epoch)) throw new Error("Kontositzung wurde gewechselt.");
    const key = `${op.sheetId}|${op.objectId}`;
    const expectedRev = revisions.get(key) ?? 0;
    const res = await writeObject(projectId, op, expectedRev);
    if (!res.accepted) {
      throw new Error("CAD-Zeichnung weicht vom Cloudstand ab. Bitte Zeichnung öffnen und Stand wählen.");
    }
    revisions.set(key, res.revision);
    const bKey = `${op.sheetId}${BASELINE_SEP}${op.objectKind}${BASELINE_SEP}${op.objectId}`;
    if (op.changeType === "delete" || !op.payload) {
      nextBaseline.delete(bKey);
    } else {
      nextBaseline.set(bKey, hashText(JSON.stringify(op.payload)));
    }
    pushed += 1;
  }
  saveBaseline(baseKey, nextBaseline);
  return { pushed };
}