import type { LocalProjectSaveState } from "@/cad/persist/localScenePersist";
import type { ProjectSyncState } from "./projectSync";

/** A clean local save is never evidence of a cloud acknowledgement. */
export function workspaceSaveStatus(local: LocalProjectSaveState, cloud: ProjectSyncState) {
  const localError = ["quota", "error", "blocked"].includes(local.status);
  const cloudSaved = cloud.mode !== "off" && !cloud.deviceOnly && !cloud.dirty && !cloud.saving && !cloud.error && !cloud.conflict && !cloud.updateAvailable && cloud.lastSavedAt !== null;
  const busy = local.status === "saving" || cloud.saving;
  return { busy, localError, cloudSaved, complete: local.status === "saved" && cloudSaved && !busy };
}