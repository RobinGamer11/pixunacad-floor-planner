/** Transient editor state, shared by header, keyboard and tablet history commands. */
export type ObjectRef3D = { sheetId: string; id: string };
type Editor3DState = { refs: ObjectRef3D[]; cancelDraft?: () => boolean; onHistory?: () => void };
const states = new WeakMap<object, Editor3DState>();
export function state3D(app: object): Editor3DState { let s=states.get(app);if(!s){s={refs:[]};states.set(app,s);}return s; }
export function enter3DEditor(app: object, cancelDraft: () => boolean, onHistory: () => void) { const s=state3D(app);s.cancelDraft=cancelDraft;s.onHistory=onHistory;return()=>states.delete(app); }
export function route3DHistory(app: object, direction: "undo"|"redo"): boolean {
  const s=states.get(app);if(!s?.cancelDraft)return false;
  if(s.cancelDraft()){s.onHistory?.();return true;}
  const a=app as {historyUndoStep:()=>boolean;historyRedoStep:()=>boolean};
  if(direction==="undo")a.historyUndoStep();else a.historyRedoStep();s.onHistory?.();return true;
}