import { projectAccessStore } from "./projectAccess";
import { timelineStore } from "./timelineStore";

/** Shared UI command: removes only the contribution, never referenced files or booked time. */
export function deleteContribution(projectId: string, itemId: string): boolean {
  if (!projectAccessStore.canEdit(projectId)) return false;
  const item = timelineStore.getState(projectId).items.find((entry) => entry.id === itemId);
  if (!item || !window.confirm(`Beitrag „${item.title || "Ohne Titel"}“ löschen?`)) return false;
  // Check again after confirmation; the underlying timeline command supplies one undo step.
  if (!projectAccessStore.canEdit(projectId)) return false;
  timelineStore.deleteItem(projectId, itemId);
  return true;
}