/**
 * 3D-Ansicht (lazy geladen). Rendert nur abgeleitete Körper der gemeinsamen CadApp –
 * keine eigene CAD-Instanz, kein eigener Verlauf. Navigation: Orbit (Drehen,
 * Schwenken, Zoomen) und einfache Bewegung durch die Szene (WASD/Pfeile bzw.
 * Richtungsfeld auf Touchgeräten).
 */
import { useEffect, useImperativeHandle, useRef, forwardRef } from "react";
import * as THREE from "three";
import type { Derived3D } from "@/cad/three3d/geometryDerivation";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { disposeTransformControls } from "./disposeTransformControls";
import { CAD_TO_THREE, moveMatrix, type MoveDelta } from "@/cad/three3d/spatialTransform";
import type { ManualMoveSession } from "@/cad/three3d/manualMoveSession";
import { MATERIAL_DRAG_TYPE, type Material3D } from "@/cad/three3d/materials";

export interface CameraState { tx: number; ty: number; tz: number; r: number; theta: number; phi: number }
export interface Viewer3DHandle {
  exportGLB(): Promise<ArrayBuffer>;
  fitAll(): void;
  move(dir: "f" | "b" | "l" | "r" | "u" | "d", on: boolean): void;
  getCamera(): CameraState | null;
  setCamera(c: CameraState): void;
  /** Analoge Steuerung (Joysticks): Werte −1…1; move = laufen, look = Blick drehen. */
  setStick(kind: "move" | "look", x: number, y: number): void;
  /** Empfindlichkeit (1 = 100 %) für Laufen und Blick. */
  setSensitivity(move: number, look: number, vert?: number): void;
  /** Raster ein/aus und Sichtbarkeit (0…1). */
  setGrid(visible: boolean, opacity: number): void;
  /** Aktuelles Bild ohne Raster/UI; projiziert Weltpunkte (x, Höhe z, y) auf Bildpixel. */
  capture(points: { id: string; x: number; y: number; z: number }[]): { png: string; w: number; h: number; badges: { id: string; x: number; y: number }[] } | null;
}
interface Props {
  items: Derived3D[];
  selectedKey: string | null;
  selectedKeys?: string[];
  manual?: ManualMoveSession | null;
  transformMode?: "translate"|"rotate";
  onTransform?: (delta: MoveDelta) => void;
  onPick: (sheetId: string, id: string, additive?: boolean) => void;
  /** Klick ins Leere (kein Körper getroffen). */
  onEmpty?: () => void;
  /** Flüchtige Neigungsvorschau (transparent grau, Bezugskante beige). */
  ghost?: { mesh?: { positions: number[]; indices: number[] }; edge?: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }] } | null;
  /** Inhalt einer flachen Platte (Dokument, Text, Tabelle) als Bild. */
  textureFor?: (d: Derived3D) => Promise<{ canvas: HTMLCanvasElement; transparent: boolean; failed: boolean } | null>;
  materialImage?: (m: Material3D) => string | undefined;
  onMaterialDrop?: (sheetId: string, id: string, materialId: string) => void;
  onToggleOpening?: (sheetId: string, id: string) => void;
}

const keyOf = (d: Derived3D) => `${d.sheetId}::${d.sourceId}`;

function shapeOf(outer: { x: number; y: number }[], holes: { x: number; y: number }[][]) {
  const s = new THREE.Shape(outer.map(p => new THREE.Vector2(p.x, p.y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(p => new THREE.Vector2(p.x, p.y))));
  return s;
}

const Viewer3D = forwardRef<Viewer3DHandle, Props>(function Viewer3D({ items, selectedKey, selectedKeys, manual, transformMode = "translate", onTransform, onPick, onEmpty, textureFor, ghost, materialImage, onMaterialDrop, onToggleOpening }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const st = useRef<any>({});

  // Einmalige Einrichtung von Renderer, Kamera, Licht und Navigation.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const css = getComputedStyle(document.documentElement);
    const bg = css.getPropertyValue("--background").trim();
    renderer.setClearColor(new THREE.Color(bg ? `hsl(${bg.replace(/ /g, ", ")})` : "#f4f1ea"));
    host.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 5000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8170, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(30, 60, 20); scene.add(sun);
    const grid = new THREE.GridHelper(200, 200, 0xc9b98f, 0xe2dccd); scene.add(grid);
    const group = new THREE.Group(); scene.add(group);
    const pivot = new THREE.Object3D(); scene.add(pivot);
    const controls = new TransformControls(camera,renderer.domElement);
    controls.setSpace("world");controls.setSize(1.15);controls.enabled=false;
    const helper=controls.getHelper();scene.add(helper);
    const transformed=()=>{
      const session: ManualMoveSession | undefined=st.current.manual;if(!session||!controls.dragging)return;
      const cad=CAD_TO_THREE.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(),pivot.quaternion,new THREE.Vector3(1,1,1))).multiply(CAD_TO_THREE);
      const euler=new THREE.Euler().setFromRotationMatrix(cad,"XYZ"), k=180/Math.PI;
      st.current.onTransform?.({x:pivot.position.x-session.pivot.x,y:pivot.position.z-session.pivot.y,z:pivot.position.y-session.pivot.z,rx:euler.x*k,ry:euler.y*k,rz:euler.z*k});
    };
    controls.addEventListener("objectChange",transformed);
    controls.addEventListener("dragging-changed",e=>{st.current.gizmoDragging=e.value;});
    // Orbit-Zustand (Kugelkoordinaten um Zielpunkt)
    const orbit = { target: new THREE.Vector3(), r: 25, theta: Math.PI / 4, phi: Math.PI / 3.2 };
    const apply = () => {
      orbit.phi = Math.min(Math.PI - 0.05, Math.max(0.05, orbit.phi));
      orbit.r = Math.min(3000, Math.max(0.3, orbit.r));
      camera.position.set(
        orbit.target.x + orbit.r * Math.sin(orbit.phi) * Math.cos(orbit.theta),
        orbit.target.y + orbit.r * Math.cos(orbit.phi),
        orbit.target.z + orbit.r * Math.sin(orbit.phi) * Math.sin(orbit.theta));
      camera.lookAt(orbit.target);
    };
    apply();
    const resize = () => {
      const w = host.clientWidth || 1, h = host.clientHeight || 1;
      renderer.setSize(w, h, false); renderer.domElement.style.width = "100%"; renderer.domElement.style.height = "100%";
      camera.aspect = w / h; camera.updateProjectionMatrix();
      if (st.current.fitted) st.current.fit?.();
    };
    const ro = new ResizeObserver(resize); ro.observe(host); resize();

    // Pointer-Navigation (Maus und Touch)
    const pts = new Map<number, { x: number; y: number }>();
    let mode: "rot" | "pan" | "look" | null = null, downAt = { x: 0, y: 0, t: 0, shift:false }, lastPinch = 0, lastMid = { x: 0, y: 0 }, travelled=0;
    const pan = (dx: number, dy: number) => {
      const s = orbit.r * 0.0015;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
      const fwd = new THREE.Vector3(-Math.cos(orbit.theta), 0, -Math.sin(orbit.theta));
      orbit.target.addScaledVector(right, -dx * s).addScaledVector(fwd, dy * s);
    };
    // Blick drehen: Kamerastandpunkt bleibt, Zielpunkt dreht sich um die Kamera.
    const look = (dTheta: number, dPhi: number) => {
      const pos = camera.position.clone();
      orbit.theta += dTheta; orbit.phi += dPhi;
      orbit.phi = Math.min(Math.PI - 0.05, Math.max(0.05, orbit.phi));
      orbit.target.set(
        pos.x - orbit.r * Math.sin(orbit.phi) * Math.cos(orbit.theta),
        pos.y - orbit.r * Math.cos(orbit.phi),
        pos.z - orbit.r * Math.sin(orbit.phi) * Math.sin(orbit.theta));
      apply();
    };
    const sticks = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 } };
    const sens = { move: 1, look: 1, vert: 1 };
    const el = renderer.domElement;
    // 3D-Klicks nie an das darunterliegende CAD weiterreichen (sonst geht die Auswahl verloren).
    const stopAll = (e: Event) => e.stopPropagation();
    for (const t of ["mousedown", "mouseup", "click", "dblclick", "touchstart", "touchend"]) el.addEventListener(t, stopAll);
    const onDown = (e: PointerEvent) => {
      e.stopPropagation();
      if(controls.dragging || (controls.enabled&&controls.axis)) { st.current.gizmoGesture=true;return; }
      st.current.gizmoGesture=false;travelled=0;
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      downAt = { x: e.clientX, y: e.clientY, t: performance.now(), shift:e.shiftKey };
      mode = e.shiftKey ? "look" : e.button === 1 ? "pan" : "rot";
      if (pts.size === 2) { const [a, b] = [...pts.values()]; lastPinch = Math.hypot(a.x - b.x, a.y - b.y); lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
    };
    const onMove = (e: PointerEvent) => {
      if(st.current.gizmoGesture||controls.dragging)return;
      const p = pts.get(e.pointerId); if (!p) return;
      e.stopPropagation();
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      travelled+=Math.hypot(dx,dy);
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (lastPinch > 0) orbit.r *= lastPinch / Math.max(1, d);
        pan(mid.x - lastMid.x, mid.y - lastMid.y);
        lastPinch = d; lastMid = mid;
      }
      // Shift + gedrücktes Mausrad = Drehen, egal in welcher Reihenfolge gedrückt.
      const cur = e.pointerType === "mouse"
        ? (e.shiftKey && (e.buttons & 5) ? "look" : (e.buttons & 4) ? "pan" : mode)
        : mode;
      if (pts.size >= 2) { /* bereits behandelt */ }
      else if (cur === "pan") pan(dx, dy);
      else if (cur === "look") { look(dx * 0.004 * sens.look, -dy * 0.004 * sens.look); return; }
      else { orbit.theta += dx * 0.008 * sens.look; orbit.phi -= dy * 0.008 * sens.look; }
      apply();
    };
    const ray = new THREE.Raycaster();
    const onUp = (e: PointerEvent) => {
      e.stopPropagation();
      if(st.current.gizmoGesture){st.current.gizmoGesture=false;return;}
      pts.delete(e.pointerId);
      if (pts.size < 2) lastPinch = 0;
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      if (moved < 5 && travelled < 7 && performance.now() - downAt.t < 500 && e.button === 0 && e.type === "pointerup") {
        const r = el.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
        ray.params.Line = { threshold: Math.max(0.05, orbit.r * 0.004) };
        const hit = ray.intersectObjects(group.children, true)[0];
        const u = hit?.object.userData as any;
        if (u?.sheetId) st.current.onPick?.(u.sheetId, u.sourceId, downAt.shift);
        else st.current.onEmpty?.();
      }
    };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); orbit.r *= Math.exp(e.deltaY * 0.0012); apply(); };
    el.addEventListener("pointerdown", onDown); el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp); el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", e => e.preventDefault());
    const cancelPointer=()=>{pts.clear();mode=null;lastPinch=0;st.current.gizmoGesture=false;if(controls.dragging){controls.pointerUp(null);}};
    el.addEventListener("lostpointercapture",cancelPointer);window.addEventListener("blur",cancelPointer);
    const pickAt = (x: number, y: number) => {
      const r=el.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1),camera);
      return ray.intersectObjects(group.children,true).find(h=>h.object.userData.sheetId)?.object.userData;
    };
    const dragOver = (e: DragEvent) => { if (e.dataTransfer?.types.includes(MATERIAL_DRAG_TYPE)) e.preventDefault(); };
    const drop = (e: DragEvent) => { const id=e.dataTransfer?.getData(MATERIAL_DRAG_TYPE); if(!id)return; e.preventDefault();e.stopPropagation();const u=pickAt(e.clientX,e.clientY);if(u)st.current.onMaterialDrop?.(u.sheetId,u.sourceId,id); };
    const doubleClick = (e: MouseEvent) => { const u=pickAt(e.clientX,e.clientY);if(u?.opening)st.current.onToggleOpening?.(u.sheetId,u.sourceId); };
    el.addEventListener("dragover",dragOver);el.addEventListener("drop",drop);el.addEventListener("dblclick",doubleClick);

    // Bewegung durch die Szene (gehend, ohne Physik)
    const held = new Set<string>();
    const keyMap: Record<string, string> = { w: "f", arrowup: "f", s: "b", arrowdown: "b", a: "l", arrowleft: "l", d: "r", arrowright: "r", e: "u", q: "d", " ": "u", x: "d" };
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const kd = (e: KeyboardEvent) => { const k = keyMap[e.key.toLowerCase()]; if (k && !typing(e.target) && !e.ctrlKey && !e.metaKey) { held.add(k); e.preventDefault(); e.stopImmediatePropagation(); } };
    const ku = (e: KeyboardEvent) => { const k = keyMap[e.key.toLowerCase()]; if (k) { held.delete(k); if (!typing(e.target)) e.stopImmediatePropagation(); } };
    window.addEventListener("keydown", kd, true); window.addEventListener("keyup", ku, true);
    const clearHeld = () => held.clear(); window.addEventListener("blur", clearHeld);
    let raf = 0, last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      if (held.size) {
        const speed = Math.max(1.5, orbit.r * 0.6) * dt * sens.move;
        const fwd = new THREE.Vector3(-Math.cos(orbit.theta), 0, -Math.sin(orbit.theta));
        const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
        if (held.has("f")) orbit.target.addScaledVector(fwd, speed);
        if (held.has("b")) orbit.target.addScaledVector(fwd, -speed);
        if (held.has("r")) orbit.target.addScaledVector(right, speed);
        if (held.has("l")) orbit.target.addScaledVector(right, -speed);
        if (held.has("u")) orbit.target.y += speed / sens.move * sens.vert;
        if (held.has("d")) orbit.target.y -= speed / sens.move * sens.vert;
        apply();
      }
      if (sticks.move.x || sticks.move.y) {
        const speed = Math.max(1.5, orbit.r * 0.6) * dt * sens.move;
        const fwd = new THREE.Vector3(-Math.cos(orbit.theta), 0, -Math.sin(orbit.theta));
        const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
        orbit.target.addScaledVector(fwd, -sticks.move.y * speed).addScaledVector(right, sticks.move.x * speed);
        apply();
      }
      if (sticks.look.x || sticks.look.y) look(sticks.look.x * dt * 1.6 * sens.look, -sticks.look.y * dt * 1.2 * sens.look);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    st.current = { ...st.current, scene, group, camera, orbit, apply, held, renderer, grid, sticks, sens, controls, pivot };
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      window.removeEventListener("blur",cancelPointer);disposeTransformControls(controls);scene.remove(pivot);
      window.removeEventListener("keydown", kd, true); window.removeEventListener("keyup", ku, true); window.removeEventListener("blur", clearHeld);
      disposeGroup(group); grid.geometry.dispose(); (grid.material as THREE.Material).dispose?.();
      renderer.dispose(); renderer.forceContextLoss?.(); el.remove();
    };
  }, []);

  st.current.onPick = onPick; st.current.onEmpty = onEmpty; st.current.onMaterialDrop = onMaterialDrop; st.current.onToggleOpening = onToggleOpening;
  st.current.manual=manual;st.current.onTransform=onTransform;
  useEffect(()=>{
    const controls:TransformControls|undefined=st.current.controls,pivot:THREE.Object3D|undefined=st.current.pivot;
    if(!controls||!pivot)return;
    if(!manual){controls.detach();controls.enabled=false;return;}
    controls.enabled=true;controls.setMode(transformMode);controls.attach(pivot);
    if(!controls.dragging){
      pivot.position.set(manual.pivot.x+manual.delta.x,manual.pivot.z+manual.delta.z,manual.pivot.y+manual.delta.y);
      const rotation=moveMatrix({...manual.delta,x:0,y:0,z:0},{x:0,y:0,z:0});
      pivot.quaternion.setFromRotationMatrix(CAD_TO_THREE.clone().multiply(rotation).multiply(CAD_TO_THREE));
    }
  },[manual,transformMode]);

  // Neigungsvorschau: eigener, nicht anklickbarer Körper über dem (unveränderten) Original.
  useEffect(() => {
    const scene: THREE.Scene | undefined = st.current.scene;
    if (!scene || !ghost) return;
    const gg = new THREE.Group();
    // Ohne Entwurf nur die beige Bezugskante (kein Vorschaukörper).
    const m = ghost.mesh;
    if (m) {
    const pos = new Float32Array(m.positions.length);
    for (let i = 0; i < pos.length; i += 3) { pos[i] = m.positions[i]; pos[i + 1] = m.positions[i + 2]; pos[i + 2] = m.positions[i + 1]; }
    const idx: number[] = []; for (let i = 0; i + 2 < m.indices.length; i += 3) idx.push(m.indices[i], m.indices[i + 2], m.indices[i + 1]);
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    gg.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x9aa1ab, transparent: true, opacity: 0.38, roughness: 0.6, depthWrite: false, side: THREE.DoubleSide })));
    gg.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: 0xd9dde3, transparent: true, opacity: 0.7 })));
    }
    if (ghost.edge) {
      const [a, b] = ghost.edge.map(p => new THREE.Vector3(p.x, p.z, p.y));
      const r = Math.max(0.025, a.distanceTo(b) * 0.008);
      gg.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, r, 8), new THREE.MeshBasicMaterial({ color: 0xe8cf9a })));
      gg.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, r * 2.6, 8), new THREE.MeshBasicMaterial({ color: 0xe8cf9a, transparent: true, opacity: 0.25, depthWrite: false })));
    }
    gg.traverse(o => { (o as any).raycast = () => {}; });
    gg.renderOrder = 10;
    scene.add(gg);
    return () => { scene.remove(gg); gg.traverse((o: any) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); };
  }, [ghost]);

  // Körper bei jeder Datenänderung neu aufbauen (flüchtig).
  useEffect(() => {
    const g: THREE.Group | undefined = st.current.group;
    if (!g) return;
    disposeGroup(g);
    const gen = (st.current.gen = (st.current.gen || 0) + 1);
    // Höhengleiche flache Flächen: Tiefenversatz nach Ebenen-/Stapelreihenfolge
    // (reale Höhe bleibt unverändert). Vorderste Fläche = kein Versatz.
    const planeRank = new Map<Derived3D, number>();
    {
      const byZ = new Map<number, Derived3D[]>();
      for (const d of items) if (d.type === "plane") {
        const k = Math.round(d.z * 1000);
        const list = byZ.get(k) ?? []; list.push(d); byZ.set(k,list);
      }
      for (const list of byZ.values()) {
        list.sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
        list.forEach((d, i) => planeRank.set(d, i));
      }
    }
    for (const d of items) {
      const sel = selectedKeys?.includes(keyOf(d)) ?? keyOf(d) === selectedKey;
      const color = new THREE.Color(sel ? "#3b82f6" : d.color);
      let obj: THREE.Object3D | null = null;
      try {
        if (d.type === "prism") {
          const depth = d.z1 - d.z0; if (!(depth > 1e-4) || d.footprint.length < 3) continue;
          const geo = new THREE.ExtrudeGeometry(shapeOf(d.footprint, d.holes), { depth, bevelEnabled: false });
          geo.rotateX(Math.PI / 2);
          const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
          m.position.y = d.z1; obj = m;
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: 0x3a352c, transparent: true, opacity: 0.35 }));
          edges.position.y = d.z1; edges.raycast = () => {}; g.add(edges);
        } else if (d.type === "plane") {
          if (d.outline.length < 3) continue;
          const rank = planeRank.get(d) ?? 0;
          const mat = new THREE.MeshStandardMaterial({
            color, side: THREE.DoubleSide, roughness: 0.9,
            polygonOffset: true, polygonOffsetFactor: 1 + rank, polygonOffsetUnits: 4 * (1 + rank),
          });
          let geo: THREE.BufferGeometry;
          if (d.texture && d.outline.length === 4) {
            // Eigenes Viereck mit Bildkoordinaten: oben-links = (0,1) …
            const [a, b, c, e] = d.outline;
            geo = new THREE.BufferGeometry();
            geo.setAttribute("position", new THREE.Float32BufferAttribute([a.x, 0, a.y, b.x, 0, b.y, c.x, 0, c.y, e.x, 0, e.y], 3));
            geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
            geo.setIndex([0, 1, 2, 0, 2, 3]);
            geo.computeVertexNormals();
          } else {
            geo = new THREE.ShapeGeometry(shapeOf(d.outline, d.holes)); geo.rotateX(Math.PI / 2);
          }
          const m = new THREE.Mesh(geo, mat);
          m.position.y = d.z; m.renderOrder = -rank; obj = m;
        } else if (d.type === "mesh") {
          // CAD (x, y, Höhe z) → Szene (x, z, y); Spiegelung → Umlaufsinn tauschen.
          const p = d.mesh.positions, pos = new Float32Array(p.length);
          for (let i = 0; i < p.length; i += 3) { pos[i] = p[i]; pos[i + 1] = p[i + 2]; pos[i + 2] = p[i + 1]; }
          const ix = d.mesh.indices, idx: number[] = [];
          for (let i = 0; i < ix.length; i += 3) idx.push(ix[i], ix[i + 2], ix[i + 1]);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
          geo.setIndex(idx);
          if (d.uvs) geo.setAttribute("uv",new THREE.Float32BufferAttribute(d.uvs,2));
          geo.computeVertexNormals();
          const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: d.closed ? THREE.FrontSide : THREE.DoubleSide, flatShading: true }));
          obj = m;
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: 0x3a352c, transparent: true, opacity: 0.35 }));
          edges.raycast = () => {}; g.add(edges);
        } else {
          const geo = new THREE.BufferGeometry().setFromPoints(d.spatialPoints ? d.spatialPoints.map(p=>new THREE.Vector3(p.x,p.z,p.y)) : d.points.map(p => new THREE.Vector3(p.x, d.z, p.y)));
          obj = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
          obj.renderOrder = 1;
        }
      } catch { continue; }
      if (obj) {
        obj.name = `${d.source}_${d.sourceId}${d.part ? `_${d.part}` : ""}`;
        obj.userData = { ...obj.userData, sheetId: d.sheetId, sourceId: d.sourceId, opening: d.source === "door" || d.source === "window", part:d.part };
        g.add(obj);
        if (obj instanceof THREE.Mesh) {
          const mesh = obj, mat=mesh.material as THREE.MeshStandardMaterial;
          if (d.glow && !d.texture) { mat.emissive.copy(mat.color); mat.emissiveIntensity = d.glow; }
          if (d.surfaceOpacity !== undefined) { mat.opacity=d.surfaceOpacity;mat.transparent=true;mat.depthWrite=false;mat.side=THREE.DoubleSide; }
          if (d.texture && textureFor && !d.material) textureFor(d).then(res=>{
            if(!res||st.current.gen!==gen||!mesh.parent)return;
            const tex=new THREE.CanvasTexture(res.canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
            mat.map=tex;if(!sel)mat.color.set("#ffffff");
            if(d.glow){mat.emissive.set("#ffffff");mat.emissiveMap=tex;mat.emissiveIntensity=d.glow;}
            if(res.transparent){mat.transparent=true;mat.alphaTest=0.01;mat.depthWrite=false;}
            mat.needsUpdate=true;
          }).catch(()=>{});
          if (d.material) {
            const material=d.material;
            mat.name=material.name;mat.roughness=material.roughness;mat.metalness=material.metalness;
            mat.opacity=material.opacity*(d.surfaceOpacity??1);mat.transparent=mat.opacity<1;mat.depthWrite=mat.opacity>=0.99;
            mat.emissive.copy(mat.color);mat.emissiveIntensity=material.emissiveIntensity;
            const src=materialImage?.(material);
            if(src) {
              if(d.type !== "plane" && !d.texture) {
                const p=mesh.geometry.getAttribute("position"), n=mesh.geometry.getAttribute("normal"),uv:number[]=[];
                for(let i=0;i<p.count;i++) {
                  const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));
                  uv.push((nx>=ny&&nx>=nz?p.getZ(i):p.getX(i))/material.scaleM,(ny>=nx&&ny>=nz?p.getZ(i):p.getY(i))/material.scaleM);
                }
                mesh.geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
              }
              const tex=new THREE.TextureLoader().load(src,loaded=>{
                if(st.current.gen!==gen||!mesh.parent){loaded.dispose();return;}
                loaded.colorSpace=THREE.SRGBColorSpace;loaded.wrapS=loaded.wrapT=THREE.RepeatWrapping;
                if(d.type==='plane'){const a=d.outline[0],b=d.outline[1],e=d.outline[3];if(a&&b&&e)loaded.repeat.set(Math.hypot(b.x-a.x,b.y-a.y)/material.scaleM,Math.hypot(e.x-a.x,e.y-a.y)/material.scaleM);}
                else if(d.texture?.corners?.length===4){const [a,b,,e]=d.texture.corners;loaded.repeat.set(Math.hypot(b.x-a.x,b.y-a.y)/material.scaleM,Math.hypot(e.x-a.x,e.y-a.y)/material.scaleM);}
                mat.map?.dispose();mat.map=loaded;if(!sel)mat.color.set("#ffffff");mat.emissiveMap=loaded;mat.needsUpdate=true;
              });
              mesh.userData.tex=tex;
            }
          }
        }
      }
    }
    if (!st.current.fitted && items.length) { st.current.fitted = true; fit(); }
  }, [items, selectedKey, selectedKeys, textureFor, materialImage]);

  const fit = () => {
    const { group, orbit, apply, camera } = st.current; if (!group) return;
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    orbit.target.copy(c);
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const radius = s.length()/2;
    orbit.r = Math.max(3,radius / Math.sin(Math.min(halfFov,Math.atan(Math.tan(halfFov)*camera.aspect))) * 1.12); apply();
  };
  st.current.fit = fit;

  useImperativeHandle(ref, () => ({
    exportGLB: async () => {
      const g: THREE.Group | undefined=st.current.group;if(!g)throw new Error("3D-Ansicht nicht bereit.");
      const {GLTFExporter}=await import("three/examples/jsm/exporters/GLTFExporter.js");
      const copy=g.clone(true);
      for(const child of [...copy.children]) {
        if(!(child instanceof THREE.Mesh)){copy.remove(child);continue;}
        child.material=(child.material as THREE.MeshStandardMaterial).clone();
        const material=child.material as THREE.MeshStandardMaterial;
        const data=items.find(d=>d.sheetId===child.userData.sheetId&&d.sourceId===child.userData.sourceId&&d.part===child.userData.part);
        material.color.set(data?.material&&material.map ? "#ffffff" : data?.color??"#ffffff");
      }
      const result=await new GLTFExporter().parseAsync(copy,{binary:true,onlyVisible:true});
      if(!(result instanceof ArrayBuffer))throw new Error("GLB konnte nicht erstellt werden.");
      return result;
    },
    fitAll: fit,
    getCamera: () => { const o = st.current.orbit; return o ? { tx: o.target.x, ty: o.target.y, tz: o.target.z, r: o.r, theta: o.theta, phi: o.phi } : null; },
    setCamera: (c) => { const o = st.current.orbit; if (!o) return; o.target.set(c.tx, c.ty, c.tz); o.r = c.r; o.theta = c.theta; o.phi = c.phi; st.current.apply(); st.current.fitted = true; },
    capture: (points) => {
      const { renderer, scene, camera, grid } = st.current; if (!renderer) return null;
      const helper=st.current.controls?.getHelper(),wasVisible=helper?.visible;
      if(helper)helper.visible=false;
      grid.visible = false; renderer.render(scene, camera);
      const png = renderer.domElement.toDataURL("image/png");
      if(helper)helper.visible=wasVisible;
      grid.visible = st.current.gridOn !== false;
      const w = renderer.domElement.width, h = renderer.domElement.height;
      const badges = points.map(p => {
        const v = new THREE.Vector3(p.x, p.z, p.y).project(camera);
        return { id: p.id, x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, vis: v.z < 1 };
      }).filter(b => b.vis).map(({ id, x, y }) => ({ id, x, y }));
      return { png, w, h, badges };
    },
    setSensitivity: (move, look, vert = 1) => { const s = st.current.sens; if (s) { s.move = move; s.look = look; s.vert = vert; } },
    setStick: (kind, x, y) => { const s = st.current.sticks; if (s) s[kind] = { x, y }; },
    setGrid: (visible, opacity) => {
      const g = st.current.grid; if (!g) return;
      g.visible = visible && opacity > 0.001;
      const mats = Array.isArray(g.material) ? g.material : [g.material];
      for (const m of mats) { m.transparent = true; m.opacity = Math.max(0, Math.min(1, opacity)); m.depthWrite = opacity >= 0.99; m.needsUpdate = true; }
      st.current.gridOn = g.visible;
    },
    move: (dir, on) => { const h: Set<string> | undefined = st.current.held; if (!h) return; on ? h.add(dir) : h.delete(dir); },
  }));

  return <div ref={hostRef} className="absolute inset-0" />;
});

function disposeGroup(g: THREE.Group) {
  for (const c of [...g.children]) {
    g.remove(c);
    const any = c as any;
    any.geometry?.dispose?.();
    (Array.isArray(any.material) ? any.material : [any.material]).forEach((m: any) => { m?.map?.dispose?.();m?.dispose?.(); });
  }
}

export default Viewer3D;
