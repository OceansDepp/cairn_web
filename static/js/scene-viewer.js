// CAIRN project page — WebGL viewer for assembled multi-room HM3D scenes.
// Renders a dollhouse point cloud with room boxes, a hierarchical scene graph and
// per-question highlights. Scene files are produced by tools/build_scenes.py.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export const ROOM_COLORS = ['#4A86C8', '#E8919F', '#5FB7AE', '#8CC37E', '#EE9A6B', '#9DB8E8', '#C9A0DC', '#F2C66D'];
export const COLORS = {
  roomNode: '#F25A5F', objNode: '#4E90D9', edge: '#F2CF4A', roomEdge: '#F48B8B',
  good: '#22A559', bad: '#E0453A', focus: '#F2A93B',
};
const MAX_HI = 32;
const SKIP_GRAPH = new Set(['wall', 'floor', 'ceiling', 'door', 'window', 'curtain', 'power outlet', 'rug', 'mat',
  'carpet', 'blinds', 'vent', 'radiator', 'picture', 'frame', 'decoration', 'ceiling light', 'ceiling lamp',
  'curtain rod', 'closet rod', 'shower curtain rod', 'cabinet door', 'smoke detector']);

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

const VERT = /* glsl */`
  attribute vec3 color;
  attribute float room;
  attribute float obj;
  uniform float uSize, uScale, uTime;
  uniform float uDim[8];
  uniform float uDrop[8];
  uniform float uShow[8];
  uniform float uHi[${MAX_HI}];
  uniform vec3 uHiColor[${MAX_HI}];
  uniform int uHiN;
  varying vec3 vColor;
  varying float vShow;
  void main() {
    int r = int(room + 0.5);
    vec3 p = position;
    p.z += uDrop[r];
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.0, uSize * uScale / -mv.z);
    vec3 c = color;
    float g = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, vec3(0.93) * 0.55 + vec3(g) * 0.45, uDim[r] * 0.82);
    for (int i = 0; i < ${MAX_HI}; i++) {
      if (i >= uHiN) break;
      if (abs(obj - uHi[i]) < 0.5) {
        c = mix(c, uHiColor[i], 0.38 + 0.14 * sin(uTime * 4.0));
        gl_PointSize *= 1.25;
      }
    }
    vColor = c;
    vShow = uShow[r];
  }`;

const FRAG = /* glsl */`
  varying vec3 vColor;
  varying float vShow;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    if (dot(d, d) > 0.25) discard;
    if (hash(gl_FragCoord.xy) > vShow) discard;
    gl_FragColor = vec4(vColor, 1.0);
  }`;

export async function fetchScene(base, key) {
  const [meta, buf] = await Promise.all([
    fetch(`${base}/${key}.json`).then((r) => r.json()),
    fetch(`${base}/${key}.bin`).then((r) => r.arrayBuffer()),
  ]);
  const n = meta.n;
  const xyz = new Int16Array(buf, 0, n * 3);
  const rgb = new Uint8Array(buf, n * 6, n * 3);
  const room = new Uint8Array(buf, n * 9, n);
  const obj = new Uint16Array(buf, n * 10, n);
  return { meta, xyz, rgb, room, obj };
}

function boxSegments(min, max) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const c = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const e = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  return e.flatMap(([a, b]) => [...c[a], ...c[b]]);
}

export class SceneViewer {
  constructor(container, opts = {}) {
    this.el = container;
    this.opts = Object.assign({ pointSize: 0.032, autoRotate: false, background: null }, opts);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.el.appendChild(this.renderer.domElement);
    this.labels = document.createElement('div');
    this.labels.className = 'sv-labels';
    this.el.appendChild(this.labels);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.autoRotateSpeed = 0.45;
    this.controls.addEventListener('start', () => { this.userActive = true; this.tween = null; this.onUserInteract?.(); });
    this.controls.addEventListener('end', () => { this.userActive = false; });

    this.groups = { rooms: new THREE.Group(), graph: new THREE.Group(), hi: new THREE.Group() };
    Object.values(this.groups).forEach((g) => this.scene.add(g));
    this.lineMats = [];
    this.labelItems = [];
    this.anim = [];
    this.clock = new THREE.Clock();
    this.visible = true;

    new ResizeObserver(() => this.resize()).observe(this.el);
    new IntersectionObserver((es) => { this.visible = es[0].isIntersecting; }, { threshold: 0.01 }).observe(this.el);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.lineMats.forEach((m) => m.resolution.set(w, h));
    if (this.mat) this.mat.uniforms.uScale.value = h / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
  }

  lineMat(color, width, opacity = 1) {
    const m = new LineMaterial({ color, linewidth: width, transparent: opacity < 1, opacity, depthTest: true });
    m.resolution.set(this.el.clientWidth || 1, this.el.clientHeight || 1);
    this.lineMats.push(m);
    return m;
  }

  clearGroup(g) {
    while (g.children.length) {
      const c = g.children.pop();
      c.geometry?.dispose();
      if (c.material) {
        this.lineMats = this.lineMats.filter((m) => m !== c.material);
        c.material.dispose();
      }
    }
  }

  async load(base, key) {
    this.loading = key;
    const data = await fetchScene(base, key);
    if (this.loading !== key) return null;   // superseded by a newer request
    this.setData(data);
    return data.meta;
  }

  setData({ meta, xyz, rgb, room, obj }) {
    this.meta = meta;
    if (this.points) { this.scene.remove(this.points); this.points.geometry.dispose(); }
    const n = meta.n;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) pos[i] = xyz[i] / 1000;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(rgb, 3, true));
    g.setAttribute('room', new THREE.BufferAttribute(Float32Array.from(room), 1));
    g.setAttribute('obj', new THREE.BufferAttribute(Float32Array.from(obj), 1));
    g.computeBoundingSphere();
    if (!this.mat) {
      this.mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG,
        uniforms: {
          uSize: { value: this.opts.pointSize }, uScale: { value: 400 }, uTime: { value: 0 },
          uDim: { value: new Array(8).fill(0) }, uDrop: { value: new Array(8).fill(0) },
          uShow: { value: new Array(8).fill(1) },
          uHi: { value: new Array(MAX_HI).fill(-1) },
          uHiColor: { value: Array.from({ length: MAX_HI }, () => new THREE.Color()) },
          uHiN: { value: 0 },
        },
      });
    }
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.resize();

    this.objById = new Map(meta.objects.map((o) => [o.id, o]));

    this.buildRooms();
    this.buildGraph();
    this.setHighlight({});
    this.resetView(true);
  }

  // ---------- overlays ----------
  roomCenter(i, z = null) {
    const r = this.meta.rooms[i];
    return new THREE.Vector3((r.min[0] + r.max[0]) / 2, (r.min[1] + r.max[1]) / 2, z ?? (r.floor + 1.0));
  }

  buildRooms() {
    this.clearGroup(this.groups.rooms);
    this.roomBoxes = this.meta.rooms.map((r, i) => {
      const geo = new LineSegmentsGeometry().setPositions(boxSegments(
        [r.min[0], r.min[1], r.floor], [r.max[0], r.max[1], r.floor + 2.05]));
      const line = new LineSegments2(geo, this.lineMat(ROOM_COLORS[i % 8], 2.2, 0.9));
      this.groups.rooms.add(line);
      return line;
    });
    this.labelItems = this.labelItems.filter((l) => { if (l.kind === 'room') { l.el.remove(); return false; } return true; });
    this.meta.rooms.forEach((r, i) => {
      this.addLabel('room', this.roomCenter(i, r.floor + 2.35), `<b>${r.name}</b>`, ROOM_COLORS[i % 8], i);
    });
  }

  buildGraph() {
    this.clearGroup(this.groups.graph);
    const m = this.meta;
    const H = 3.1;
    this.graphNodes = [];
    const segs = [];
    const seen = new Set();
    const sph = (r, color) => new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14),
      new THREE.MeshBasicMaterial({ color }));
    m.rooms.forEach((r, i) => {
      const rc = this.roomCenter(i, r.floor + H);
      const node = sph(0.2, COLORS.roomNode);
      node.position.copy(rc);
      this.groups.graph.add(node);
      this.graphNodes.push({ mesh: node, room: i, kind: 'room' });
      const objs = m.objects.filter((o) => o.room === i && !SKIP_GRAPH.has(o.label))
        .map((o) => ({ o, v: (o.max[0] - o.min[0]) * (o.max[1] - o.min[1]) * (o.max[2] - o.min[2]) }))
        .sort((a, b) => b.v - a.v).slice(0, 7).map((x) => x.o);
      const pos = objs.map((o) => new THREE.Vector3((o.min[0] + o.max[0]) / 2, (o.min[1] + o.max[1]) / 2,
        Math.min(o.max[2], r.floor + 1.6) + 0.12));
      pos.forEach((p, k) => {
        const s = sph(0.075, COLORS.objNode);
        s.position.copy(p);
        this.groups.graph.add(s);
        this.graphNodes.push({ mesh: s, room: i, kind: 'obj' });
        segs.push({ a: p, b: rc, kind: 'or', room: i });
        // object-object relations: nearest neighbour within the room
        let best = -1, bd = 1e9;
        pos.forEach((q, j) => { if (j !== k) { const d = p.distanceTo(q); if (d < bd) { bd = d; best = j; } } });
        const key = `${i}:${Math.min(k, best)}-${Math.max(k, best)}`;
        if (best >= 0 && !seen.has(key)) { seen.add(key); segs.push({ a: p, b: pos[best], kind: 'oo', room: i }); }
      });
    });
    m.adj.forEach((row, i) => row.forEach((v, j) => {
      if (v && j > i) segs.push({ a: this.roomCenter(i, m.rooms[i].floor + H), b: this.roomCenter(j, m.rooms[j].floor + H), kind: 'rr' });
    }));
    const mk = (kind, color, w) => {
      const list = segs.filter((s) => s.kind === kind);
      if (!list.length) return null;
      const geo = new LineSegmentsGeometry().setPositions(list.flatMap((s) => [...s.a.toArray(), ...s.b.toArray()]));
      const line = new LineSegments2(geo, this.lineMat(color, w, 0.95));
      line.userData.segs = list;
      this.groups.graph.add(line);
      return line;
    };
    this.graphLines = [mk('or', COLORS.edge, 1.6), mk('oo', '#7FB0E6', 1.4), mk('rr', COLORS.roomEdge, 3.2)].filter(Boolean);
    this.setGraphProgress(1);
  }

  setGraphProgress(t) {
    // nodes pop in first, then edges grow from objects towards room nodes
    this.graphNodes.forEach((n, k) => {
      const tt = clamp01((t * 1.6 - (n.kind === 'room' ? 0 : 0.15 + 0.4 * (k % 7) / 7)) / 0.35);
      n.mesh.scale.setScalar(ease(tt) + 1e-3);
    });
    const te = ease(clamp01((t - 0.35) / 0.65));
    this.graphLines.forEach((line) => {
      const pts = line.userData.segs.flatMap((s) => {
        const b = s.a.clone().lerp(s.b, te);
        return [...s.a.toArray(), ...b.toArray()];
      });
      line.geometry.setPositions(pts);
    });
  }

  addLabel(kind, pos, html, color, room = -1) {
    const el = document.createElement('div');
    el.className = `sv-label sv-label-${kind}`;
    el.innerHTML = html;
    el.style.setProperty('--c', color);
    el.style.opacity = 0;   // until the first frame positions it
    this.labels.appendChild(el);
    const item = { kind, pos, el, room };
    this.labelItems.push(item);
    return item;
  }

  showGraph(on) { this.groups.graph.visible = on; this.graphOn = on; }
  showRooms(on) {
    this.groups.rooms.visible = on;
    this.labelItems.forEach((l) => { if (l.kind === 'room') l.el.style.display = on ? '' : 'none'; });
  }

  /** rooms: indices to keep in colour (others dimmed); objs: [{id, color, label}] */
  setHighlight({ rooms = null, objs = [] }) {
    const u = this.mat.uniforms;
    const nr = this.meta.rooms.length;
    this.targetDim = Array.from({ length: 8 }, (_, i) => (rooms && rooms.length && i < nr && !rooms.includes(i) ? 1 : 0));
    this.roomBoxes.forEach((b, i) => {
      const on = !rooms || !rooms.length || rooms.includes(i);
      b.material.opacity = on ? 0.95 : 0.18;
      b.material.linewidth = rooms && rooms.includes(i) ? 3.6 : 2.2;
    });
    objs = objs.slice(0, MAX_HI);
    objs.forEach((o, i) => { u.uHi.value[i] = o.id; u.uHiColor.value[i].set(o.color); });
    u.uHiN.value = objs.length;

    this.clearGroup(this.groups.hi);
    this.labelItems = this.labelItems.filter((l) => { if (l.kind === 'obj') { l.el.remove(); return false; } return true; });
    objs.forEach((h) => {
      const o = this.objById.get(h.id);
      if (!o) return;
      const pad = 0.04;
      const geo = new LineSegmentsGeometry().setPositions(boxSegments(o.min.map((v) => v - pad), o.max.map((v) => v + pad)));
      this.groups.hi.add(new LineSegments2(geo, this.lineMat(h.color, 3.2)));
      if (h.label) {
        this.addLabel('obj', new THREE.Vector3((o.min[0] + o.max[0]) / 2, (o.min[1] + o.max[1]) / 2, o.max[2] + 0.12),
          h.label, h.color);
      }
    });
  }

  // ---------- camera ----------
  /** Camera pose that frames the 3D box [lo, hi] from (azim, elev): the projected corners are
   *  re-centred and scaled to `fill` of the viewport, which a bounding sphere cannot do under perspective. */
  fitView(lo, hi, azim = -0.95, elev = 0.95, fill = 0.86) {
    const corners = [];
    for (let i = 0; i < 8; i++) corners.push(new THREE.Vector3(i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]));
    const target = new THREE.Vector3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
    const dir = new THREE.Vector3(Math.cos(azim) * Math.cos(elev), Math.sin(azim) * Math.cos(elev), Math.sin(elev));
    let dist = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) * 1.4;
    const cam = this.camera.clone();
    const right = new THREE.Vector3(), up = new THREE.Vector3(), p = new THREE.Vector3();
    const tanH = Math.tan((cam.fov * Math.PI) / 360);
    for (let it = 0; it < 6; it++) {
      cam.position.copy(target).addScaledVector(dir, dist);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      corners.forEach((c) => { p.copy(c).project(cam); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
      right.setFromMatrixColumn(cam.matrixWorld, 0);
      up.setFromMatrixColumn(cam.matrixWorld, 1);
      target.addScaledVector(right, ((x0 + x1) / 2) * tanH * dist * cam.aspect).addScaledVector(up, ((y0 + y1) / 2) * tanH * dist);
      dist *= Math.max((x1 - x0) / 2, (y1 - y0) / 2) / fill;
    }
    return { pos: target.clone().addScaledVector(dir, dist), target };
  }

  boxOf(rooms) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    rooms.forEach((i) => {
      const r = this.meta.rooms[i];
      for (let k = 0; k < 2; k++) { lo[k] = Math.min(lo[k], r.min[k]); hi[k] = Math.max(hi[k], r.max[k]); }
      lo[2] = Math.min(lo[2], r.floor);
      hi[2] = Math.max(hi[2], r.floor + (this.graphOn === false ? 2.05 : 3.3));
    });
    return [lo, hi];
  }

  currentAzimuth() {
    const v = this.camera.position.clone().sub(this.controls.target);
    return Math.atan2(v.y, v.x);
  }

  flyTo(view, dur = 1.3) {
    this.tween = { from: { pos: this.camera.position.clone(), target: this.controls.target.clone() }, to: view, t: 0, dur };
  }

  allRooms() { return this.meta.rooms.map((_, i) => i); }

  resetView(instant = false) {
    const v = this.fitView(...this.boxOf(this.allRooms()), -0.95, 0.92, this.opts.autoRotate ? 0.8 : 0.92);
    if (instant) { this.camera.position.copy(v.pos); this.controls.target.copy(v.target); this.controls.update(); }
    else this.flyTo(v);
  }

  topView() {
    this.flyTo(this.fitView(...this.boxOf(this.allRooms()), this.currentAzimuth(), 1.45, 0.92));
  }

  focusRooms(idx, keepAzimuth = true) {
    if (!idx || !idx.length) return this.resetView();
    const [lo, hi] = this.boxOf(idx);
    // small rooms: pad the box so the camera does not dive into a closet
    for (let k = 0; k < 2; k++) {
      const pad = Math.max(0, 4.5 - (hi[k] - lo[k])) / 2;
      lo[k] -= pad; hi[k] += pad;
    }
    this.flyTo(this.fitView(lo, hi, keepAzimuth ? this.currentAzimuth() : -0.95, 0.88, 0.84));
  }

  /** "cairn" assembly: rooms drop in one by one, then the graph grows. */
  playAssemble(total = 3.2) {
    const nr = this.meta.rooms.length;
    const u = this.mat.uniforms;
    for (let i = 0; i < 8; i++) { u.uShow.value[i] = i < nr ? 0 : 1; u.uDrop.value[i] = i < nr ? 2.5 : 0; }
    this.setGraphProgress(0);
    this.roomBoxes.forEach((b) => { b.visible = false; });
    const start = this.clock.elapsedTime;
    const per = (total * 0.55) / nr;
    this.anim = [(now) => {
      const t = now - start;
      for (let i = 0; i < nr; i++) {
        const k = ease(clamp01((t - i * per * 0.75) / per));
        u.uShow.value[i] = k;
        u.uDrop.value[i] = (1 - k) * 2.5;
        if (k > 0.6) this.roomBoxes[i].visible = true;
      }
      const g = clamp01((t - total * 0.5) / (total * 0.5));
      this.setGraphProgress(g);
      return t < total;
    }];
  }

  // ---------- loop ----------
  frame() {
    const dt = this.clock.getDelta();
    const now = this.clock.elapsedTime;
    if (!this.visible || !this.points) return;
    this.anim = this.anim.filter((f) => f(now));
    const u = this.mat.uniforms;
    u.uTime.value = now;
    if (this.targetDim) for (let i = 0; i < 8; i++) u.uDim.value[i] += (this.targetDim[i] - u.uDim.value[i]) * Math.min(1, dt * 6);
    if (this.tween) {
      const tw = this.tween;
      tw.t += dt / tw.dur;
      const k = ease(clamp01(tw.t));
      this.camera.position.lerpVectors(tw.from.pos, tw.to.pos, k);
      this.controls.target.lerpVectors(tw.from.target, tw.to.target, k);
      if (tw.t >= 1) this.tween = null;
    }
    this.controls.autoRotate = this.opts.autoRotate && !this.tween && !this.userActive;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
  }

  updateLabels() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    const v = new THREE.Vector3();
    this.labelItems.forEach((l) => {
      v.copy(l.pos);
      if (l.kind === 'room') v.z += this.mat.uniforms.uDrop.value[l.room] || 0;
      v.project(this.camera);
      const hidden = v.z > 1 || (l.kind === 'room' && this.mat.uniforms.uShow.value[l.room] < 0.5);
      l.el.style.opacity = hidden ? 0 : '';
      l.el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
    });
  }
}
