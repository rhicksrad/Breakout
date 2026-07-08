/* ==========================================================================
   NEON BREAKOUT
   A zero-dependency canvas game. Everything — physics, audio, particles,
   levels, UI — lives in this file and runs from file:// with no build step.

   Highlights:
   - Fixed-timestep simulation (120 Hz) with swept circle-vs-AABB collision,
     so balls never tunnel through bricks or the paddle at any speed.
   - Paddle "english": reflection angle derives from impact point + paddle
     velocity, making aim a skill.
   - Combo system with rising musical pitch, score multipliers, popups.
   - 100% procedural WebAudio sound — no audio assets.
   - Pooled particles, screen shake, hit-stop, ball trails, starfield.
   - 8 designed levels, then endless procedurally generated symmetric boards.
   ========================================================================== */
(() => {
'use strict';

/* ---------------------------------------------------------------- config */
const W = 960, H = 720;              // logical arena size (letterboxed)
const HUD_H = 56;                    // top HUD strip inside the arena
const WALL = 6;                      // playfield wall thickness
const PHYS_STEP = 1 / 120;           // fixed physics timestep
const MAX_BALLS = 12;

const PADDLE = { w: 116, wWide: 178, h: 16, y: H - 44, speed: 900 };
const BALL = { r: 7, baseSpeed: 380, levelSpeed: 14, rallyGain: 0.011, rallyCap: 34 };

const BRICK_COLS = 12;
const BRICK_TOP = HUD_H + 34;
const BRICK_MARGIN = 26;
const BRICK_W = (W - BRICK_MARGIN * 2) / BRICK_COLS;
const BRICK_H = 26;
const BRICK_GAP = 4;

const EFFECT_TIME = { expand: 12, laser: 8, slow: 8, sticky: 10, fire: 6 };
const DROP_BASE = 0.15;              // powerup drop chance, decays with level

const TIERS = {
  '1': { hp: 1, pts: 50,  color: '#22d3ee' },
  '2': { hp: 1, pts: 70,  color: '#4ade80' },
  '3': { hp: 1, pts: 90,  color: '#facc15' },
  '4': { hp: 1, pts: 110, color: '#fb7185' },
  'S': { hp: 3, pts: 150, color: '#94a3b8' },
  'X': { hp: 1, pts: 120, color: '#fb923c', explosive: true },
  '#': { hp: Infinity, pts: 0, color: '#3f4a5c', solid: true },
};

const POWERUPS = {
  expand: { key: 'E', color: '#4ade80', label: 'WIDE PADDLE',  weight: 20 },
  multi:  { key: 'M', color: '#22d3ee', label: 'MULTIBALL',    weight: 16 },
  laser:  { key: 'L', color: '#fb7185', label: 'LASERS',       weight: 14 },
  slow:   { key: 'S', color: '#a78bfa', label: 'SLOW-MO',      weight: 14 },
  sticky: { key: 'C', color: '#34d399', label: 'CATCH',        weight: 12 },
  fire:   { key: 'F', color: '#fb923c', label: 'FIREBALL',     weight: 10 },
  life:   { key: '+', color: '#f472b6', label: 'EXTRA LIFE',   weight: 4  },
};
const CAP_SPRITES = { multi: 'cap_multi', fire: 'cap_fire', expand: 'cap_expand', laser: 'cap_laser' };

/* ----------------------------------------------------------------- utils */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const TAU = Math.PI * 2;

function weightedPick(table) {
  let total = 0;
  for (const k in table) total += table[k].weight;
  let roll = Math.random() * total;
  for (const k in table) { roll -= table[k].weight; if (roll <= 0) return k; }
  return Object.keys(table)[0];
}

/* ---------------------------------------------------------------- assets */
/* All art/music is CC0 (see README). Everything degrades gracefully: any
   sprite that hasn't loaded (or fails) falls back to the vector renderer,
   so the game is playable the instant the script runs. */
const FONT = '"Orbitron", "Segoe UI", system-ui, sans-serif';

const IMG = {};
for (const name of ['brick_t1', 'brick_t1_cracked', 'brick_t2', 'brick_t2_cracked',
                    'brick_t3', 'brick_t3_cracked', 'brick_t4', 'brick_t4_cracked',
                    'brick_steel', 'brick_steel_cracked', 'brick_boom', 'brick_boom_cracked',
                    'brick_solid', 'paddle', 'paddle_wide', 'ball', 'heart', 'star',
                    'cap_blank', 'cap_multi', 'cap_fire', 'cap_expand', 'cap_laser',
                    'nebula_blue', 'nebula_purple', 'nebula_green']) {
  const img = new Image();
  img.src = `assets/${name.startsWith('nebula') ? 'img' : 'sprites'}/${name}.png`;
  IMG[name] = img;
}
const ok = (img) => img && img.complete && img.naturalWidth > 0;

try {
  const face = new FontFace('Orbitron', "url('assets/fonts/orbitron.ttf')", { weight: '400 900' });
  face.load().then((f) => document.fonts.add(f)).catch(() => {});
} catch {}

const MUSIC = new Audio('assets/music/space_ranger.mp3');
MUSIC.loop = true;
MUSIC.volume = 0.4;
MUSIC.preload = 'auto';

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('neonbreakout.' + key); return v === null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('neonbreakout.' + key, JSON.stringify(value)); } catch {}
  },
};

/* -----------------------------------------------------------------------
   Swept collision: segment (px,py)→(px+dx,py+dy) vs AABB expanded by the
   ball radius. Returns earliest hit { t in (0,1], nx, ny } or null.
   Starting inside the box returns null — the ball escapes on its own,
   which avoids sticky re-collision loops.
   ----------------------------------------------------------------------- */
function sweep(px, py, dx, dy, x0, y0, x1, y1, r) {
  x0 -= r; y0 -= r; x1 += r; y1 += r;
  let tmin = -Infinity, tmax = Infinity, nx = 0, ny = 0;
  if (dx !== 0) {
    const inv = 1 / dx;
    let t1 = (x0 - px) * inv, t2 = (x1 - px) * inv;
    const lo = Math.min(t1, t2), hi = Math.max(t1, t2);
    if (lo > tmin) { tmin = lo; nx = dx > 0 ? -1 : 1; ny = 0; }
    tmax = Math.min(tmax, hi);
  } else if (px < x0 || px > x1) return null;
  if (dy !== 0) {
    const inv = 1 / dy;
    let t1 = (y0 - py) * inv, t2 = (y1 - py) * inv;
    const lo = Math.min(t1, t2), hi = Math.max(t1, t2);
    if (lo > tmin) { tmin = lo; nx = 0; ny = dy > 0 ? -1 : 1; }
    tmax = Math.min(tmax, hi);
  } else if (py < y0 || py > y1) return null;
  if (tmax < tmin || tmin <= 0 || tmin > 1) return null;
  return { t: tmin, nx, ny };
}

/* ----------------------------------------------------------------- audio */
/* Every sound is synthesized on the fly: oscillators for tones, filtered
   white noise for impacts/explosions. Combo pitch climbs a semitone scale. */
class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = store.get('muted', false);
  }
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }
  toggleMute() {
    this.muted = !this.muted;
    store.set('muted', this.muted);
    if (this.muted) MUSIC.pause();
    else this.startMusic();
    return this.muted;
  }
  startMusic() {
    if (this.muted) return;
    MUSIC.play().catch(() => {});   // requires a user gesture; retried on next action
  }
  tone({ freq = 440, end = 0, type = 'sine', dur = 0.12, vol = 0.4, delay = 0 }) {
    if (this.muted || !this.ensure()) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (end) osc.frequency.exponentialRampToValueAtTime(Math.max(end, 1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  noise({ dur = 0.2, vol = 0.4, freq = 1200, end = 0, q = 1, delay = 0 }) {
    if (this.muted || !this.ensure()) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0);
    if (end) f.frequency.exponentialRampToValueAtTime(Math.max(end, 20), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }
  wall()   { this.tone({ freq: 200, end: 160, type: 'triangle', dur: 0.06, vol: 0.18 }); }
  paddle() { this.tone({ freq: 260, end: 320, type: 'square', dur: 0.07, vol: 0.16 });
             this.tone({ freq: 520, type: 'sine', dur: 0.09, vol: 0.12 }); }
  brick(combo) {
    const f = 440 * Math.pow(2, Math.min(combo, 24) / 12);
    this.tone({ freq: f, end: f * 1.3, type: 'triangle', dur: 0.1, vol: 0.28 });
    this.noise({ dur: 0.06, vol: 0.12, freq: 3000, q: 2 });
  }
  steel()  { this.tone({ freq: 1400, end: 900, type: 'square', dur: 0.05, vol: 0.1 });
             this.noise({ dur: 0.05, vol: 0.15, freq: 5000, q: 4 }); }
  boom()   { this.noise({ dur: 0.45, vol: 0.5, freq: 400, end: 60, q: 0.7 });
             this.tone({ freq: 90, end: 40, type: 'sine', dur: 0.4, vol: 0.5 }); }
  laser()  { this.tone({ freq: 1200, end: 300, type: 'sawtooth', dur: 0.12, vol: 0.14 }); }
  powerup(){ [523, 659, 784, 1047].forEach((f, i) =>
               this.tone({ freq: f, type: 'triangle', dur: 0.1, vol: 0.2, delay: i * 0.05 })); }
  launch() { this.tone({ freq: 300, end: 700, type: 'triangle', dur: 0.15, vol: 0.2 }); }
  lose()   { this.tone({ freq: 300, end: 80, type: 'sawtooth', dur: 0.5, vol: 0.28 }); }
  life()   { [392, 523, 659, 784, 1047].forEach((f, i) =>
               this.tone({ freq: f, type: 'sine', dur: 0.15, vol: 0.22, delay: i * 0.07 })); }
  clear()  { [523, 659, 784, 1047, 1319].forEach((f, i) =>
               this.tone({ freq: f, type: 'triangle', dur: 0.22, vol: 0.22, delay: i * 0.09 })); }
  over()   { [440, 349, 294, 220].forEach((f, i) =>
               this.tone({ freq: f, type: 'sawtooth', dur: 0.3, vol: 0.16, delay: i * 0.18 })); }
}

/* ------------------------------------------------------------- particles */
/* One pooled array for everything: sparks (additive dots), shards (rotating
   brick fragments with gravity), and rings (expanding shockwaves). */
class Particles {
  constructor(max = 900) {
    this.pool = Array.from({ length: max }, () => ({ alive: false }));
    this.cursor = 0;
  }
  spawn(props) {
    for (let i = 0; i < this.pool.length; i++) {
      this.cursor = (this.cursor + 1) % this.pool.length;
      const p = this.pool[this.cursor];
      if (!p.alive) { Object.assign(p, { alive: true, age: 0, rot: 0, vr: 0, grav: 0, size: 3 }, props); return; }
    }
  }
  sparks(x, y, color, n, speed = 220) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(0.2, 1) * speed;
      this.spawn({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                   life: rand(0.25, 0.6), size: rand(1.5, 3.5), color });
    }
  }
  shards(x, y, w, h, color, n = 8) {
    for (let i = 0; i < n; i++) {
      this.spawn({ kind: 'shard', x: x + rand(0, w), y: y + rand(0, h),
                   vx: rand(-160, 160), vy: rand(-260, -40), grav: 720,
                   vr: rand(-9, 9), rot: rand(0, TAU),
                   life: rand(0.5, 0.9), size: rand(3, 7), color });
    }
  }
  ring(x, y, color, maxR = 80) {
    this.spawn({ kind: 'ring', x, y, vx: 0, vy: 0, life: 0.35, maxR, color });
  }
  update(dt) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) { p.alive = false; continue; }
      p.vy += (p.grav || 0) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += (p.vr || 0) * dt;
    }
  }
  render(ctx) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      const k = 1 - p.age / p.life;
      if (p.kind === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * k, 0, TAU); ctx.fill();
      } else if (p.kind === 'shard') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
        ctx.restore();
      } else if (p.kind === 'ring') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = k * 0.8;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * k;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.maxR * (1 - k), 0, TAU); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

/* ---------------------------------------------------------------- levels */
/* Rows are 12-char strings. '.' empty · 1-4 colored tiers · S steel(3hp)
   · X explosive · # indestructible (doesn't count toward level clear). */
const LEVELS = [
  { name: 'FIRST CONTACT', rows: [
    '444444444444',
    '333333333333',
    '222222222222',
    '111111111111',
  ]},
  { name: 'CHECKERBOARD', rows: [
    '4.4.4.4.4.4.',
    '.3.3.3.3.3.3',
    '2.2.2.2.2.2.',
    '.1.1.1.1.1.1',
    '2.2.2.2.2.2.',
    '.3.3.3.3.3.3',
  ]},
  { name: 'THE VAULT', rows: [
    'SSSSSSSSSSSS',
    'S4444444444S',
    'S3XX3333XX3S',
    'S2222222222S',
    'S1111111111S',
    'SSSSSSSSSSSS',
  ]},
  { name: 'DIAMOND', rows: [
    '.....44.....',
    '....4334....',
    '...432234...',
    '..43211234..',
    '.4321XX1234.',
    '..43211234..',
    '...432234...',
    '....4334....',
    '.....44.....',
  ]},
  { name: 'FORTRESS', rows: [
    '..#......#..',
    '..#.4444.#..',
    '..#.3XX3.#..',
    '..#.3223.#..',
    '..#.1111.#..',
    '..#......#..',
    'SS#..SS..#SS',
  ]},
  { name: 'INVADER', rows: [
    '..3......3..',
    '...3....3...',
    '..33333333..',
    '.33X3333X33.',
    '333333333333',
    '3.33333333.3',
    '3.3......3.3',
    '...33..33...',
  ]},
  { name: 'TWIN CORES', rows: [
    '.SS......SS.',
    'S44S....S44S',
    'S4XS....S4XS',
    'S44S....S44S',
    '.SS......SS.',
    '..2211112...',
    '..1122221...',
  ]},
  { name: 'THE WALL', rows: [
    'S4S4S4S4S4S4',
    '444444444444',
    '3X3333333X33',
    '333333333333',
    '2222XX222222',
    '222222222222',
    '111111111111',
  ]},
];

/* Endless mode: mirrored random boards that get denser with depth. */
function generateLevel(index) {
  const depth = index - LEVELS.length;
  const rows = [];
  const numRows = clamp(5 + Math.floor(depth / 2), 5, 11);
  const density = clamp(0.55 + depth * 0.03, 0.55, 0.85);
  for (let r = 0; r < numRows; r++) {
    let half = '';
    for (let c = 0; c < BRICK_COLS / 2; c++) {
      if (Math.random() > density) { half += '.'; continue; }
      const roll = Math.random();
      if (roll < 0.06) half += 'X';
      else if (roll < 0.06 + Math.min(0.16, depth * 0.02)) half += 'S';
      else if (roll < 0.14 && depth > 3) half += '#';
      else half += String(randInt(1, 4));
    }
    rows.push(half + [...half].reverse().join(''));
  }
  return { name: `SECTOR ${String(index + 1).padStart(2, '0')}`, rows };
}

const SKINS = { '1': 'brick_t1', '2': 'brick_t2', '3': 'brick_t3', '4': 'brick_t4',
                'S': 'brick_steel', 'X': 'brick_boom', '#': 'brick_solid' };

function buildBricks(def) {
  const bricks = [];
  def.rows.forEach((row, r) => {
    for (let c = 0; c < Math.min(row.length, BRICK_COLS); c++) {
      const ch = row[c];
      if (!(ch in TIERS)) continue;
      const t = TIERS[ch];
      bricks.push({
        skin: SKINS[ch],
        x: BRICK_MARGIN + c * BRICK_W + BRICK_GAP / 2,
        y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
        w: BRICK_W - BRICK_GAP, h: BRICK_H,
        hp: t.hp, maxHp: t.hp, pts: t.pts, color: t.color,
        explosive: !!t.explosive, solid: !!t.solid, alive: true,
        flash: 0,
      });
    }
  });
  return bricks;
}

/* ------------------------------------------------------------------ game */
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sound = new Sound();
    this.particles = new Particles();

    this.state = 'title';           // title | playing | paused | clear | gameover
    this.best = store.get('best', 0);
    this.stars = Array.from({ length: 110 }, () => ({
      x: rand(0, W), y: rand(0, H), z: rand(0.2, 1), tw: rand(0, TAU),
    }));

    this.shake = 0;
    this.freeze = 0;                // hit-stop timer (real seconds)
    this.flash = 0;                 // full-screen flash alpha
    this.texts = [];                // floating score popups
    this.stateTimer = 0;

    this.input = { x: W / 2, left: false, right: false, firePressed: false, fireHeld: false };
    this._bindInput();
    this._resize();
    addEventListener('resize', () => this._resize());

    this._last = performance.now();
    this._acc = 0;
    requestAnimationFrame((t) => this._frame(t));
  }

  /* -------------------------------------------------- run state control */
  newGame() {
    this.state = 'playing';
    this.level = 0;
    this.score = 0;
    this.lives = 3;
    this.combo = 0;
    this.maxCombo = 0;
    this.bricksBroken = 0;
    this.effects = { expand: 0, laser: 0, slow: 0, sticky: 0, fire: 0 };
    this.lasers = [];
    this.drops = [];
    this.explosions = [];
    this.paddle = { x: W / 2, vx: 0, w: PADDLE.w };
    this.loadLevel(0);
    this.sound.launch();
  }

  loadLevel(i) {
    this.level = i;
    const def = i < LEVELS.length ? LEVELS[i] : generateLevel(i);
    this.levelName = def.name;
    this.bricks = buildBricks(def);
    this.balls = [];
    this.drops = [];
    this.lasers = [];
    this.explosions = [];
    this.rally = 0;
    this.banner = 2.0;              // "LEVEL N" banner countdown
    for (const k in this.effects) this.effects[k] = 0;
    this.spawnStuckBall();
  }

  spawnStuckBall() {
    this.balls.push({ x: this.paddle.x, y: PADDLE.y - BALL.r - PADDLE.h / 2 - 1,
                      vx: 0, vy: 0, stuck: true, stickOffset: 0, trail: [] });
  }

  ballSpeed() {
    const ramp = 1 + Math.min(this.rally, BALL.rallyCap) * BALL.rallyGain;
    const slow = this.effects.slow > 0 ? 0.62 : 1;
    return (BALL.baseSpeed + this.level * BALL.levelSpeed) * ramp * slow;
  }

  launchBall(ball) {
    ball.stuck = false;
    const rel = clamp((ball.x - this.paddle.x) / (this.paddle.w / 2), -0.8, 0.8);
    const angle = rel * 0.9;
    const sp = this.ballSpeed();
    ball.vx = Math.sin(angle) * sp;
    ball.vy = -Math.cos(angle) * sp;
    this.sound.launch();
  }

  loseLife() {
    this.lives--;
    this.combo = 0;
    this.flash = 0.5;
    this.shake = Math.max(this.shake, 8);
    this.sound.lose();
    if (this.lives <= 0) {
      this.state = 'gameover';
      this.stateTimer = 0;
      if (this.score > this.best) { this.best = this.score; store.set('best', this.best); }
      this.sound.over();
    } else {
      for (const k in this.effects) this.effects[k] = 0;
      this.paddle.w = PADDLE.w;
      this.rally = Math.max(0, this.rally - 10);
      this.spawnStuckBall();
    }
  }

  levelCleared() {
    this.state = 'clear';
    this.stateTimer = 0;
    this.sound.clear();
    if (this.score > this.best) { this.best = this.score; store.set('best', this.best); }
  }

  /* -------------------------------------------------------------- input */
  _bindInput() {
    const c = this.canvas;
    const toGameX = (clientX) => (clientX - this.viewX) / this.viewScale;

    c.addEventListener('mousemove', (e) => { this.input.x = toGameX(e.clientX); });
    c.addEventListener('mousedown', () => this._primaryAction());
    c.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.input.x = toGameX(e.touches[0].clientX);
      this._primaryAction();
    }, { passive: false });
    c.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this.input.x = toGameX(e.touches[0].clientX);
    }, { passive: false });

    addEventListener('keydown', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.input.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.input.right = true;
      if (e.code === 'Space') { e.preventDefault(); this.input.fireHeld = true; this._primaryAction(); }
      if (e.code === 'KeyP' || e.code === 'Escape') this._togglePause();
      if (e.code === 'KeyM') this.sound.toggleMute();
      if (e.code === 'KeyR' && (this.state === 'paused' || this.state === 'gameover')) this.newGame();
      if (e.code === 'KeyQ' && this.state === 'paused') this.state = 'title';
    });
    addEventListener('keyup', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.input.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.input.right = false;
      if (e.code === 'Space') this.input.fireHeld = false;
    });
  }

  _primaryAction() {
    this.sound.ensure();
    this.sound.startMusic();
    if (this.state === 'title') { this.newGame(); return; }
    if (this.state === 'gameover' && this.stateTimer > 0.8) { this.state = 'title'; return; }
    if (this.state === 'clear' && this.stateTimer > 1.2) { this.state = 'playing'; this.loadLevel(this.level + 1); return; }
    if (this.state === 'paused') { this.state = 'playing'; return; }
    if (this.state === 'playing') {
      for (const b of this.balls) if (b.stuck) { this.launchBall(b); return; }
      this.input.firePressed = true;
    }
  }

  _togglePause() {
    if (this.state === 'playing') this.state = 'paused';
    else if (this.state === 'paused') this.state = 'playing';
  }

  /* --------------------------------------------------------- simulation */
  update(dt) {
    this.updatePaddle(dt);

    for (const k in this.effects) if (this.effects[k] > 0) this.effects[k] -= dt;
    if (this.effects.expand > 0) this.paddle.w = lerp(this.paddle.w, PADDLE.wWide, 0.15);
    else this.paddle.w = lerp(this.paddle.w, PADDLE.w, 0.1);

    // Lasers: auto-fire while active; Space/click also fires instantly.
    this.laserCooldown = (this.laserCooldown || 0) - dt;
    if (this.effects.laser > 0 && (this.laserCooldown <= 0 || this.input.firePressed)) {
      this.laserCooldown = 0.34;
      const y = PADDLE.y - PADDLE.h / 2;
      this.lasers.push({ x: this.paddle.x - this.paddle.w / 2 + 12, y },
                       { x: this.paddle.x + this.paddle.w / 2 - 12, y });
      this.sound.laser();
    }
    this.input.firePressed = false;

    for (const ball of this.balls) this.updateBall(ball, dt);
    this.balls = this.balls.filter(b => !b.dead);
    if (this.balls.length === 0 && this.state === 'playing') this.loseLife();

    this.updateLasers(dt);
    this.updateDrops(dt);
    this.updateExplosions(dt);

    if (this.state === 'playing' && this.bricks.every(b => !b.alive || b.solid)) this.levelCleared();
  }

  updatePaddle(dt) {
    const p = this.paddle;
    const prev = p.x;
    let target = p.x;
    if (this.input.left) target -= PADDLE.speed * dt;
    if (this.input.right) target += PADDLE.speed * dt;
    if (!this.input.left && !this.input.right) target = this.input.x;
    p.x = clamp(target, WALL + p.w / 2, W - WALL - p.w / 2);
    p.vx = (p.x - prev) / dt;
    for (const b of this.balls) {
      if (b.stuck) {
        b.x = clamp(p.x + b.stickOffset, WALL + BALL.r, W - WALL - BALL.r);
        b.y = PADDLE.y - PADDLE.h / 2 - BALL.r - 1;
      }
    }
  }

  updateBall(ball, dt) {
    if (ball.stuck) return;

    // Keep speed pinned to the current target so slow-mo & ramps apply live.
    const sp = this.ballSpeed();
    const cur = Math.hypot(ball.vx, ball.vy) || 1;
    ball.vx = ball.vx / cur * sp;
    ball.vy = ball.vy / cur * sp;

    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 10) ball.trail.shift();

    let remaining = dt;
    for (let iter = 0; iter < 6 && remaining > 1e-6; iter++) {
      const dx = ball.vx * remaining, dy = ball.vy * remaining;
      let hit = null, hitObj = null, hitType = null;

      // Walls (left / right / ceiling below HUD)
      if (dx < 0) { const t = (WALL + BALL.r - ball.x) / dx; if (t > 0 && t <= 1 && (!hit || t < hit.t)) { hit = { t, nx: 1, ny: 0 }; hitType = 'wall'; } }
      if (dx > 0) { const t = (W - WALL - BALL.r - ball.x) / dx; if (t > 0 && t <= 1 && (!hit || t < hit.t)) { hit = { t, nx: -1, ny: 0 }; hitType = 'wall'; } }
      if (dy < 0) { const t = (HUD_H + BALL.r - ball.y) / dy; if (t > 0 && t <= 1 && (!hit || t < hit.t)) { hit = { t, nx: 0, ny: 1 }; hitType = 'wall'; } }

      // Paddle (only when descending)
      if (ball.vy > 0) {
        const p = this.paddle;
        const s = sweep(ball.x, ball.y, dx, dy,
          p.x - p.w / 2, PADDLE.y - PADDLE.h / 2, p.x + p.w / 2, PADDLE.y + PADDLE.h / 2, BALL.r);
        if (s && (!hit || s.t < hit.t)) { hit = s; hitType = 'paddle'; }
      }

      // Bricks
      for (const br of this.bricks) {
        if (!br.alive) continue;
        const s = sweep(ball.x, ball.y, dx, dy, br.x, br.y, br.x + br.w, br.y + br.h, BALL.r);
        if (s && (!hit || s.t < hit.t)) { hit = s; hitObj = br; hitType = 'brick'; }
      }

      if (!hit) { ball.x += dx; ball.y += dy; break; }

      ball.x += dx * hit.t + hit.nx * 0.01;
      ball.y += dy * hit.t + hit.ny * 0.01;
      remaining *= (1 - hit.t);

      if (hitType === 'wall') {
        if (hit.nx) ball.vx = Math.abs(ball.vx) * hit.nx;
        if (hit.ny) ball.vy = Math.abs(ball.vy) * hit.ny;
        this.sound.wall();
        this.particles.sparks(ball.x, ball.y, '#67e8f9', 4, 120);
      } else if (hitType === 'paddle') {
        this.hitPaddle(ball, hit);
      } else {
        const pierce = this.effects.fire > 0 && !hitObj.solid;
        if (!pierce) {
          if (hit.nx) ball.vx = Math.abs(ball.vx) * hit.nx;
          if (hit.ny) ball.vy = Math.abs(ball.vy) * hit.ny;
        }
        this.damageBrick(hitObj, this.effects.fire > 0 ? Infinity : 1, ball.x, ball.y);
      }
    }

    if (ball.y - BALL.r > H + 10) ball.dead = true;
  }

  hitPaddle(ball, hit) {
    const p = this.paddle;
    this.rally++;
    this.combo = 0;

    if (this.effects.sticky > 0 && hit.ny < 0) {
      ball.stuck = true;
      ball.stickOffset = clamp(ball.x - p.x, -p.w / 2 + BALL.r, p.w / 2 - BALL.r);
      ball.vx = ball.vy = 0;
      this.sound.paddle();
      return;
    }

    if (hit.ny < 0) {
      // English: exit angle from impact point, seasoned with paddle velocity.
      const rel = clamp((ball.x - p.x) / (p.w / 2), -1, 1);
      const angle = rel * 1.05;                       // max ~60° from vertical
      const sp = this.ballSpeed();
      ball.vx = Math.sin(angle) * sp + p.vx * 0.18;
      ball.vy = -Math.abs(Math.cos(angle) * sp);
      const norm = Math.hypot(ball.vx, ball.vy);
      ball.vx = ball.vx / norm * sp;
      ball.vy = ball.vy / norm * sp;
      // Never allow a near-horizontal exit — it makes the game stall.
      if (Math.abs(ball.vy) < sp * 0.25) {
        ball.vy = -sp * 0.25 * Math.sign(-1);
        const n2 = Math.hypot(ball.vx, ball.vy);
        ball.vx = ball.vx / n2 * sp; ball.vy = ball.vy / n2 * sp;
      }
    } else {
      ball.vx = Math.abs(ball.vx) * (hit.nx || 1);    // side hit
    }
    this.sound.paddle();
    this.particles.ring(ball.x, PADDLE.y - PADDLE.h / 2, '#67e8f9', 36);
  }

  damageBrick(brick, dmg, hx, hy) {
    if (!brick.alive) return;
    if (brick.solid) {
      this.sound.steel();
      this.particles.sparks(hx, hy, '#94a3b8', 5, 140);
      return;
    }
    brick.hp -= dmg;
    brick.flash = 1;
    if (brick.hp > 0) {
      this.sound.steel();
      this.particles.sparks(hx, hy, brick.color, 6, 160);
      return;
    }
    brick.alive = false;
    this.bricksBroken++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const mult = 1 + (this.combo - 1) * 0.25;
    const pts = Math.round(brick.pts * mult);
    this.score += pts;
    if (this.score > this.best) { this.best = this.score; store.set('best', this.best); }

    this.sound.brick(this.combo);
    this.particles.shards(brick.x, brick.y, brick.w, brick.h, brick.color, 8);
    this.particles.sparks(brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color, 8);
    this.texts.push({ x: brick.x + brick.w / 2, y: brick.y, text: `+${pts}`, life: 0.9, age: 0,
                      color: this.combo >= 4 ? '#facc15' : '#e2e8f0',
                      size: this.combo >= 4 ? 17 : 13 });
    if (this.combo >= 4 && this.combo % 4 === 0) {
      this.texts.push({ x: brick.x + brick.w / 2, y: brick.y - 18, text: `COMBO x${this.combo}`,
                        life: 1.1, age: 0, color: '#facc15', size: 19 });
    }
    this.shake = Math.max(this.shake, 2.5);

    if (brick.explosive) {
      this.explosions.push({ x: brick.x + brick.w / 2, y: brick.y + brick.h / 2, delay: 0.06, r: 95 });
    }
    // Powerup drop
    const chance = Math.max(0.08, DROP_BASE - this.level * 0.004);
    if (Math.random() < chance) {
      const type = weightedPick(POWERUPS);
      this.drops.push({ type, x: brick.x + brick.w / 2, y: brick.y + brick.h / 2, vy: 130, wob: rand(0, TAU) });
    }
  }

  updateExplosions(dt) {
    for (const ex of this.explosions) {
      ex.delay -= dt;
      if (ex.delay > 0 || ex.done) continue;
      ex.done = true;
      this.sound.boom();
      this.shake = Math.max(this.shake, 10);
      this.freeze = 0.05;
      this.flash = Math.max(this.flash, 0.18);
      this.particles.ring(ex.x, ex.y, '#fb923c', ex.r * 1.4);
      this.particles.sparks(ex.x, ex.y, '#fb923c', 26, 380);
      this.particles.sparks(ex.x, ex.y, '#fde68a', 14, 300);
      for (const br of this.bricks) {
        if (!br.alive || br.solid) continue;
        const cx = br.x + br.w / 2, cy = br.y + br.h / 2;
        if (Math.hypot(cx - ex.x, cy - ex.y) <= ex.r) this.damageBrick(br, Infinity, cx, cy);
      }
    }
    this.explosions = this.explosions.filter(e => !e.done);
  }

  updateLasers(dt) {
    for (const l of this.lasers) {
      l.y -= 850 * dt;
      if (l.y < HUD_H) { l.dead = true; continue; }
      for (const br of this.bricks) {
        if (!br.alive) continue;
        if (l.x >= br.x && l.x <= br.x + br.w && l.y >= br.y && l.y <= br.y + br.h) {
          this.damageBrick(br, 1, l.x, l.y);
          l.dead = true;
          break;
        }
      }
    }
    this.lasers = this.lasers.filter(l => !l.dead);
  }

  updateDrops(dt) {
    const p = this.paddle;
    for (const d of this.drops) {
      d.y += d.vy * dt;
      d.wob += dt * 5;
      d.x += Math.sin(d.wob) * 14 * dt;
      if (d.y > H + 20) { d.dead = true; continue; }
      if (Math.abs(d.y - PADDLE.y) < PADDLE.h / 2 + 11 && Math.abs(d.x - p.x) < p.w / 2 + 11) {
        d.dead = true;
        this.applyPowerup(d.type);
      }
    }
    this.drops = this.drops.filter(d => !d.dead);
  }

  applyPowerup(type) {
    const info = POWERUPS[type];
    this.texts.push({ x: this.paddle.x, y: PADDLE.y - 34, text: info.label, life: 1.2, age: 0,
                      color: info.color, size: 18 });
    if (type === 'life') {
      this.lives = Math.min(this.lives + 1, 6);
      this.sound.life();
      return;
    }
    if (type === 'multi') {
      const src = this.balls.filter(b => !b.stuck);
      const seed = src.length ? src : this.balls;
      for (const b of seed) {
        for (let i = 0; i < 2 && this.balls.length < MAX_BALLS; i++) {
          const a = rand(-Math.PI * 0.85, -Math.PI * 0.15);
          const sp = this.ballSpeed();
          this.balls.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                            stuck: false, stickOffset: 0, trail: [] });
        }
      }
      this.sound.powerup();
      return;
    }
    this.effects[type] = EFFECT_TIME[type];
    this.sound.powerup();
  }

  /* ------------------------------------------------------------ render */
  _resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = innerWidth * dpr;
    this.canvas.height = innerHeight * dpr;
    this.canvas.style.width = innerWidth + 'px';
    this.canvas.style.height = innerHeight + 'px';
    this.dpr = dpr;
    this.viewScale = Math.min(innerWidth / W, innerHeight / H);
    this.viewX = (innerWidth - W * this.viewScale) / 2;
    this.viewY = (innerHeight - H * this.viewScale) / 2;
  }

  _frame(t) {
    requestAnimationFrame((n) => this._frame(n));
    let dt = Math.min((t - this._last) / 1000, 0.1);
    this._last = t;
    this.stateTimer += dt;
    if (this.banner > 0) this.banner -= dt;
    if (this.flash > 0) this.flash -= dt * 1.6;
    if (this.shake > 0) this.shake *= Math.pow(0.0001, dt);
    if (this.freeze > 0) { this.freeze -= dt; dt = 0; }

    this._bgScroll = (this._bgScroll || 0) + dt * 7;
    for (const s of this.stars) {
      s.y += s.z * 12 * dt; s.tw += dt * 3;
      if (s.y > H) { s.y = 0; s.x = rand(0, W); }
    }
    for (const txt of this.texts) txt.age += dt;
    this.texts = this.texts.filter(txt => txt.age < txt.life);
    this.particles.update(dt);

    if (this.state === 'playing') {
      this._acc += dt;
      const maxSteps = 8;
      let steps = 0;
      while (this._acc >= PHYS_STEP && steps++ < maxSteps) {
        this.update(PHYS_STEP);
        this._acc -= PHYS_STEP;
      }
      if (steps >= maxSteps) this._acc = 0;
    }

    this.render();
  }

  render() {
    const { ctx, dpr } = this;

    // Letterbox background (device space)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Arena space + shake
    const sx = this.shake > 0.2 ? rand(-this.shake, this.shake) : 0;
    const sy = this.shake > 0.2 ? rand(-this.shake, this.shake) : 0;
    ctx.setTransform(dpr * this.viewScale, 0, 0, dpr * this.viewScale,
                     dpr * (this.viewX + sx * this.viewScale), dpr * (this.viewY + sy * this.viewScale));
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();

    // Arena backdrop
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0b1020');
    grad.addColorStop(1, '#070a14');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Nebula backdrop (seamless 512px tiles, slow diagonal drift)
    const nebKey = this.state === 'title' ? 'nebula_blue'
                 : ['nebula_blue', 'nebula_purple', 'nebula_green'][(this.level || 0) % 3];
    const neb = IMG[nebKey];
    if (ok(neb)) {
      this._bgScroll = (this._bgScroll || 0);
      const o = this._bgScroll % 512;
      ctx.globalAlpha = 0.55;
      for (let ty = -1; ty * 512 - 512 < H; ty++)
        for (let tx = -1; tx * 512 - 512 < W; tx++)
          ctx.drawImage(neb, tx * 512 - o, ty * 512 - o * 0.6, 512, 512);
      ctx.globalAlpha = 1;
    }

    // Starfield
    for (const s of this.stars) {
      ctx.globalAlpha = 0.25 + 0.5 * s.z * (0.6 + 0.4 * Math.sin(s.tw));
      ctx.fillStyle = '#9db4d8';
      ctx.fillRect(s.x, s.y, s.z * 2, s.z * 2);
    }
    ctx.globalAlpha = 1;

    if (this.state === 'title') {
      this.renderTitle(ctx);
    } else {
      this.renderPlayfield(ctx);
      this.renderHUD(ctx);
      if (this.state === 'paused') this.renderOverlayCard(ctx, 'PAUSED', 'Click or Space to resume · R restart · Q quit');
      if (this.state === 'clear') this.renderClear(ctx);
      if (this.state === 'gameover') this.renderGameOver(ctx);
    }

    // Full-screen flash
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${clamp(this.flash, 0, 0.5)})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  renderPlayfield(ctx) {
    // Walls
    ctx.fillStyle = '#1b2540';
    ctx.fillRect(0, HUD_H - WALL, W, WALL);
    ctx.fillRect(0, HUD_H, WALL, H - HUD_H);
    ctx.fillRect(W - WALL, HUD_H, WALL, H - HUD_H);
    ctx.strokeStyle = 'rgba(103,232,249,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(WALL, HUD_H, W - WALL * 2, H - HUD_H);

    // Bricks (sprite art with cracked damage variants; vector fallback)
    for (const br of this.bricks) {
      if (!br.alive) continue;
      if (br.flash > 0) br.flash -= 0.08;
      const hpFrac = br.maxHp === Infinity ? 1 : br.hp / br.maxHp;
      const damaged = br.maxHp !== Infinity && br.hp < br.maxHp;
      const sprite = damaged && ok(IMG[br.skin + '_cracked']) ? IMG[br.skin + '_cracked'] : IMG[br.skin];
      if (ok(sprite)) {
        ctx.drawImage(sprite, br.x, br.y, br.w, br.h);
        if (br.solid) {
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillRect(br.x, br.y, br.w, br.h);
        }
      } else {
        this.roundRect(ctx, br.x, br.y, br.w, br.h, 5);
        const g = ctx.createLinearGradient(br.x, br.y, br.x, br.y + br.h);
        g.addColorStop(0, br.color);
        g.addColorStop(1, this.shade(br.color, br.solid ? 0.55 : 0.55 + 0.25 * (1 - hpFrac)));
        ctx.fillStyle = g;
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        this.roundRect(ctx, br.x + 2, br.y + 2, br.w - 4, 5, 3);
        ctx.fill();
      }
      if (br.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${br.flash * 0.7})`;
        this.roundRect(ctx, br.x, br.y, br.w, br.h, 5);
        ctx.fill();
      }
      if (br.explosive) {
        // pulsing core so explosive bricks read at a glance
        const pulse = 0.6 + 0.4 * Math.sin(this.stateTimer * 6 + br.x);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath(); ctx.arc(br.x + br.w / 2, br.y + br.h / 2, 5.5, 0, TAU); ctx.fill();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#fde68a';
        ctx.beginPath(); ctx.arc(br.x + br.w / 2, br.y + br.h / 2, 2.5, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Powerup drops — themed capsule sprites; heart for life; lettered capsule otherwise
    for (const d of this.drops) {
      const info = POWERUPS[d.type];
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = info.color;
      ctx.globalAlpha = 0.25;
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (d.type === 'life' && ok(IMG.heart)) {
        ctx.drawImage(IMG.heart, -11, -10.5, 22, 21);
      } else if (CAP_SPRITES[d.type] && ok(IMG[CAP_SPRITES[d.type]])) {
        ctx.drawImage(IMG[CAP_SPRITES[d.type]], -26, -7, 52, 13.7);
      } else if (ok(IMG.cap_blank)) {
        ctx.drawImage(IMG.cap_blank, -26, -7, 52, 13.7);
        ctx.fillStyle = info.color;
        ctx.font = `700 11px ${FONT}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(info.key, 0, 0.5);
      } else {
        this.roundRect(ctx, -13, -10, 26, 20, 8);
        ctx.fillStyle = '#0b1020'; ctx.fill();
        ctx.strokeStyle = info.color; ctx.lineWidth = 2; this.roundRect(ctx, -13, -10, 26, 20, 8); ctx.stroke();
        ctx.fillStyle = info.color;
        ctx.font = `700 13px ${FONT}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(info.key, 0, 1);
      }
      ctx.restore();
    }

    // Lasers
    ctx.globalCompositeOperation = 'lighter';
    for (const l of this.lasers) {
      ctx.fillStyle = '#fb7185';
      ctx.fillRect(l.x - 2, l.y - 14, 4, 14);
      ctx.fillStyle = 'rgba(251,113,133,0.35)';
      ctx.fillRect(l.x - 4, l.y - 16, 8, 18);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Paddle — sprite (normal/wide variants), tinted while sticky/laser is live
    const p = this.paddle;
    const px = p.x - p.w / 2, py = PADDLE.y - PADDLE.h / 2;
    const sticky = this.effects.sticky > 0, laser = this.effects.laser > 0;
    const pSprite = p.w > 145 ? IMG.paddle_wide : IMG.paddle;
    ctx.save();
    ctx.shadowColor = sticky ? '#34d399' : laser ? '#fb7185' : '#22d3ee';
    ctx.shadowBlur = 18;
    if (ok(pSprite)) {
      // sprite is taller than the 16px physics box; its top edge = contact surface
      const vh = p.w * (pSprite.naturalHeight / pSprite.naturalWidth);
      ctx.drawImage(pSprite, px, py, p.w, vh);
      if (sticky || laser) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = sticky ? '#34d399' : '#fb7185';
        this.roundRect(ctx, px, py, p.w, vh, 10);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else {
      const pg = ctx.createLinearGradient(px, py, px, py + PADDLE.h);
      pg.addColorStop(0, sticky ? '#6ee7b7' : laser ? '#fda4af' : '#7dd3fc');
      pg.addColorStop(1, sticky ? '#059669' : laser ? '#e11d48' : '#0284c7');
      ctx.fillStyle = pg;
      this.roundRect(ctx, px, py, p.w, PADDLE.h, 8);
      ctx.fill();
    }
    ctx.restore();
    if (laser) {
      ctx.fillStyle = '#fb7185';
      ctx.fillRect(px + 8, py - 6, 8, 6);
      ctx.fillRect(px + p.w - 16, py - 6, 8, 6);
    }

    // Balls + trails
    const fire = this.effects.fire > 0;
    for (const b of this.balls) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < b.trail.length; i++) {
        const k = i / b.trail.length;
        ctx.globalAlpha = k * 0.35;
        ctx.fillStyle = fire ? '#fb923c' : '#67e8f9';
        ctx.beginPath(); ctx.arc(b.trail[i].x, b.trail[i].y, BALL.r * k, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.shadowColor = fire ? '#fb923c' : '#67e8f9';
      ctx.shadowBlur = 16;
      if (!fire && ok(IMG.ball)) {
        ctx.drawImage(IMG.ball, b.x - BALL.r - 1, b.y - BALL.r - 1, BALL.r * 2 + 2, BALL.r * 2 + 2);
      } else {
        ctx.fillStyle = fire ? '#ffedd5' : '#f0fdff';
        ctx.beginPath(); ctx.arc(b.x, b.y, BALL.r, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    this.particles.render(ctx);

    // Floating texts
    for (const t of this.texts) {
      const k = 1 - t.age / t.life;
      ctx.globalAlpha = k;
      ctx.fillStyle = t.color;
      ctx.font = `800 ${t.size}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(t.text, t.x, t.y - (1 - k) * 30);
    }
    ctx.globalAlpha = 1;

    // Level banner
    if (this.banner > 0 && this.state === 'playing') {
      const a = clamp(Math.min(this.banner, 2.0 - this.banner) * 2.5, 0, 1);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#67e8f9';
      ctx.font = '800 40px "Orbitron", "Segoe UI", system-ui, sans-serif';
      ctx.fillText(`LEVEL ${this.level + 1}`, W / 2, H / 2 - 32);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 20px "Orbitron", "Segoe UI", system-ui, sans-serif';
      ctx.fillText(this.levelName, W / 2, H / 2 + 2);
      ctx.globalAlpha = 1;
    }

    // Launch hint
    if (this.state === 'playing' && this.balls.some(b => b.stuck) && this.banner <= 0) {
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(this.stateTimer * 5);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 16px "Orbitron", "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CLICK OR SPACE TO LAUNCH', W / 2, H - 90);
      ctx.globalAlpha = 1;
    }
  }

  renderHUD(ctx) {
    ctx.fillStyle = 'rgba(10,15,30,0.9)';
    ctx.fillRect(0, 0, W, HUD_H - WALL);

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '800 22px "Orbitron", "Segoe UI", system-ui, sans-serif';
    ctx.fillText(String(this.score).padStart(6, '0'), 22, 26);
    ctx.font = '600 12px "Orbitron", "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#7c8db0';
    ctx.fillText(`BEST ${this.best}`, 22, 44);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#67e8f9';
    ctx.font = '700 15px "Orbitron", "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`LEVEL ${this.level + 1}`, W / 2, 20);
    if (this.combo >= 2) {
      ctx.fillStyle = '#facc15';
      ctx.font = '800 14px "Orbitron", "Segoe UI", system-ui, sans-serif';
      ctx.fillText(`COMBO x${this.combo}  ·  ${(1 + (this.combo - 1) * 0.25).toFixed(2).replace(/\.?0+$/, '')}× SCORE`, W / 2, 40);
    } else {
      ctx.fillStyle = '#54627f';
      ctx.font = '600 11px "Orbitron", "Segoe UI", system-ui, sans-serif';
      ctx.fillText(this.levelName || '', W / 2, 40);
    }

    // Lives as hearts
    ctx.textAlign = 'right';
    for (let i = 0; i < this.lives; i++) {
      ctx.save();
      if (ok(IMG.heart)) {
        ctx.drawImage(IMG.heart, W - 34 - i * 22, 17, 18, 17);
      } else {
        ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 8;
        ctx.fillStyle = '#f0fdff';
        ctx.beginPath(); ctx.arc(W - 26 - i * 20, 26, 6, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    if (this.sound.muted) {
      ctx.fillStyle = '#54627f';
      ctx.font = '600 11px "Orbitron", "Segoe UI", system-ui, sans-serif';
      ctx.fillText('MUTED (M)', W - 22, 44);
    }

    // Active effect timers
    let ex = 130;
    ctx.textAlign = 'left';
    for (const key in this.effects) {
      const t = this.effects[key];
      if (t <= 0) continue;
      const info = POWERUPS[key];
      const frac = clamp(t / EFFECT_TIME[key], 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      this.roundRect(ctx, ex, 14, 54, 24, 6); ctx.fill();
      ctx.fillStyle = info.color;
      ctx.font = '800 13px "Orbitron", "Segoe UI", system-ui, sans-serif';
      ctx.fillText(info.key, ex + 8, 26);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(ex + 22, 22, 26, 6);
      ctx.fillStyle = info.color;
      ctx.fillRect(ex + 22, 22, 26 * frac, 6);
      ex += 62;
    }
  }

  renderTitle(ctx) {
    const t = this.stateTimer;
    ctx.textAlign = 'center';

    // drifting glow orbs
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const ox = W / 2 + Math.sin(t * 0.4 + i * 2.2) * 320;
      const oy = H * 0.4 + Math.cos(t * 0.3 + i * 1.7) * 200;
      const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, 130);
      const colors = ['#22d3ee', '#a78bfa', '#fb7185', '#4ade80', '#facc15'];
      g.addColorStop(0, colors[i] + '30');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(ox - 130, oy - 130, 260, 260);
    }
    ctx.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#f0fdff';
    ctx.font = '800 76px "Orbitron", "Segoe UI", system-ui, sans-serif';
    ctx.fillText('NEON', W / 2, H * 0.32);
    ctx.shadowColor = '#fb7185';
    ctx.fillStyle = '#ffe4e6';
    ctx.fillText('BREAKOUT', W / 2, H * 0.32 + 78);
    ctx.restore();

    ctx.fillStyle = '#7c8db0';
    ctx.font = '600 16px "Orbitron", "Segoe UI", system-ui, sans-serif';
    ctx.fillText('MOUSE / TOUCH / ← → MOVE   ·   SPACE LAUNCH & FIRE   ·   P PAUSE   ·   M MUTE', W / 2, H * 0.60);

    if (this.best > 0) {
      ctx.fillStyle = '#facc15';
      ctx.font = '700 20px "Orbitron", "Segoe UI", system-ui, sans-serif';
      ctx.fillText(`BEST  ${this.best}`, W / 2, H * 0.67);
    }

    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 4);
    ctx.fillStyle = '#67e8f9';
    ctx.font = '800 24px "Orbitron", "Segoe UI", system-ui, sans-serif';
    ctx.fillText('CLICK OR PRESS SPACE TO START', W / 2, H * 0.78);
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#3d4a66';
    ctx.font = '600 11px "Orbitron", "Segoe UI", system-ui, sans-serif';
    ctx.fillText('CC0 ART: IMAGINELABS.ROCKS · SCREAMING BRAIN STUDIOS  ·  MUSIC: OPENGAMEART  ·  FONT: ORBITRON', W / 2, H * 0.94);
  }

  renderOverlayCard(ctx, title, subtitle) {
    ctx.fillStyle = 'rgba(5,7,13,0.72)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f0fdff';
    ctx.font = '800 52px "Orbitron", "Segoe UI", system-ui, sans-serif';
    ctx.fillText(title, W / 2, H / 2 - 20);
    ctx.fillStyle = '#7c8db0';
    ctx.font = '600 17px "Orbitron", "Segoe UI", system-ui, sans-serif';
    ctx.fillText(subtitle, W / 2, H / 2 + 24);
  }

  renderClear(ctx) {
    ctx.fillStyle = 'rgba(5,7,13,0.72)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 24;
    ctx.fillStyle = '#dcfce7';
    ctx.font = '800 54px "Orbitron", "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`LEVEL ${this.level + 1} CLEAR`, W / 2, H / 2 - 60);
    ctx.restore();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 20px "Orbitron", "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`SCORE ${this.score}    ·    MAX COMBO x${this.maxCombo}`, W / 2, H / 2);
    // Star rating from combo performance
    if (ok(IMG.star)) {
      const stars = this.maxCombo >= 12 ? 3 : this.maxCombo >= 8 ? 2 : this.maxCombo >= 4 ? 1 : 0;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = i < stars ? 1 : 0.18;
        ctx.drawImage(IMG.star, W / 2 - 66 + i * 46, H / 2 + 18, 40, 38);
      }
      ctx.globalAlpha = 1;
    }
    if (this.stateTimer > 1.2) {
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(this.stateTimer * 4);
      ctx.fillStyle = '#67e8f9';
      ctx.font = '800 22px "Orbitron", "Segoe UI", system-ui, sans-serif';
      ctx.fillText('CLICK OR SPACE FOR NEXT LEVEL', W / 2, H / 2 + 92);
      ctx.globalAlpha = 1;
    }
  }

  renderGameOver(ctx) {
    ctx.fillStyle = 'rgba(5,7,13,0.78)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = '#fb7185'; ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffe4e6';
    ctx.font = '800 60px "Orbitron", "Segoe UI", system-ui, sans-serif';
    ctx.fillText('GAME OVER', W / 2, H / 2 - 70);
    ctx.restore();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 22px "Orbitron", "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`SCORE ${this.score}`, W / 2, H / 2 - 10);
    ctx.fillStyle = '#7c8db0';
    ctx.font = '600 16px "Orbitron", "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`BEST ${this.best}   ·   LEVEL ${this.level + 1}   ·   BRICKS ${this.bricksBroken}   ·   MAX COMBO x${this.maxCombo}`, W / 2, H / 2 + 26);
    if (this.score >= this.best && this.score > 0) {
      ctx.fillStyle = '#facc15';
      ctx.font = '800 20px "Orbitron", "Segoe UI", system-ui, sans-serif';
      ctx.fillText('★ NEW BEST ★', W / 2, H / 2 + 62);
    }
    if (this.stateTimer > 0.8) {
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(this.stateTimer * 4);
      ctx.fillStyle = '#67e8f9';
      ctx.font = '800 22px "Orbitron", "Segoe UI", system-ui, sans-serif';
      ctx.fillText('CLICK OR SPACE TO CONTINUE', W / 2, H / 2 + 110);
      ctx.globalAlpha = 1;
    }
  }

  /* --------------------------------------------------------- draw utils */
  roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * k);
    const g = Math.round(((n >> 8) & 255) * k);
    const b = Math.round((n & 255) * k);
    return `rgb(${r},${g},${b})`;
  }
}

/* ------------------------------------------------------------------ boot */
window.game = new Game(document.getElementById('game'));
})();
