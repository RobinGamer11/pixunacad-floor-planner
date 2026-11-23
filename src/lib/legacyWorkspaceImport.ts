import { currentAccount, accountGeneration, sessionIsCurrent } from "./accountStorage";
import { projectStore, type Project } from "./projectStore";
import { projectAccessStore } from "./projectAccess";
import { loadPendingTrash } from "./cloudTrash";
import { saveLocalScene, loadLocalScene } from "@/cad/persist/localScenePersist";
import type { WorkspacePayload } from "./workspaceStorage";

export function missingLegacyProjects(current: readonly { id: string }[], incoming: readonly Project[], deleted: Set<string>) {
  const ids = new Set(current.map(p => p.id));
  return incoming.filter(p => typeof p?.id === "string" && Array.isArray(p.sheets) && !ids.has(p.id) && !p.deletedAt && !deleted.has(p.id));
}

/** A server-authenticated account backup is ownership evidence; unowned device keys are not. */
export async function importLegacyWorkspace(payload: WorkspacePayload, owner: string) {
  const epoch = accountGeneration();
  if (currentAccount() !== owner || localStorage.getItem("pixuna.legacyWorkspaceImported.v1") === "1") return;
  const raw = payload.localStorage?.["pixuna.projects.v3"];
  if (!raw) return;
  // Preserve the complete authenticated old backup before settings-only uploads replace it.
  if (!localStorage.getItem("pixuna.legacyWorkspaceArchive.v1")) localStorage.setItem("pixuna.legacyWorkspaceArchive.v1", JSON.stringify(payload));
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed?.projects)) throw new Error("Alte Kontosicherung nicht lesbar; sie bleibt unverändert erhalten.");
  await projectAccessStore.reload();
  if (!sessionIsCurrent(owner, epoch)) return;
  if (!projectAccessStore.getState().ready) throw new Error("Alte Kontosicherung bleibt erhalten; der Cloud-Papierkorb konnte noch nicht geprüft werden.");
  const deleted = new Set([...projectAccessStore.getState().deletedAtByProject].filter(([, at]) => at).map(([id]) => id));
  for (const [id, op] of Object.entries(loadPendingTrash())) if (op.op !== "restore") deleted.add(id);
  for (const project of missingLegacyProjects(projectStore.getState().projects, parsed.projects, deleted)) {
    if (!sessionIsCurrent(owner, epoch)) return;
    // Write the CAD carrier before publishing its directory entry; retries are safe by ID.
    const snapshot = payload.localStorage[`pixuna.cad.${project.id}`];
    if (snapshot && !await loadLocalScene(project.id)) {
      if (!await saveLocalScene(project.id, snapshot, 0, `pixuna.cad.${project.id}`)) throw new Error("Alte Zeichnung konnte nicht dauerhaft übernommen werden.");
    }
    if (!sessionIsCurrent(owner, epoch)) return;
    projectStore.applySharedProject(project);
    if (!projectStore.flushLocal()) throw new Error("Altes Projektverzeichnis konnte nicht dauerhaft übernommen werden.");
  }
  // Existing IDs are never replaced. Preserve missing local carriers from the authenticated
  // archive only when no current CAD snapshot exists; the normal open conflict rule decides.
  for (const project of parsed.projects as Project[]) {
    if (!sessionIsCurrent(owner, epoch)) return;
    if (!project?.id || deleted.has(project.id) || !projectStore.getState().projects.some(p => p.id === project.id)) continue;
    const snapshot = payload.localStorage[`pixuna.cad.${project.id}`];
    if (snapshot && !await loadLocalScene(project.id)) {
      if (!await saveLocalScene(project.id, snapshot, 0, `pixuna.cad.${project.id}`)) throw new Error("Alte Zeichnung konnte nicht dauerhaft übernommen werden.");
    }
  }
  if (sessionIsCurrent(owner, epoch)) localStorage.setItem("pixuna.legacyWorkspaceImported.v1", "1");
}