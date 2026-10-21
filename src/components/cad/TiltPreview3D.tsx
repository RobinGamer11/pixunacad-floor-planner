/**
 * Interaktive räumliche Vorschau eines Schraffurkörpers in den 3D-Einstellungen.
 * Geometrie kommt ausschließlich aus `deriveHatch` (dieselbe Ableitung wie die 3D-Ansicht).
 * Kamera (drehen/zoomen/schieben) ist rein flüchtig – nie Geometrie, Undo oder Cloud.
 * Kurzer Tipp auf eine Kante wählt sie; Ziehen an der gewählten Kante (nur in der
 * Bearbeitung) ändert die Vorschau-Neigung; Pinch/Ziehen sonst = nur Kamera.
 */
import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Maximize2 } from "lucide-react";
import { deriveHatch } from "@/cad/three3d/geometryDerivation";
import { faceMesh, slabMesh, type MeshData } from "@/cad/three3d/solidMesh";
import type { TiltFrame } from "@/cad/three3d/tiltGeometry";
import type { Vec2 } from "@/cad/geometry";

type Props = {
  obj: any; base: number; draftTilt: any | undefined; edge: number | null; frame?: TiltFrame;
  selectable: Set<number>; onPickEdge?: (i: number) => void;
  /** Nur in der Bearbeitung: vertikaler Zug an der Kante in Metern (relativ zum Zugbeginn). */
  onEdgeDrag?: (phase: "start" | "move", dzM: number) => void;
};

const toScene = (x: number, y: number, z: number) => new THREE.Vector3(x, z, y);

function meshOfDerived(d: any): MeshData | null {
  if (!d) return null;
  if (d.type === "mesh") return d.mesh;
  if (d.type === "prism") return slabMesh(d.footprint, d.holes, () => d.z0, () => d.z1);
  if (d.type === "plane") return faceMesh(d.outline, d.holes, () => d.z);
  return null;
}

export const TiltPreview3D: React.FC<Props> = ({ obj, base, draftTilt, edge, frame, selectable, onPickEdge, onEdgeDrag }) => {
  const host = useRef<HTMLDivElement>(null);
  const st = useRef<any>({});
  const props = useRef<Props>({} as Props);
  props.current = { obj, base, draftTilt, edge, frame, selectable, onPickEdge, onEdgeDrag };

  // Einmalige Einrichtung; Ressourcen beim Schließen freigeben.
  useEffect(() => {
    const el = host.current!; const W = el.clientWidth || 260, H = 180;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { el.dataset.noWebgl = "1"; return; } // ohne WebGL: Bedienung über Zahl/Regler bleibt
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(W, H);
    renderer.domElement.style.touchAction = "none"; renderer.domElement.style.display = "block";
    el.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(4, 8, 3); scene.add(sun);
    const camera = new THREE.PerspectiveCamera(40, W / H, 0.01, 5000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false; controls.screenSpacePanning = true;
    const group = new THREE.Group(); scene.add(group);
    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);
    const ro = new ResizeObserver(() => { const w = el.clientWidth || W; renderer.setSize(w, H); camera.aspect = w / H; camera.updateProjectionMatrix(); render(); });
    ro.observe(el);
    st.current = { renderer, scene, camera, controls, group, render, fitted: null as string | null, edges: [] as { i: number; a: THREE.Vector3; b: THREE.Vector3 }[] };

    // Tipp vs. Ziehen unterscheiden; Kantenzug nur an der gewählten Kante.
    const cv = renderer.domElement;
    let down: { id: number; x: number; y: number; moved: boolean; edgeDrag: boolean; ppm: number } | null = null;
    let touches = 0;
    const screen = (v: THREE.Vector3) => { const r = cv.getBoundingClientRect(); const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * r.width, y: (1 - p.y) / 2 * r.height }; };
    const nearestEdge = (cx: number, cy: number) => {
      let best = -1, bd = 16;
      for (const e of st.current.edges) {
        const A = screen(e.a), B = screen(e.b); const dx = B.x - A.x, dy = B.y - A.y; const L = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((cx - A.x) * dx + (cy - A.y) * dy) / L));
        const d = Math.hypot(cx - (A.x + t * dx), cy - (A.y + t * dy));
        if (d < bd) { bd = d; best = e.i; }
      }
      return best;
    };
    const onDown = (e: PointerEvent) => {
      touches++;
      if (touches > 1) { down = null; controls.enabled = true; return; } // Pinch = nur Kamera
      const r = cv.getBoundingClientRect(); const cx = e.clientX - r.left, cy = e.clientY - r.top;
      const P = props.current;
      let edgeDrag = false, ppm = 1;
      if (P.onEdgeDrag && P.edge !== null && nearestEdge(cx, cy) === P.edge) {
        const e0 = st.current.edges.find((x: any) => x.i === P.edge);
        if (e0) {
          const mid = e0.a.clone().add(e0.b).multiplyScalar(0.5);
          const s0 = screen(mid), s1 = screen(mid.clone().add(new THREE.Vector3(0, 1, 0)));
          ppm = Math.max(1, Math.hypot(s1.x - s0.x, s1.y - s0.y));
          edgeDrag = true; controls.enabled = false; P.onEdgeDrag("start", 0);
        }
      }
      down = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, edgeDrag, ppm };
    };
    const onMove = (e: PointerEvent) => {
      if (!down || down.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) down.moved = true;
      if (down.edgeDrag) props.current.onEdgeDrag?.("move", -(e.clientY - down.y) / down.ppm);
    };
    const onUp = (e: PointerEvent) => {
      touches = Math.max(0, touches - 1);
      const d = down; down = null; controls.enabled = true;
      if (!d || d.id !== e.pointerId || d.moved || d.edgeDrag) return; // Fingerheben hält die Vorschau
      const r = cv.getBoundingClientRect(); const i = nearestEdge(e.clientX - r.left, e.clientY - r.top);
      if (i >= 0 && props.current.selectable.has(i)) props.current.onPickEdge?.(i);
    };
    cv.addEventListener("pointerdown", onDown, true); window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp); window.addEventListener("pointercancel", onUp);
    return () => {
      cv.removeEventListener("pointerdown", onDown, true); window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onUp);
      ro.disconnect(); controls.dispose();
      group.traverse((o: any) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
      renderer.dispose(); cv.remove();
    };
  }, []);

  const fit = () => {
    const s = st.current; if (!s.group) return;
    const box = new THREE.Box3().setFromObject(s.group); if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3()), r = Math.max(0.5, box.getSize(new THREE.Vector3()).length() / 2);
    s.controls.target.copy(c);
    s.camera.position.copy(c).add(new THREE.Vector3(1, 0.9, 1.3).normalize().multiplyScalar(r * 2.6));
    s.camera.near = r / 100; s.camera.far = r * 100; s.camera.updateProjectionMatrix();
    s.controls.update(); s.render();
  };

  // Geometrie neu aufbauen (Kamera bleibt, außer bei Objektwechsel).
  const pts: Vec2[] = obj?.points || [];
  useEffect(() => {
    const s = st.current; if (!s.group) return;
    s.group.traverse((o: any) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    s.group.clear(); s.edges = [];
    const d: any = deriveHatch({ ...obj, tilt3D: draftTilt }, "preview", base);
    const m = meshOfDerived(d);
    if (m) {
      const pos = new Float32Array(m.positions.length);
      for (let i = 0; i < pos.length; i += 3) { pos[i] = m.positions[i]; pos[i + 1] = m.positions[i + 2]; pos[i + 2] = m.positions[i + 1]; }
      const idx: number[] = []; for (let i = 0; i < m.indices.length; i += 3) idx.push(m.indices[i], m.indices[i + 2], m.indices[i + 1]);
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      s.group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: obj.fillColor || "#cfc6b0", roughness: 0.85, flatShading: true, side: THREE.DoubleSide })));
      s.group.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), new THREE.LineBasicMaterial({ color: 0x2a2f3a, transparent: true, opacity: 0.55 })));
    }
    // Obere Außenkanten (aus der abgeleiteten Oberseite) für Auswahl und Hervorhebung.
    const top = d?.faces?.top?.outer as { x: number; y: number; z: number }[] | undefined;
    const ztop = d?.type === "prism" ? d.z1 : d?.type === "plane" ? d.z : undefined;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      const a = top ? toScene(top[i].x, top[i].y, top[i].z) : toScene(pts[i].x, pts[i].y, ztop ?? base);
      const b = top ? toScene(top[j].x, top[j].y, top[j].z) : toScene(pts[j].x, pts[j].y, ztop ?? base);
      s.edges.push({ i, a, b });
      if (i === edge) {
        const g = new THREE.BufferGeometry().setFromPoints([a, b]);
        s.group.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xc8954a, linewidth: 3 })));
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, 0.02 * Math.max(1, a.distanceTo(b) / 3), 6), new THREE.MeshBasicMaterial({ color: 0xc8954a }));
        s.group.add(tube);
      }
    }
    // Feste Bezugslinie (Drehachse bzw. feste Gegenkante) gestrichelt.
    if (frame) {
      const L = 1e2, zb = base + (Number(obj.elevationM) || 0);
      const g = new THREE.BufferGeometry().setFromPoints([
        toScene(frame.axis.x - frame.dir.x * L, frame.axis.y - frame.dir.y * L, zb), toScene(frame.axis.x + frame.dir.x * L, frame.axis.y + frame.dir.y * L, zb)]);
      const line = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0x7a8394, dashSize: 0.15, gapSize: 0.1 }));
      line.computeLineDistances(); s.group.add(line);
    }
    const key = String(obj?.id);
    if (s.fitted !== key) { s.fitted = key; fit(); } else s.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify([obj?.id, pts, obj?.holes, obj?.bulges, obj?.heightM, obj?.elevationM, obj?.fillColor, draftTilt, edge, frame?.axis, frame?.dir, base])]);

  return (
    <div ref={host} className="relative w-full overflow-hidden rounded-lg border" style={{ height: 180, borderColor: "hsl(var(--overlay-surface) / 0.16)", background: "hsl(var(--overlay-surface) / 0.05)" }}>
      <button type="button" onClick={fit} title="Gesamtes Objekt anzeigen" aria-label="Gesamtes Objekt anzeigen"
        className="absolute right-1.5 top-1.5 flex h-8 items-center gap-1 rounded-md border px-2 text-[10px] font-medium"
        style={{ borderColor: "hsl(var(--overlay-surface) / 0.2)", background: "hsl(var(--overlay-ink) / 0.85)", color: "hsl(var(--overlay-surface))" }}>
        <Maximize2 size={12} /> Gesamtes Objekt
      </button>
    </div>
  );
};
