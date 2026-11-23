import type { Project } from "./projectStore";
/** Recovery carrier for per-sheet vector snapshots in authenticated legacy directories. */
export function directoryCadSnapshot(project: Project | undefined): string | null {
  if (!project?.sheets.some(s => s.sceneJson)) return null;
  const scenesById: Record<string, unknown> = {};
  for (const sheet of project.sheets) {
    if (sheet.sceneJson) scenesById[sheet.id] = JSON.parse(sheet.sceneJson);
  }
  const labels = project.sheets.find(s => s.labelsJson)?.labelsJson;
  return JSON.stringify({
    sheets: project.sheets.map(s => ({ ...s, scaleValue: Number(String(s.scale).split(":").pop()) || 100 })),
    scenesById, activeSheetId: project.sheets[0]?.id,
    ...(labels ? { labels: JSON.parse(labels) } : {}),
  });
}