/**
 * 3D-Ansicht (lazy geladen). Rendert nur abgeleitete Körper der gemeinsamen CadApp –
 * keine eigene CAD-Instanz, kein eigener Verlauf. Navigation: Orbit (Drehen,
 * Schwenken, Zoomen) und einfache Bewegung durch die Szene (WASD/Pfeile bzw.
 * Richtungsfeld auf Touchgeräten).
 */
import { useEffect, useImperativeHandle, useRef, forwardRef } from "react";
import * as THREE from "three";
import type { Derived3D, Plane3D } from "@/cad/three3d/geometryDerivation";

export interface CameraState { tx: number; ty: number; tz: number; r: number; theta: number; phi: number }
export interface Viewer3DHandle {
  fitAll(): void;
  move(dir: "f" | "b" | "l" | "r" | "u" | "d", on: boolean): void;
  getCamera(): CameraState | null;
  setCamera(c: CameraState): void;
  /** Analoge Steuerung (Joysticks): Werte −1…1; move = laufen, look = Blick drehen. */
  setStick(kind: "move" | "look", x: number, y: number): void;
  /** Empfindlichkeit (1 = 100 %) für Laufen und Blick. */
  setSensitivity(move: number, look: number): void;
  /** Raster ein/aus und Sichtbarkeit (0…1). */
  setGrid(visible: boolean, opacity: number): void;
  /** Aktuelles Bild ohne Raster/UI; projiziert Weltpunkte (x, Höhe z, y) auf Bildpixel. */
  capture(points: { id: string; x: number; y: number; z: number }[]): { png: string; w: number; h: number; badges: { id: string; x: number; y: number }[] } | null;
}
interface Props {
  items: Derived3D[];
  selectedKey: string | null;
  onPick: (sheetId: string, id: string) => void;
  /** Inhalt einer flachen Platte (Dokument, Text, Tabelle) als Bild. */
  textureFor?: (d: Plane3D) => Promise<{ canvas: HTMLCanvasElement; transparent: boolean; failed: boolean } | null>;
}

const keyOf = (d: Derived3D) => `${d.sheetId}::${d.sourceId}`;

function shapeOf(outer: { x: number; y: number }[], holes: { x: number; y: number }[][]) {
  const s = new THREE.Shape(outer.map(p => new THREE.Vector2(p.x, p.y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(p => new THREE.Vector2(p.x, p.y))));
  return s;
}

const Viewer3D = forwardRef<Viewer3DHandle, Props>(function Viewer3D({ items, selectedKey, onPick, textureFor }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const st = useRef<any>({});

  // Einmalige Einrichtung von Renderer, Kamera, Licht und Navigation.
  useEffect(() => {
    const host = hostRef.current!;
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
    };
    const ro = new ResizeObserver(resize); ro.observe(host); resize();

    // Pointer-Navigation (Maus und Touch)
    const pts = new Map<number, { x: number; y: number }>();
    let mode: "rot" | "pan" | "look" | null = null, downAt = { x: 0, y: 0, t: 0 }, lastPinch = 0, lastMid = { x: 0, y: 0 };
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
    const sens = { move: 1, look: 1 };
    const el = renderer.domElement;
    // 3D-Klicks nie an das darunterliegende CAD weiterreichen (sonst geht die Auswahl verloren).
    const stopAll = (e: Event) => e.stopPropagation();
    for (const t of ["mousedown", "mouseup", "click", "dblclick", "touchstart", "touchend"]) el.addEventListener(t, stopAll);
    const onDown = (e: PointerEvent) => {
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      mode = e.shiftKey ? "look" : e.button === 2 || e.button === 1 ? "pan" : "rot";
      if (pts.size === 2) { const [a, b] = [...pts.values()]; lastPinch = Math.hypot(a.x - b.x, a.y - b.y); lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
    };
    const onMove = (e: PointerEvent) => {
      const p = pts.get(e.pointerId); if (!p) return;
      e.stopPropagation();
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
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
        ? (e.shiftKey && (e.buttons & 5) ? "look" : (e.buttons & 6) ? "pan" : mode)
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
      pts.delete(e.pointerId);
      if (pts.size < 2) lastPinch = 0;
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      if (moved < 5 && performance.now() - downAt.t < 500 && e.button === 0) {
        const r = el.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
        ray.params.Line = { threshold: Math.max(0.05, orbit.r * 0.004) };
        const hit = ray.intersectObjects(group.children, false)[0];
        const u = hit?.object.userData as any;
        if (u?.sheetId) st.current.onPick?.(u.sheetId, u.sourceId);
      }
    };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); orbit.r *= Math.exp(e.deltaY * 0.0012); apply(); };
    el.addEventListener("pointerdown", onDown); el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp); el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", e => e.preventDefault());

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
        if (held.has("u")) orbit.target.y += speed;
        if (held.has("d")) orbit.target.y -= speed;
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

    st.current = { ...st.current, scene, group, camera, orbit, apply, held, renderer, grid, sticks, sens };
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      window.removeEventListener("keydown", kd, true); window.removeEventListener("keyup", ku, true); window.removeEventListener("blur", clearHeld);
      disposeGroup(group); grid.geometry.dispose(); (grid.material as THREE.Material).dispose?.();
      renderer.dispose(); renderer.forceContextLoss?.(); el.remove();
    };
  }, []);

  st.current.onPick = onPick;

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
      const byZ = new Map<number, Plane3D[]>();
      for (const d of items) if (d.type === "plane") {
        const k = Math.round(d.z * 1000);
        (byZ.get(k) || byZ.set(k, []).get(k)!).push(d);
      }
      for (const list of byZ.values()) {
        list.sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
        list.forEach((d, i) => planeRank.set(d, i));
      }
    }
    for (const d of items) {
      const sel = keyOf(d) === selectedKey;
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
          if (d.texture && textureFor) {
            textureFor(d).then((res) => {
              if (!res || st.current.gen !== gen || !m.parent) return;
              const tex = new THREE.CanvasTexture(res.canvas);
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.anisotropy = 4;
              mat.map = tex;
              if (!sel) mat.color.set("#ffffff");
              if (res.transparent) { mat.transparent = true; mat.depthWrite = false; mat.alphaTest = 0.01; }
              mat.needsUpdate = true;
              (m.userData as any).tex = tex;
            }).catch(() => { /* Platte bleibt einfarbig */ });
          }
        } else if (d.type === "mesh") {
          // CAD (x, y, Höhe z) → Szene (x, z, y); Spiegelung → Umlaufsinn tauschen.
          const p = d.mesh.positions, pos = new Float32Array(p.length);
          for (let i = 0; i < p.length; i += 3) { pos[i] = p[i]; pos[i + 1] = p[i + 2]; pos[i + 2] = p[i + 1]; }
          const ix = d.mesh.indices, idx: number[] = [];
          for (let i = 0; i < ix.length; i += 3) idx.push(ix[i], ix[i + 2], ix[i + 1]);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
          geo.setIndex(idx);
          geo.computeVertexNormals();
          const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: d.closed ? THREE.FrontSide : THREE.DoubleSide, flatShading: true }));
          obj = m;
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: 0x3a352c, transparent: true, opacity: 0.35 }));
          edges.raycast = () => {}; g.add(edges);
        } else {
          const geo = new THREE.BufferGeometry().setFromPoints(d.points.map(p => new THREE.Vector3(p.x, d.z, p.y)));
          obj = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
          obj.renderOrder = 1;
        }
      } catch { continue; }
      if (obj) { obj.userData = { ...obj.userData, sheetId: d.sheetId, sourceId: d.sourceId }; g.add(obj); }
    }
    if (!st.current.fitted && items.length) { st.current.fitted = true; fit(); }
  }, [items, selectedKey, textureFor]);

  const fit = () => {
    const { group, orbit, apply } = st.current; if (!group) return;
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    orbit.target.copy(c); orbit.r = Math.max(3, Math.max(s.x, s.y, s.z) * 1.4); apply();
  };

  useImperativeHandle(ref, () => ({
    fitAll: fit,
    getCamera: () => { const o = st.current.orbit; return o ? { tx: o.target.x, ty: o.target.y, tz: o.target.z, r: o.r, theta: o.theta, phi: o.phi } : null; },
    setCamera: (c) => { const o = st.current.orbit; if (!o) return; o.target.set(c.tx, c.ty, c.tz); o.r = c.r; o.theta = c.theta; o.phi = c.phi; st.current.apply(); st.current.fitted = true; },
    capture: (points) => {
      const { renderer, scene, camera, grid } = st.current; if (!renderer) return null;
      grid.visible = false; renderer.render(scene, camera);
      const png = renderer.domElement.toDataURL("image/png");
      grid.visible = st.current.gridOn !== false;
      const w = renderer.domElement.width, h = renderer.domElement.height;
      const badges = points.map(p => {
        const v = new THREE.Vector3(p.x, p.z, p.y).project(camera);
        return { id: p.id, x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, vis: v.z < 1 };
      }).filter(b => b.vis).map(({ id, x, y }) => ({ id, x, y }));
      return { png, w, h, badges };
    },
    setSensitivity: (move, look) => { const s = st.current.sens; if (s) { s.move = move; s.look = look; } },
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
    any.userData?.tex?.dispose?.();
    any.geometry?.dispose?.();
    (Array.isArray(any.material) ? any.material : [any.material]).forEach((m: any) => m?.dispose?.());
  }
}

export default Viewer3D;
