import { loadLocalScene } from "@/cad/persist/localScenePersist";
import { accountGeneration, currentAccount, sessionIsCurrent } from "@/lib/accountStorage";
import { classifyCloudError } from "@/lib/networkClient";
import { fetchObjectState, isCollabSchemaMissing, writeObject } from "./opsRepo";
import { diffSceneIndexes, indexSnapshot, type SceneIndex } from "./sceneDiff";
import type { CadObjectKind, CadObjectOp } from "./types";

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

  let remoteOps: CadObjectOp[];
  try {
    remoteOps = await fetchObjectState(projectId);
  } catch (err) {
    if (isCollabSchemaMissing(err)) return { pushed: 0 };
    throw new Error(classifyCloudError(err, "CAD-Cloudstand konnte nicht geprüft werden.").message);
  }
  if (!sessionIsCurrent(owner, epoch)) throw new Error("Kontositzung wurde gewechselt.");

  const { index: remoteIndex, revisions } = buildRemoteIndex(remoteOps);
  const ops = diffSceneIndexes(remoteIndex, localIndex);
  if (ops.length === 0) return { pushed: 0 };

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
    pushed += 1;
  }
  return { pushed };
}