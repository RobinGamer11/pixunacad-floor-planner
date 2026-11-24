export type OpeningPhase = "access" | "local" | "cloud" | "resources" | "view" | "ready";
export interface ProjectOpeningState { phase: OpeningPhase; progress: number; error: string | null; conflict: boolean; localAvailable: boolean; offline: boolean }
export const INITIAL_OPENING: ProjectOpeningState = { phase: "access", progress: 0, error: null, conflict: false, localAvailable: false, offline: false };
export const PHASE_PROGRESS: Record<OpeningPhase, number> = { access: 0, local: 10, cloud: 35, resources: 70, view: 95, ready: 100 };
export const MIN_OPENING_DISPLAY_MS = 3000;

export function remainingOpeningDisplayMs(startedAt: number, now: number, minMs = MIN_OPENING_DISPLAY_MS): number {
  return Math.max(0, minMs - Math.max(0, now - startedAt));
}

export function advanceOpening(state: ProjectOpeningState, phase: OpeningPhase, patch: Partial<ProjectOpeningState> = {}): ProjectOpeningState {
  if (phase === "ready" && (state.error || state.conflict)) return state;
  return { ...state, ...patch, phase, progress: Math.max(state.progress, PHASE_PROGRESS[phase]) };
}