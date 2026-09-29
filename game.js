/* =====================================================================
 * 奶龙围城.io —— YORG.io 玩法复刻版（表情包皮肤）
 * 大地图+镜头+小地图 / 商家节点散布 / 供应链：采集站→袋鼠→仓储→弹药厂
 * 订单经济（建筑全花订单） / 无尽生存 + 存活天数排行
 * =================================================================== */
(function () {
'use strict';

/* ================= 常量 ================= */
const TAU = Math.PI * 2;
const T = 26;                 // 每格像素
const N = 64;                 // 地图 N*N 格（大地图）
const WORLD = N * T;          // 1664
const VIEW = 780;             // 画布视口
const DAY_LEN = 45;           // 白天秒数
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const ORD = '📦';             // 订单符号

/* ================= DOM ================= */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const dpr = Math.min(2, window.devicePixelRatio || 1);
canvas.width = VIEW * dpr; canvas.height = VIEW * dpr;

const el = {
  orders: document.getElementById('uiOrders'),
  cap: document.getElementById('uiCap'),
  income: document.getElementById('uiIncome'),
  hqBar: document.getElementById('hqHpBar'),
  hqHp: document.getElementById('uiHqHp'),
  dayNum: document.getElementById('uiDayNum'),
  phase: document.getElementById('uiPhase'),
  skip: document.getElementById('skipDayBtn'),
  pause: document.getElementById('pauseBtn'),
  speed: document.getElementById('speedBtn'),
  sound: document.getElementById('soundBtn'),
  help: document.getElementById('helpBtn'),
  banner: document.getElementById('banner'),
  hint: document.getElementById('hint'),
  buildbar: document.getElementById('buildbar'),
  tip: document.getElementById('tooltip'),
  panel: document.getElementById('infoPanel'),
  ipName: document.getElementById('ipName'),
  ipLv: document.getElementById('ipLv'),
  ipHpBar: document.getElementById('ipHpBar'),
  ipHp: document.getElementById('ipHp'),
  ipStat: document.getElementById('ipStat'),
  upBtn: document.getElementById('upBtn'),
  sellBtn2: document.getElementById('sellBtn2'),
  board: document.getElementById('leaderboard'),
  boardList: document.getElementById('boardList'),
  startOv: document.getElementById('startOverlay'),
  startBtn: document.getElementById('startBtn'),
  best: document.getElementById('best'),
  endOv: document.getElementById('endOverlay'),
  endTitle: document.getElementById('endTitle'),
  endSub: document.getElementById('endSub'),
  stNight: document.getElementById('stNight'),
  stKills: document.getElementById('stKills'),
  stEarn: document.getElementById('stEarn'),
  stBuild: document.getElementById('stBuild'),
  restartBtn: document.getElementById('restartBtn'),
};

/* ================= 工具 ================= */
const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = n => Math.floor(Math.random() * n);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const key = (x, y) => x + ',' + y;
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}

/* ================= 音效（WebAudio 合成） ================= */
let AC = null;
let muted = localStorage.getItem('nailong_mute') === '1';
function audioCtx() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(f0, f1, dur, type, vol, delay) {
  if (muted) return;
  const a = audioCtx(); if (!a) return;
  try {
    const t0 = a.currentTime + (delay || 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + dur + 0.03);
  } catch (e) {}
}
const sfxLast = {};
function throttled(name, ms) {
  const now = performance.now();
  if (sfxLast[name] && now - sfxLast[name] < ms) return false;
  sfxLast[name] = now; return true;
}
const SFX = {
  place: () => tone(200, 120, 0.09, 'square', 0.2),
  sell: () => tone(500, 900, 0.12, 'sine', 0.18),
  click: () => tone(700, 500, 0.05, 'sine', 0.12),
  error: () => tone(160, 120, 0.14, 'square', 0.15),
  pearl: () => { if (throttled('pearl', 70)) tone(760, 620, 0.05, 'square', 0.07); },
  ice: () => { if (throttled('ice', 70)) tone(980, 460, 0.07, 'sine', 0.08); },
  lob: () => tone(240, 90, 0.13, 'triangle', 0.14),
  boom: () => { tone(90, 40, 0.2, 'sine', 0.3); tone(300, 60, 0.12, 'sawtooth', 0.1); },
  zap: () => { if (throttled('zap', 90)) tone(1400, 180, 0.09, 'sawtooth', 0.08); },
  hit: () => { if (throttled('hit', 60)) tone(320, 260, 0.03, 'square', 0.05); },
  death: () => { if (throttled('death', 80)) tone(520, 150, 0.22, 'square', 0.12); },
  deliver: () => { tone(880, 880, 0.06, 'sine', 0.12); tone(1320, 1320, 0.07, 'sine', 0.12, 0.06); },
  deliverA: () => { tone(520, 520, 0.05, 'triangle', 0.1); tone(700, 700, 0.05, 'triangle', 0.1, 0.05); },
  horn: () => { tone(196, 196, 0.5, 'sawtooth', 0.16); tone(147, 147, 0.5, 'sawtooth', 0.14, 0.02); tone(196, 185, 0.45, 'sawtooth', 0.12, 0.5); },
  dawn: () => { tone(523, 523, 0.15, 'sine', 0.14); tone(659, 659, 0.15, 'sine', 0.14, 0.14); tone(784, 784, 0.25, 'sine', 0.14, 0.28); },
  boss: () => { tone(110, 55, 0.6, 'sawtooth', 0.3); tone(220, 80, 0.5, 'square', 0.15, 0.1); },
  over: () => tone(400, 100, 0.7, 'sawtooth', 0.25),
  upgrade: () => tone(600, 1200, 0.15, 'sine', 0.15),
  full: () => { if (throttled('full', 900)) tone(300, 240, 0.1, 'square', 0.1); },
};
function sfx(n) { try { SFX[n] && SFX[n](); } catch (e) {} }

/* ================= 配置表 ================= */
const BUILD_ORDER = ['mine', 'wall', 'tea', 'shake', 'hotpot', 'tesla', 'ware', 'factory'];
const TOWER_TYPES = ['tea', 'shake', 'hotpot', 'tesla'];
const BLD = {
  mine:    { name: '采集站',   emoji: '🏪', cost: 30,  hp: 180,  desc: '建在 🍜外卖商家 上，袋鼠把订单驮回仓储。订单耗尽商家打烊。' },
  wall:    { name: '保温墙',   emoji: '🧱', cost: 8,   hp: 350,  desc: '奶龙最爱啃的奶茶箱墙，拖时间专用。' },
  tea:     { name: '奶茶塔',   emoji: '🧋', cost: 40,  hp: 200,  range: 2.7, rate: 1.0, dmg: 9,  ammo: 10, kind: 'pearl', desc: 'Q弹珍珠单体速射，性价比之王。' },
  shake:   { name: '冰奶昔塔', emoji: '🥤', cost: 70,  hp: 180,  range: 2.4, rate: 1.0, dmg: 5,  ammo: 12, kind: 'ice', slow: 0.45, slowT: 1.5, desc: '冰镇减速 45%，火锅塔最佳拍档。' },
  hotpot:  { name: '火锅塔',   emoji: '🍲', cost: 110, hp: 220,  range: 3.3, rate: 0.5, dmg: 22, ammo: 6,  kind: 'lob', aoe: 1.15, desc: '滚烫毛肚范围溅射，清群利器。' },
  tesla:   { name: '麻辣电塔', emoji: '⚡', cost: 160, hp: 190,  range: 2.6, rate: 0.85, dmg: 13, ammo: 8, kind: 'zap', chains: 3, desc: '连锁闪电最多弹 3 只，专治蛙海。' },
  ware:    { name: '外卖仓库', emoji: '🏬', cost: 60,  hp: 420,  desc: '订单容量 +250，袋鼠也可就近卸货（省腿）。' },
  factory: { name: '弹药厂',   emoji: '🏭', cost: 90,  hp: 260,  desc: '消耗 0.5订单/s 换 1.0弹药/s，喂饱你的塔。' },
};

const ENEMY = {
  nailong: { name: '小奶龙',   hp: 30,   spd: 0.85, dmg: 12, rw: 3,  r: 0.46 },
  frog:    { name: '大笑奶蛙', hp: 18,   spd: 1.65, dmg: 9,  rw: 2,  r: 0.4 },
  baoba:   { name: '暴暴龙',   hp: 100,  spd: 0.6,  dmg: 26, rw: 12, r: 0.55, from: 3 },
  mother:  { name: '奶蛙之母', hp: 520,  spd: 0.4,  dmg: 40, rw: 100, r: 1.1, boss: true },
};
function enemyHp(type, day) {
  const c = ENEMY[type];
  return Math.round(c.hp * Math.pow(1.19, day - 1) * (c.boss ? 1 + 0.04 * Math.floor(day / 5) : 1));
}

/* ================= 全局状态 ================= */
const state = {
  phase: 'menu',            // menu | day | night | over
  day: 1, dayT: DAY_LEN, nightT: 0,
  orders: 100,
  hqAmmo: 15,
  incomeRate: 0,            // 最近 10s 平均入库/s
  kills: 0, totalIncome: 0, built: 0, nightsCleared: 0,
  speedIdx: 0, paused: false,
  time: 0, shake: 0,
};
const SPEEDS = [1, 2, 4];

let grid = [];
let stalls = new Map();     // "x,y" -> stall node
const buildings = [];
const couriers = [];
const enemies = [];
let waveQueue = [];
const projectiles = [];
const zaps = [];
const particles = [];
const floats = [];

let bid = 0, cid = 0, eid = 0;
let selected = null, placing = null, sellMode = false;
let hover = null;           // 世界坐标格 {x,y}
let terrainCanvas = null;   // 预渲染地面
const cam = { x: WORLD / 2 - VIEW / 2, y: WORLD / 2 - VIEW / 2, zoom: 1 };
const ZOOMS = [1, 0.62];
let minimapRect = null;     // 屏幕坐标，用于点击检测

function hqB() { return buildings.find(b => b.type === 'hq'); }
function isTower(b) { return TOWER_TYPES.indexOf(b.type) >= 0; }
function isStorage(b) { return b.type === 'hq' || b.type === 'ware'; }
function walkable(x, y) { return x >= 0 && y >= 0 && x < N && y < N && !grid[y][x]; }
function capacity() {
  let c = 400 + 200 * ((hqB() ? hqB().lvl : 1) - 1);
  for (const b of buildings) if (b.type === 'ware') c += 250;
  return c;
}
function dmgMul(b) { return 1 + 0.45 * (b.lvl - 1); }
function rangeOf(b) { return BLD[b.type].range * Math.pow(1.08, b.lvl - 1); }
function upCost(b) { return Math.round(BLD[b.type].cost * 0.9 * b.lvl); }
function hqAmmoCap() { return 40 + 15 * ((hqB() ? hqB().lvl : 1) - 1); }
function ammoRate() {
  let r = 0.15;
  for (const b of buildings) if (b.type === 'factory' && state.orders > 0) r += 1.0;
  return r;
}
function factoryBurn() {
  let burn = 0;
  for (const b of buildings) if (b.type === 'factory') burn += 0.5;
  return burn;
}

/* ================= 排行榜（本地存档） ================= */
function loadRuns() {
  try { return JSON.parse(localStorage.getItem('nailong_runs_v1') || '[]'); } catch (e) { return []; }
}
function saveRun(run) {
  const runs = loadRuns(); runs.push(run);
  runs.sort((a, b) => b.days - a.days);
  try { localStorage.setItem('nailong_runs_v1', JSON.stringify(runs.slice(0, 5))); } catch (e) {}
}
function renderBoard(highlightDays) {
  const runs = loadRuns().slice(0, 5);
  let html = '<div class="bh">🏆 存活排行</div>';
  const rows = [...runs];
  if (highlightDays !== undefined && state.phase !== 'menu') {
    rows.unshift({ days: highlightDays, me: true });
    rows.sort((a, b) => b.days - a.days);
  }
  html += rows.slice(0, 5).map((r, i) =>
    '<div class="br' + (r.me ? ' me' : '') + '"><span>' + (i + 1) + '</span><span>' + (r.me ? '本局' : '第 ' + r.ts + ' 次') + '</span><span>' + r.days + ' 天</span></div>'
  ).join('');
  el.boardList.innerHTML = html;
}

/* ================= 世界生成 ================= */
const stallSpots = [];      // {x,y,amount,max,dead,cluster}
function genWorld() {
  grid = [];
  for (let y = 0; y < N; y++) grid.push(new Array(N).fill(null));
  stalls = new Map(); stallSpots.length = 0;
  const cx = N >> 1;
  // HQ
  const hq = { id: ++bid, x: cx, y: cx, type: 'hq', lvl: 1, hp: 1200, maxhp: 1200, invested: 0, flash: 0, t: rnd(0, 9) };
  grid[cx][cx] = hq; buildings.push(hq);
  // 商家集群：46 簇 × 1~3 格，距 HQ ≥ 4，避开彼此过近
  const taken = new Set([key(cx, cx)]);
  let attempts = 0;
  while (stallSpots.length < 46 && attempts++ < 3000) {
    const x = 2 + irnd(N - 4), y = 2 + irnd(N - 4);
    if (dist(x, y, cx, cx) < 4.5) continue;
    let ok = true;
    for (const s of stallSpots) if (dist(x, y, s.x, s.y) < 3.2) { ok = false; break; }
    if (!ok) continue;
    const clusterN = 1 + irnd(3);
    const amt = Math.round(rnd(380, 860) / clusterN) * 1;
    for (let i = 0; i < clusterN; i++) {
      const sx = clamp(x + irnd(3) - 1, 1, N - 2), sy = clamp(y + irnd(3) - 1, 1, N - 2);
      const k = key(sx, sy);
      if (taken.has(k)) continue;
      taken.add(k);
      const node = { x: sx, y: sy, amount: amt, max: amt, dead: false };
      stallSpots.push(node); stalls.set(k, node);
    }
  }
  buildTerrain();
  cam.x = cx * T + T / 2 - VIEW / (2 * cam.zoom);
  cam.y = cy0() * T + T / 2 - VIEW / (2 * cam.zoom);
}
function cy0() { return N >> 1; }

function buildTerrain() {
  terrainCanvas = document.createElement('canvas');
  terrainCanvas.width = WORLD; terrainCanvas.height = WORLD;
  const t = terrainCanvas.getContext('2d');
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      t.fillStyle = (x + y) % 2 ? '#9cd06c' : '#a8d878';
      t.fillRect(x * T, y * T, T, T);
    }
  }
  // 边缘深色带（地图边界）
  t.fillStyle = 'rgba(60,45,25,0.25)';
  t.fillRect(0, 0, WORLD, T * 0.6); t.fillRect(0, WORLD - T * 0.6, WORLD, T * 0.6);
  t.fillRect(0, 0, T * 0.6, WORLD); t.fillRect(WORLD - T * 0.6, 0, T * 0.6, WORLD);
  // 装饰
  for (let i = 0; i < 420; i++) {
    const px = rnd(T, WORLD - T), py = rnd(T, WORLD - T), k = irnd(3), r = rnd(0, TAU);
    if (k === 0) {
      t.fillStyle = ['#fff', '#ffe9a8', '#ffd1e8'][irnd(3)];
      for (let j = 0; j < 4; j++) {
        const a = r + j * TAU / 4;
        t.beginPath(); t.arc(px + Math.cos(a) * 2.2, py + Math.sin(a) * 2.2, 1.4, 0, TAU); t.fill();
      }
      t.fillStyle = '#ffcf4d'; t.beginPath(); t.arc(px, py, 1.3, 0, TAU); t.fill();
    } else if (k === 1) {
      t.fillStyle = 'rgba(90,110,70,0.5)';
      t.beginPath(); t.ellipse(px, py, 2.6, 1.8, r, 0, TAU); t.fill();
    } else {
      t.strokeStyle = 'rgba(80,130,50,0.6)'; t.lineWidth = 1.2;
      t.beginPath(); t.moveTo(px, py); t.lineTo(px - 2, py - 4);
      t.moveTo(px, py); t.lineTo(px + 2, py - 4); t.stroke();
    }
  }
}

/* ================= 相机 ================= */
const keysDown = {};
function panSpeed(dt) { return 520 * dt / cam.zoom; }
function updateCamera(dt) {
  let dx = 0, dy = 0;
  if (keysDown['w'] || keysDown['arrowup']) dy -= 1;
  if (keysDown['s'] || keysDown['arrowdown']) dy += 1;
  if (keysDown['a'] || keysDown['arrowleft']) dx -= 1;
  if (keysDown['d'] || keysDown['arrowright']) dx += 1;
  if (dx || dy) {
    const l = Math.hypot(dx, dy);
    cam.x += dx / l * panSpeed(dt); cam.y += dy / l * panSpeed(dt);
  }
  clampCam();
}
function clampCam() {
  const vw = VIEW / cam.zoom, vh = VIEW / cam.zoom;
  cam.x = clamp(cam.x, -40, WORLD - vw + 40);
  cam.y = clamp(cam.y, -40, WORLD - vh + 40);
}
function screenToWorld(sx, sy) {
  return { x: cam.x + sx / cam.zoom, y: cam.y + sy / cam.zoom };
}

/* ================= 寻路 ================= */
function findPath(sx, sy, tx, ty) {
  if (sx === tx && sy === ty) return [];
  const open = [{ x: sx, y: sy, g: 0, f: Math.abs(tx - sx) + Math.abs(ty - sy) }];
  const gScore = new Map([[key(sx, sy), 0]]);
  const came = new Map();
  const closed = new Set();
  let guard = 0;
  while (open.length && guard++ < 9000) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    const ck = key(cur.x, cur.y);
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (cur.x === tx && cur.y === ty) {
      const path = []; let k = ck;
      while (came.has(k)) { const p = k.split(','); path.push({ x: +p[0], y: +p[1] }); k = came.get(k); }
      path.reverse(); path.pop();
      return path;
    }
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const isTarget = nx === tx && ny === ty;
      if (!isTarget && !walkable(nx, ny)) continue;
      const nk = key(nx, ny);
      const ng = cur.g + 1;
      if (gScore.has(nk) && gScore.get(nk) <= ng) continue;
      gScore.set(nk, ng); came.set(nk, ck);
      open.push({ x: nx, y: ny, g: ng, f: ng + Math.abs(tx - nx) + Math.abs(ty - ny) });
    }
  }
  return null;
}
// BFS 找最近建筑（返回 {b, path}），cap 限制搜索量
function acquire(e) {
  const sx = clamp(Math.floor(e.fx), 0, N - 1), sy = clamp(Math.floor(e.fy), 0, N - 1);
  const visited = new Uint8Array(N * N);
  visited[sy * N + sx] = 1;
  let q = [{ x: sx, y: sy }];
  const parent = new Map();
  let steps = 0;
  while (q.length && steps++ < 3200) {
    const nq = [];
    for (const cur of q) {
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const b = grid[ny][nx];
        if (b) {
          const path = [];
          let k = key(cur.x, cur.y);
          while (parent.has(k)) { const p = k.split(','); path.push({ x: +p[0], y: +p[1] }); k = parent.get(k); }
          path.reverse();
          return { b, path };
        }
        const k = ny * N + nx;
        if (visited[k]) continue;
        visited[k] = 1;
        parent.set(k, key(cur.x, cur.y));
        nq.push({ x: nx, y: ny });
      }
    }
    q = nq;
  }
  return null;
}
function nearestBuilding(fx, fy) {
  let best = null, bd = 1e9;
  for (const b of buildings) {
    const d = dist(b.x + 0.5, b.y + 0.5, fx, fy);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function adjacentBuilding(fx, fy) {
  let best = null, bd = 1.02;
  for (const b of buildings) {
    const d = dist(b.x + 0.5, b.y + 0.5, fx, fy);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

/* ================= 建造 / 升级 / 出售 ================= */
function adjacentToStall(x, y) {
  for (const [dx, dy] of DIRS) {
    const s = stalls.get(key(x + dx, y + dy));
    if (s && !s.dead) return true;
  }
  return false;
}
function canPlace(type, x, y) {
  if (x < 0 || y < 0 || x >= N || y >= N) return false;
  if (grid[y][x]) return false;
  const s = stalls.get(key(x, y));
  if (type === 'mine') return !!s && !s.dead && !s.reserved;   // 采集站建在商家格上
  if (s) return false;                                         // 其他建筑不占商家格
  if (type === 'mine') return false;
  for (const e of enemies) if (Math.floor(e.fx) === x && Math.floor(e.fy) === y) return false;
  return true;
}
function tryPlace(type, x, y, free) {
  const cfg = BLD[type];
  if (!free && state.orders < cfg.cost) { sfx('error'); floatText('订单不足！', x + 0.5, y, '#ff8080'); return false; }
  if (!canPlace(type, x, y)) { sfx('error'); return false; }
  const b = {
    id: ++bid, x, y, type, lvl: 1,
    hp: cfg.hp, maxhp: cfg.hp, invested: cfg.cost,
    ammo: cfg.ammo || 0, maxammo: cfg.ammo || 0,
    cool: rnd(0, 0.4), flash: 0, t: rnd(0, 9),
    buffer: 0, bufCap: type === 'mine' ? 14 : 0,
  };
  grid[y][x] = b; buildings.push(b);
  if (!free) state.orders -= cfg.cost;
  state.built++;
  if (type === 'mine') {
    const s = stalls.get(key(x, y));
    if (s) { s.mine = b; s.reserved = true; }
    b.stall = s || null;
    spawnMoneyCourier(b);
  }
  if (type === 'factory') spawnAmmoRunner();
  sfx('place');
  puff(x + 0.5, y + 0.5, '#ffffff', 6);
  refreshPanel();
  return true;
}
function upgrade(b) {
  if (b.lvl >= 3) return;
  const c = upCost(b);
  if (state.orders < c) { sfx('error'); floatText('订单不足！', b.x + 0.5, b.y, '#ff8080'); return; }
  state.orders -= c; b.invested += c; b.lvl++;
  const oldMax = b.maxhp;
  b.maxhp = Math.round(b.maxhp * 1.3); b.hp = Math.min(b.maxhp, b.hp + Math.round(oldMax * 0.3));
  if (b.type === 'mine') { b.bufCap += 8; spawnMoneyCourier(b); }
  if (b.type === 'hq') { b.maxhp += 400; b.hp = Math.min(b.maxhp, b.hp + 400); spawnAmmoRunner(); }
  sfx('upgrade');
  floatText('Lv.' + b.lvl + '!', b.x + 0.5, b.y - 0.2, '#ffe45c');
  puff(b.x + 0.5, b.y + 0.5, '#ffe45c', 10);
  refreshPanel();
}
function sellB(b) {
  if (b.type === 'hq') return;
  const refund = Math.round(b.invested * 0.6);
  state.orders = Math.min(capacity(), state.orders + refund);
  floatText('+' + refund + ORD, b.x + 0.5, b.y, '#ffd100');
  removeB(b, false);
  sfx('sell');
  closePanel();
}
function removeB(b, byEnemy) {
  if (grid[b.y][b.x] === b) grid[b.y][b.x] = null;
  const i = buildings.indexOf(b); if (i >= 0) buildings.splice(i, 1);
  if (b.stall) { b.stall.mine = null; b.stall.reserved = false; }
  for (let j = couriers.length - 1; j >= 0; j--) if (couriers[j].mineId === b.id) couriers.splice(j, 1);
  if (selected === b) { selected = null; closePanel(); }
  if (byEnemy) {
    puff(b.x + 0.5, b.y + 0.5, '#5a5a5a', 14);
    floatText('💥被拆了', b.x + 0.5, b.y, '#ff9090');
    state.shake = Math.max(state.shake, 0.25);
  }
  for (const e of enemies) if (e.tb === b) { e.tb = null; e.path = null; e.repath = 0; }
}

/* ================= 袋鼠物流 ================= */
function spawnMoneyCourier(mine) {
  const count = couriers.filter(c => c.kind === 'money' && c.mineId === mine.id).length;
  if (count >= mine.lvl) return;
  couriers.push({
    id: ++cid, kind: 'money', mineId: mine.id,
    fx: mine.x + 0.5, fy: mine.y + 0.5, dir: 1,
    mode: 'load', timer: 1.1, path: null, pi: 0, warn: 0, t: rnd(0, 9),
  });
}
function spawnAmmoRunner() {
  const hq = hqB(); if (!hq) return;
  couriers.push({
    id: ++cid, kind: 'ammo', mineId: null,
    fx: hq.x + 0.5 + rnd(-0.3, 0.3), fy: hq.y + 0.5 + 0.5, dir: 1,
    mode: 'idle', timer: 0, path: null, pi: 0, warn: 0, t: rnd(0, 9),
  });
}
function nearestStorage(fx, fy) {
  let best = null, bd = 1e9;
  for (const b of buildings) {
    if (!isStorage(b)) continue;
    const d = dist(b.x + 0.5, b.y + 0.5, fx, fy);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function neediestTower() {
  let best = null, br = 1e9;
  for (const b of buildings) {
    if (!isTower(b)) continue;
    const r = b.ammo / b.maxammo;
    if (r >= 0.85) continue;
    if (r < br) { br = r; best = b; }
  }
  return best;
}
function courierMove(c, speed, dt) {
  if (!c.path) return 'blocked';
  if (c.pi >= c.path.length) return 'arrived';
  const wp = c.path[c.pi];
  if (c.pi < c.path.length - 1 && !walkable(wp.x, wp.y)) { c.path = null; return 'blocked'; }
  const tx = wp.x + 0.5, ty = wp.y + 0.5;
  const dx = tx - c.fx, dy = ty - c.fy;
  const d = Math.hypot(dx, dy);
  const step = speed * dt;
  if (d <= step) { c.fx = tx; c.fy = ty; c.pi++; return c.pi >= c.path.length ? 'arrived' : 'moving'; }
  c.fx += dx / d * step; c.fy += dy / d * step;
  if (Math.abs(dx) > 0.05) c.dir = dx > 0 ? 1 : -1;
  return 'moving';
}
function requestPath(c, tx, ty) {
  const p = findPath(Math.floor(c.fx), Math.floor(c.fy), tx, ty);
  if (p) { c.path = p; c.pi = 0; c.warn = 0; return true; }
  c.warn = 0.6; return false;
}
function updateCouriers(dt) {
  const hq = hqB();
  for (let i = couriers.length - 1; i >= 0; i--) {
    const c = couriers[i];
    c.t += dt;
    if (c.warn > 0) c.warn -= dt;
    if (!hq) { couriers.splice(i, 1); continue; }
    if (c.kind === 'money') {
      const mine = buildings.find(b => b.id === c.mineId);
      if (!mine || mine.type !== 'mine') { couriers.splice(i, 1); continue; }
      if (mine.stall && mine.stall.dead && c.mode === 'load' && mine.buffer <= 0) { couriers.splice(i, 1); continue; }
      if (c.mode === 'load') {
        c.timer -= dt;
        if (mine.buffer >= 4 || (mine.stall && mine.stall.dead && mine.buffer > 0)) {
          const st = nearestStorage(c.fx, c.fy);
          if (st && requestPath(c, st.x, st.y)) { c.mode = 'go'; c.batch = Math.min(Math.floor(mine.buffer), 20); }
          else c.timer = 1.5;
        } else if (c.timer <= 0) {
          c.timer = 0.8;
        }
      } else if (c.mode === 'go') {
        const st = buildings.find(b => isStorage(b) && b.x === c.destX && b.y === c.destY) || nearestStorage(c.fx, c.fy);
        if (!st) { c.mode = 'load'; continue; }
        if (!c.path) {
          c.destX = st.x; c.destY = st.y;
          if (!requestPath(c, st.x, st.y)) { c.mode = 'stuck'; c.resume = 'go'; c.timer = 1.5; }
        } else if (courierMove(c, 2.0, dt) === 'arrived') {
          const batch = c.batch || Math.floor(mine.buffer);
          if (state.orders + batch > capacity()) {
            floatText('仓库满了！', st.x + 0.5, st.y - 0.3, '#ff9a3d');
            sfx('full');
          }
          const add = Math.min(batch, Math.max(0, capacity() - state.orders));
          state.orders += add; state.totalIncome += add;
          mine.buffer -= batch;
          c.mode = 'load'; c.timer = 1.0;
          if (add > 0) { floatText('+' + add + ORD, st.x + 0.5, st.y - 0.3, '#ffd100'); sfx('deliver'); coinPuff(st.x + 0.5, st.y); }
        }
      } else if (c.mode === 'stuck') {
        c.timer -= dt;
        if (c.timer <= 0) { c.timer = 1.5; const st = nearestStorage(c.fx, c.fy); if (st && requestPath(c, st.x, st.y)) c.mode = 'go'; }
      }
    } else { // ammo
      if (c.mode === 'idle') {
        c.timer -= dt;
        if (c.timer <= 0) {
          c.timer = 0.7;
          if (state.hqAmmo >= 1) {
            const t = neediestTower();
            if (t) {
              const batch = Math.min(6, Math.floor(state.hqAmmo), t.maxammo - t.ammo);
              if (batch > 0) {
                state.hqAmmo -= batch; c.batch = batch; c.towerId = t.id;
                if (requestPath(c, t.x, t.y)) c.mode = 'go';
              }
            }
          }
        }
      } else if (c.mode === 'go') {
        const t = buildings.find(b => b.id === c.towerId);
        if (!t) { state.hqAmmo = Math.min(hqAmmoCap(), state.hqAmmo + (c.batch || 0)); c.mode = 'idle'; c.timer = 0.3; continue; }
        if (!c.path) {
          if (!requestPath(c, t.x, t.y)) { c.mode = 'stuck'; c.resume = 'go'; c.timer = 1.5; }
        } else if (courierMove(c, 2.3, dt) === 'arrived') {
          t.ammo = Math.min(t.maxammo, t.ammo + c.batch);
          sfx('deliverA');
          floatText('📦+' + c.batch, t.x + 0.5, t.y - 0.3, '#9fdcff');
          c.mode = 'return';
          if (!requestPath(c, hq.x, hq.y)) { c.mode = 'stuck'; c.resume = 'return'; c.timer = 1.5; }
        }
      } else if (c.mode === 'return') {
        if (!c.path) {
          if (!requestPath(c, hq.x, hq.y)) { c.mode = 'stuck'; c.resume = 'return'; c.timer = 1.5; }
        } else if (courierMove(c, 2.3, dt) === 'arrived') {
          c.mode = 'idle'; c.timer = 0;
        }
      } else if (c.mode === 'stuck') {
        c.timer -= dt;
        if (c.timer <= 0) {
          c.timer = 1.5;
          const dest = c.resume === 'go' ? buildings.find(b => b.id === c.towerId) || hq : hq;
          if (requestPath(c, dest.x, dest.y)) c.mode = c.resume;
        }
      }
    }
  }
}

/* ================= 塔射击 ================= */
function pickTarget(b) {
  const r = rangeOf(b);
  let best = null, bd = 1e9;
  for (const e of enemies) {
    const d = dist(e.fx, e.fy, b.x + 0.5, b.y + 0.5);
    if (d <= r && d < bd) { bd = d; best = e; }
  }
  return best;
}
function fireTower(b) {
  const tg = pickTarget(b);
  if (!tg) return false;
  const cx = b.x + 0.5, cy = b.y + 0.5;
  const kind = BLD[b.type].kind;
  if (kind === 'pearl') {
    projectiles.push({ kind: 'pearl', fx: cx, fy: cy, tg: tg.id, lx: tg.fx, ly: tg.fy, dmg: BLD.tea.dmg * dmgMul(b), spd: 10 });
    sfx('pearl');
  } else if (kind === 'ice') {
    projectiles.push({ kind: 'ice', fx: cx, fy: cy, tg: tg.id, lx: tg.fx, ly: tg.fy, dmg: BLD.shake.dmg * dmgMul(b), spd: 9 });
    sfx('ice');
  } else if (kind === 'lob') {
    const d = dist(tg.fx, tg.fy, cx, cy);
    projectiles.push({ kind: 'lob', x0: cx, y0: cy, x1: tg.fx, y1: tg.fy, t: 0, dur: Math.max(0.3, d / 5.5), dmg: BLD.hotpot.dmg * dmgMul(b), aoe: BLD.hotpot.aoe });
    sfx('lob');
  } else if (kind === 'zap') {
    const pts = [{ x: cx, y: cy }];
    let cur = tg, d = BLD.tesla.dmg * dmgMul(b);
    const hit = new Set();
    for (let i = 0; i < BLD.tesla.chains && cur; i++) {
      hurtEnemy(cur, d);
      pts.push({ x: cur.fx, y: cur.fy });
      hit.add(cur.id);
      d *= 0.72;
      let nx = null, nd = 1.9;
      for (const e of enemies) {
        if (hit.has(e.id) || e.hp <= 0) continue;
        const dd = dist(e.fx, e.fy, cur.fx, cur.fy);
        if (dd < nd) { nd = dd; nx = e; }
      }
      cur = nx;
    }
    zaps.push({ pts, t: 0.14 });
    sfx('zap');
  }
  b.flash = 0.15;
  return true;
}
function updateTowers(dt) {
  for (const b of buildings) {
    b.flash = Math.max(0, b.flash - dt);
    if (!isTower(b)) continue;
    b.cool -= dt;
    if (b.cool <= 0) {
      if (b.ammo > 0) {
        if (fireTower(b)) { b.ammo--; b.cool = 1 / (BLD[b.type].rate * (1 + 0.12 * (b.lvl - 1))); }
        else b.cool = 0.1;
      } else b.cool = 0.4;
    }
  }
}

/* ================= 敌人（无尽波次） ================= */
function makeWave(day) {
  const q = [];
  let t = 1.2;
  let total = Math.min(90, 6 + Math.round(4.5 * Math.pow(day, 1.16)));
  if (day % 5 === 0) { q.push({ type: 'mother', at: 5 }); total = Math.max(6, total - 8); }
  const frogR = Math.min(0.5, 0.15 + day * 0.045);
  const baoR = day >= 3 ? Math.min(0.24, 0.04 + day * 0.022) : 0;
  for (let i = 0; i < total; i++) {
    const r = Math.random();
    const type = r < frogR ? 'frog' : (r < frogR + baoR ? 'baoba' : 'nailong');
    q.push({ type, at: t });
    t += Math.max(0.12, 0.5 - day * 0.02) + Math.random() * Math.max(0.1, 0.8 - day * 0.03);
  }
  q.sort((a, b) => a.at - b.at);
  return q;
}
function wavePreview(q) {
  const c = {};
  for (const it of q) c[it.type] = (c[it.type] || 0) + 1;
  return Object.keys(c).map(k => ENEMY[k].name + '×' + c[k]).join('　');
}
function spawnEnemy(type) {
  const hq = hqB(); if (!hq) return null;
  const cfg = ENEMY[type];
  const ang = rnd(0, TAU);
  const r = rnd(17, 23);                       // 距 HQ 17~23 格（屏外压进）
  let fx = clamp(hq.x + 0.5 + Math.cos(ang) * r, 0.5, N - 0.5);
  let fy = clamp(hq.y + 0.5 + Math.sin(ang) * r, 0.5, N - 0.5);
  const e = {
    id: ++eid, type, fx, fy, dir: 1,
    hp: enemyHp(type, state.day), maxhp: enemyHp(type, state.day),
    spd: cfg.spd * (1 + Math.min(0.5, state.day * 0.012)),
    dmg: cfg.dmg * (1 + Math.min(1.2, state.day * 0.035)),
    rw: cfg.rw, r: cfg.r,
    slowT: 0, slowF: 0, flash: 0, t: rnd(0, 9),
    tb: null, path: null, pi: 0, repath: rnd(0, 0.3), atkT: 0,
    spawnT: 0.5,
    skin: type === 'nailong' ? NAILONG_SKINS[irnd(NAILONG_SKINS.length)] : null,
  };
  if (type === 'mother') e.spawnCd = 4.5;
  enemies.push(e);
  spawnFlashes.push({ x: fx, y: fy, t: 0.8 });
  if (type === 'mother') {
    sfx('boss');
    showBanner('👑 奶蛙之母降临！', '她悬浮着来了，还会不断产蛙……');
    state.shake = 0.5;
  }
  return e;
}
function hurtEnemy(e, d) {
  if (e.hp <= 0) return;
  e.hp -= d; e.flash = 0.12;
  sfx('hit');
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  const rw = e.rw + Math.floor(state.day / 4);
  state.orders = Math.min(capacity(), state.orders + rw);
  state.kills++;
  floatText('+' + rw + ORD, e.fx, e.fy - 0.2, '#ffd100');
  starPuff(e.fx, e.fy, ENEMY[e.type].boss ? 24 : 7);
  sfx('death');
  const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1);
}
function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt);
    if (e.spawnT > 0) { e.spawnT -= dt; continue; }
    let sf = 1;
    if (e.slowT > 0) { e.slowT -= dt; sf = 1 - e.slowF; }
    if (e.type === 'mother') {
      e.spawnCd -= dt;
      if (e.spawnCd <= 0) {
        e.spawnCd = Math.max(3.2, 4.6 - state.day * 0.05);
        const baby = spawnEnemy('frog');
        if (baby) {
          baby.fx = clamp(e.fx + rnd(-0.8, 0.8), 0.5, N - 0.5);
          baby.fy = clamp(e.fy + rnd(0.5, 1.2), 0.5, N - 0.5);
          baby.spawnT = 0.2;
          floatText('呱！', e.fx, e.fy - 1.2, '#d9ec9a');
        }
      }
    }
    if (e.tb && (e.tb.hp <= 0 || buildings.indexOf(e.tb) < 0)) { e.tb = null; e.path = null; }
    const adj = adjacentBuilding(e.fx, e.fy);
    if (adj) { e.tb = adj; e.path = null; }
    if (!e.tb) {
      e.repath -= dt;
      if (e.repath <= 0) {
        e.repath = 0.5;
        const ac = acquire(e);
        if (ac) { e.tb = ac.b; e.path = ac.path; e.pi = 0; }
        else {
          const nb = nearestBuilding(e.fx, e.fy);
          if (nb) { e.tb = nb; e.path = null; }
        }
      }
    }
    if (e.tb) {
      const d = dist(e.tb.x + 0.5, e.tb.y + 0.5, e.fx, e.fy);
      if (d < 1.0) {
        e.atkT += dt;
        e.dir = e.tb.x + 0.5 > e.fx ? 1 : -1;
        e.tb.hp -= e.dmg * dt;
        if (Math.random() < dt * 3) spark(e.tb.x + 0.5 + rnd(-0.3, 0.3), e.tb.y + 0.5 + rnd(-0.3, 0.3));
        if (e.tb.hp <= 0) {
          const wasHQ = e.tb.type === 'hq';
          const deadB = e.tb;
          removeB(e.tb, true);
          e.tb = null; e.path = null; e.repath = 0;
          if (wasHQ) { destroyHQ(deadB); return; }
        }
      } else {
        let moved = false;
        if (e.path && e.pi < e.path.length) {
          const wp = e.path[e.pi];
          if (!walkable(wp.x, wp.y) && !(e.tb && wp.x === e.tb.x && wp.y === e.tb.y)) { e.path = null; }
          else {
            const tx = wp.x + 0.5, ty = wp.y + 0.5;
            const dx = tx - e.fx, dy = ty - e.fy;
            const dd = Math.hypot(dx, dy);
            const step = e.spd * sf * dt;
            if (dd <= step) { e.fx = tx; e.fy = ty; e.pi++; }
            else {
              e.fx += dx / dd * step; e.fy += dy / dd * step;
              if (Math.abs(dx) > 0.05) e.dir = dx > 0 ? 1 : -1;
            }
            moved = true;
          }
        }
        if (!moved) {
          const tx = e.tb.x + 0.5, ty = e.tb.y + 0.5;
          const dx = tx - e.fx, dy = ty - e.fy;
          const dd = Math.hypot(dx, dy) || 1;
          const step = e.spd * sf * dt;
          e.fx += dx / dd * step; e.fy += dy / dd * step;
          if (Math.abs(dx) > 0.05) e.dir = dx > 0 ? 1 : -1;
        }
      }
    }
  }
}

/* ================= 弹道 / 特效 ================= */
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (p.kind === 'lob') {
      p.t += dt / p.dur;
      if (p.t >= 1) {
        const ex = p.x1, ey = p.y1;
        for (let j = enemies.length - 1; j >= 0; j--) {
          const e = enemies[j];
          if (dist(e.fx, e.fy, ex, ey) <= p.aoe) hurtEnemy(e, p.dmg);
        }
        boomPuff(ex, ey);
        sfx('boom');
        state.shake = Math.max(state.shake, 0.12);
        projectiles.splice(i, 1);
      }
      continue;
    }
    const tg = enemies.find(e => e.id === p.tg);
    if (tg) { p.lx = tg.fx; p.ly = tg.fy; }
    const dx = p.lx - p.fx, dy = p.ly - p.fy;
    const d = Math.hypot(dx, dy);
    const step = p.spd * dt;
    if (d <= step + 0.12) {
      if (tg) {
        hurtEnemy(tg, p.dmg);
        if (p.kind === 'ice') { tg.slowF = BLD.shake.slow; tg.slowT = BLD.shake.slowT; }
        spark(p.lx, p.ly);
      }
      projectiles.splice(i, 1);
      continue;
    }
    p.fx += dx / d * step; p.fy += dy / d * step;
  }
  for (let i = zaps.length - 1; i >= 0; i--) { zaps[i].t -= dt; if (zaps[i].t <= 0) zaps.splice(i, 1); }
}
function floatText(txt, fx, fy, color) {
  floats.push({ txt, x: fx * T + T / 2, y: fy * T + T / 2, t: 0, life: 1.4, color: color || '#fff' });
  if (floats.length > 80) floats.shift();
}
function puff(fx, fy, color, n) {
  for (let i = 0; i < (n || 8); i++)
    particles.push({ kind: 'puff', x: fx * T + T / 2, y: fy * T + T / 2, vx: rnd(-30, 30), vy: rnd(-45, -5), t: 0, life: rnd(0.4, 0.8), r: rnd(3, 7), color });
}
function starPuff(fx, fy, n) {
  for (let i = 0; i < n; i++)
    particles.push({ kind: 'star', x: fx * T + T / 2, y: fy * T + T / 2, vx: rnd(-60, 60), vy: rnd(-90, -20), t: 0, life: rnd(0.5, 0.9), r: rnd(3, 6), color: '#ffdf5e', rot: rnd(0, TAU) });
}
function coinPuff(fx, fy) {
  for (let i = 0; i < 4; i++)
    particles.push({ kind: 'coin', x: fx * T + T / 2 + rnd(-8, 8), y: fy * T + T / 2, vx: rnd(-15, 15), vy: rnd(-70, -40), t: 0, life: 0.6, r: 3.5, color: '#ffd100' });
}
function boomPuff(fx, fy) {
  for (let i = 0; i < 14; i++)
    particles.push({ kind: 'boom', x: fx * T + T / 2, y: fy * T + T / 2, vx: rnd(-70, 70), vy: rnd(-70, 30), t: 0, life: rnd(0.3, 0.6), r: rnd(4, 9), color: ['#ff7a2f', '#ffb13d', '#e8432f'][irnd(3)] });
}
function spark(fx, fy) {
  for (let i = 0; i < 3; i++)
    particles.push({ kind: 'spark', x: fx * T + T / 2, y: fy * T + T / 2, vx: rnd(-50, 50), vy: rnd(-50, 10), t: 0, life: 0.25, r: 2, color: '#fff2b0' });
}
function updateFX(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.t += dt;
    if (p.t >= p.life) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 'star' || p.kind === 'coin') p.vy += 160 * dt;
    if (p.kind === 'puff' || p.kind === 'boom') { p.vx *= 0.94; p.vy *= 0.94; }
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.t += dt;
    if (f.t >= f.life) floats.splice(i, 1);
  }
  for (let i = spawnFlashes.length - 1; i >= 0; i--) {
    spawnFlashes[i].t -= dt;
    if (spawnFlashes[i].t <= 0) spawnFlashes.splice(i, 1);
  }
  state.shake = Math.max(0, state.shake - dt);
}
let spawnFlashes = [];

/* ================= 采集 / 工厂 / 修复 ================= */
function updateEconomy(dt) {
  let produced = 0;
  for (const b of buildings) {
    b.hp = Math.min(b.maxhp, b.hp + 8 * dt);          // 全天缓慢修复（昼夜都修，yorg 无此设定但降低挫败）
    if (b.type === 'mine') {
      const s = b.stall;
      if (!s || s.dead) continue;
      const rate = 0.9 * b.lvl;                        // 订单/s
      const take = Math.min(rate * dt, s.amount);
      s.amount -= take;
      b.buffer = Math.min(b.bufCap, b.buffer + take);
      produced += take;
      if (s.amount <= 0) {
        s.dead = true; s.amount = 0;
        floatText('商家打烊了…', b.x + 0.5, b.y, '#ff9a9a');
      }
    }
  }
  // 工厂烧订单产弹药
  const burn = factoryBurn() * dt;
  if (burn > 0 && state.orders > 0) {
    state.orders = Math.max(0, state.orders - burn);
  }
  state.hqAmmo = Math.min(hqAmmoCap(), state.hqAmmo + ammoRate() * dt);
  // 收入统计（滑窗）
  state._incAcc = (state._incAcc || 0) + produced;
  state._incT = (state._incT || 0) + dt;
  if (state._incT >= 5) {
    state.incomeRate = state._incAcc / state._incT;
    state._incAcc = 0; state._incT = 0;
  }
}

/* ================= 主更新 ================= */
function update(dt) {
  state.time += dt;
  updateCamera(dt);
  if (state.phase === 'day') {
    state.dayT -= dt;
    updateEconomy(dt);
    updateTowers(dt);
    updateCouriers(dt);
    updateProjectiles(dt);
    if (state.dayT <= 0) startNight();
  } else if (state.phase === 'night') {
    state.nightT += dt;
    updateEconomy(dt);
    updateTowers(dt);
    while (waveQueue.length && waveQueue[0].at <= state.nightT) {
      const it = waveQueue.shift();
      spawnEnemy(it.type);
    }
    updateEnemies(dt);
    if (state.phase === 'over' || state.phase === 'menu') return;
    updateCouriers(dt);
    updateProjectiles(dt);
    if (waveQueue.length === 0 && enemies.length === 0) endNight();
  }
  updateFX(dt);
}

/* ================= 阶段 ================= */
function startGame() {
  state.phase = 'day'; state.dayT = DAY_LEN;
  spawnAmmoRunner(); spawnAmmoRunner();
  showBanner('第 1 天 · 开业大吉！', '在 🍜商家 旁建采集站 → 袋鼠驮订单 → 弹药厂喂塔');
  renderBoard(state.nightsCleared);
  sfx('dawn');
}
function startNight() {
  state.phase = 'night'; state.nightT = 0;
  waveQueue = makeWave(state.day);
  showBanner('🌙 第 ' + state.day + ' 夜 · 奶龙来袭！', '今晚：' + wavePreview(waveQueue));
  sfx('horn');
  renderBoard(state.nightsCleared);
}
function endNight() {
  const reward = 25 + 10 * state.day;
  state.orders = Math.min(capacity(), state.orders + reward);
  state.totalIncome += reward;
  state.nightsCleared++;
  state.day++;
  state.phase = 'day'; state.dayT = DAY_LEN;
  showBanner('☀️ 第 ' + state.day + ' 天 · 守住了（+' + reward + ORD + ' 补贴）', '扩矿、升级、攒弹药——它们会越来越猛');
  renderBoard(state.nightsCleared);
  sfx('dawn');
}
function destroyHQ(hq) {
  puff(hq.x + 0.5, hq.y + 0.5, '#666', 30);
  state.shake = 0.6;
  gameOver();
}
function gameOver() {
  state.phase = 'over';
  sfx('over');
  saveRun({ days: state.nightsCleared, kills: state.kills, ts: loadRuns().length + 1 });
  const best = loadRuns()[0];
  el.endTitle.textContent = '🏚️ 站点沦陷！';
  el.endTitle.className = 'lose';
  el.endSub.textContent = '本次存活 ' + state.nightsCleared + ' 天' +
    (best && best.days > state.nightsCleared ? ' · 最佳 ' + best.days + ' 天' : ' · 🎉 新纪录！');
  el.stNight.textContent = state.nightsCleared;
  el.stKills.textContent = state.kills;
  el.stEarn.textContent = Math.round(state.totalIncome);
  el.stBuild.textContent = state.built;
  el.endOv.classList.remove('hidden');
  renderBoard();
}

/* ================= 精灵 ================= */
const SPRITES = {}, SPRITE_WHITE = {};
const SPRITE_SRC = {
  nailong: 'assets/nailong.png',
  frog: 'assets/nailaugh.png',
  baoba: 'assets/baoba.png',
  mother: 'assets/s_watermelon.png',
  kangaroo: 'assets/kangaroo.png',
  s_cherry: 'assets/s_cherry.png',
  s_orange: 'assets/s_orange.png',
  s_lemon: 'assets/s_lemon.png',
  s_kiwi: 'assets/s_kiwi.png',
  s_tomato: 'assets/s_tomato.png',
  s_peach: 'assets/s_peach.png',
  s_coconut: 'assets/s_coconut.png',
};
const NAILONG_SKINS = ['nailong', 's_cherry', 's_orange', 's_lemon', 's_kiwi', 's_tomato', 's_peach', 's_coconut'];
const SPRITE_FACES_LEFT = { kangaroo: true };
function loadSprites() {
  for (const k in SPRITE_SRC) {
    const img = new Image();
    img.src = SPRITE_SRC[k];
    SPRITES[k] = img;
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const cx = c.getContext('2d');
      cx.drawImage(img, 0, 0);
      cx.globalCompositeOperation = 'source-in';
      cx.fillStyle = '#fff';
      cx.fillRect(0, 0, c.width, c.height);
      SPRITE_WHITE[k] = c;
    };
  }
}
function spriteReady(k) { const i = SPRITES[k]; return i && i.complete && i.naturalWidth > 0; }
function drawSprite(key, px, py, w, h, dir, t, bobAmp, flash, alphaMul) {
  if (!spriteReady(key)) {
    // 兜底：圆脸占位
    ctx.save();
    ctx.fillStyle = '#ffe45c'; ctx.strokeStyle = '#de9e2a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(px, py - h * 0.5, w * 0.45, h * 0.45, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2b2420';
    ctx.beginPath(); ctx.arc(px - w * 0.15, py - h * 0.55, 2, 0, TAU); ctx.arc(px + w * 0.15, py - h * 0.55, 2, 0, TAU); ctx.fill();
    ctx.restore();
    return true;
  }
  const bob = Math.abs(Math.sin(t * 8)) * bobAmp;
  ctx.save();
  if (alphaMul !== undefined && alphaMul < 1) ctx.globalAlpha *= alphaMul;
  shadow(px, py, w * 0.4);
  ctx.translate(px, py - h * 0.52 - bob);
  ctx.scale(SPRITE_FACES_LEFT[key] ? -dir : dir, 1);
  ctx.drawImage(SPRITES[key], -w / 2, -h / 2, w, h);
  if (flash > 0 && SPRITE_WHITE[key]) {
    ctx.globalAlpha *= Math.min(1, flash * 7);
    ctx.drawImage(SPRITE_WHITE[key], -w / 2, -h / 2, w, h);
  }
  ctx.restore();
  return true;
}
function drawCrown(px, py, s) {
  ctx.save(); ctx.translate(px, py); ctx.scale(s, s);
  ctx.fillStyle = '#ffd100'; ctx.strokeStyle = '#c7a200'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-8, 2); ctx.lineTo(-8, -5); ctx.lineTo(-3.5, -1);
  ctx.lineTo(0, -9); ctx.lineTo(3.5, -1); ctx.lineTo(8, -5); ctx.lineTo(8, 2);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e04545';
  ctx.beginPath(); ctx.arc(0, -2.5, 1.7, 0, TAU); ctx.fill();
  ctx.restore();
}
const ENEMY_SPRITE_H = { nailong: T * 1.7, frog: T * 1.6, baoba: T * 1.9, mother: T * 4.0 };
function drawEnemySprite(e, px, py, attacking, alphaMul) {
  const k = e.skin || (e.type === 'mother' ? 'mother' : e.type);
  let h = ENEMY_SPRITE_H[e.type], w = h;
  if (spriteReady(k)) w = h * SPRITES[k].naturalWidth / SPRITES[k].naturalHeight;
  let bobAmp = e.type === 'frog' ? 3.6 : 2.2;
  const t = e.t * (e.type === 'frog' ? 1.25 : 1);
  if (attacking) { w *= 1 + 0.06 * Math.abs(Math.sin(e.t * 10)); bobAmp *= 1.8; }
  const ok = drawSprite(k, px, py, w, h, e.dir, t, bobAmp, e.flash, alphaMul);
  if (ok && e.type === 'mother') drawCrown(px, py - h * 1.06, 1.5);
  return ok;
}
function drawDeliveryBox(px, py, kind) {
  const ammo = kind === 'ammo';
  ctx.save();
  ctx.translate(px, py);
  ctx.fillStyle = ammo ? '#e8564f' : '#ffd100';
  ctx.strokeStyle = ammo ? '#a3332e' : '#c7a200'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.roundRect(-9, -8, 18, 16, 3); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-9, -1); ctx.lineTo(9, -1); ctx.stroke();
  if (ammo) {
    ctx.fillStyle = '#ffe45c';
    ctx.beginPath();
    ctx.moveTo(-0.5, -6); ctx.lineTo(3.5, -6); ctx.lineTo(0.5, -1.5); ctx.lineTo(3.5, -1.5); ctx.lineTo(-3, 6.5); ctx.lineTo(-1, 0.5); ctx.lineTo(-3.5, 0.5);
    ctx.closePath(); ctx.fill();
  } else {
    ctx.fillStyle = '#7a5c00'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('¥', 0, -1);
  }
  ctx.restore();
}
function drawCourier(px, py, t, dir, boxKind) {
  const h = T * 1.7;
  let w = h;
  if (spriteReady('kangaroo')) w = h * SPRITES.kangaroo.naturalWidth / SPRITES.kangaroo.naturalHeight;
  drawSprite('kangaroo', px, py, w, h, dir, t, 3.2, 0);
  if (boxKind) drawDeliveryBox(px - dir * w * 0.3, py - h * 0.12, boxKind);
}
function shadow(px, py, w) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(px, py + T * 0.3, w, w * 0.36, 0, 0, TAU); ctx.fill();
}

/* ================= 建筑 & 地物绘制 ================= */
function drawStars(px, py, lvl, size) {
  if (lvl <= 1) return;
  ctx.fillStyle = '#ffd100';
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8;
  for (let i = 0; i < lvl - 1; i++) {
    const x = px - (lvl - 2) * size + i * size * 2;
    starPath(x, py, size * 0.75);
    ctx.fill(); ctx.stroke();
  }
}
function starPath(cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * TAU / 5;
    const b = a + TAU / 10;
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.lineTo(cx + Math.cos(b) * r * 0.45, cy + Math.sin(b) * r * 0.45);
  }
  ctx.closePath();
}
function drawStall(s, time) {
  const px = s.x * T + T / 2, py = s.y * T + T / 2;
  if (s.dead) {
    ctx.fillStyle = 'rgba(80,80,80,0.55)';
    ctx.beginPath(); ctx.roundRect(px - T * 0.4, py - T * 0.3, T * 0.8, T * 0.6, 4); ctx.fill();
    ctx.fillStyle = '#ddd'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('打烊', px, py);
    return;
  }
  // 条纹雨棚摊位
  ctx.fillStyle = '#d9c4a3'; ctx.strokeStyle = '#a3865d'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(px - T * 0.42, py - T * 0.24, T * 0.84, T * 0.56, 3); ctx.fill(); ctx.stroke();
  const aw = T * 0.84, ax = px - aw / 2, ay = py - T * 0.4;
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? '#fff' : '#e85d4a';
    ctx.fillRect(ax + (aw / 6) * i, ay, aw / 6, T * 0.18);
  }
  ctx.strokeStyle = '#a3402f'; ctx.strokeRect(ax, ay, aw, T * 0.18);
  ctx.fillStyle = '#8f5b32';
  ctx.fillRect(ax, ay, 2, T * 0.2); ctx.fillRect(ax + aw - 2, ay, 2, T * 0.2);
  ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🍜', px, py + T * 0.08);
  // 余量环
  const f = s.amount / s.max;
  if (s.mine) {
    ctx.strokeStyle = f > 0.35 ? '#7ed957' : '#ffb13d'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(px, py + T * 0.32, 5, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(126,217,87,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py + T * 0.32, 5, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
  }
}
function drawHQ(b) {
  const px = b.x * T + T / 2, py = b.y * T + T / 2;
  const night = state.phase === 'night';
  shadow(px, py, T * 0.62);
  ctx.fillStyle = '#f5f6f8'; ctx.strokeStyle = '#2b2f3a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(px - T * 0.72, py - T * 0.5, T * 1.44, T * 1.05, 5); ctx.fill(); ctx.stroke();
  ctx.save();
  ctx.beginPath(); ctx.roundRect(px - T * 0.72, py - T * 0.5, T * 1.44, T * 0.16, 5); ctx.clip();
  for (let i = -3; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#222' : '#ffd100';
    ctx.save(); ctx.translate(px - T * 0.72 + i * 9, py - T * 0.5); ctx.rotate(0.5); ctx.fillRect(0, -6, 6, 22); ctx.restore();
  }
  ctx.restore();
  ctx.fillStyle = '#1b1c22';
  ctx.beginPath(); ctx.roundRect(px - T * 0.5, py - T * 0.28, T, T * 0.34, 4); ctx.fill();
  ctx.fillStyle = '#ffd100'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('外卖站点', px, py - T * 0.1);
  ctx.fillStyle = night ? '#ffe27a' : '#cfe3f2';
  ctx.fillRect(px - T * 0.56, py + T * 0.14, T * 0.34, T * 0.26);
  ctx.fillRect(px + T * 0.22, py + T * 0.14, T * 0.34, T * 0.26);
  ctx.strokeStyle = '#2b2f3a'; ctx.lineWidth = 1.2;
  ctx.strokeRect(px - T * 0.56, py + T * 0.14, T * 0.34, T * 0.26);
  ctx.strokeRect(px + T * 0.22, py + T * 0.14, T * 0.34, T * 0.26);
  ctx.fillStyle = '#7c5a36';
  ctx.beginPath(); ctx.roundRect(px - T * 0.14, py + T * 0.08, T * 0.28, T * 0.44, 3); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#2b2f3a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(px + T * 0.5, py - T * 0.5); ctx.lineTo(px + T * 0.5, py - T * 0.82); ctx.stroke();
  ctx.fillStyle = (state.time % 1 < 0.5) ? '#ff4d4d' : '#7c2b2b';
  ctx.beginPath(); ctx.arc(px + T * 0.5, py - T * 0.84, 2.6, 0, TAU); ctx.fill();
  drawStars(px, py - T * 0.95, b.lvl, 5);
}
function drawPedestal(px, py) {
  ctx.fillStyle = '#3a3f4a'; ctx.strokeStyle = '#23262e'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(px - T * 0.38, py + T * 0.14, T * 0.76, T * 0.2, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2c3038';
  ctx.beginPath(); ctx.roundRect(px - T * 0.28, py + T * 0.04, T * 0.56, T * 0.12, 3); ctx.fill();
}
function drawTeaTower(b, px, py) {
  drawPedestal(px, py);
  const bump = b.flash > 0 ? 1.08 : 1;
  ctx.save();
  ctx.translate(px, py + T * 0.02);
  ctx.scale(1, bump);
  ctx.fillStyle = '#f6efdc'; ctx.strokeStyle = '#b9a77f'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-T * 0.3, -T * 0.44); ctx.lineTo(T * 0.3, -T * 0.44);
  ctx.lineTo(T * 0.22, T * 0.18); ctx.lineTo(-T * 0.22, T * 0.18);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#5b3a29';
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-T * 0.15 + i * T * 0.1, T * 0.1, 2.6, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#fff8ea';
  ctx.beginPath(); ctx.ellipse(0, -T * 0.44, T * 0.3, T * 0.07, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#e8564f'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(T * 0.08, -T * 0.44); ctx.lineTo(T * 0.22, -T * 0.72); ctx.stroke();
  ctx.restore();
}
function drawShakeTower(b, px, py) {
  drawPedestal(px, py);
  const bump = b.flash > 0 ? 1.08 : 1;
  ctx.save();
  ctx.translate(px, py + T * 0.02);
  ctx.scale(1, bump);
  ctx.fillStyle = '#bfe3ff'; ctx.strokeStyle = '#6f9cc0'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-T * 0.28, -T * 0.4); ctx.lineTo(T * 0.28, -T * 0.4);
  ctx.lineTo(T * 0.2, T * 0.18); ctx.lineTo(-T * 0.2, T * 0.18);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e8f5ff';
  ctx.beginPath(); ctx.ellipse(0, -T * 0.4, T * 0.28, T * 0.06, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(0, -T * 0.5, 4.6, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(-5.6, -T * 0.48, 3.6, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(5.6, -T * 0.48, 3.6, 0, TAU); ctx.fill();
  ctx.restore();
}
function drawHotpotTower(b, px, py) {
  drawPedestal(px, py);
  const bump = b.flash > 0 ? 1.06 : 1;
  ctx.save();
  ctx.translate(px, py + T * 0.02);
  ctx.scale(bump, bump);
  ctx.fillStyle = '#8c2f2f'; ctx.strokeStyle = '#571c1c'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-T * 0.34, -T * 0.24); ctx.lineTo(T * 0.34, -T * 0.24);
  ctx.lineTo(T * 0.24, T * 0.18); ctx.lineTo(-T * 0.24, T * 0.18);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#571c1c'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-T * 0.34, -T * 0.16); ctx.lineTo(-T * 0.46, -T * 0.16); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(T * 0.34, -T * 0.16); ctx.lineTo(T * 0.46, -T * 0.16); ctx.stroke();
  ctx.fillStyle = '#ff7a2f';
  ctx.beginPath(); ctx.ellipse(0, -T * 0.24, T * 0.32, T * 0.08, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#571c1c'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.fillStyle = '#ffc46b';
  for (let i = 0; i < 3; i++) {
    const bt = (state.time * 0.8 + i * 0.33) % 1;
    ctx.globalAlpha = 1 - bt;
    ctx.beginPath(); ctx.arc(-T * 0.16 + i * T * 0.15, -T * 0.26 - bt * 6, 1.8 + bt * 1.6, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
function drawTeslaTower(b, px, py) {
  drawPedestal(px, py);
  const bump = b.flash > 0 ? 1.08 : 1;
  ctx.save();
  ctx.translate(px, py + T * 0.02);
  ctx.scale(1, bump);
  ctx.fillStyle = '#7a828e'; ctx.strokeStyle = '#4a505a'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-T * 0.14, T * 0.16); ctx.lineTo(T * 0.14, T * 0.16);
  ctx.lineTo(T * 0.2, -T * 0.36); ctx.lineTo(-T * 0.2, -T * 0.36);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  const glow = b.ammo > 0 ? (0.5 + 0.5 * Math.sin(state.time * 6)) : 0.15;
  ctx.fillStyle = '#e8edf4'; ctx.strokeStyle = '#4a505a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, -T * 0.46, T * 0.14, 0, TAU); ctx.fill(); ctx.stroke();
  if (b.ammo > 0) {
    ctx.strokeStyle = 'rgba(255,228,92,' + (0.4 + glow * 0.5) + ')'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      const a = state.time * 7 + i * TAU / 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * T * 0.14, -T * 0.46 + Math.sin(a) * T * 0.14);
      ctx.lineTo(Math.cos(a) * T * 0.3, -T * 0.46 + Math.sin(a) * T * 0.28);
      ctx.stroke();
    }
  }
  ctx.restore();
}
function drawWall(b, px, py) {
  shadow(px, py, T * 0.42);
  const boxes = 1 + b.lvl;
  for (let i = 0; i < boxes; i++) {
    const w = T * (0.8 - i * 0.08), h = T * 0.34;
    const yy = py + T * 0.3 - i * h - h / 2;
    ctx.fillStyle = '#ffd100'; ctx.strokeStyle = '#c7a200'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.roundRect(px - w / 2, yy - h / 2, w, h, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffe66b';
    ctx.beginPath(); ctx.roundRect(px - w / 2 + 2, yy - h / 2 + 2, w - 4, 6, 2); ctx.fill();
  }
}
function drawMine(b, px, py) {
  ctx.strokeStyle = '#8f5b32'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(px + T * 0.34, py + T * 0.3); ctx.lineTo(px + T * 0.34, py - T * 0.3); ctx.stroke();
  const wave = Math.sin(state.time * 5 + b.id) * 2;
  ctx.fillStyle = '#ffd100'; ctx.strokeStyle = '#c7a200'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px + T * 0.34, py - T * 0.3);
  ctx.lineTo(px + T * 0.34 + 12, py - T * 0.26 + wave);
  ctx.lineTo(px + T * 0.34, py - T * 0.18);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // 缓冲条
  if (b.buffer > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(px - 10, py + T * 0.38, 20, 3);
    ctx.fillStyle = '#7ed957';
    ctx.fillRect(px - 10, py + T * 0.38, 20 * clamp(b.buffer / b.bufCap, 0, 1), 3);
  }
}
function drawWare(b, px, py) {
  shadow(px, py, T * 0.5);
  for (let i = 0; i < 2 + b.lvl; i++) {
    const w = T * (0.72 - (i % 2) * 0.1), h = T * 0.3;
    const xx = px + (i % 2 ? 4 : -4), yy = py + T * 0.3 - Math.floor(i / 2) * h - h / 2 - (i % 2 ? 0 : 2);
    ctx.fillStyle = '#ffb13d'; ctx.strokeStyle = '#c77d1e'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.roundRect(xx - w / 2, yy - h / 2, w, h, 3); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(xx - w / 2, yy); ctx.lineTo(xx + w / 2, yy); ctx.stroke();
  }
  ctx.fillStyle = '#7a4c00'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('仓储', px, py + T * 0.42);
}
function drawFactory(b, px, py) {
  shadow(px, py, T * 0.5);
  ctx.fillStyle = '#c9564f'; ctx.strokeStyle = '#8f332e'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(px - T * 0.42, py - T * 0.2, T * 0.84, T * 0.6, 4); ctx.fill(); ctx.stroke();
  // 锯齿屋顶
  ctx.fillStyle = '#8f332e';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(px - T * 0.42 + i * T * 0.28, py - T * 0.2);
    ctx.lineTo(px - T * 0.28 + i * T * 0.28, py - T * 0.42);
    ctx.lineTo(px - T * 0.14 + i * T * 0.28, py - T * 0.2);
    ctx.closePath(); ctx.fill();
  }
  // 烟囱+烟
  ctx.fillStyle = '#666';
  ctx.fillRect(px + T * 0.2, py - T * 0.55, T * 0.14, T * 0.3);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
  const st = state.time * 2 + b.id;
  ctx.beginPath(); ctx.arc(px + T * 0.27, py - T * 0.62 - (st % 1) * 6, 2.5 + (st % 1) * 2, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#ffe45c'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('⚡弹药', px, py + T * 0.28);
  drawStars(px, py - T * 0.6, b.lvl, 4);
}
function drawBuilding(b, ghost) {
  const px = b.x * T + T / 2, py = b.y * T + T / 2;
  if (ghost) ctx.globalAlpha = 0.6;
  switch (b.type) {
    case 'hq': drawHQ(b); break;
    case 'mine': drawMine(b, px, py); break;
    case 'wall': drawWall(b, px, py); break;
    case 'tea': drawTeaTower(b, px, py); break;
    case 'shake': drawShakeTower(b, px, py); break;
    case 'hotpot': drawHotpotTower(b, px, py); break;
    case 'tesla': drawTeslaTower(b, px, py); break;
    case 'ware': drawWare(b, px, py); break;
    case 'factory': drawFactory(b, px, py); break;
  }
  ctx.globalAlpha = 1;
  if (!ghost) {
    if (b.hp < b.maxhp || selected === b) {
      const w = 22;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(px - w / 2, py - T * 0.85, w, 4);
      ctx.fillStyle = b.hp / b.maxhp > 0.4 ? '#7ed957' : '#ff6b5f';
      ctx.fillRect(px - w / 2, py - T * 0.85, w * clamp(b.hp / b.maxhp, 0, 1), 4);
    }
    if (isTower(b)) {
      const w = 22;
      const yy = py - T * 0.85 + (b.hp < b.maxhp || selected === b ? 5 : 0);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(px - w / 2, yy, w, 3);
      ctx.fillStyle = b.ammo > 0 ? '#6fc7ff' : '#ff4d4d';
      ctx.fillRect(px - w / 2, yy, w * clamp(b.ammo / b.maxammo, 0, 1), 3);
      if (b.ammo <= 0 && state.phase === 'night') {
        ctx.fillStyle = (state.time % 0.8 < 0.4) ? '#ff5f5f' : '#ffd7d7';
        ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('缺弹！', px, py - T * 0.98);
      }
    }
    if (b.lvl > 1 && b.type !== 'wall') drawStars(px, py - T * 0.78 - (isTower(b) ? 6 : 0), b.lvl, 4);
    if (selected === b) {
      ctx.strokeStyle = '#ffe45c'; ctx.lineWidth = 2.4;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(b.x * T + 2, b.y * T + 2, T - 4, T - 4);
      ctx.setLineDash([]);
      if (isTower(b)) {
        ctx.strokeStyle = 'rgba(255,228,92,0.55)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(px, py, rangeOf(b) * T, 0, TAU); ctx.stroke();
      }
    }
  }
}

/* ================= 主绘制 ================= */
function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#3c4a30';
  ctx.fillRect(0, 0, VIEW, VIEW);
  if (state.shake > 0) {
    ctx.translate(rnd(-1, 1) * state.shake * 8, rnd(-1, 1) * state.shake * 8);
  }
  ctx.save();
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
  const vw = VIEW / cam.zoom, vh = VIEW / cam.zoom;
  const vx0 = cam.x - T, vy0 = cam.y - T, vx1 = cam.x + vw + T, vy1 = cam.y + vh + T;
  // 地面（预渲染）
  if (terrainCanvas) {
    const sx = clamp(cam.x, 0, Math.max(0, WORLD - vw));
    const sy = clamp(cam.y, 0, Math.max(0, WORLD - vh));
    ctx.drawImage(terrainCanvas, sx, sy, vw, vh, sx, sy, vw, vh);
  }
  // 商家（可见的）
  const placingMine = placing === 'mine';
  for (const s of stallSpots) {
    if (s.x * T < vx0 || s.x * T > vx1 || s.y * T < vy0 || s.y * T > vy1) continue;
    drawStall(s, state.time);
    if (placingMine && !s.dead && !s.reserved) {
      const pulse = 0.4 + 0.3 * Math.sin(state.time * 5);
      ctx.strokeStyle = 'rgba(255,228,92,' + pulse + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(s.x * T + T / 2, s.y * T + T / 2, T * 0.62, 0, TAU); ctx.stroke();
    }
  }
  // 建筑
  const bs = buildings.filter(b => b.x * T + T > vx0 && b.x * T < vx1 && b.y * T + T > vy0 && b.y * T < vy1);
  bs.sort((a, b) => a.y - b.y);
  for (const b of bs) drawBuilding(b, false);
  // 夜幕（压地面和建筑）
  const na = nightAlpha();
  if (na > 0) {
    ctx.fillStyle = 'rgba(16,20,88,' + na + ')';
    ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    const hq = hqB();
    if (hq) {
      const g = ctx.createRadialGradient(hq.x * T + T / 2, hq.y * T + T / 2, 10, hq.x * T + T / 2, hq.y * T + T / 2, 170);
      g.addColorStop(0, 'rgba(255,226,122,' + (na * 0.5) + ')');
      g.addColorStop(1, 'rgba(255,226,122,0)');
      ctx.fillStyle = g;
      ctx.fillRect(hq.x * T - 180, hq.y * T - 180, 360, 360);
    }
  }
  // 袋鼠
  for (const c of couriers) {
    if (c.fx * T < vx0 || c.fx * T > vx1 || c.fy * T < vy0 || c.fy * T > vy1) continue;
    const px = c.fx * T + T / 2, py = c.fy * T + T / 2;
    const hasBox = (c.kind === 'money' && c.mode === 'go') || (c.kind === 'ammo' && c.mode === 'go');
    drawCourier(px, py, c.t || 0, c.dir, hasBox ? (c.kind === 'ammo' ? 'ammo' : 'money') : null);
    if (c.warn > 0) {
      ctx.fillStyle = (state.time % 0.6 < 0.3) ? '#ffdf5e' : '#ff9a3d';
      ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('⚠', px, py - T * 0.9);
    }
  }
  // 敌人
  const es = enemies.filter(e => e.fx * T > vx0 - 40 && e.fx * T < vx1 + 40 && e.fy * T > vy0 - 40 && e.fy * T < vy1 + 40);
  es.sort((a, b) => a.fy - b.fy);
  for (const e of es) {
    const px = e.fx * T + T / 2, py = e.fy * T + T / 2;
    const attacking = e.tb && dist(e.tb.x + 0.5, e.tb.y + 0.5, e.fx, e.fy) < 1.0;
    const alphaMul = e.spawnT > 0 ? 0.6 : 1;
    drawEnemySprite(e, px, py, attacking, alphaMul);
    // 血条
    if (e.hp < e.maxhp || e.type === 'mother') {
      const w = e.type === 'mother' ? 60 : 20;
      const yy = e.type === 'mother' ? py - ENEMY_SPRITE_H.mother * T / T * 1.0 - 14 : py - (ENEMY_SPRITE_H[e.type] || T * 1.4) - 8;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(px - w / 2, yy, w, 4);
      ctx.fillStyle = e.hp / e.maxhp > 0.4 ? '#ff8f6b' : '#ff4d4d';
      ctx.fillRect(px - w / 2, yy, w * clamp(e.hp / e.maxhp, 0, 1), 4);
    }
  }
  // 弹道
  for (const p of projectiles) {
    if (p.kind === 'lob') {
      const px = lerp(p.x0, p.x1, p.t) * T + T / 2;
      const py = lerp(p.y0, p.y1, p.t) * T + T / 2 - Math.sin(Math.PI * p.t) * 26;
      ctx.fillStyle = '#ff7a2f'; ctx.strokeStyle = '#a3332e'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(px, py, 5.4, 0, TAU); ctx.fill(); ctx.stroke();
    } else if (p.kind === 'pearl') {
      const px = p.fx * T + T / 2, py = p.fy * T + T / 2;
      ctx.fillStyle = 'rgba(91,58,41,0.35)';
      ctx.beginPath(); ctx.arc(px, py, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5b3a29';
      ctx.beginPath(); ctx.arc(px, py, 5, 0, TAU); ctx.fill();
    } else {
      const px = p.fx * T + T / 2, py = p.fy * T + T / 2;
      ctx.fillStyle = 'rgba(150,220,255,0.35)';
      ctx.beginPath(); ctx.arc(px, py, 8.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#d8f2ff';
      ctx.beginPath(); ctx.arc(px, py, 4.8, 0, TAU); ctx.fill();
    }
  }
  // 闪电
  for (const z of zaps) {
    ctx.globalAlpha = clamp(z.t / 0.14, 0, 1);
    for (const pass of [[6, 'rgba(255,228,92,0.5)'], [2.2, '#fff']]) {
      ctx.strokeStyle = pass[1]; ctx.lineWidth = pass[0]; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < z.pts.length - 1; i++) {
        const a = z.pts[i], b = z.pts[i + 1];
        const ax = a.x * T + T / 2, ay = a.y * T + T / 2, bx = b.x * T + T / 2, by = b.y * T + T / 2;
        ctx.moveTo(ax, ay);
        for (let s = 1; s <= 4; s++) {
          const tt = s / 4;
          const jx = (s === 4) ? 0 : rnd(-4, 4);
          const jy = (s === 4) ? 0 : rnd(-4, 4);
          ctx.lineTo(lerp(ax, bx, tt) + jx, lerp(ay, by, tt) + jy);
        }
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // 粒子
  for (const p of particles) {
    const a = 1 - p.t / p.life;
    ctx.globalAlpha = a;
    if (p.kind === 'star') {
      ctx.fillStyle = p.color;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot + p.t * 6);
      starPath(0, 0, p.r); ctx.fill(); ctx.restore();
    } else if (p.kind === 'coin') {
      ctx.fillStyle = p.color; ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * Math.abs(Math.cos(p.t * 12)), 0, 0, TAU); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.kind === 'spark' ? p.r : p.r * (1 + p.t * 2), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // 飘字
  ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of floats) {
    if (f.x < vx0 || f.x > vx1 || f.y < vy0 || f.y > vy1) continue;
    const a = f.t < 0.15 ? f.t / 0.15 : 1 - Math.max(0, (f.t - 0.8) / 0.6);
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3;
    ctx.strokeText(f.txt, f.x, f.y - f.t * 22);
    ctx.fillStyle = f.color;
    ctx.fillText(f.txt, f.x, f.y - f.t * 22);
    ctx.globalAlpha = 1;
  }
  // 出怪预警
  for (const sf of spawnFlashes) {
    const a = sf.t / 0.8;
    ctx.strokeStyle = 'rgba(255,80,80,' + a * 0.9 + ')';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(sf.x * T + T / 2, sf.y * T + T / 2, T * (1.4 - a), 0, TAU); ctx.stroke();
  }
  // 建造鬼影
  if (placing && hover && (state.phase === 'day' || state.phase === 'night')) {
    const ok = canPlace(placing, hover.x, hover.y) && state.orders >= BLD[placing].cost;
    const afford = state.orders >= BLD[placing].cost;
    ctx.fillStyle = ok && afford ? 'rgba(126,217,87,0.4)' : 'rgba(255,95,95,0.4)';
    ctx.fillRect(hover.x * T + 1, hover.y * T + 1, T - 2, T - 2);
    const ghostB = { id: 9999, x: hover.x, y: hover.y, type: placing, lvl: 1, hp: 1, maxhp: 1, ammo: BLD[placing].ammo || 0, maxammo: BLD[placing].ammo || 0, flash: 0, invested: 0, cool: 0, t: 0, buffer: 0, bufCap: 0, stall: placing === 'mine' ? stalls.get(key(hover.x, hover.y)) : null };
    drawBuilding(ghostB, true);
    if (BLD[placing].range) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.6;
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.arc(hover.x * T + T / 2, hover.y * T + T / 2, BLD[placing].range * T, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (!afford) {
      ctx.fillStyle = '#ff5f5f'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('📦不足', hover.x * T + T / 2, hover.y * T - 4);
    }
  }
  ctx.restore();
  // ---- 屏幕空间：小地图 ----
  drawMinimap();
  // 暗角
  if (na > 0) {
    const g = ctx.createRadialGradient(VIEW / 2, VIEW / 2, VIEW * 0.35, VIEW / 2, VIEW / 2, VIEW * 0.75);
    g.addColorStop(0, 'rgba(0,0,10,0)');
    g.addColorStop(1, 'rgba(0,0,10,' + na * 0.8 + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW, VIEW);
  }
}
function nightAlpha() {
  if (state.phase === 'night') return Math.min(0.48, 0.18 + state.nightT * 0.24);
  if (state.phase === 'day' && state.dayT > DAY_LEN - 2) return (DAY_LEN - state.dayT) / 2 * -0.48 + 0.48;
  return 0;
}
function drawMinimap() {
  const S = 148, pad = 10;
  const mx = pad, my = VIEW - S - pad;
  minimapRect = { x: mx, y: my, w: S, h: S };
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = 'rgba(20,24,16,0.85)';
  ctx.strokeStyle = '#454a3a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(mx - 3, my - 3, S + 6, S + 6, 8); ctx.fill(); ctx.stroke();
  const sc = S / (N * T);
  ctx.drawImage(terrainCanvas, mx, my, S, S);
  // 商家
  for (const s of stallSpots) {
    ctx.fillStyle = s.dead ? '#666' : '#ffd100';
    ctx.fillRect(mx + s.x * T * sc - 1, my + s.y * T * sc - 1, 2.4, 2.4);
  }
  // 建筑
  for (const b of buildings) {
    ctx.fillStyle = b.type === 'hq' ? '#ff5f5f' : (isTower(b) ? '#6fc7ff' : '#f0f0f0');
    ctx.fillRect(mx + b.x * T * sc - 1.5, my + b.y * T * sc - 1.5, 3.6, 3.6);
  }
  // 敌人
  ctx.fillStyle = '#a96fd6';
  for (const e of enemies) ctx.fillRect(mx + e.fx * T * sc - 1, my + e.fy * T * sc - 1, 2.2, 2.2);
  // 视口框
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2;
  ctx.strokeRect(mx + cam.x * sc, my + cam.y * sc, VIEW / cam.zoom * sc, VIEW / cam.zoom * sc);
  ctx.restore();
}

/* ================= HUD / UI ================= */
function updateHUD() {
  el.orders.textContent = Math.floor(state.orders);
  el.cap.textContent = '/ ' + capacity();
  el.income.textContent = (state.incomeRate || 0).toFixed(1) + ' 单/s · 弹药 ' + Math.floor(state.hqAmmo) + '/' + hqAmmoCap() + ' (+' + ammoRate().toFixed(1) + '/s)';
  const hq = hqB();
  if (hq) {
    el.hqBar.style.width = clamp(hq.hp / hq.maxhp * 100, 0, 100) + '%';
    el.hqHp.textContent = Math.ceil(hq.hp) + '/' + hq.maxhp;
  } else {
    el.hqBar.style.width = '0%';
    el.hqHp.textContent = '已沦陷';
  }
  el.dayNum.textContent = state.day;
  if (state.phase === 'day') {
    el.phase.textContent = '☀️ 白天 ' + Math.ceil(state.dayT) + 's';
    el.skip.style.display = '';
  } else if (state.phase === 'night') {
    el.phase.textContent = '🌙 第 ' + state.day + ' 夜 · 来敌 ' + (enemies.length + waveQueue.length);
    el.skip.style.display = 'none';
  } else {
    el.phase.textContent = '';
    el.skip.style.display = 'none';
  }
  for (const t of BUILD_ORDER) cardEls[t].classList.toggle('poor', state.orders < BLD[t].cost);
  updateHint();
}
let bannerTimer = null;
function showBanner(title, sub) {
  el.banner.querySelector('h2').textContent = title;
  el.banner.querySelector('p').textContent = sub || '';
  el.banner.classList.remove('show');
  void el.banner.offsetWidth;
  el.banner.classList.add('show');
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.banner.classList.remove('show'), 5000);
}
let lastHint = '';
function updateHint() {
  let h = '';
  if (state.phase === 'day') {
    if (state.day === 1 && state.built === 0) h = '👋 拖动/WASD 移动镜头，滚轮缩放；按【1】把采集站建到发光的 🍜商家 上';
    else if (state.built > 0 && !buildings.some(b => isTower(b))) h = '👍 订单到账！按【3】建奶茶塔守站点，【7】仓库扩容，【8】弹药厂产弹';
    else if (state.day === 1) h = '💡 夜里奶龙从四周压来：保温墙【2】挡路，塔在后头输出，右下小地图看全景';
  }
  if (h === lastHint) return;
  lastHint = h;
  if (h) { el.hint.textContent = h; el.hint.style.display = 'block'; }
  else el.hint.style.display = 'none';
}
const cardEls = {};
function buildBuildbar() {
  BUILD_ORDER.forEach((t, i) => {
    const cfg = BLD[t];
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<span class="key">' + (i + 1) + '</span><div class="ico">' + cfg.emoji + '</div><div class="nm">' + cfg.name + '</div><div class="pr">📦' + cfg.cost + '</div>';
    card.addEventListener('click', () => selectPlacing(t));
    card.addEventListener('mouseenter', e => showTip(e.target, '<b>' + cfg.emoji + ' ' + cfg.name + '（📦' + cfg.cost + '）</b><div class="d">' + cfg.desc + '</div>'));
    card.addEventListener('mouseleave', hideTip);
    el.buildbar.appendChild(card);
    cardEls[t] = card;
  });
  const sell = document.createElement('div');
  sell.className = 'card';
  sell.innerHTML = '<span class="key">X</span><div class="ico">🗑️</div><div class="nm">出售</div><div class="pr">回收60%</div>';
  sell.addEventListener('click', () => { sellMode = !sellMode; placing = null; syncBar(); sfx('click'); });
  sell.addEventListener('mouseenter', e => showTip(e.target, '<b>🗑️ 出售模式</b><div class="d">点击建筑回收 60% 订单。右键/Esc 取消。</div>'));
  sell.addEventListener('mouseleave', hideTip);
  el.buildbar.appendChild(sell);
  cardEls.__sell = sell;
}
function selectPlacing(t) {
  placing = placing === t ? null : t;
  sellMode = false;
  selected = null; closePanel();
  syncBar(); sfx('click');
}
function syncBar() {
  for (const t of BUILD_ORDER) cardEls[t].classList.toggle('sel', placing === t);
  cardEls.__sell.classList.toggle('sel', sellMode);
}
function showTip(node, html) {
  el.tip.innerHTML = html;
  el.tip.style.display = 'block';
  const r = node.getBoundingClientRect();
  el.tip.style.left = Math.min(window.innerWidth - 250, r.left) + 'px';
  el.tip.style.top = (r.top - el.tip.offsetHeight - 8) + 'px';
}
function hideTip() { el.tip.style.display = 'none'; }
function selectB(b) {
  selected = b; sellMode = false; placing = null; syncBar();
  refreshPanel(); sfx('click');
}
function closePanel() { el.panel.style.display = 'none'; }
function refreshPanel() {
  const b = selected;
  if (!b) { closePanel(); return; }
  el.panel.style.display = 'block';
  const cfg = BLD[b.type];
  if (b.type === 'hq') {
    el.ipName.textContent = '🏚️ 外卖站点';
    el.ipLv.textContent = '大本营 · Lv.' + b.lvl;
    el.ipHp.textContent = Math.ceil(b.hp) + ' / ' + b.maxhp;
    el.ipHpBar.style.width = clamp(b.hp / b.maxhp * 100, 0, 100) + '%';
    el.ipStat.textContent = '容量 +' + (200 * (b.lvl - 1)) + ' · 弹药上限 ' + hqAmmoCap();
    el.upBtn.textContent = b.lvl >= 3 ? '已满级' : '⬆ 升级 📦' + upCost(b);
    el.upBtn.disabled = b.lvl >= 3;
    el.sellBtn2.style.display = 'none';
    return;
  }
  el.sellBtn2.style.display = '';
  el.ipName.textContent = cfg.emoji + ' ' + cfg.name;
  el.ipLv.textContent = 'Lv.' + b.lvl + (b.lvl >= 3 ? ' · 满级' : '');
  el.ipHp.textContent = Math.ceil(b.hp) + ' / ' + b.maxhp;
  el.ipHpBar.style.width = clamp(b.hp / b.maxhp * 100, 0, 100) + '%';
  if (b.type === 'mine') {
    el.ipStat.textContent = '.buffer ' + Math.floor(b.buffer) + '/' + b.bufCap + ' · 产 0.9×' + b.lvl + '/s · 余单 ' + (b.stall ? Math.max(0, b.stall.amount) : 0);
  } else if (isTower(b)) {
    el.ipStat.textContent = '伤' + Math.round(cfg.dmg * dmgMul(b)) + ' · ' + cfg.rate.toFixed(1) + '/s · 弹 ' + b.ammo + '/' + b.maxammo;
  } else if (b.type === 'ware') {
    el.ipStat.textContent = '容量 +250 · 就近卸货点';
  } else if (b.type === 'factory') {
    el.ipStat.textContent = '烧 0.5订单/s → +1.0弹药/s';
  } else {
    el.ipStat.textContent = '耐久砖墙';
  }
  el.upBtn.textContent = b.lvl >= 3 ? '已满级' : '⬆ 升级 📦' + upCost(b);
  el.upBtn.disabled = b.lvl >= 3;
}
el.upBtn.addEventListener('click', () => { if (selected) upgrade(selected); });
el.sellBtn2.addEventListener('click', () => { if (selected) sellB(selected); });
el.skip.addEventListener('click', () => { if (state.phase === 'day') { state.dayT = 0.01; sfx('click'); } });
el.pause.addEventListener('click', () => {
  state.paused = !state.paused;
  el.pause.textContent = state.paused ? '▶' : '⏸';
  sfx('click');
});
el.speed.addEventListener('click', () => {
  state.speedIdx = (state.speedIdx + 1) % SPEEDS.length;
  el.speed.textContent = '⏩' + SPEEDS[state.speedIdx] + 'x';
  sfx('click');
});
el.sound.addEventListener('click', () => {
  muted = !muted;
  try { localStorage.setItem('nailong_mute', muted ? '1' : '0'); } catch (e) {}
  el.sound.textContent = muted ? '🔇' : '🔊';
  if (!muted) sfx('click');
});
el.help.addEventListener('click', () => {
  el.startBtn.textContent = '返回游戏 ▶';
  el.startOv.classList.remove('hidden');
  state.paused = true;
  sfx('click');
});
el.startBtn.addEventListener('click', () => {
  audioCtx();
  el.startOv.classList.add('hidden');
  state.paused = false;
  if (state.phase === 'menu') startGame();
  sfx('click');
});
el.restartBtn.addEventListener('click', () => location.reload());

/* ================= 输入 ================= */
function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  const sx = (e.clientX - r.left) / r.width * VIEW;
  const sy = (e.clientY - r.top) / r.height * VIEW;
  return { sx, sy };
}
canvas.addEventListener('mousemove', e => {
  const { sx, sy } = canvasPos(e);
  // 小地图悬停不设置世界 hover
  if (minimapRect && sx >= minimapRect.x && sx <= minimapRect.x + minimapRect.w && sy >= minimapRect.y && sy <= minimapRect.y + minimapRect.h) { hover = null; return; }
  const w = screenToWorld(sx, sy);
  const tx = Math.floor(w.x / T), ty = Math.floor(w.y / T);
  hover = (tx >= 0 && ty >= 0 && tx < N && ty < N) ? { x: tx, y: ty } : null;
});
canvas.addEventListener('mouseleave', () => { hover = null; });
canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  placing = null; sellMode = false; selected = null; closePanel(); syncBar();
});
let dragging = false, dragMoved = 0, dragLast = null;
canvas.addEventListener('mousedown', e => {
  audioCtx();
  if (state.phase === 'menu' || state.phase === 'over') return;
  const { sx, sy } = canvasPos(e);
  if (e.button === 0) {
    // 小地图点击 → 跳转镜头
    if (minimapRect && sx >= minimapRect.x && sx <= minimapRect.x + minimapRect.w && sy >= minimapRect.y && sy <= minimapRect.y + minimapRect.h) {
      const fx = (sx - minimapRect.x) / minimapRect.w * WORLD;
      const fy = (sy - minimapRect.y) / minimapRect.h * WORLD;
      cam.x = fx - VIEW / (2 * cam.zoom); cam.y = fy - VIEW / (2 * cam.zoom);
      clampCam(); sfx('click');
      return;
    }
    dragging = true; dragMoved = 0; dragLast = { sx, sy };
  }
});
window.addEventListener('mousemove', e => {
  if (!dragging) return;
  const r = canvas.getBoundingClientRect();
  const sx = (e.clientX - r.left) / r.width * VIEW;
  const sy = (e.clientY - r.top) / r.height * VIEW;
  const dx = sx - dragLast.sx, dy = sy - dragLast.sy;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  if (dragMoved > 6) {
    cam.x -= dx / cam.zoom; cam.y -= dy / cam.zoom;
    clampCam();
  }
  dragLast = { sx, sy };
});
window.addEventListener('mouseup', e => {
  if (!dragging) return;
  dragging = false;
  if (e.target !== canvas || dragMoved > 6) return;
  if (state.phase === 'menu' || state.phase === 'over') return;
  const { sx, sy } = canvasPos(e);
  const w = screenToWorld(sx, sy);
  const tx = Math.floor(w.x / T), ty = Math.floor(w.y / T);
  if (tx < 0 || ty < 0 || tx >= N || ty >= N) return;
  const b = grid[ty][tx];
  if (placing) { tryPlace(placing, tx, ty); return; }
  if (sellMode && b) {
    if (b.type === 'hq') { floatText('站点不能卖！', tx + 0.5, ty, '#ff8080'); sfx('error'); return; }
    sellB(b); return;
  }
  if (b) selectB(b);
  else { selected = null; closePanel(); }
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  cam.zoom = e.deltaY < 0 ? ZOOMS[0] : ZOOMS[1] || ZOOMS[0];
  cam.zoom = e.deltaY < 0 ? Math.max(ZOOMS[ZOOMS.length - 1], cam.zoom - 0) : Math.min(ZOOMS[0], cam.zoom + 0);
  cam.zoom = e.deltaY < 0 ? ZOOMS[0] : ZOOMS[1];
  clampCam();
}, { passive: false });
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  keysDown[k] = true;
  if (k >= '1' && k <= '8') {
    const t = BUILD_ORDER[+k - 1];
    if (t) selectPlacing(t);
  } else if (k === 'x') {
    sellMode = !sellMode; placing = null; selected = null; closePanel(); syncBar(); sfx('click');
  } else if (k === 'escape') {
    placing = null; sellMode = false; selected = null; closePanel(); syncBar();
  } else if (k === ' ') {
    e.preventDefault();
    state.paused = !state.paused;
    el.pause.textContent = state.paused ? '▶' : '⏸';
  }
});
window.addEventListener('keyup', e => { keysDown[e.key.toLowerCase()] = false; });

/* ================= 主循环 ================= */
let last = performance.now();
let lastFrameAt = performance.now();
function frame(now) {
  lastFrameAt = performance.now();
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!state.paused && (state.phase === 'day' || state.phase === 'night')) {
    for (let i = 0; i < SPEEDS[state.speedIdx]; i++) update(dt);
  } else {
    updateCamera(dt);
    updateFX(dt);
  }
  draw();
  updateHUD();
  requestAnimationFrame(frame);
}
setInterval(() => {
  if (performance.now() - lastFrameAt > 300) frame(performance.now());
}, 33);

/* ================= 调试接口 ================= */
window.G = {
  get state() { return state; },
  get buildings() { return buildings; },
  get enemies() { return enemies; },
  get couriers() { return couriers; },
  get stalls() { return stallSpots; },
  cam(x, y, z) { if (x !== undefined) { cam.x = x; cam.y = y; } if (z) cam.zoom = z; return { x: cam.x, y: cam.y, zoom: cam.zoom }; },
  orders(n) { state.orders += n; },
  place(x, y, t) { tryPlace(t, x, y, true); return buildings.find(b => b.x === x && b.y === y && b.type === t); },
  night() { if (state.phase === 'day') state.dayT = 0.01; },
  clearNight() { waveQueue.length = 0; enemies.length = 0; },
  endNight() { endNight(); },
  spawn(type, x, y) { const e = spawnEnemy(type); if (e && x !== undefined) { e.fx = x; e.fy = y; } return e; },
  hq() { return hqB(); },
  step(dt, skipDraw) { update(dt); if (!skipDraw) { draw(); updateHUD(); } },
  sprites() { return Object.keys(SPRITES).map(k => k + ':' + spriteReady(k)); },
};

/* ================= 启动 ================= */
genWorld();
buildBuildbar();
loadSprites();
el.sound.textContent = muted ? '🔇' : '🔊';
el.speed.textContent = '⏩1x';
const runs = loadRuns();
el.best.textContent = runs.length
  ? '🏆 历史最佳：存活 ' + runs[0].days + ' 天（共 ' + runs.length + ' 局）'
  : '提示：WASD/拖动 移动镜头 · 滚轮缩放 · 数字键 1-8 建造 · 空格暂停';
renderBoard();
requestAnimationFrame(frame);

})();
