/* =====================================================================
 * 奶龙围城 · 袋鼠外卖保卫战  (YORG.io 玩法魔改版)
 * 白天：采集站(外卖商家) → 美团袋鼠送餐赚钱 + 给塔送弹药
 * 夜晚：奶龙 / 大笑奶蛙 / 暴暴龙 / 奶蛙之母 来袭，守 15 夜
 * 纯 Canvas 手绘角色，无外部资源，双击 index.html 即玩
 * =================================================================== */
(function () {
'use strict';

/* ================= 常量 ================= */
const TAU = Math.PI * 2;
const T = 26;                 // 每格像素（逻辑）
const N = 30;                 // 地图 N*N 格
const W = N * T, H = N * T;   // 画布逻辑尺寸 780x780
const DAY_LEN = 50;           // 白天秒数
const MAX_NIGHT = 15;         // 胜利夜晚
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/* ================= DOM ================= */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const dpr = Math.min(2, window.devicePixelRatio || 1);
canvas.width = W * dpr; canvas.height = H * dpr;

const el = {
  money: document.getElementById('uiMoney'),
  ammo: document.getElementById('uiAmmo'),
  hqBar: document.getElementById('hqHpBar'),
  hqHp: document.getElementById('uiHqHp'),
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
  endlessBtn: document.getElementById('endlessBtn'),
  restartBtn: document.getElementById('restartBtn'),
};

/* ================= 工具 ================= */
const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = n => Math.floor(Math.random() * n);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const key = (x, y) => x + ',' + y;
const lerp = (a, b, t) => a + (b - a) * t;

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
  } catch (e) { /* 忽略 */ }
}
const sfxLast = {};
function throttled(name, ms) {
  const now = performance.now();
  if (sfxLast[name] && now - sfxLast[name] < ms) return false;
  sfxLast[name] = now; return true;
}
const SFX = {
  place:    () => tone(200, 120, 0.09, 'square', 0.2),
  sell:     () => tone(500, 900, 0.12, 'sine', 0.18),
  click:    () => tone(700, 500, 0.05, 'sine', 0.12),
  error:    () => tone(160, 120, 0.14, 'square', 0.15),
  pearl:    () => { if (throttled('pearl', 70)) tone(760, 620, 0.05, 'square', 0.07); },
  ice:      () => { if (throttled('ice', 70)) tone(980, 460, 0.07, 'sine', 0.08); },
  lob:      () => tone(240, 90, 0.13, 'triangle', 0.14),
  boom:     () => { tone(90, 40, 0.2, 'sine', 0.3); tone(300, 60, 0.12, 'sawtooth', 0.1); },
  zap:      () => { if (throttled('zap', 90)) tone(1400, 180, 0.09, 'sawtooth', 0.08); },
  hit:      () => { if (throttled('hit', 60)) tone(320, 260, 0.03, 'square', 0.05); },
  death:    () => { if (throttled('death', 80)) tone(520, 150, 0.22, 'square', 0.12); },
  deliver:  () => { tone(880, 880, 0.06, 'sine', 0.12); tone(1320, 1320, 0.07, 'sine', 0.12, 0.06); },
  deliverA: () => { tone(520, 520, 0.05, 'triangle', 0.1); tone(700, 700, 0.05, 'triangle', 0.1, 0.05); },
  horn:     () => { tone(196, 196, 0.5, 'sawtooth', 0.16); tone(147, 147, 0.5, 'sawtooth', 0.14, 0.02); tone(196, 185, 0.45, 'sawtooth', 0.12, 0.5); },
  dawn:     () => { tone(523, 523, 0.15, 'sine', 0.14); tone(659, 659, 0.15, 'sine', 0.14, 0.14); tone(784, 784, 0.25, 'sine', 0.14, 0.28); },
  boss:     () => { tone(110, 55, 0.6, 'sawtooth', 0.3); tone(220, 80, 0.5, 'square', 0.15, 0.1); },
  over:     () => { tone(400, 100, 0.7, 'sawtooth', 0.25); },
  win:      () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.22, 'sine', 0.16, i * 0.15)); },
  upgrade:  () => { tone(600, 1200, 0.15, 'sine', 0.15); },
};
function sfx(n) { try { SFX[n] && SFX[n](); } catch (e) {} }

/* ================= 配置表 ================= */
const TOWER_TYPES = ['tea', 'shake', 'hotpot', 'tesla'];
const BLD = {
  mine:   { name: '采集站',  emoji: '🏪', cost: 30,  hp: 160,  desc: '只能建在 🍜外卖商家 上。派袋鼠往返送餐赚金币；升级多派袋鼠、单趟赚更多。订单会耗尽，注意扩张。' },
  wall:   { name: '保温墙',  emoji: '🧱', cost: 10,  hp: 350,  desc: '装满奶茶的保温箱墙，奶龙最爱啃它，替你拖时间。' },
  tea:    { name: '奶茶塔',  emoji: '🧋', cost: 45,  hp: 200,  range: 2.7, rate: 1.0,  dmg: 9,  ammo: 10, kind: 'pearl', desc: '发射Q弹珍珠，单体速射，性价比之选。' },
  shake:  { name: '冰奶昔塔', emoji: '🥤', cost: 70,  hp: 180,  range: 2.4, rate: 1.0,  dmg: 5,  ammo: 12, kind: 'ice', slow: 0.45, slowT: 1.5, desc: '冰镇奶昔使敌人大幅减速，配合火锅塔食用更佳。' },
  hotpot: { name: '火锅塔',  emoji: '🍲', cost: 110, hp: 220,  range: 3.3, rate: 0.5,  dmg: 22, ammo: 6,  kind: 'lob', aoe: 1.15, desc: '抛出滚烫毛肚，范围溅射伤害，清群利器。' },
  tesla:  { name: '麻辣电塔', emoji: '⚡', cost: 160, hp: 190,  range: 2.6, rate: 0.85, dmg: 13, ammo: 8,  kind: 'zap', chains: 3, desc: '麻到跳脚的连锁闪电，最多连 3 只，克制蛙海。' },
};
const BUILD_ORDER = ['mine', 'wall', 'tea', 'shake', 'hotpot', 'tesla'];

const ENEMY = {
  nailong: { name: '小奶龙',   hp: w => 26 + 14 * w,   spd: 0.85, dmg: 12, rw: 3,   r: 0.46 },
  frog:    { name: '大笑奶蛙', hp: w => 15 + 8 * w,    spd: 1.65, dmg: 9,  rw: 2,   r: 0.4 },
  baoba:   { name: '暴暴龙',   hp: w => 90 + 55 * w,   spd: 0.6,  dmg: 26, rw: 14,  r: 0.55, from: 3 },
  mother:  { name: '奶蛙之母', hp: w => 520 + 270 * w, spd: 0.4,  dmg: 40, rw: 120, r: 1.1,  boss: true },
};

const SHOP_EMOJIS = ['🍜', '🍔', '🍗', '🧋', '🍢', '🍱'];
// [x, y, 订单量]：内圈少而近，外圈富矿
const STALL_SPOTS = [
  [10, 10, 320], [20, 10, 320], [10, 20, 320], [20, 20, 320],
  [6, 15, 480], [24, 15, 480], [15, 6, 480], [15, 24, 480],
  [5, 5, 700], [25, 5, 700], [5, 25, 700], [25, 25, 700],
  [9, 21, 520], [21, 9, 520],
];

/* ================= 全局状态 ================= */
const state = {
  phase: 'menu',            // menu | day | night | over | win
  day: 1, dayT: DAY_LEN, nightT: 0,
  money: 220, hqAmmo: 14, kills: 0, income: 0, built: 0,
  speed: 1, paused: false, endless: false, nightsCleared: 0,
  time: 0, shake: 0,
  bestNight: 0,
  hintsDone: { mine: false, tower: false, wall: false },
};
try { state.bestNight = +localStorage.getItem('nailong_best') || 0; } catch (e) {}

let grid = [];          // grid[y][x] = building | null
let stalls = new Map(); // "x,y" -> stall
const buildings = [];
const couriers = [];
const enemies = [];
let waveQueue = [];
const projectiles = [];
const zaps = [];
const particles = [];
const floats = [];

let bid = 0, cid = 0, eid = 0;
let selected = null;     // 选中的建筑
let placing = null;      // 待放置类型
let sellMode = false;
let hover = null;        // {x,y} 悬停格
let decor = [];          // 地面装饰
let spawnFlashes = [];   // 夜间出怪红圈

function hqB() { return buildings.find(b => b.type === 'hq'); }
function isTower(b) { return TOWER_TYPES.indexOf(b.type) >= 0; }
function walkable(x, y) { return x >= 0 && y >= 0 && x < N && y < N && !grid[y][x]; }
function dmgMul(b) { return 1 + 0.45 * (b.lvl - 1); }
function rangeOf(b) { return BLD[b.type].range * Math.pow(1.08, b.lvl - 1); }
function upCost(b) {
  if (b.type === 'hq') return [400, 800][b.lvl - 1];
  return Math.round(BLD[b.type].cost * 0.9 * b.lvl);
}

/* ================= 世界初始化 ================= */
function genWorld() {
  grid = [];
  for (let y = 0; y < N; y++) { grid.push(new Array(N).fill(null)); }
  stalls = new Map();
  for (const [x, y, amt] of STALL_SPOTS) {
    const s = { x, y, emoji: SHOP_EMOJIS[irnd(SHOP_EMOJIS.length)], amount: amt, max: amt, dead: false, mine: null };
    stalls.set(key(x, y), s);
  }
  // 站点 HQ
  const hq = { id: ++bid, x: 15, y: 15, type: 'hq', lvl: 1, hp: 1200, maxhp: 1200, invested: 0, cool: 0, flash: 0, t: rnd(0, 9) };
  grid[15][15] = hq; buildings.push(hq);
  // 地面装饰
  decor = [];
  for (let i = 0; i < 90; i++) decor.push({ x: rnd(1, N - 1), y: rnd(1, N - 1), k: irnd(3), r: rnd(0, TAU) });
}

/* ================= 寻路 ================= */
// A*：4 向；目标格允许是建筑（端点）
function findPath(sx, sy, tx, ty) {
  if (sx === tx && sy === ty) return [];
  const open = [{ x: sx, y: sy, g: 0, f: Math.abs(tx - sx) + Math.abs(ty - sy) }];
  const gScore = new Map([[key(sx, sy), 0]]);
  const came = new Map();
  const closed = new Set();
  let guard = 0;
  while (open.length && guard++ < 4000) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    const ck = key(cur.x, cur.y);
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (cur.x === tx && cur.y === ty) {
      const path = []; let k = ck;
      while (came.has(k)) { const p = k.split(','); path.push({ x: +p[0], y: +p[1] }); k = came.get(k); }
      path.reverse(); path.pop(); // 去掉起点（最后一项是起点）
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

// 敌人 BFS 找目标建筑（走到哪栋楼最近就拆哪栋）
function acquire(e) {
  const sx = clamp(Math.floor(e.fx), 0, N - 1), sy = clamp(Math.floor(e.fy), 0, N - 1);
  const visited = new Uint8Array(N * N);
  visited[sy * N + sx] = 1;
  let q = [{ x: sx, y: sy, path: [] }];
  let steps = 0;
  while (q.length && steps++ < 950) {
    const nq = [];
    for (const cur of q) {
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const b = grid[ny][nx];
        if (b) return { b, path: cur.path };
        const k = ny * N + nx;
        if (visited[k]) continue;
        visited[k] = 1;
        nq.push({ x: nx, y: ny, path: cur.path.concat([{ x: nx, y: ny }]) });
      }
    }
    q = nq;
  }
  return null; // 被围墙封死
}

function nearestBuilding(fx, fy) {
  let best = null, bd = 1e9;
  for (const b of buildings) {
    const d = Math.hypot(b.x + 0.5 - fx, b.y + 0.5 - fy);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function adjacentBuilding(fx, fy) {
  let best = null, bd = 1.02;
  for (const b of buildings) {
    const d = Math.hypot(b.x + 0.5 - fx, b.y + 0.5 - fy);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

/* ================= 建筑：建造 / 升级 / 出售 / 摧毁 ================= */
function canPlace(type, x, y) {
  if (x < 0 || y < 0 || x >= N || y >= N) return false;
  if (grid[y][x]) return false;
  const s = stalls.get(key(x, y));
  if (type === 'mine') return !!s && !s.dead;
  if (s) return false; // 商家格上只能建采集站
  for (const e of enemies) {
    if (Math.floor(e.fx) === x && Math.floor(e.fy) === y) return false;
  }
  return true;
}
function tryPlace(type, x, y, free) {
  const cfg = BLD[type];
  if (!free && state.money < cfg.cost) { sfx('error'); floatText('💰不够！', x + 0.5, y, '#ff8080'); return false; }
  if (!canPlace(type, x, y)) { sfx('error'); return false; }
  const b = {
    id: ++bid, x, y, type, lvl: 1,
    hp: cfg.hp, maxhp: cfg.hp, invested: cfg.cost,
    ammo: cfg.ammo || 0, maxammo: cfg.ammo || 0,
    cool: rnd(0, 0.4), flash: 0, t: rnd(0, 9), load: 14,
  };
  grid[y][x] = b; buildings.push(b);
  state.money -= free ? 0 : cfg.cost;
  state.built++;
  if (type === 'mine') {
    const s = stalls.get(key(x, y));
    s.mine = b; b.stall = s;
    spawnMoneyCourier(b);
    state.hintsDone.mine = true;
  }
  if (isTower(b) && state.hintsDone.mine) state.hintsDone.tower = true;
  if (type === 'wall') state.hintsDone.wall = true;
  sfx('place');
  puff(x + 0.5, y + 0.5, '#ffffff', 6);
  return true;
}
function upgrade(b) {
  if (b.lvl >= 3) return;
  const c = upCost(b);
  if (state.money < c) { sfx('error'); return; }
  state.money -= c; b.invested += c; b.lvl++;
  const oldMax = b.maxhp;
  b.maxhp = Math.round(b.maxhp * 1.3); b.hp = Math.min(b.maxhp, b.hp + Math.round(oldMax * 0.3));
  if (b.type === 'mine') { b.load += 6; spawnMoneyCourier(b); }
  if (b.type === 'hq') { spawnAmmoRunner(); b.maxhp += 500; b.hp = Math.min(b.maxhp, b.hp + 500); }
  sfx('upgrade');
  floatText('Lv.' + b.lvl + '!', b.x + 0.5, b.y - 0.2, '#ffe45c');
  puff(b.x + 0.5, b.y + 0.5, '#ffe45c', 10);
  refreshPanel();
}
function sellB(b) {
  if (b.type === 'hq') return;
  const refund = Math.round(b.invested * 0.6);
  state.money += refund;
  floatText('+' + refund + '💰', b.x + 0.5, b.y, '#ffd100');
  removeB(b, false);
  sfx('sell');
  closePanel();
}
function removeB(b, byEnemy) {
  if (grid[b.y][b.x] === b) grid[b.y][b.x] = null;
  const i = buildings.indexOf(b); if (i >= 0) buildings.splice(i, 1);
  if (b.stall) { b.stall.mine = null; }
  for (let j = couriers.length - 1; j >= 0; j--) if (couriers[j].mineId === b.id) couriers.splice(j, 1);
  if (selected === b) { selected = null; closePanel(); }
  if (byEnemy) {
    puff(b.x + 0.5, b.y + 0.5, '#5a5a5a', 14);
    floatText('💥被拆了', b.x + 0.5, b.y, '#ff9090');
    state.shake = Math.max(state.shake, 0.25);
  }
  for (const e of enemies) if (e.tb === b) { e.tb = null; e.path = null; e.repath = 0; }
}
function destroyHQ(hq) {
  puff(hq.x + 0.5, hq.y + 0.5, '#666', 30);
  state.shake = 0.6;
  gameOver();
}

/* ================= 袋鼠 ================= */
function spawnMoneyCourier(mine) {
  couriers.push({
    id: ++cid, kind: 'money', mineId: mine.id,
    fx: mine.x + 0.5, fy: mine.y + 0.5, dir: 1,
    mode: 'load', timer: 1.1, path: null, pi: 0, warn: 0,
  });
}
function spawnAmmoRunner() {
  const hq = hqB();
  couriers.push({
    id: ++cid, kind: 'ammo', mineId: null,
    fx: hq.x + 0.5 + rnd(-0.3, 0.3), fy: hq.y + 0.5 + 0.5, dir: 1,
    mode: 'idle', timer: 0, path: null, pi: 0, warn: 0,
  });
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
// 返回 'arrived' | 'blocked' | 'moving'；终点格是建筑格（允许踏入）
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
  if (!hq) return;
  for (let i = couriers.length - 1; i >= 0; i--) {
    const c = couriers[i];
    c.t = (c.t || 0) + dt;
    if (c.warn > 0) c.warn -= dt;
    if (c.kind === 'money') {
      const mine = buildings.find(b => b.id === c.mineId);
      if (!mine || !mine.stall || mine.stall.dead) { couriers.splice(i, 1); continue; }
      if (c.mode === 'load') {
        c.timer -= dt;
        if (c.timer <= 0) {
          if (requestPath(c, hq.x, hq.y)) c.mode = 'go';
          else c.timer = 1.5;
        }
      } else if (c.mode === 'go') {
        if (!c.path) {
          if (!requestPath(c, hq.x, hq.y)) { c.mode = 'stuck'; c.resume = 'go'; c.timer = 1.5; }
        } else if (courierMove(c, 1.9, dt) === 'arrived') {
          const gain = Math.min(mine.load, Math.max(0, mine.stall.amount));
          state.money += gain; state.income += gain;
          mine.stall.amount -= gain;
          floatText('+' + gain + '💰', hq.x + 0.5, hq.y - 0.3, '#ffd100');
          sfx('deliver');
          coinPuff(hq.x + 0.5, hq.y);
          if (mine.stall.amount <= 0) {
            mine.stall.dead = true; mine.dead = true;
            floatText('歇业了…', mine.x + 0.5, mine.y, '#ff9a9a');
            couriers.splice(i, 1); continue;
          }
          c.mode = 'return';
          if (!requestPath(c, mine.x, mine.y)) { c.mode = 'stuck'; c.resume = 'return'; c.timer = 1.5; }
        }
      } else if (c.mode === 'return') {
        if (!c.path) {
          if (!requestPath(c, mine.x, mine.y)) { c.mode = 'stuck'; c.resume = 'return'; c.timer = 1.5; }
        } else if (courierMove(c, 1.9, dt) === 'arrived') {
          c.mode = 'load'; c.timer = 1.1;
        }
      } else if (c.mode === 'stuck') {
        c.timer -= dt;
        if (c.timer <= 0) {
          c.timer = 1.5;
          const dest = c.resume === 'go' ? hq : mine;
          if (requestPath(c, dest.x, dest.y)) c.mode = c.resume;
        }
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
        } else if (courierMove(c, 2.2, dt) === 'arrived') {
          t.ammo = Math.min(t.maxammo, t.ammo + c.batch);
          sfx('deliverA');
          floatText('📦+' + c.batch, t.x + 0.5, t.y - 0.3, '#9fdcff');
          c.mode = 'return';
          if (!requestPath(c, hq.x, hq.y)) { c.mode = 'stuck'; c.resume = 'return'; c.timer = 1.5; }
        }
      } else if (c.mode === 'return') {
        if (!c.path) {
          if (!requestPath(c, hq.x, hq.y)) { c.mode = 'stuck'; c.resume = 'return'; c.timer = 1.5; }
        } else if (courierMove(c, 2.2, dt) === 'arrived') {
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
function hqAmmoCap() { const hq = hqB(); return 24 + 12 * (hq ? hq.lvl - 1 : 0); }
function hqAmmoRate() { const hq = hqB(); return 0.55 * Math.pow(1.4, (hq ? hq.lvl : 1) - 1); }

/* ================= 塔射击 ================= */
function pickTarget(b) {
  const r = rangeOf(b);
  let best = null, bd = 1e9;
  for (const e of enemies) {
    const d = Math.hypot(e.fx - (b.x + 0.5), e.fy - (b.y + 0.5));
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
    const d = Math.hypot(tg.fx - cx, tg.fy - cy);
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
        const dd = Math.hypot(e.fx - cur.fx, e.fy - cur.fy);
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

/* ================= 敌人 ================= */
function makeWave(w) {
  const q = [];
  let t = 1.0;
  let total = 8 + Math.round(4.2 * Math.pow(w, 1.18));
  if (w % 5 === 0) { q.push({ type: 'mother', at: 5 }); total = Math.max(6, total - 8); }
  const frogR = Math.min(0.5, 0.15 + w * 0.05);
  const baoR = w >= 3 ? Math.min(0.22, 0.04 + w * 0.025) : 0;
  for (let i = 0; i < total; i++) {
    const r = Math.random();
    const type = r < frogR ? 'frog' : (r < frogR + baoR ? 'baoba' : 'nailong');
    q.push({ type, at: t });
    t += 0.35 + Math.random() * 0.85;
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
  const cfg = ENEMY[type];
  const side = irnd(4);
  const u = rnd(3, N - 3);
  let fx, fy;
  if (side === 0) { fx = u; fy = 0.4; }
  else if (side === 1) { fx = u; fy = N - 0.4; }
  else if (side === 2) { fx = 0.4; fy = u; }
  else { fx = N - 0.4; fy = u; }
  const e = {
    id: ++eid, type, fx, fy, dir: 1,
    hp: cfg.hp(state.day), maxhp: cfg.hp(state.day),
    spd: cfg.spd, dmg: cfg.dmg, rw: cfg.rw,
    slowT: 0, slowF: 0, flash: 0, t: rnd(0, 9),
    tb: null, path: null, pi: 0, repath: rnd(0, 0.3), atkT: 0,
    spawnT: 0.5, spawnTgt: null,
  };
  if (type === 'mother') { e.spawnCd = 4.5; }
  enemies.push(e);
  spawnFlashes.push({ x: fx, y: fy, t: 0.8 });
  puff(fx, fy, '#8a5cf5', 6);
  if (type === 'mother') {
    sfx('boss');
    showBanner('👑 奶蛙之母降临！', '她会不断生产大笑奶蛙……集中火力！');
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
  state.money += e.rw; state.kills++;
  floatText('+' + e.rw + '💰', e.fx, e.fy - 0.2, '#ffd100');
  starPuff(e.fx, e.fy, ENEMY[e.type].boss ? 24 : 7);
  if (Math.random() < 0.35) floatText(Math.random() < 0.5 ? '嗷呜~' : '呱…', e.fx, e.fy - 0.7, '#ffe9a8');
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
    // Boss 生小蛙
    if (e.type === 'mother') {
      e.spawnCd -= dt;
      if (e.spawnCd <= 0) {
        e.spawnCd = 4.5;
        const baby = spawnEnemy('frog');
        baby.fx = e.fx + rnd(-0.8, 0.8); baby.fy = e.fy + rnd(0.5, 1.2);
        baby.spawnT = 0.2;
        floatText('呱！', e.fx, e.fy - 1.2, '#d9ec9a');
      }
    }
    // 目标建筑
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
      const d = Math.hypot(e.tb.x + 0.5 - e.fx, e.tb.y + 0.5 - e.fy);
      if (d < 1.0) {
        // 拆楼
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
        // 走路
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
          // 直线兜底（被围墙封死时朝目标硬走）
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
          if (Math.hypot(e.fx - ex, e.fy - ey) <= p.aoe) hurtEnemy(e, p.dmg);
        }
        boomPuff(ex, ey);
        sfx('boom');
        state.shake = Math.max(state.shake, 0.12);
        projectiles.splice(i, 1);
      }
      continue;
    }
    // 追踪弹
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
    if (p.kind === 'ice' && Math.random() < dt * 20) particles.push({ kind: 'snow', x: p.fx * T + T / 2, y: p.fy * T + T / 2, vx: rnd(-6, 6), vy: rnd(-4, 10), t: 0, life: 0.4, r: rnd(1.5, 2.6), color: '#bfe9ff' });
  }
  for (let i = zaps.length - 1; i >= 0; i--) { zaps[i].t -= dt; if (zaps[i].t <= 0) zaps.splice(i, 1); }
}
function floatText(txt, fx, fy, color) {
  floats.push({ txt, x: fx * T + T / 2, y: fy * T + T / 2, t: 0, life: 1.4, color: color || '#fff' });
  if (floats.length > 60) floats.shift();
}
function puff(fx, fy, color, n) {
  for (let i = 0; i < (n || 8); i++) {
    particles.push({ kind: 'puff', x: fx * T + T / 2, y: fy * T + T / 2, vx: rnd(-30, 30), vy: rnd(-45, -5), t: 0, life: rnd(0.4, 0.8), r: rnd(3, 7), color });
  }
}
function starPuff(fx, fy, n) {
  for (let i = 0; i < n; i++) {
    particles.push({ kind: 'star', x: fx * T + T / 2, y: fy * T + T / 2, vx: rnd(-60, 60), vy: rnd(-90, -20), t: 0, life: rnd(0.5, 0.9), r: rnd(3, 6), color: '#ffdf5e', rot: rnd(0, TAU) });
  }
}
function coinPuff(fx, fy) {
  for (let i = 0; i < 4; i++) particles.push({ kind: 'coin', x: fx * T + T / 2 + rnd(-8, 8), y: fy * T + T / 2, vx: rnd(-15, 15), vy: rnd(-70, -40), t: 0, life: 0.6, r: 3.5, color: '#ffd100' });
}
function boomPuff(fx, fy) {
  for (let i = 0; i < 14; i++) {
    particles.push({ kind: 'boom', x: fx * T + T / 2, y: fy * T + T / 2, vx: rnd(-70, 70), vy: rnd(-70, 30), t: 0, life: rnd(0.3, 0.6), r: rnd(4, 9), color: ['#ff7a2f', '#ffb13d', '#e8432f'][irnd(3)] });
  }
}
function spark(fx, fy) {
  for (let i = 0; i < 3; i++) particles.push({ kind: 'spark', x: fx * T + T / 2, y: fy * T + T / 2, vx: rnd(-50, 50), vy: rnd(-50, 10), t: 0, life: 0.25, r: 2, color: '#fff2b0' });
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

/* ================= 主更新 ================= */
function update(dt) {
  state.time += dt;
  if (state.phase === 'day') {
    state.dayT -= dt;
    // 白天缓慢修建筑
    for (const b of buildings) b.hp = Math.min(b.maxhp, b.hp + 8 * dt);
    if (state.dayT <= 0) startNight();
  } else if (state.phase === 'night') {
    state.nightT += dt;
    while (waveQueue.length && waveQueue[0].at <= state.nightT) {
      const it = waveQueue.shift();
      spawnEnemy(it.type);
    }
    if (waveQueue.length === 0 && enemies.length === 0) endNight();
  }
  // 站点弹药产能
  if (state.phase === 'day' || state.phase === 'night') {
    state.hqAmmo = Math.min(hqAmmoCap(), state.hqAmmo + hqAmmoRate() * dt);
    updateTowers(dt);
    updateEnemies(dt);
    if (state.phase !== 'day' && state.phase !== 'night') return; // HQ 被拆，游戏结束
    updateCouriers(dt);
    updateProjectiles(dt);
  }
  updateFX(dt);
}

/* ================= 阶段切换 ================= */
function startGame() {
  state.phase = 'day'; state.dayT = DAY_LEN;
  spawnAmmoRunner(); spawnAmmoRunner();
  showBanner('第 1 天 · 开业大吉！', '在 🍜 商家上建采集站，天黑前做好防御');
  sfx('dawn');
}
function startNight() {
  state.phase = 'night'; state.nightT = 0;
  waveQueue = makeWave(state.day);
  showBanner('🌙 第 ' + state.day + ' 夜 · 奶龙来袭！', '今晚：' + wavePreview(waveQueue));
  sfx('horn');
}
function endNight() {
  const reward = 30 + 12 * state.day;
  state.money += reward; state.income += reward;
  state.nightsCleared++;
  state.bestNight = Math.max(state.bestNight, state.day);
  try { localStorage.setItem('nailong_best', String(state.bestNight)); } catch (e) {}
  if (state.day >= MAX_NIGHT && !state.endless) { victory(); return; }
  state.day++;
  state.phase = 'day'; state.dayT = DAY_LEN;
  showBanner('☀️ 第 ' + state.day + ' 天 · 夜晚过去（+' + reward + '💰）', '趁白天修修建筑、扩扩产能');
  sfx('dawn');
}
function gameOver() {
  state.phase = 'over';
  sfx('over');
  showEnd(false);
}
function victory() {
  state.phase = 'win';
  sfx('win');
  showEnd(true);
}
function showEnd(win) {
  el.endTitle.textContent = win ? '🎉 全部守住！外卖帝国达成！' : '🏚️ 站点沦陷！';
  el.endTitle.className = win ? 'win' : 'lose';
  el.endSub.textContent = win
    ? '奶龙军团被你打得嗷嗷叫，袋鼠骑手连夜给你送来锦旗 🏅'
    : ['奶龙们把站点吃成了自助餐……', '奶蛙之母表示：这家的奶茶还不错 🧋', '暴暴龙：就这？下次再来！'][irnd(3)];
  el.stNight.textContent = win ? MAX_NIGHT : state.nightsCleared;
  el.stKills.textContent = state.kills;
  el.stEarn.textContent = state.income;
  el.stBuild.textContent = state.built;
  el.endlessBtn.classList.toggle('hidden', !win);
  el.endOv.classList.remove('hidden');
}

/* ================= 绘制：角色 ================= */
function shadow(px, py, w) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(px, py + T * 0.34, w, w * 0.36, 0, 0, TAU); ctx.fill();
}

function drawNailong(px, py, t, dir, attacking, flash) {
  const bob = attacking ? 0 : Math.abs(Math.sin(t * 8)) * 2.2;
  shadow(px, py, T * 0.44);
  ctx.save();
  ctx.translate(px, py - T * 0.1 - bob);
  const jig = 1 + 0.035 * Math.sin(t * 12);
  ctx.scale(1, jig);
  // 尾巴
  ctx.fillStyle = '#ffdf5e'; ctx.strokeStyle = '#de9e2a'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-T * 0.4, 0);
  ctx.quadraticCurveTo(-T * 0.62, -T * 0.05, -T * 0.55, -T * 0.28 + Math.sin(t * 9) * 2);
  ctx.quadraticCurveTo(-T * 0.45, -T * 0.1, -T * 0.34, -T * 0.06);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // 身体
  ctx.fillStyle = flash ? '#fff7d6' : '#ffe45c';
  ctx.beginPath(); ctx.ellipse(0, 0, T * 0.46, T * 0.42, 0, 0, TAU);
  ctx.fill(); ctx.stroke();
  // 大肚子
  ctx.fillStyle = '#fff3c6';
  ctx.beginPath(); ctx.ellipse(0, T * 0.13, T * 0.3, T * 0.24, 0, 0, TAU); ctx.fill();
  // 小角
  ctx.fillStyle = '#f5a623';
  for (const hx of [-0.2, 0.2]) {
    ctx.beginPath();
    ctx.moveTo(hx * T - 3, -T * 0.36);
    ctx.lineTo(hx * T + 3, -T * 0.36);
    ctx.lineTo(hx * T, -T * 0.52);
    ctx.closePath(); ctx.fill();
  }
  // 手手
  ctx.fillStyle = '#ffdf5e'; ctx.strokeStyle = '#de9e2a';
  ctx.beginPath(); ctx.ellipse(-T * 0.44, T * 0.05 + (attacking ? -2 : 0), 5, 7, 0.4, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(T * 0.44, T * 0.05 + (attacking ? -2 : 0), 5, 7, -0.4, 0, TAU); ctx.fill(); ctx.stroke();
  // 眼睛（大眼呆萌）
  const ex = dir * 2;
  const blink = (t % 3.7) < 0.12;
  for (const sx of [-0.16, 0.16]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(sx * T + ex, -T * 0.16, T * 0.11, 0, TAU); ctx.fill();
    if (blink) {
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(sx * T + ex - 4, -T * 0.16); ctx.lineTo(sx * T + ex + 4, -T * 0.16); ctx.stroke();
    } else {
      ctx.fillStyle = '#2b2420';
      ctx.beginPath(); ctx.arc(sx * T + ex + dir * 1.6, -T * 0.15, T * 0.05, 0, TAU); ctx.fill();
    }
  }
  // 腮红
  ctx.fillStyle = 'rgba(255,150,170,0.55)';
  ctx.beginPath(); ctx.ellipse(-T * 0.26 + ex, T * 0.0, 3.4, 2.2, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(T * 0.26 + ex, T * 0.0, 3.4, 2.2, 0, 0, TAU); ctx.fill();
  // 嘴（攻击时喷小火）
  if (attacking) {
    ctx.fillStyle = '#b3541e';
    ctx.beginPath(); ctx.ellipse(ex, T * 0.06, 4, 4.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff8c2f';
    ctx.beginPath();
    ctx.moveTo(ex - 3, T * 0.04);
    ctx.lineTo(ex + 3, T * 0.04);
    ctx.lineTo(ex + dir * 2, -T * 0.12 + Math.sin(t * 30) * 1.5);
    ctx.closePath(); ctx.fill();
  } else {
    ctx.strokeStyle = '#7a5420'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(ex, T * 0.02, 3.6, 0.25, Math.PI - 0.25); ctx.stroke();
  }
  ctx.restore();
}

function drawFrog(px, py, t, dir, attacking, flash) {
  const ph = Math.abs(Math.sin(t * 7));
  const bob = -ph * 6;
  const squash = ph < 0.25 ? 0.86 : 1;
  shadow(px, py, T * 0.4 * (ph < 0.25 ? 1.15 : 1));
  ctx.save();
  ctx.translate(px, py - T * 0.06 + bob);
  ctx.scale(1 / squash * 0.98, squash);
  // 身体（扁圆）
  ctx.fillStyle = flash ? '#f2ffd6' : '#cbe05e';
  ctx.strokeStyle = '#8ba23c'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 0, T * 0.46, T * 0.34, 0, 0, TAU);
  ctx.fill(); ctx.stroke();
  // 眼睛包
  for (const sx of [-0.22, 0.22]) {
    ctx.fillStyle = flash ? '#f2ffd6' : '#cbe05e';
    ctx.beginPath(); ctx.arc(sx * T, -T * 0.3, T * 0.13, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(sx * T, -T * 0.32, T * 0.09, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2b2420';
    ctx.beginPath(); ctx.arc(sx * T + dir * 1.5, -T * 0.31, T * 0.045, 0, TAU); ctx.fill();
  }
  // 大笑嘴
  ctx.fillStyle = '#7c2b2b';
  ctx.beginPath();
  ctx.roundRect(-T * 0.3 + dir * 2, -T * 0.06, T * 0.6, T * 0.2, T * 0.1);
  ctx.fill();
  ctx.strokeStyle = '#5d1f1f'; ctx.lineWidth = 1.5; ctx.stroke();
  // 舌头
  ctx.fillStyle = '#ff8ba0';
  ctx.beginPath(); ctx.ellipse(dir * 2, T * 0.11, T * 0.16, T * 0.05, 0, 0, TAU); ctx.fill();
  // 小白牙（抽象蛙的诡异微笑）
  ctx.fillStyle = '#fff';
  ctx.fillRect(-T * 0.18 + dir * 2, -T * 0.06, 3.4, 3.4);
  ctx.fillRect(T * 0.1 + dir * 2, -T * 0.06, 3.4, 3.4);
  // 手
  ctx.strokeStyle = '#8ba23c'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-T * 0.42, T * 0.05); ctx.lineTo(-T * 0.5, -T * 0.12 + (attacking ? -3 : 0)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(T * 0.42, T * 0.05); ctx.lineTo(T * 0.5, -T * 0.12 + (attacking ? -3 : 0)); ctx.stroke();
  ctx.restore();
}

function drawBaoba(px, py, t, dir, attacking, flash) {
  const bob = Math.abs(Math.sin(t * 6)) * 1.8;
  shadow(px, py, T * 0.5);
  ctx.save();
  ctx.translate(px, py - T * 0.08 - bob);
  // 背刺
  ctx.fillStyle = '#6c3fa0';
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(i * T * 0.22 - 4, -T * 0.3);
    ctx.lineTo(i * T * 0.22 + 4, -T * 0.3);
    ctx.lineTo(i * T * 0.22, -T * 0.52);
    ctx.closePath(); ctx.fill();
  }
  // 身体
  ctx.fillStyle = flash ? '#e8d4ff' : '#a96fd6';
  ctx.strokeStyle = '#6c3fa0'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 0, T * 0.5, T * 0.44, 0, 0, TAU);
  ctx.fill(); ctx.stroke();
  // 肚子
  ctx.fillStyle = '#e5ccf2';
  ctx.beginPath(); ctx.ellipse(0, T * 0.14, T * 0.3, T * 0.24, 0, 0, TAU); ctx.fill();
  // 眼 + 怒眉
  const ex = dir * 2;
  for (const sx of [-0.17, 0.17]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(sx * T + ex, -T * 0.14, T * 0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2b2420';
    ctx.beginPath(); ctx.arc(sx * T + ex + dir * 1.4, -T * 0.13, T * 0.045, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#3d2058'; ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(sx * T + ex - 5, -T * 0.28 + (sx < 0 ? 3 : -1));
    ctx.lineTo(sx * T + ex + 5, -T * 0.28 + (sx < 0 ? -1 : 3));
    ctx.stroke();
  }
  // 嘴 + 尖牙
  ctx.fillStyle = '#4a1d4a';
  ctx.beginPath(); ctx.ellipse(ex, T * 0.08, 6, attacking ? 6 : 3.4, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(ex - 4, T * 0.05); ctx.lineTo(ex - 1, T * 0.05); ctx.lineTo(ex - 2.5, T * 0.12); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(ex + 1, T * 0.05); ctx.lineTo(ex + 4, T * 0.05); ctx.lineTo(ex + 2.5, T * 0.12); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawMother(px, py, t, dir, attacking, flash) {
  const pulse = 1 + 0.03 * Math.sin(t * 3);
  const bob = Math.abs(Math.sin(t * 4)) * 4;
  shadow(px, py, T * 1.15);
  ctx.save();
  ctx.translate(px, py - T * 0.3 - bob);
  ctx.scale(pulse * 3.0, pulse * 3.0 * 0.92);
  // 身体
  ctx.fillStyle = flash ? '#f4ffdc' : '#d9ec9a';
  ctx.strokeStyle = '#93ac52'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.ellipse(0, 0, T * 0.46, T * 0.38, 0, 0, TAU); ctx.fill(); ctx.stroke();
  // 眼睛包（爆突）
  for (const sx of [-0.2, 0.2]) {
    ctx.fillStyle = flash ? '#f4ffdc' : '#d9ec9a';
    ctx.beginPath(); ctx.arc(sx * T, -T * 0.32, T * 0.14, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(sx * T, -T * 0.34, T * 0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2b2420';
    ctx.beginPath(); ctx.arc(sx * T + dir * 2, -T * 0.33, T * 0.05, 0, TAU); ctx.fill();
  }
  // 皇冠
  ctx.fillStyle = '#ffd100'; ctx.strokeStyle = '#c7a200'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-7, -T * 0.48); ctx.lineTo(-7, -T * 0.6); ctx.lineTo(-3, -T * 0.52);
  ctx.lineTo(0, -T * 0.64); ctx.lineTo(3, -T * 0.52); ctx.lineTo(7, -T * 0.6); ctx.lineTo(7, -T * 0.48);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e04545';
  ctx.beginPath(); ctx.arc(0, -T * 0.52, 1.6, 0, TAU); ctx.fill();
  // 大嘴
  ctx.fillStyle = '#6e2424';
  ctx.beginPath(); ctx.roundRect(-T * 0.3, -T * 0.08, T * 0.6, T * 0.2, T * 0.1); ctx.fill();
  ctx.fillStyle = '#ff8ba0';
  ctx.beginPath(); ctx.ellipse(0, T * 0.08, T * 0.15, T * 0.05, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(-T * 0.2, -T * 0.08, 3.6, 3.6);
  ctx.fillRect(T * 0.13, -T * 0.08, 3.6, 3.6);
  // 肚皮纹
  ctx.strokeStyle = 'rgba(120,140,80,0.4)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, T * 0.18, T * 0.2, 0.3, Math.PI - 0.3); ctx.stroke();
  ctx.restore();
}

function drawKangaroo(px, py, t, dir, boxKind) {
  const hop = Math.abs(Math.sin(t * 9));
  const bob = -hop * 3.6;
  shadow(px, py, T * 0.38 * (hop < 0.2 ? 1.1 : 1));
  ctx.save();
  ctx.translate(px, py - T * 0.05 + bob);
  ctx.scale(dir, 1);
  // 尾巴
  ctx.strokeStyle = '#8f5b32'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-T * 0.3, T * 0.16);
  ctx.quadraticCurveTo(-T * 0.62, T * 0.3, -T * 0.5, T * 0.02 - hop * 3);
  ctx.stroke();
  // 后脚
  ctx.fillStyle = '#c98f5a'; ctx.strokeStyle = '#8f5b32'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.ellipse(-T * 0.05, T * 0.3, T * 0.22, 6, 0, 0, TAU); ctx.fill(); ctx.stroke();
  // 身体
  ctx.fillStyle = '#c98f5a';
  ctx.beginPath(); ctx.ellipse(0, -T * 0.02, T * 0.3, T * 0.32, 0.15, 0, TAU); ctx.fill(); ctx.stroke();
  // 肚皮
  ctx.fillStyle = '#ecd2b2';
  ctx.beginPath(); ctx.ellipse(T * 0.04, T * 0.04, T * 0.16, T * 0.2, 0.15, 0, TAU); ctx.fill();
  // 黄马甲
  ctx.fillStyle = '#ffd100'; ctx.strokeStyle = '#c7a200'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-T * 0.24, -T * 0.22, T * 0.3, T * 0.3, 4);
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#222'; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(-T * 0.2, -T * 0.18); ctx.lineTo(T * 0.02, T * 0.06); ctx.stroke();
  // 头
  ctx.fillStyle = '#c98f5a'; ctx.strokeStyle = '#8f5b32'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.ellipse(T * 0.22, -T * 0.3, T * 0.18, T * 0.15, 0, 0, TAU); ctx.fill(); ctx.stroke();
  // 耳朵
  ctx.beginPath(); ctx.ellipse(T * 0.14, -T * 0.46, 3.4, 7, -0.3, 0, TAU); ctx.fill(); ctx.stroke();
  // 黄头盔
  ctx.fillStyle = '#ffd100'; ctx.strokeStyle = '#c7a200';
  ctx.beginPath(); ctx.arc(T * 0.22, -T * 0.34, T * 0.15, Math.PI * 1.05, Math.PI * 1.98); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#222';
  ctx.fillRect(T * 0.07, -T * 0.37, T * 0.28, 3);
  // 眼睛 + 鼻子
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(T * 0.28, -T * 0.32, 4, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2b2420';
  ctx.beginPath(); ctx.arc(T * 0.295, -T * 0.315, 2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#8f5b32';
  ctx.beginPath(); ctx.ellipse(T * 0.36, -T * 0.26, 2.4, 1.8, 0, 0, TAU); ctx.fill();
  // 外卖箱
  if (boxKind) {
    ctx.fillStyle = boxKind === 'ammo' ? '#e8564f' : '#ffd100';
    ctx.strokeStyle = boxKind === 'ammo' ? '#a3332e' : '#c7a200'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.roundRect(-T * 0.52, -T * 0.4, 17, 15, 3); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-T * 0.52, -T * 0.32); ctx.lineTo(-T * 0.52 + 17, -T * 0.32); ctx.stroke();
    if (boxKind === 'ammo') {
      ctx.fillStyle = '#ffe45c';
      ctx.beginPath();
      ctx.moveTo(-T * 0.44, -T * 0.22); ctx.lineTo(-T * 0.36, -T * 0.22); ctx.lineTo(-T * 0.43, -T * 0.1); ctx.lineTo(-T * 0.39, -T * 0.1); ctx.lineTo(-T * 0.48, -T * 0.03); ctx.lineTo(-T * 0.44, -T * 0.1); ctx.lineTo(-T * 0.48, -T * 0.1);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.save();
      ctx.scale(dir, 1); // 抵消外层镜像，避免 ¥ 反字
      ctx.fillStyle = '#7a5c00'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('¥', (-T * 0.52 + 8.5) * dir, -T * 0.26);
      ctx.restore();
    }
  }
  // 小手
  ctx.strokeStyle = '#8f5b32'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(T * 0.1, -T * 0.08); ctx.lineTo(T * 0.24, -T * 0.02 - hop * 2); ctx.stroke();
  ctx.restore();
}

/* ================= 图片精灵（真实素材，加载失败回退矢量绘制） ================= */
const SPRITES = {}, SPRITE_WHITE = {};
const SPRITE_SRC = {
  nailong: 'assets/nailong.png',
  frog: 'assets/nailaugh.png',
  baoba: 'assets/baoba.png',
  mother: 'assets/nailaugh.png',
  kangaroo: 'assets/kangaroo.png',
};
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
const SPRITE_FACES_LEFT = { kangaroo: true }; // 素材原生朝向：袋鼠朝左
function drawSprite(key, px, py, w, h, dir, t, bobAmp, flash, alphaMul) {
  if (!spriteReady(key)) return false;
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
const ENEMY_SPRITE_H = { nailong: T * 1.55, frog: T * 1.5, baoba: T * 1.7, mother: T * 3.6 };
function drawEnemySprite(e, px, py, attacking, alphaMul) {
  const k = e.type === 'mother' ? 'mother' : e.type;
  if (!spriteReady(k)) return false;
  const img = SPRITES[k];
  let h = ENEMY_SPRITE_H[e.type], w = h * img.naturalWidth / img.naturalHeight;
  let bobAmp = e.type === 'frog' ? 3.6 : 2.2;
  let t = e.t * (e.type === 'frog' ? 1.25 : 1);
  if (attacking) { w *= 1 + 0.06 * Math.abs(Math.sin(e.t * 10)); bobAmp *= 1.8; }
  const ok = drawSprite(k, px, py, w, h, e.dir, t, bobAmp, e.flash, alphaMul);
  if (ok && e.type === 'mother') drawCrown(px, py - h * 1.02 - 8, 1.5);
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
  if (spriteReady('kangaroo')) {
    const img = SPRITES.kangaroo;
    const h = T * 1.7, w = h * img.naturalWidth / img.naturalHeight;
    drawSprite('kangaroo', px, py, w, h, dir, t, 3.2, 0);
    if (boxKind) drawDeliveryBox(px - dir * w * 0.3, py - h * 0.12, boxKind);
  } else {
    ctx.save();
    ctx.translate(px, py); ctx.scale(1.15, 1.15); ctx.translate(-px, -py);
    drawKangaroo(px, py, t, dir, boxKind);
    ctx.restore();
  }
}

/* ================= 绘制：建筑 ================= */
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

function drawStall(s) {
  const px = s.x * T + T / 2, py = s.y * T + T / 2;
  ctx.save();
  if (s.dead) ctx.globalAlpha = 0.55;
  // 地台
  ctx.fillStyle = '#d9c4a3';
  ctx.strokeStyle = '#a3865d'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(px - T * 0.46, py - T * 0.28, T * 0.92, T * 0.62, 3); ctx.fill(); ctx.stroke();
  // 柜台
  ctx.fillStyle = '#b9743f';
  ctx.fillRect(px - T * 0.4, py + T * 0.02, T * 0.8, T * 0.24);
  ctx.fillStyle = '#e8d9c0';
  ctx.fillRect(px - T * 0.4, py - T * 0.02, T * 0.8, T * 0.07);
  // 雨棚条纹
  const aw = T * 0.92, ax = px - aw / 2, ay = py - T * 0.44;
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? '#fff' : '#e85d4a';
    ctx.fillRect(ax + (aw / 6) * i, ay, aw / 6, T * 0.2);
  }
  ctx.strokeStyle = '#a3402f'; ctx.lineWidth = 1.5;
  ctx.strokeRect(ax, ay, aw, T * 0.2);
  // 棚柱
  ctx.fillStyle = '#8f5b32';
  ctx.fillRect(ax, ay, 2, T * 0.22);
  ctx.fillRect(ax + aw - 2, ay, 2, T * 0.22);
  // 食物 emoji
  ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(s.emoji, px, py + T * 0.1);
  ctx.restore();
  if (s.dead) {
    ctx.fillStyle = 'rgba(60,60,60,0.45)';
    ctx.beginPath(); ctx.roundRect(px - T * 0.46, py - T * 0.44, T * 0.92, T * 0.8, 4); ctx.fill();
    ctx.fillStyle = '#ffd7d7'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('歇业', px, py);
  } else if (s.mine) {
    // 剩余订单条
    const f = s.amount / s.max;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(px - 10, py + T * 0.4, 20, 3);
    ctx.fillStyle = f > 0.35 ? '#7ed957' : '#ffb13d';
    ctx.fillRect(px - 10, py + T * 0.4, 20 * f, 3);
  }
}

function drawHQ(b) {
  const px = b.x * T + T / 2, py = b.y * T + T / 2;
  const night = state.phase === 'night';
  shadow(px, py, T * 0.62);
  // 楼体
  ctx.fillStyle = '#f5f6f8'; ctx.strokeStyle = '#2b2f3a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(px - T * 0.72, py - T * 0.5, T * 1.44, T * 1.05, 5); ctx.fill(); ctx.stroke();
  // 黄黑警戒条
  ctx.save();
  ctx.beginPath(); ctx.roundRect(px - T * 0.72, py - T * 0.5, T * 1.44, T * 0.16, 5); ctx.clip();
  for (let i = -3; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#222' : '#ffd100';
    ctx.save(); ctx.translate(px - T * 0.72 + i * 9, py - T * 0.5); ctx.rotate(0.5); ctx.fillRect(0, -6, 6, 22); ctx.restore();
  }
  ctx.restore();
  // 招牌
  ctx.fillStyle = '#1b1c22';
  ctx.beginPath(); ctx.roundRect(px - T * 0.5, py - T * 0.28, T, T * 0.34, 4); ctx.fill();
  ctx.fillStyle = '#ffd100'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('外卖站点', px, py - T * 0.1);
  // 窗（夜晚发光）
  ctx.fillStyle = night ? '#ffe27a' : '#cfe3f2';
  ctx.fillRect(px - T * 0.56, py + T * 0.14, T * 0.34, T * 0.26);
  ctx.fillRect(px + T * 0.22, py + T * 0.14, T * 0.34, T * 0.26);
  ctx.strokeStyle = '#2b2f3a'; ctx.lineWidth = 1.2;
  ctx.strokeRect(px - T * 0.56, py + T * 0.14, T * 0.34, T * 0.26);
  ctx.strokeRect(px + T * 0.22, py + T * 0.14, T * 0.34, T * 0.26);
  // 门
  ctx.fillStyle = '#7c5a36';
  ctx.beginPath(); ctx.roundRect(px - T * 0.14, py + T * 0.08, T * 0.28, T * 0.44, 3); ctx.fill(); ctx.stroke();
  // 天线
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
  // 杯身
  ctx.fillStyle = '#f6efdc'; ctx.strokeStyle = '#b9a77f'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-T * 0.3, -T * 0.44);
  ctx.lineTo(T * 0.3, -T * 0.44);
  ctx.lineTo(T * 0.22, T * 0.18);
  ctx.lineTo(-T * 0.22, T * 0.18);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // 珍珠
  ctx.fillStyle = '#5b3a29';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.arc(-T * 0.15 + i * T * 0.1, T * 0.1, 2.6, 0, TAU); ctx.fill();
  }
  // 奶盖
  ctx.fillStyle = '#fff8ea';
  ctx.beginPath(); ctx.ellipse(0, -T * 0.44, T * 0.3, T * 0.07, 0, 0, TAU); ctx.fill(); ctx.stroke();
  // 吸管
  ctx.strokeStyle = '#e8564f'; ctx.lineWidth = 4; ctx.lineCap = 'butt';
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
  ctx.moveTo(-T * 0.28, -T * 0.4);
  ctx.lineTo(T * 0.28, -T * 0.4);
  ctx.lineTo(T * 0.2, T * 0.18);
  ctx.lineTo(-T * 0.2, T * 0.18);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e8f5ff';
  ctx.beginPath(); ctx.ellipse(0, -T * 0.4, T * 0.28, T * 0.06, 0, 0, TAU); ctx.fill(); ctx.stroke();
  // 雪顶
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(0, -T * 0.5, 4.6, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(-5.6, -T * 0.48, 3.6, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(5.6, -T * 0.48, 3.6, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#8fc4e8'; ctx.lineWidth = 1.4;
  for (let i = 0; i < 3; i++) {
    const a = state.time * 2 + i * TAU / 3;
    ctx.beginPath(); ctx.arc(Math.cos(a) * 11, -T * 0.6 + Math.sin(a) * 3, 1.8, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

function drawHotpotTower(b, px, py) {
  drawPedestal(px, py);
  const bump = b.flash > 0 ? 1.06 : 1;
  ctx.save();
  ctx.translate(px, py + T * 0.02);
  ctx.scale(bump, bump);
  // 锅体
  ctx.fillStyle = '#8c2f2f'; ctx.strokeStyle = '#571c1c'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-T * 0.34, -T * 0.24);
  ctx.lineTo(T * 0.34, -T * 0.24);
  ctx.lineTo(T * 0.24, T * 0.18);
  ctx.lineTo(-T * 0.24, T * 0.18);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // 把手
  ctx.strokeStyle = '#571c1c'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-T * 0.34, -T * 0.16); ctx.lineTo(-T * 0.46, -T * 0.16); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(T * 0.34, -T * 0.16); ctx.lineTo(T * 0.46, -T * 0.16); ctx.stroke();
  // 红汤
  ctx.fillStyle = '#ff7a2f';
  ctx.beginPath(); ctx.ellipse(0, -T * 0.24, T * 0.32, T * 0.08, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#571c1c'; ctx.lineWidth = 1.4; ctx.stroke();
  // 气泡
  ctx.fillStyle = '#ffc46b';
  for (let i = 0; i < 3; i++) {
    const bt = (state.time * 0.8 + i * 0.33) % 1;
    ctx.globalAlpha = 1 - bt;
    ctx.beginPath(); ctx.arc(-T * 0.16 + i * T * 0.15, -T * 0.26 - bt * 6, 1.8 + bt * 1.6, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 蒸汽
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.6;
  for (let i = 0; i < 2; i++) {
    const st = state.time * 1.4 + i * 2;
    ctx.beginPath();
    ctx.moveTo(-T * 0.1 + i * T * 0.2, -T * 0.34);
    ctx.quadraticCurveTo(-T * 0.1 + i * T * 0.2 + Math.sin(st) * 4, -T * 0.5, -T * 0.1 + i * T * 0.2 + Math.sin(st + 1) * 5, -T * 0.66);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTeslaTower(b, px, py) {
  drawPedestal(px, py);
  const bump = b.flash > 0 ? 1.08 : 1;
  ctx.save();
  ctx.translate(px, py + T * 0.02);
  ctx.scale(1, bump);
  // 线圈柱
  ctx.fillStyle = '#7a828e'; ctx.strokeStyle = '#4a505a'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-T * 0.14, T * 0.16);
  ctx.lineTo(T * 0.14, T * 0.16);
  ctx.lineTo(T * 0.2, -T * 0.36);
  ctx.lineTo(-T * 0.2, -T * 0.36);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#4a505a'; ctx.lineWidth = 1.4;
  for (let i = 0; i < 3; i++) {
    const yy = T * 0.06 - i * T * 0.16;
    const w = T * (0.17 - i * 0.012);
    ctx.beginPath(); ctx.moveTo(-w, yy); ctx.lineTo(w, yy); ctx.stroke();
  }
  // 顶球
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
    // 箱盖
    ctx.fillStyle = '#ffe66b';
    ctx.beginPath(); ctx.roundRect(px - w / 2 + 2, yy - h / 2 + 2, w - 4, 6, 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(px - w / 2 + w * 0.42, yy - h / 2 + 2, 3, h - 6);
  }
}

function drawMine(b, px, py) {
  // 商家摊位由 drawStall 画，这里画袋鼠接单旗
  ctx.strokeStyle = '#8f5b32'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(px + T * 0.34, py + T * 0.3); ctx.lineTo(px + T * 0.34, py - T * 0.3); ctx.stroke();
  const wave = Math.sin(state.time * 5 + b.id) * 2;
  ctx.fillStyle = '#ffd100'; ctx.strokeStyle = '#c7a200'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px + T * 0.34, py - T * 0.3);
  ctx.lineTo(px + T * 0.34 + 12, py - T * 0.26 + wave);
  ctx.lineTo(px + T * 0.34, py - T * 0.18);
  ctx.closePath(); ctx.fill(); ctx.stroke();
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
  }
  ctx.globalAlpha = 1;
  if (!ghost) {
    // 血条
    if (b.hp < b.maxhp || selected === b) {
      const w = 22;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(px - w / 2, py - T * 0.85, w, 4);
      ctx.fillStyle = b.hp / b.maxhp > 0.4 ? '#7ed957' : '#ff6b5f';
      ctx.fillRect(px - w / 2, py - T * 0.85, w * clamp(b.hp / b.maxhp, 0, 1), 4);
    }
    // 塔弹药条
    if (isTower(b)) {
      const w = 22;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(px - w / 2, py - T * 0.85 + (b.hp < b.maxhp || selected === b ? 5 : 0), w, 3);
      ctx.fillStyle = b.ammo > 0 ? '#6fc7ff' : '#ff4d4d';
      ctx.fillRect(px - w / 2, py - T * 0.85 + (b.hp < b.maxhp || selected === b ? 5 : 0), w * clamp(b.ammo / b.maxammo, 0, 1), 3);
      if (b.ammo <= 0 && state.phase === 'night') {
        ctx.fillStyle = (state.time % 0.8 < 0.4) ? '#ff5f5f' : '#ffd7d7';
        ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('缺弹！', px, py - T * 0.98);
      }
    }
    if (b.lvl > 1 && b.type !== 'wall') drawStars(px, py - T * 0.78 - (isTower(b) ? 6 : 0), b.lvl, 4);
    // 选中框
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

/* ================= 绘制：全局 ================= */
function drawGround() {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#9cd06c' : '#a8d878';
      ctx.fillRect(x * T, y * T, T, T);
    }
  }
  // 边缘出怪带
  ctx.fillStyle = 'rgba(70,50,20,0.15)';
  ctx.fillRect(0, 0, W, T * 0.5); ctx.fillRect(0, H - T * 0.5, W, T * 0.5);
  ctx.fillRect(0, 0, T * 0.5, H); ctx.fillRect(W - T * 0.5, 0, T * 0.5, H);
  // 装饰
  for (const d of decor) {
    const px = d.x * T, py = d.y * T;
    if (d.k === 0) { // 小花
      ctx.fillStyle = ['#fff', '#ffe9a8', '#ffd1e8'][Math.floor(d.r * 3) % 3];
      for (let i = 0; i < 4; i++) {
        const a = d.r + i * TAU / 4;
        ctx.beginPath(); ctx.arc(px + Math.cos(a) * 2.2, py + Math.sin(a) * 2.2, 1.4, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#ffcf4d';
      ctx.beginPath(); ctx.arc(px, py, 1.3, 0, TAU); ctx.fill();
    } else if (d.k === 1) { // 石子
      ctx.fillStyle = 'rgba(90,110,70,0.5)';
      ctx.beginPath(); ctx.ellipse(px, py, 2.6, 1.8, d.r, 0, TAU); ctx.fill();
    } else { // 草
      ctx.strokeStyle = 'rgba(80,130,50,0.6)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px, py); ctx.lineTo(px - 2, py - 4);
      ctx.moveTo(px, py); ctx.lineTo(px + 2, py - 4);
      ctx.stroke();
    }
  }
}

function nightAlpha() {
  if (state.phase === 'night') return Math.min(0.48, 0.18 + state.nightT * 0.24);
  if (state.phase === 'day' && state.dayT > DAY_LEN - 2) return (DAY_LEN - state.dayT) / 2 * -0.48 + 0.48; // 渐亮
  return 0;
}

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (state.shake > 0) {
    ctx.translate(rnd(-1, 1) * state.shake * 8, rnd(-1, 1) * state.shake * 8);
  }
  drawGround();
  // 商家摊位（含鬼影模式下高亮可建商家）
  const highlightStalls = placing === 'mine';
  for (const s of stalls.values()) {
    drawStall(s);
    if (highlightStalls && !s.dead && !s.mine) {
      const pulse = 0.4 + 0.3 * Math.sin(state.time * 5);
      ctx.strokeStyle = 'rgba(255,228,92,' + pulse + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(s.x * T + T / 2, s.y * T + T / 2, T * 0.62, 0, TAU); ctx.stroke();
    }
  }
  // 建筑（按 y 排序画）
  const bs = buildings.slice().sort((a, b) => a.y - b.y);
  for (const b of bs) drawBuilding(b, false);
  // 夜幕：压暗地面与建筑，角色保持鲜亮（后画）
  const na = nightAlpha();
  if (na > 0) {
    ctx.fillStyle = 'rgba(16,20,88,' + na + ')';
    ctx.fillRect(-20, -20, W + 40, H + 40);
    // 站点灯
    const hq = hqB();
    if (hq) {
      const g = ctx.createRadialGradient(hq.x * T + T / 2, hq.y * T + T / 2, 10, hq.x * T + T / 2, hq.y * T + T / 2, 130);
      g.addColorStop(0, 'rgba(255,226,122,' + (na * 0.5) + ')');
      g.addColorStop(1, 'rgba(255,226,122,0)');
      ctx.fillStyle = g;
      ctx.fillRect(hq.x * T - 140, hq.y * T - 140, 280, 280);
    }
  }
  // 袋鼠
  for (const c of couriers) {
    const px = c.fx * T + T / 2, py = c.fy * T + T / 2;
    const hasBox = (c.kind === 'money' && c.mode === 'go') || (c.kind === 'ammo' && c.mode === 'go');
    drawCourier(px, py, c.t || 0, c.dir, hasBox ? (c.kind === 'ammo' ? 'ammo' : 'money') : null);
    if (c.warn > 0) {
      ctx.fillStyle = (state.time % 0.6 < 0.3) ? '#ffdf5e' : '#ff9a3d';
      ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('⚠', px, py - T * 0.9);
    }
  }
  // 敌人（按 y 排序）
  const es = enemies.slice().sort((a, b) => a.fy - b.fy);
  for (const e of es) {
    const px = e.fx * T + T / 2, py = e.fy * T + T / 2;
    const attacking = e.tb && Math.hypot(e.tb.x + 0.5 - e.fx, e.tb.y + 0.5 - e.fy) < 1.0;
    const alphaMul = e.spawnT > 0 ? 0.6 : 1;
    if (!drawEnemySprite(e, px, py, attacking, alphaMul)) {
      if (e.spawnT > 0) ctx.globalAlpha = 0.6;
      const sc = e.type === 'mother' ? 1.15 : 1.28;
      ctx.save();
      ctx.translate(px, py); ctx.scale(sc, sc); ctx.translate(-px, -py);
      switch (e.type) {
        case 'nailong': drawNailong(px, py, e.t, e.dir, attacking, e.flash > 0); break;
        case 'frog': drawFrog(px, py, e.t, e.dir, attacking, e.flash > 0); break;
        case 'baoba': drawBaoba(px, py, e.t, e.dir, attacking, e.flash > 0); break;
        case 'mother': drawMother(px, py, e.t, e.dir, attacking, e.flash > 0); break;
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    // 血条（Boss 常显；精灵敌人按精灵实际高度定位在头顶上方）
    if (e.hp < e.maxhp || e.type === 'mother') {
      const w = e.type === 'mother' ? 60 : 20;
      const yy = e.type === 'mother' ? py - T * 4.7 : py - (ENEMY_SPRITE_H[e.type] || T * 1.4) * 1.02 - 8;
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
      ctx.fillStyle = '#ffc46b';
      ctx.beginPath(); ctx.arc(px - 1.6, py - 1.6, 1.8, 0, TAU); ctx.fill();
    } else if (p.kind === 'pearl') {
      const px = p.fx * T + T / 2, py = p.fy * T + T / 2;
      ctx.fillStyle = 'rgba(91,58,41,0.35)';
      ctx.beginPath(); ctx.arc(px, py, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5b3a29';
      ctx.beginPath(); ctx.arc(px, py, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8a6446';
      ctx.beginPath(); ctx.arc(px - 1.4, py - 1.4, 1.8, 0, TAU); ctx.fill();
    } else {
      const px = p.fx * T + T / 2, py = p.fy * T + T / 2;
      ctx.fillStyle = 'rgba(150,220,255,0.35)';
      ctx.beginPath(); ctx.arc(px, py, 8.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#d8f2ff'; ctx.strokeStyle = '#7cc4e8'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(px, py, 4.8, 0, TAU); ctx.fill(); ctx.stroke();
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
        const segs = 4;
        for (let s = 1; s <= segs; s++) {
          const tt = s / segs;
          const jx = (s === segs) ? 0 : rnd(-4, 4);
          const jy = (s === segs) ? 0 : rnd(-4, 4);
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
    } else if (p.kind === 'spark' || p.kind === 'snow') {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + p.t * 2), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // 飘字
  ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of floats) {
    const a = f.t < 0.15 ? f.t / 0.15 : 1 - Math.max(0, (f.t - 0.8) / 0.6);
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3;
    ctx.strokeText(f.txt, f.x, f.y - f.t * 22);
    ctx.fillStyle = f.color;
    ctx.fillText(f.txt, f.x, f.y - f.t * 22);
    ctx.globalAlpha = 1;
  }
  // 出怪预警圈
  for (const sf of spawnFlashes) {
    const a = sf.t / 0.8;
    ctx.strokeStyle = 'rgba(255,80,80,' + a * 0.9 + ')';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(sf.x * T + T / 2, sf.y * T + T / 2, T * (1.4 - a), 0, TAU); ctx.stroke();
  }
  // 建造鬼影
  if (placing && hover && state.phase !== 'menu' && state.phase !== 'over' && state.phase !== 'win') {
    const ok = canPlace(placing, hover.x, hover.y) && state.money >= BLD[placing].cost;
    const afford = state.money >= BLD[placing].cost;
    const c = ok && afford ? 'rgba(126,217,87,0.4)' : 'rgba(255,95,95,0.4)';
    ctx.fillStyle = c;
    ctx.fillRect(hover.x * T + 1, hover.y * T + 1, T - 2, T - 2);
    const ghostB = { id: 9999, x: hover.x, y: hover.y, type: placing, lvl: 1, hp: 1, maxhp: 1, ammo: BLD[placing].ammo || 0, maxammo: BLD[placing].ammo || 0, flash: 0, invested: 0, cool: 0, t: 0, stall: placing === 'mine' ? stalls.get(key(hover.x, hover.y)) : null };
    drawBuilding(ghostB, true);
    if (BLD[placing].range) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.6;
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.arc(hover.x * T + T / 2, hover.y * T + T / 2, BLD[placing].range * T, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (!afford) {
      ctx.fillStyle = '#ff5f5f'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('💰不足', hover.x * T + T / 2, hover.y * T - 4);
    }
  }
}

/* ================= HUD / UI ================= */
function updateHUD() {
  el.money.textContent = Math.floor(state.money);
  const hq = hqB();
  el.ammo.textContent = Math.floor(state.hqAmmo) + '/' + hqAmmoCap();
  if (hq) {
    el.hqBar.style.width = clamp(hq.hp / hq.maxhp * 100, 0, 100) + '%';
    el.hqHp.textContent = Math.ceil(hq.hp) + '/' + hq.maxhp;
  } else {
    el.hqBar.style.width = '0%';
    el.hqHp.textContent = '已沦陷';
  }
  if (state.phase === 'day') {
    el.phase.textContent = '☀️ 第 ' + state.day + ' 天 · 白天 ' + Math.ceil(state.dayT) + 's' + (state.endless ? ' · 无尽' : ' · ' + state.day + '/' + MAX_NIGHT);
    el.skip.style.display = '';
  } else if (state.phase === 'night') {
    el.phase.textContent = '🌙 第 ' + state.day + ' 夜 · 来敌 ' + (enemies.length + waveQueue.length);
    el.skip.style.display = 'none';
  } else {
    el.phase.textContent = state.phase === 'menu' ? '🐲 准备开业' : '';
    el.skip.style.display = 'none';
  }
  // 卡片可用性
  for (const t of BUILD_ORDER) {
    cardEls[t].classList.toggle('poor', state.money < BLD[t].cost);
  }
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
    if (!state.hintsDone.mine && state.day === 1) {
      h = '👋 新手引导：按【1】选中采集站，再点地图上的 🍜 外卖商家，袋鼠就开始送餐赚钱';
    } else if (state.hintsDone.mine && !state.hintsDone.tower) {
      h = '👍 有收入了！按【3】建奶茶塔守在站点/商家旁边（弹药靠站点袋鼠补给，别建太远）';
    } else if (state.hintsDone.tower && !state.hintsDone.wall && state.day === 1) {
      h = '💡 奶龙拆楼很快，按【2】用便宜的保温墙挡在前面，塔在后面输出';
    }
  }
  if (h === lastHint) return;
  lastHint = h;
  if (h) { el.hint.textContent = h; el.hint.style.display = 'block'; }
  else el.hint.style.display = 'none';
}

/* --- 建造栏 --- */
const cardEls = {};
function buildBuildbar() {
  BUILD_ORDER.forEach((t, i) => {
    const cfg = BLD[t];
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<span class="key">' + (i + 1) + '</span><div class="ico">' + cfg.emoji + '</div><div class="nm">' + cfg.name + '</div><div class="pr">💰' + cfg.cost + '</div>';
    card.addEventListener('click', () => selectPlacing(t));
    card.addEventListener('mouseenter', e => showTip(e.target, '<b>' + cfg.emoji + ' ' + cfg.name + '（💰' + cfg.cost + '）</b><div class="d">' + cfg.desc + '</div>'));
    card.addEventListener('mouseleave', hideTip);
    el.buildbar.appendChild(card);
    cardEls[t] = card;
  });
  const sell = document.createElement('div');
  sell.className = 'card';
  sell.id = 'sellBtn';
  sell.innerHTML = '<span class="key">X</span><div class="ico">🗑️</div><div class="nm">出售</div><div class="pr">回收60%</div>';
  sell.addEventListener('click', () => { sellMode = !sellMode; placing = null; syncBar(); sfx('click'); });
  sell.addEventListener('mouseenter', e => showTip(e.target, '<b>🗑️ 出售模式</b><div class="d">点击场上建筑出售，回收 60% 投入。右键/Esc 取消。</div>'));
  sell.addEventListener('mouseleave', hideTip);
  el.buildbar.appendChild(sell);
  cardEls.__sell = sell;
}
function selectPlacing(t) {
  if (placing === t) placing = null;
  else { placing = t; sellMode = false; }
  selected = null; closePanel();
  syncBar(); sfx('click');
}
function syncBar() {
  for (const t in cardEls) {
    if (t === '__sell') continue;
    cardEls[t].classList.toggle('sel', placing === t);
  }
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

/* --- 信息面板 --- */
function selectB(b) {
  selected = b; sellMode = false; placing = null; syncBar();
  refreshPanel();
  sfx('click');
}
function closePanel() { el.panel.style.display = 'none'; }
function refreshPanel() {
  const b = selected;
  if (!b) { closePanel(); return; }
  el.panel.style.display = 'block';
  if (b.type === 'hq') {
    el.ipName.textContent = '🏚️ 外卖站点';
    el.ipLv.textContent = '本局核心 · Lv.' + b.lvl;
    el.ipHp.textContent = Math.ceil(b.hp) + ' / ' + b.maxhp;
    el.ipHpBar.style.width = clamp(b.hp / b.maxhp * 100, 0, 100) + '%';
    el.ipStat.textContent = '弹药 ' + hqAmmoRate().toFixed(2) + '/s';
    el.upBtn.textContent = b.lvl >= 3 ? '已满级' : '⬆ 升级 💰' + upCost(b);
    el.upBtn.disabled = b.lvl >= 3;
    el.sellBtn2.style.display = 'none';
    return;
  }
  el.sellBtn2.style.display = '';
  const cfg = BLD[b.type];
  el.ipName.textContent = cfg.emoji + ' ' + cfg.name + (b.dead ? '（已歇业）' : '');
  el.ipLv.textContent = 'Lv.' + b.lvl + (b.lvl >= 3 ? ' · 满级' : '');
  el.ipHp.textContent = Math.ceil(b.hp) + ' / ' + b.maxhp;
  el.ipHpBar.style.width = clamp(b.hp / b.maxhp * 100, 0, 100) + '%';
  if (b.type === 'mine') {
    el.ipStat.textContent = '每趟 +' + b.load + '💰 · 袋鼠' + couriers.filter(c => c.mineId === b.id).length + '只 · 余单 ' + Math.max(0, b.stall.amount);
  } else if (isTower(b)) {
    el.ipStat.textContent = '伤' + Math.round(cfg.dmg * dmgMul(b)) + ' · ' + cfg.rate.toFixed(1) + '/s · 弹' + b.ammo + '/' + b.maxammo;
  } else {
    el.ipStat.textContent = '耐久砖墙';
  }
  el.upBtn.textContent = b.lvl >= 3 ? '已满级' : '⬆ 升级 💰' + upCost(b);
  el.upBtn.disabled = b.lvl >= 3;
}
el.upBtn.addEventListener('click', () => { if (selected) upgrade(selected); });
el.sellBtn2.addEventListener('click', () => { if (selected) sellB(selected); });

/* --- 顶栏按钮 --- */
el.skip.addEventListener('click', () => {
  if (state.phase === 'day') { state.dayT = 0.01; sfx('click'); }
});
el.pause.addEventListener('click', () => {
  state.paused = !state.paused;
  el.pause.textContent = state.paused ? '▶' : '⏸';
  sfx('click');
});
el.speed.addEventListener('click', () => {
  state.speed = state.speed === 1 ? 2 : 1;
  el.speed.textContent = '▶▶ ' + state.speed + 'x';
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
el.endlessBtn.addEventListener('click', () => {
  el.endOv.classList.add('hidden');
  state.endless = true;
  state.day++;
  state.phase = 'day';
  state.dayT = DAY_LEN;
  showBanner('♾️ 无尽模式开启', '第 ' + state.day + ' 天起，夜晚将越来越狰狞');
  sfx('dawn');
});

/* ================= 输入 ================= */
function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * W;
  const y = (e.clientY - r.top) / r.height * H;
  return { x, y, tx: Math.floor(x / T), ty: Math.floor(y / T) };
}
canvas.addEventListener('mousemove', e => {
  const p = canvasPos(e);
  hover = (p.tx >= 0 && p.ty >= 0 && p.tx < N && p.ty < N) ? { x: p.tx, y: p.ty } : null;
});
canvas.addEventListener('mouseleave', () => { hover = null; });
canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  placing = null; sellMode = false; selected = null; closePanel(); syncBar();
});
canvas.addEventListener('mousedown', e => {
  if (state.phase === 'menu' || state.phase === 'over' || state.phase === 'win') return;
  audioCtx();
  const p = canvasPos(e);
  if (e.button !== 0) return;
  if (p.tx < 0 || p.ty < 0 || p.tx >= N || p.ty >= N) return;
  const b = grid[p.ty][p.tx];
  if (placing) {
    if (tryPlace(placing, p.tx, p.ty) && !e.shiftKey) { /* 保持连续建造 */ }
    return;
  }
  if (sellMode && b) {
    if (b.type === 'hq') { floatText('站点不能卖！', p.tx + 0.5, p.ty, '#ff8080'); sfx('error'); return; }
    sellB(b); return;
  }
  if (b) selectB(b);
  else { selected = null; closePanel(); }
});
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  const k = e.key;
  if (k >= '1' && k <= '6') {
    const t = BUILD_ORDER[+k - 1];
    if (t) selectPlacing(t);
  } else if (k === 'x' || k === 'X') {
    sellMode = !sellMode; placing = null; selected = null; closePanel(); syncBar(); sfx('click');
  } else if (k === 'Escape') {
    placing = null; sellMode = false; selected = null; closePanel(); syncBar();
  } else if (k === ' ') {
    e.preventDefault();
    state.paused = !state.paused;
    el.pause.textContent = state.paused ? '▶' : '⏸';
  }
});

/* ================= 主循环 ================= */
let last = performance.now();
let lastFrameAt = performance.now();
function frame(now) {
  lastFrameAt = performance.now();
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!state.paused && (state.phase === 'day' || state.phase === 'night')) {
    for (let i = 0; i < state.speed; i++) update(dt);
  } else {
    updateFX(dt); // 菜单/结束时粒子仍飘
  }
  draw();
  updateHUD();
  requestAnimationFrame(frame);
}
// 看门狗：rAF 被节流/停摆时（后台标签、部分无头环境）用定时器兜底驱动
setInterval(() => {
  if (performance.now() - lastFrameAt > 300) frame(performance.now());
}, 33);
requestAnimationFrame(frame);

/* ================= 调试接口 ================= */
window.G = {
  get state() { return state; },
  get buildings() { return buildings; },
  get enemies() { return enemies; },
  get couriers() { return couriers; },
  money(n) { state.money += n; },
  place(x, y, t) { return tryPlace(t, x, y, true); },
  night() { if (state.phase === 'day') state.dayT = 0.01; },
  spawn(type, x, y) { const e = spawnEnemy(type); if (x !== undefined) { e.fx = x; e.fy = y; } return e; },
  heal() { const hq = hqB(); hq.hp = hq.maxhp; },
  hq() { return hqB(); },
  clearNight() { waveQueue.length = 0; enemies.length = 0; },
  endNight() { endNight(); },
  step(dt, skipDraw) { update(dt); if (!skipDraw) { draw(); updateHUD(); } },
  sprites() { return Object.keys(SPRITES).map(k => k + ':' + spriteReady(k)); },
};

/* ================= 启动 ================= */
genWorld();
buildBuildbar();
loadSprites();
el.sound.textContent = muted ? '🔇' : '🔊';
el.best.textContent = state.bestNight > 0
  ? ('🏆 历史最佳：撑过第 ' + state.bestNight + ' 夜')
  : '提示：数字键 1-6 快捷选建筑，右键取消，空格暂停';
requestAnimationFrame(frame);

})();
