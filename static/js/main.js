// CAIRN project page — page widgets, interactive teaser and qualitative explorer.
import { SceneViewer, ROOM_COLORS } from './scene-viewer.js';

const SCENES = 'static/scenes';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const onVisible = (el, fn, threshold = 0.25) => {
  if (!el) return;
  const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { io.disconnect(); fn(); } }, { threshold });
  io.observe(el);
};
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const TASKS = {
  grounding: { name: 'Grounding', color: '#F46F74' },
  captioning: { name: 'Captioning', color: '#F4875F' },
  identification: { name: 'Identification', color: '#5FB7AE' },
  counting: { name: 'Counting', color: '#6FA0D8' },
  existence: { name: 'Existence', color: '#F2B866' },
  comparison: { name: 'Comparison', color: '#8CC37E' },
};

const METHODS = [
  { name: 'Chat-Scene', color: '#8CC37E', v: [19.6, 19.4, 78.3, 61.3, 58.9, 69.5, 63.6] },
  { name: '3DGraphLLM', color: '#F2C94C', v: [18.9, 18.7, 79.6, 61.9, 58.3, 72.7, 62.3] },
  { name: 'Inst3D-LMM', color: '#F48B8B', v: [20.4, 20.0, 79.5, 61.8, 58.5, 71.6, 63.7] },
  { name: 'CAIRN (ours)', color: '#4A86C8', v: [25.8, 25.4, 94.5, 62.1, 61.1, 76.1, 70.4], ours: true },
];
const METRICS = ['Grounding A@0.25', 'Grounding A@0.5', 'Captioning CIDEr', 'Ident. EM', 'Count. MRA', 'Exist. EM', 'Comp. EM'];

/* =========================================================================
   Hero: drifting scene-graph background
   ========================================================================= */
function heroGraph() {
  const cv = $('#hero-graph');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, nodes = [], visible = true, mx = 0, my = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);
  function init() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const nr = Math.max(5, Math.round(W / 150));
    nodes = [];
    for (let i = 0; i < nr; i++) nodes.push({ room: true, x: rnd(0, W), y: rnd(0, H), vx: rnd(-.12, .12), vy: rnd(-.08, .08), r: rnd(5, 7.5) });
    const rooms = nodes.slice();
    rooms.forEach((R) => {
      const k = Math.round(rnd(3, 6));
      for (let j = 0; j < k; j++) {
        const a = rnd(0, Math.PI * 2), d = rnd(30, 85);
        nodes.push({ room: false, parent: R, ox: Math.cos(a) * d, oy: Math.sin(a) * d, ph: rnd(0, 6.28), r: rnd(2.6, 3.8) });
      }
    });
  }
  function step(t) {
    requestAnimationFrame(step);
    if (!visible) return;
    ctx.clearRect(0, 0, W, H);
    const rooms = nodes.filter((n) => n.room);
    rooms.forEach((n) => {
      n.x += n.vx; n.y += n.vy;
      if (n.x < -40 || n.x > W + 40) n.vx *= -1;
      if (n.y < -40 || n.y > H + 40) n.vy *= -1;
    });
    const px = (mx - W / 2) * 0.012, py = (my - H / 2) * 0.012;
    nodes.forEach((n) => {
      if (!n.room) {
        n.x = n.parent.x + n.ox + Math.sin(t / 1600 + n.ph) * 5;
        n.y = n.parent.y + n.oy + Math.cos(t / 1900 + n.ph) * 5;
      }
      n.sx = n.x + px * (n.room ? 1.5 : 1); n.sy = n.y + py * (n.room ? 1.5 : 1);
    });
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(244,139,139,.55)';
    for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i], b = rooms[j];
      const d = Math.hypot(a.sx - b.sx, a.sy - b.sy);
      if (d < 260) { ctx.globalAlpha = 1 - d / 260; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke(); }
    }
    ctx.globalAlpha = 0.7; ctx.lineWidth = 1.1; ctx.strokeStyle = 'rgba(242,207,74,.9)';
    nodes.forEach((n) => { if (!n.room) { ctx.beginPath(); ctx.moveTo(n.sx, n.sy); ctx.lineTo(n.parent.sx, n.parent.sy); ctx.stroke(); } });
    ctx.globalAlpha = 1;
    nodes.forEach((n) => {
      ctx.beginPath(); ctx.arc(n.sx, n.sy, n.r, 0, Math.PI * 2);
      ctx.fillStyle = n.room ? 'rgba(242,90,95,.75)' : 'rgba(78,144,217,.65)';
      ctx.fill();
    });
  }
  init();
  window.addEventListener('resize', init);
  window.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(cv);
  if (!reduceMotion) requestAnimationFrame(step); else step(0);
}

/* =========================================================================
   Nav, reveal, counters, zoom, bibtex
   ========================================================================= */
function pageChrome() {
  const nav = $('#topnav');
  const hero = $('.hero');
  new IntersectionObserver((es) => nav.classList.toggle('show', !es[0].isIntersecting), { rootMargin: '-60px 0px 0px 0px' }).observe(hero);
  const links = $$('.topnav-links a');
  const secs = links.map((a) => $(a.getAttribute('href')));
  const spy = () => {
    const y = window.scrollY + 120;
    let k = 0;
    secs.forEach((s, i) => { if (s && s.offsetTop <= y) k = i; });
    links.forEach((a, i) => a.classList.toggle('active', i === k));
  };
  window.addEventListener('scroll', spy, { passive: true });
  spy();

  $$('.sec-title, .prose, .fig, .stats, .task-ladder, .mask-demo, .table-wrap, .icon-row, .tldr').forEach((el) => {
    el.classList.add('reveal');
    onVisible(el, () => el.classList.add('in'), 0.08);
  });

  onVisible($('#stats'), () => {
    $$('#stats .num').forEach((el) => {
      const to = parseFloat(el.dataset.to), dec = +(el.dataset.dec || 0);
      const pre = el.dataset.prefix || '', suf = el.dataset.suffix || '';
      const t0 = performance.now(), dur = 1400;
      const tick = (t) => {
        const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = pre + (to * e).toFixed(dec) + suf;
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  });

  if (window.mediumZoom) window.mediumZoom('[data-zoomable]', { margin: 24, background: 'rgba(255,255,255,.96)' });

  $('#bib-copy')?.addEventListener('click', async () => {
    const btn = $('#bib-copy');
    try { await navigator.clipboard.writeText($('#bib-text').textContent); btn.querySelector('span').textContent = 'Copied!'; }
    catch { btn.querySelector('span').textContent = 'Select & copy'; }
    setTimeout(() => { btn.querySelector('span').textContent = 'Copy'; }, 1600);
  });
}

/* =========================================================================
   Radar chart (teaser) and bar groups (results)
   ========================================================================= */
function radar() {
  const svg = $('#radar');
  const NS = 'http://www.w3.org/2000/svg';
  // clockwise from the top, matching the paper teaser
  const axes = [
    { name: ['Grounding', 'Acc'], k: 0 }, { name: ['Comp.', 'EM'], k: 6 }, { name: ['Exist.', 'EM'], k: 5 },
    { name: ['Count.', 'MRA'], k: 4 }, { name: ['Ident.', 'EM'], k: 3 }, { name: ['Captioning', 'CIDEr'], k: 2 },
  ];
  const R = 96;
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
  const norm = axes.map((a) => {
    const vs = METHODS.map((m) => m.v[a.k]);
    const lo = Math.min(...vs) * 0.9, hi = Math.max(...vs) * 1.01;
    return (v) => 0.2 + 0.8 * (v - lo) / (hi - lo);
  });
  const el = (tag, attrs, parent = svg) => {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    parent.appendChild(e);
    return e;
  };
  [0.25, 0.5, 0.75, 1].forEach((f) => el('polygon', { class: 'grid', points: axes.map((_, i) => `${Math.cos(ang(i)) * R * f},${Math.sin(ang(i)) * R * f}`).join(' ') }));
  axes.forEach((a, i) => {
    el('line', { class: 'axis', x1: 0, y1: 0, x2: Math.cos(ang(i)) * R, y2: Math.sin(ang(i)) * R });
    const lx = Math.cos(ang(i)) * (R + 34), ly = Math.sin(ang(i)) * (R + 24);
    const t = el('text', { class: 'ax-lbl', x: lx, y: ly - 7 });
    a.name.forEach((s, j) => { const ts = el('tspan', { x: lx, dy: j ? 17 : 0 }, t); ts.textContent = s; });
  });
  const polys = METHODS.map((m) => el('polygon', {
    class: 'series' + (m.ours ? ' ours' : ''), fill: m.color, 'fill-opacity': m.ours ? 0.22 : 0.07, stroke: m.color,
    'stroke-width': m.ours ? 2.6 : 1.6, 'stroke-linejoin': 'round', points: axes.map(() => '0,0').join(' '),
  }));
  const ours = METHODS.length - 1;
  const vals = axes.map((a, i) => {
    const r = norm[i](METHODS[ours].v[a.k]) * R - 16;
    const t = el('text', { class: 'val', x: Math.cos(ang(i)) * r, y: Math.sin(ang(i)) * r + 4, opacity: 0 });
    t.textContent = METHODS[ours].v[a.k];
    return t;
  });
  const draw = (k) => polys.forEach((p, mi) => p.setAttribute('points', axes.map((a, i) => {
    const r = norm[i](METHODS[mi].v[a.k]) * R * k;
    return `${Math.cos(ang(i)) * r},${Math.sin(ang(i)) * r}`;
  }).join(' ')));
  onVisible(svg, () => {
    const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / 1300), e = 1 - Math.pow(1 - k, 3);
      draw(e);
      if (k < 1) requestAnimationFrame(tick); else vals.forEach((v) => v.setAttribute('opacity', 1));
    };
    requestAnimationFrame(tick);
  });
  const leg = $('#radar-legend');
  METHODS.forEach((m, mi) => {
    const b = document.createElement('button');
    b.className = m.ours ? 'ours' : '';
    b.style.setProperty('--c', m.color);
    b.innerHTML = `<i></i>${esc(m.name)}`;
    const on = () => { svg.classList.add('focus'); polys[mi].classList.add('hot'); };
    const off = () => { svg.classList.remove('focus'); polys[mi].classList.remove('hot'); };
    b.addEventListener('mouseenter', on); b.addEventListener('mouseleave', off);
    b.addEventListener('focus', on); b.addEventListener('blur', off);
    leg.appendChild(b);
  });
}

function bars() {
  const box = $('#bars');
  if (!box) return;
  METRICS.forEach((name, k) => {
    const vs = METHODS.map((m) => m.v[k]);
    const max = Math.max(...vs) * 1.12;
    const best = Math.max(...vs.slice(0, -1));
    const g = document.createElement('div');
    g.className = 'bar-group';
    g.innerHTML = `<h4>${esc(name)}</h4><div class="bar-plot">${METHODS.map((m) =>
      `<div class="bar${m.ours ? ' ours' : ''}" style="--c:${m.color}" data-h="${(m.v[k] / max) * 100}" title="${esc(m.name)}: ${m.v[k]}"><span>${m.v[k]}</span></div>`).join('')}</div>
      <div class="bar-gain">+${(vs[vs.length - 1] - best).toFixed(1)}</div>`;
    box.appendChild(g);
  });
  const leg = document.createElement('div');
  leg.className = 'bars-legend';
  leg.innerHTML = METHODS.map((m) => `<span style="--c:${m.color}"><i></i>${esc(m.name)}</span>`).join('') +
    '<span style="color:var(--good);font-weight:600">+x.x = gain over the best baseline</span>';
  box.appendChild(leg);
  onVisible(box, () => {
    box.classList.add('in');
    $$('.bar', box).forEach((b) => { b.style.height = b.dataset.h + '%'; });
  });
}

/* =========================================================================
   Hierarchical attention-mask playground
   ========================================================================= */
function maskDemo() {
  const root = $('#mask-demo');
  if (!root) return;
  const NS = 'http://www.w3.org/2000/svg';
  const st = { mode: 'cairn', rooms: 2, objs: 2 };
  const COL = { self: '#F5F5F5', rr: '#F28B8B', or: '#F6DC6B', oo: '#A9CBEA', blk: '#9E9E9E', full: '#C9D3E0' };
  const mat = $('#md-matrix'), graph = $('#md-graph');

  function tokens() {
    const t = [];
    let o = 1;
    for (let r = 0; r < st.rooms; r++) {
      t.push({ kind: 'R', room: r, label: `R${r + 1}` });
      for (let j = 0; j < st.objs; j++) t.push({ kind: 'O', room: r, label: `O${o++}` });
    }
    return t;
  }
  const type = (a, b, i, j) => {
    if (i === j) return 'self';
    if (st.mode === 'full') return 'full';
    if (a.kind === 'R' && b.kind === 'R') return 'rr';
    if (a.room !== b.room) return 'blk';
    if (a.kind === 'O' && b.kind === 'O') return 'oo';
    return 'or';
  };
  const mk = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    parent.appendChild(e);
    return e;
  };

  function render() {
    const T = tokens(), N = T.length;
    $('#md-rooms').textContent = st.rooms;
    $('#md-objs').textContent = st.objs;
    $$('.seg button', root).forEach((b) => b.classList.toggle('on', b.dataset.mode === st.mode));
    const cs = Math.min(40, 400 / N), pad = 34;
    mat.setAttribute('viewBox', `0 0 ${pad + N * cs + 4} ${pad + N * cs + 4}`);
    mat.innerHTML = '';
    const cells = [];
    T.forEach((t, i) => {
      mk('text', { class: 'tok' + (t.kind === 'R' ? ' r' : ''), x: pad + i * cs + cs / 2, y: pad / 2 + 2 }, mat).textContent = t.label;
      mk('text', { class: 'tok' + (t.kind === 'R' ? ' r' : ''), x: pad / 2, y: pad + i * cs + cs / 2 }, mat).textContent = t.label;
      cells[i] = [];
      T.forEach((u, j) => {
        const ty = type(t, u, i, j);
        cells[i][j] = mk('rect', { class: 'cell', x: pad + j * cs, y: pad + i * cs, width: cs, height: cs, rx: 3, fill: COL[ty] }, mat);
      });
    });
    T.forEach((t, i) => {
      const hit = mk('rect', { class: 'row-hit', x: 0, y: pad + i * cs, width: pad + N * cs, height: cs }, mat);
      hit.addEventListener('mouseenter', () => hover(i));
      hit.addEventListener('mouseleave', () => hover(-1));
    });

    // scene-graph view of the same tokens
    graph.innerHTML = '';
    const GW = 260, top = 34, bot = 128;
    const slot = GW / st.rooms;
    const rx = (r) => slot * (r + 0.5);
    const pos = T.map((t) => {
      if (t.kind === 'R') return [rx(t.room), top];
      const k = T.filter((u) => u.kind === 'O' && u.room === t.room).indexOf(t);
      const span = Math.min(slot - 22, 24 * (st.objs - 1));
      return [rx(t.room) - span / 2 + (st.objs === 1 ? 0 : (k * span) / (st.objs - 1)), bot - 10 + (k % 2) * 22];
    });
    const edges = [];
    T.forEach((a, i) => T.forEach((b, j) => {
      if (j <= i) return;
      const ty = type(a, b, i, j);
      if (ty === 'blk' || ty === 'self') return;
      const color = ty === 'full' ? '#C9D3E0' : COL[ty] === COL.or ? '#E9C62E' : COL[ty];
      edges.push({ i, j, el: mk('line', { x1: pos[i][0], y1: pos[i][1], x2: pos[j][0], y2: pos[j][1], stroke: color, 'stroke-opacity': ty === 'full' ? 0.8 : 1 }, graph) });
    }));
    const nodes = T.map((t, i) => {
      const c = mk('circle', { cx: pos[i][0], cy: pos[i][1], r: t.kind === 'R' ? 12 : (st.rooms * st.objs > 9 ? 7.5 : 9), fill: t.kind === 'R' ? '#F25A5F' : '#4E90D9' }, graph);
      mk('text', { x: pos[i][0], y: pos[i][1] }, graph).textContent = t.label;
      c.addEventListener('mouseenter', () => hover(i));
      c.addEventListener('mouseleave', () => hover(-1));
      return c;
    });

    function hover(i) {
      mat.classList.toggle('hovering', i >= 0);
      graph.classList.toggle('hovering', i >= 0);
      cells.forEach((row, a) => row.forEach((c, b) => c.classList.toggle('hot', i >= 0 && a === i && type(T[a], T[b], a, b) !== 'blk')));
      nodes.forEach((n, j) => n.classList.toggle('hot', i >= 0 && (j === i || type(T[i], T[j], i, j) !== 'blk')));
      edges.forEach((e) => e.el.classList.toggle('hot', i >= 0 && (e.i === i || e.j === i)));
    }

    let vis = 0, oo = 0;
    T.forEach((a, i) => T.forEach((b, j) => {
      const ty = type(a, b, i, j);
      if (ty !== 'blk') vis++;
      if (a.kind === 'O' && b.kind === 'O' && ty !== 'blk') oo++;
    }));
    const nO = st.rooms * st.objs;
    const pct = (vis / (N * N)) * 100;
    $('#md-stat').innerHTML = `<b>${vis}</b> of ${N * N} token pairs visible (${pct.toFixed(0)}%)<br>
      object↔object pairs: <b>${oo}</b> ${st.mode === 'cairn' ? `= ${st.rooms}·${st.objs}² instead of ${nO}² = ${nO * nO}` : `= ${nO}²`}
      <div class="md-bar"><i style="width:${pct}%"></i></div>`;
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.mode) st.mode = b.dataset.mode;
    if (b.dataset.d) {
      const [k, d] = b.dataset.d.split(':');
      st[k] = Math.max(1, Math.min(k === 'rooms' ? 4 : 4, st[k] + +d));
    }
    render();
  });
  render();
}

/* =========================================================================
   Interactive teaser (Figure 1)
   ========================================================================= */
const TEASER = {
  scene: 's00835',
  cards: [
    { task: 'grounding', title: 'Visual Grounding', where: 'left', rooms: [0],
      q: 'Which object in the scene is being described? <q>The rug supports the armchair, and the cabinet is adjacent to the rug.</q>',
      ans: '<OBJ000>.', hi: [{ id: 0, label: 'OBJ000 · cabinet' }] },
    { task: 'captioning', title: 'Dense Captioning', where: 'left', rooms: [2], dur: 8.5, ansLabel: 'Reference',
      q: 'Describe the location and spatial context of &lt;OBJ132&gt;.',
      ans: 'In the bedroom, facing the bed, on the closest cabinet to the right of the bed, there is a red doll on the far left.',
      hi: [{ id: 132, label: 'OBJ132 · teddy bear' }] },
    { task: 'existence', title: 'Existence Verification', where: 'left', rooms: [4],
      q: 'In the room described as <q>The white soap on the metal soap rack next to the faucet above the blue bathtub.</q>, is there a cabinet?',
      ans: 'No.', hi: [] },
    { task: 'comparison', title: 'Inter-Room Comparison', where: 'bottom', rooms: [1, 2], dur: 7.5,
      q: 'Room A: <q>The window is located next to the pink bed, above the white radiator.</q> Room B: <q>The white plush carpet in front of the double bed facing away from the window.</q> Comparing both rooms, which has a greater number of curtains?',
      opts: '(A) Room A. (B) Room B.', ans: 'B.',
      hi: [{ id: 103, label: 'A · curtain' }, { id: 124, label: 'B · curtain' }, { id: 128, label: 'B · curtain' }] },
    { task: 'identification', title: 'Object Identification', where: 'bottom', rooms: [3],
      q: 'In the room where the rug is lower than the clothes hanger, and the radiator is next to the rug, what is higher than the rug?',
      opts: '(A) kitchen mixer (B) picture (C) curtain (D) mirror', ans: 'D', hi: [{ id: 138, label: 'mirror' }] },
    { task: 'counting', title: 'Object Counting', where: 'bottom', rooms: [0],
      q: 'In the room where the rug is to the left of the kitchen cabinet, while higher than the rug is the fireplace, how many stools are there?',
      ans: '2', hi: [{ id: 53, label: 'stool 1' }, { id: 65, label: 'stool 2' }] },
  ],
};

async function teaser() {
  const grid = $('.teaser-grid');
  const vEl = $('#tz-viewer');
  const viewer = new SceneViewer(vEl, { autoRotate: !reduceMotion, pointSize: 0.034 });
  window.cairnTeaser = viewer;
  let cur = -1, playing = !reduceMotion, timer = null, typer = null;
  const cards = TEASER.cards.map((c, i) => {
    const t = TASKS[c.task];
    const b = document.createElement('button');
    b.className = 'task-card';
    b.style.setProperty('--c', t.color);
    const rooms = c.rooms.map((r) => `<span class="room-tag" style="--rc:${ROOM_COLORS[r]}">R${r + 1}</span>`).join('');
    b.innerHTML = `<div class="tc-head">${c.title}<span class="prog"></span></div>
      <div class="tc-body"><div class="tc-q">${c.q}</div>${c.opts ? `<div class="opts">${esc(c.opts)}</div>` : ''}
      <div class="tc-foot"><span class="tc-ans">${c.ansLabel || 'Answer'}: <span>${esc(c.ans.length > 24 ? c.ans.slice(0, 22) + '…' : c.ans)}</span></span>${rooms}</div></div>`;
    b.addEventListener('click', () => { setPlaying(false); select(i); });
    (c.where === 'left' ? $('#tz-left') : $('#tz-bottom')).appendChild(b);
    return b;
  });

  function type(text, label) {
    clearInterval(typer);
    const out = $('#tz-answer');
    let k = 0;
    out.innerHTML = '<span class="caret"></span>';
    $('.tz-mini-graph').classList.remove('pulse'); void $('.tz-mini-graph').offsetWidth; $('.tz-mini-graph').classList.add('pulse');
    typer = setInterval(() => {
      k += 1;
      out.innerHTML = (label ? `<span style="color:var(--ink-3)">${label}: </span>` : '') + esc(text.slice(0, k)) + (k < text.length ? '<span class="caret"></span>' : '');
      if (k >= text.length) clearInterval(typer);
    }, reduceMotion ? 1 : 24);
  }

  function select(i) {
    cur = i;
    const c = TEASER.cards[i];
    const color = TASKS[c.task].color;
    cards.forEach((b, j) => {
      b.classList.toggle('active', j === i);
      const p = b.querySelector('.prog');
      p.classList.remove('run'); void p.offsetWidth;
      if (j === i && playing) { b.style.setProperty('--dur', (c.dur || 6.5) + 's'); p.classList.add('run'); }
    });
    viewer.setHighlight({ rooms: c.rooms, objs: c.hi.map((h) => ({ ...h, color })) });
    viewer.focusRooms(c.rooms);
    const strip = cards[i].parentElement;   // horizontal card strip on narrow screens
    if (strip.scrollWidth > strip.clientWidth + 4) strip.scrollTo({ left: cards[i].offsetLeft - strip.offsetLeft, behavior: 'smooth' });
    type(c.ans, c.ansLabel);
    clearTimeout(timer);
    if (playing) timer = setTimeout(() => select((cur + 1) % cards.length), (c.dur || 6.5) * 1000);
  }

  function setPlaying(on) {
    playing = on;
    grid.classList.toggle('playing', on);
    const b = $('#tz-play');
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
    b.querySelector('i').className = on ? 'fas fa-pause' : 'fas fa-play';
    viewer.opts.autoRotate = on && !reduceMotion;
    clearTimeout(timer);
    if (on) select(cur < 0 ? 0 : (cur + 1) % cards.length);
    else cards.forEach((b2) => b2.querySelector('.prog').classList.remove('run'));
  }

  $('#tz-play').addEventListener('click', () => setPlaying(!playing));
  $('#tz-graph').addEventListener('click', (e) => {
    const b = e.currentTarget, on = !b.classList.contains('on');
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    viewer.showGraph(on);
  });
  $('#tz-replay').addEventListener('click', () => {
    viewer.setHighlight({});
    viewer.resetView();
    viewer.playAssemble();
    clearTimeout(timer);
    if (playing) timer = setTimeout(() => select(0), 3600);
  });
  viewer.onUserInteract = () => { if (playing) setPlaying(false); };

  await viewer.load(SCENES, TEASER.scene);
  $('.viewer-loading', vEl).classList.add('done');
  const start = () => {
    if (!reduceMotion) viewer.playAssemble();
    grid.classList.toggle('playing', playing);
    $('#tz-play').classList.toggle('on', playing);
    if (playing) timer = setTimeout(() => select(0), reduceMotion ? 0 : 3600);
    else select(0);
  };
  onVisible(vEl, start, 0.3);
}

/* =========================================================================
   Qualitative explorer
   ========================================================================= */
const QTASKS = ['grounding', 'identification', 'counting', 'existence', 'comparison'];

function roomDescs(q) {
  const p = q.prompt;
  if (q.task === 'comparison') {
    const m = p.match(/Room A: "([\s\S]*?)"\.? ?Room B: "([\s\S]*?)"/);
    return m ? [m[1], m[2]] : [];
  }
  let m = p.match(/room described as "([\s\S]*?)"/);
  if (m) return [m[1]];
  m = p.match(/room where ([\s\S]*?)(?:,? (?:what|which|how|is a|is an|is there|contain)\b|\?)/);
  if (m) return [m[1]];
  if (q.task === 'grounding') { m = p.match(/"([\s\S]*?)"/); if (m) return [m[1]]; }
  return [];
}

async function explorer() {
  const vEl = $('#qv-viewer');
  const viewer = new SceneViewer(vEl, { pointSize: 0.03 });
  window.cairnExplorer = viewer;
  const index = await fetch(`${SCENES}/index.json`).then((r) => r.json());
  let meta = null, tab = 'grounding', curQ = null;

  const thumbs = $('#qv-thumbs');
  index.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'thumb';
    b.innerHTML = `<img src="static/images/thumbs/${s.key}.jpg" alt="Top-down view of scene ${esc(s.scene_id.split('_')[0])}" loading="lazy"><span>${esc(s.scene_id.split('-')[0])} · ${s.rooms} rooms</span>`;
    b.addEventListener('click', () => loadScene(i));
    thumbs.appendChild(b);
  });

  async function loadScene(i) {
    $$('.thumb', thumbs).forEach((t, j) => t.classList.toggle('on', j === i));
    $('.viewer-loading', vEl).classList.remove('done');
    const m = await viewer.load(SCENES, index[i].key);
    if (!m) return;
    meta = m;
    $('.viewer-loading', vEl).classList.add('done');
    viewer.showGraph($('#qv-graph').classList.contains('on'));
    viewer.showRooms($('#qv-rooms').classList.contains('on'));
    $('#qv-scene-name').textContent = `HM3D ${meta.scene_id.split('_')[0]} · ${meta.rooms.length} rooms`;
    $('#qv-rooms-legend').innerHTML = meta.rooms.map((r, k) =>
      `<span class="rchip" style="--rc:${ROOM_COLORS[k]}" title="${esc(r.sub)}"><b>${r.name}</b>${esc(r.hint.join(' · '))}</span>`).join('');
    renderTabs();
    const first = meta.questions.find((q) => q.task === tab && q.ok) ? tab : 'grounding';
    setTab(first);
  }

  const qs = (task) => meta.questions.filter((q) => q.task === task && q.ok);

  function renderTabs() {
    $('#qv-tabs').innerHTML = QTASKS.map((t) => {
      const n = qs(t).length;
      return n ? `<button class="qv-tab" role="tab" data-t="${t}" style="--c:${TASKS[t].color}">${TASKS[t].name}<span class="n">${n}</span></button>` : '';
    }).join('');
    $$('.qv-tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.t)));
  }

  function setTab(t) {
    tab = t;
    $$('.qv-tab').forEach((b) => { b.classList.toggle('on', b.dataset.t === t); b.setAttribute('aria-selected', b.dataset.t === t); });
    const list = qs(t);
    $('#qv-list').innerHTML = list.map((q, i) =>
      `<button class="qv-item" data-i="${i}" style="--c:${TASKS[t].color}"><span>${esc(q.prompt.replace(/^(Give the ID of the object that best matches this description|Find the object that matches this description|Which object in the scene is being described\?|Identify the object being referred to):?\s*/, ''))}</span></button>`).join('');
    $$('.qv-item').forEach((b) => b.addEventListener('click', () => showQ(list[+b.dataset.i], b)));
    if (list.length) showQ(list[0], $('.qv-item'));
  }

  const objName = (id) => meta.objects.find((o) => o.id === id)?.label ?? 'object';
  const pad3 = (n) => String(n).padStart(3, '0');
  const roomTag = (r) => `<span class="room-tag" style="--rc:${ROOM_COLORS[r]}">${meta.rooms[r].name}</span>`;

  function showQ(q, btn) {
    curQ = q;
    $$('.qv-item').forEach((b) => b.classList.toggle('on', b === btn));
    const t = TASKS[q.task];
    const GOOD = '#22A559', BAD = '#E0453A';

    // question text with the implicit room descriptions marked in their room's colour
    let html = esc(q.prompt);
    roomDescs(q).forEach((d, k) => {
      const r = q.task === 'grounding' ? q.rooms[0] : q.rooms[k];
      if (r == null) return;
      const ed = esc(d);
      html = html.replace(ed, `<span class="desc" style="--rc:${ROOM_COLORS[r]}">${ed}</span>`);
    });

    let hi = [], rooms = q.rooms.slice(), note = '';
    if (q.task === 'grounding') {
      const g = q.objs[0];
      hi.push({ id: g, color: GOOD, label: `GT / CAIRN · OBJ${pad3(g)} ${objName(g)}` });
      if (q.bad_objs.length) {
        const b = q.bad_objs[0];
        hi.push({ id: b, color: BAD, label: `Chat-Scene · OBJ${pad3(b)} ${objName(b)}` });
        const br = meta.objects.find((o) => o.id === b)?.room;
        if (br != null && !rooms.includes(br)) rooms.push(br);
        note = br != null && br !== q.rooms[0]
          ? `The baseline picks a ${esc(objName(b))} in ${roomTag(br)}, a different room from the target in ${roomTag(q.rooms[0])}.`
          : `Both candidates lie in ${roomTag(q.rooms[0])}; the baseline confuses the target with a nearby ${esc(objName(b))}.`;
      }
    } else if (q.task === 'identification') {
      hi = q.objs.map((id) => ({ id, color: GOOD, label: `answer · ${objName(id)}` }));
      note = `Answer object located in ${roomTag(q.rooms[0])}.`;
    } else if (q.task === 'counting') {
      hi = q.objs.map((id, k) => ({ id, color: GOOD, label: `${objName(id)} ${k + 1}` }));
      note = `${roomTag(q.rooms[0])} contains ${q.objs.length} ${esc(q.category)}${q.objs.length === 1 ? '' : 's'} (highlighted).`;
    } else if (q.task === 'existence') {
      hi = q.objs.map((id) => ({ id, color: GOOD, label: objName(id) }));
      note = q.objs.length ? `${roomTag(q.rooms[0])} contains ${q.objs.length} × ${esc(q.category)} (highlighted).`
        : `There is no ${esc(q.category)} in ${roomTag(q.rooms[0])}.`;
    } else if (q.task === 'comparison') {
      const [a, b] = q.rooms;
      hi = q.objs.map((id) => {
        const r = meta.objects.find((o) => o.id === id)?.room;
        return { id, color: GOOD, label: `${r === a ? 'A' : 'B'} · ${objName(id)}` };
      });
      note = `Number of ${esc(q.category)}s: Room A = ${roomTag(a)} → <b>${q.counts[0]}</b>, Room B = ${roomTag(b)} → <b>${q.counts[1]}</b>.`;
    }

    const roomsLine = q.task === 'comparison'
      ? `Room A → ${roomTag(q.rooms[0])} &nbsp; Room B → ${roomTag(q.rooms[1])}`
      : `Target room → ${roomTag(q.rooms[0])}`;
    $('#qv-detail').innerHTML = `
      <span class="qd-task" style="--c:${t.color}">${t.name}</span>
      <p class="qd-q">${html}</p>
      <div class="qd-rooms">${roomsLine}</div>
      <div class="qd-ans">
        <div class="qd-row"><span class="who">Ground truth</span><span class="what">${esc(q.gt)}</span><span></span></div>
        <div class="qd-row good"><span class="who">CAIRN</span><span class="what">${esc(q.cairn)}</span><i class="fas fa-check"></i></div>
        <div class="qd-row bad"><span class="who">Chat-Scene</span><span class="what">${esc(q.base)}</span><i class="fas fa-xmark"></i></div>
      </div>
      <div class="qd-note">${note}</div>`;
    viewer.setHighlight({ rooms, objs: hi });
    viewer.focusRooms(rooms);
  }

  $('#qv-reset').addEventListener('click', () => viewer.resetView());
  $('#qv-top').addEventListener('click', () => viewer.topView());
  const toggle = (id, fn) => $(id).addEventListener('click', (e) => {
    const b = e.currentTarget, on = !b.classList.contains('on');
    b.classList.toggle('on', on);
    fn(on);
  });
  toggle('#qv-graph', (on) => viewer.showGraph(on));
  toggle('#qv-rooms', (on) => viewer.showRooms(on));
  $('#qv-full').addEventListener('click', () => {
    const st = $('.qv-stage');
    if (document.fullscreenElement) document.exitFullscreen();
    else st.requestFullscreen?.();
  });

  onVisible($('#qualitative'), () => loadScene(0), 0.05);
}

/* ========================================================================= */
heroGraph();
pageChrome();
radar();
bars();
maskDemo();
teaser().catch((e) => { console.error(e); $('#tz-viewer .viewer-loading').textContent = 'Could not load the 3D scene.'; });
explorer().catch((e) => { console.error(e); $('#qv-viewer .viewer-loading').textContent = 'Could not load the 3D scene.'; });
