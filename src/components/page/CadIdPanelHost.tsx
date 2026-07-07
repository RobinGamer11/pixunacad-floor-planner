/**
 * CadIdPanelHost — mountet das imperative CAD-`IdPanel` (Bezeichnungs-ID /
 * Ebenen-System) in die Projektmappe. Rendert dieselbe DOM-Skelett-Struktur
 * wie `CadEditor.tsx` (Zeilen ~2622-2638) und übergibt die refs beim Mount
 * per `engine.attachIdPanel(refs)`.
 *
 * Beim Unmount wird `detachIdPanel()` aufgerufen; die Event-Listener am
 * (dann entfernten) DOM-Baum werden vom GC eingesammelt.
 */
import { useEffect, useRef } from "react";
import type { MiniCad } from "@/cad/embed/MiniCad";

interface Props {
  engine: MiniCad | null;
}

export function CadIdPanelHost({ engine }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const toggleBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!engine) return;
    if (
      !rootRef.current || !bodyRef.current || !listRef.current ||
      !addBtnRef.current || !toggleBtnRef.current
    ) return;
    engine.attachIdPanel({
      root: rootRef.current,
      body: bodyRef.current,
      list: listRef.current,
      addBtn: addBtnRef.current,
      toggleBtn: toggleBtnRef.current,
    });
    return () => {
      engine.detachIdPanel();
    };
  }, [engine]);

  return (
    <div ref={rootRef} className="cad-id-panel w-full">
      <div className="id-head">
        <div className="id-title">Bezeichnungs-ID</div>
        <div className="id-head-actions">
          <button ref={toggleBtnRef} className="id-head-btn icon-only" title="Ein-/Ausklappen">
            <span className="id-toggle-chevron" />
          </button>
        </div>
      </div>
      <div ref={bodyRef} className="id-body">
        <div className="id-add-wrap">
          <button ref={addBtnRef} className="id-head-btn id-add-btn">+ ID</button>
        </div>
        <div ref={listRef} className="id-list" />
      </div>
    </div>
  );
}
