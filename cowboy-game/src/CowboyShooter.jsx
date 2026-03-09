import { useState, useEffect, useRef, useCallback } from "react";

const PLAYER_SIZE = 28;
const BULLET_SPEED = 7;
const ENEMY_BULLET_SPEED = 3.5;
const PLAYER_SPEED = 4;
const ROLL_SPEED = 9;
const ROLL_DURATION = 14;
const ROLL_COOLDOWN = 40;
const SHOOT_COOLDOWN = 12;
const ENEMY_SIZE = 26;
const MAX_HP = 5;
const INVULN_FRAMES = 45;
const JOY_RADIUS = 55;
const JOY_DEAD = 10;

// === SOUND ENGINE ===
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.vol = 0.3;
  }
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  play(fn) {
    if (!this.ctx || !this.enabled) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    try { fn(this.ctx, this.vol); } catch(e) {}
  }
  shoot() {
    this.play((c, v) => {
      const o = c.createOscillator(); const g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = 'square'; o.frequency.setValueAtTime(600, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(100, c.currentTime + 0.1);
      g.gain.setValueAtTime(v * 0.4, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
      o.start(c.currentTime); o.stop(c.currentTime + 0.1);
      // Noise layer
      const buf = c.createBuffer(1, c.sampleRate * 0.05, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
      const n = c.createBufferSource(); const ng = c.createGain();
      n.buffer = buf; n.connect(ng); ng.connect(c.destination);
      ng.gain.setValueAtTime(v * 0.5, c.currentTime);
      ng.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.06);
      n.start(c.currentTime); n.stop(c.currentTime + 0.06);
    });
  }
  enemyShoot() {
    this.play((c, v) => {
      const o = c.createOscillator(); const g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = 'sawtooth'; o.frequency.setValueAtTime(300, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.08);
      g.gain.setValueAtTime(v * 0.15, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.08);
      o.start(c.currentTime); o.stop(c.currentTime + 0.08);
    });
  }
  hit() {
    this.play((c, v) => {
      const o = c.createOscillator(); const g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = 'sine'; o.frequency.setValueAtTime(800, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.15);
      g.gain.setValueAtTime(v * 0.3, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
      o.start(c.currentTime); o.stop(c.currentTime + 0.15);
    });
  }
  kill() {
    this.play((c, v) => {
      const o = c.createOscillator(); const g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = 'sawtooth'; o.frequency.setValueAtTime(400, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(50, c.currentTime + 0.25);
      g.gain.setValueAtTime(v * 0.35, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25);
      o.start(c.currentTime); o.stop(c.currentTime + 0.25);
      // Pop
      const o2 = c.createOscillator(); const g2 = c.createGain();
      o2.connect(g2); g2.connect(c.destination);
      o2.type = 'sine'; o2.frequency.setValueAtTime(1200, c.currentTime);
      o2.frequency.exponentialRampToValueAtTime(300, c.currentTime + 0.1);
      g2.gain.setValueAtTime(v * 0.2, c.currentTime);
      g2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
      o2.start(c.currentTime); o2.stop(c.currentTime + 0.1);
    });
  }
  bossKill() {
    this.play((c, v) => {
      for (let i = 0; i < 3; i++) {
        const o = c.createOscillator(); const g = c.createGain();
        o.connect(g); g.connect(c.destination);
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(500 - i * 100, c.currentTime + i * 0.1);
        o.frequency.exponentialRampToValueAtTime(30, c.currentTime + i * 0.1 + 0.3);
        g.gain.setValueAtTime(v * 0.4, c.currentTime + i * 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.1 + 0.3);
        o.start(c.currentTime + i * 0.1); o.stop(c.currentTime + i * 0.1 + 0.3);
      }
    });
  }
  playerHit() {
    this.play((c, v) => {
      const o = c.createOscillator(); const g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = 'square'; o.frequency.setValueAtTime(200, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.2);
      g.gain.setValueAtTime(v * 0.5, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
      o.start(c.currentTime); o.stop(c.currentTime + 0.2);
    });
  }
  dodge() {
    this.play((c, v) => {
      const o = c.createOscillator(); const g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = 'sine'; o.frequency.setValueAtTime(300, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(900, c.currentTime + 0.12);
      g.gain.setValueAtTime(v * 0.2, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
      o.start(c.currentTime); o.stop(c.currentTime + 0.12);
    });
  }
  pickup() {
    this.play((c, v) => {
      const o = c.createOscillator(); const g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = 'sine';
      o.frequency.setValueAtTime(500, c.currentTime);
      o.frequency.setValueAtTime(700, c.currentTime + 0.08);
      o.frequency.setValueAtTime(900, c.currentTime + 0.16);
      g.gain.setValueAtTime(v * 0.25, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25);
      o.start(c.currentTime); o.stop(c.currentTime + 0.25);
    });
  }
  waveClear() {
    this.play((c, v) => {
      [0, 0.1, 0.2, 0.3].forEach((t, i) => {
        const o = c.createOscillator(); const g = c.createGain();
        o.connect(g); g.connect(c.destination);
        o.type = 'sine'; o.frequency.setValueAtTime([400,500,600,800][i], c.currentTime + t);
        g.gain.setValueAtTime(v * 0.25, c.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t + 0.15);
        o.start(c.currentTime + t); o.stop(c.currentTime + t + 0.15);
      });
    });
  }
  death() {
    this.play((c, v) => {
      const o = c.createOscillator(); const g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = 'sawtooth'; o.frequency.setValueAtTime(400, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(20, c.currentTime + 0.8);
      g.gain.setValueAtTime(v * 0.4, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.8);
      o.start(c.currentTime); o.stop(c.currentTime + 0.8);
    });
  }
  combo() {
    this.play((c, v) => {
      const o = c.createOscillator(); const g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = 'triangle'; o.frequency.setValueAtTime(600, c.currentTime);
      o.frequency.setValueAtTime(800, c.currentTime + 0.05);
      g.gain.setValueAtTime(v * 0.15, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
      o.start(c.currentTime); o.stop(c.currentTime + 0.1);
    });
  }
}

const sfx = new SoundEngine();

// === DRAW HELPERS ===
function drawCowboy(ctx, x, y, size, colors, angle, f, isRolling) {
  ctx.save();
  ctx.translate(x, y);
  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath(); ctx.ellipse(0, size * 0.6, size * 0.8, 6, 0, 0, Math.PI * 2); ctx.fill();

  if (isRolling) {
    ctx.rotate(f * 0.4);
    ctx.fillStyle = colors.skin; ctx.beginPath(); ctx.arc(0, 0, size * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = colors.hat; ctx.fillRect(-size * 0.3, -size * 0.3, size * 0.6, size * 0.6);
    ctx.restore();
    return;
  }

  // Boots
  ctx.fillStyle = colors.boots;
  ctx.fillRect(-size * 0.35, size * 0.2, size * 0.22, size * 0.3);
  ctx.fillRect(size * 0.13, size * 0.2, size * 0.22, size * 0.3);

  // Body / shirt
  ctx.fillStyle = colors.shirt;
  ctx.beginPath();
  ctx.moveTo(-size * 0.3, -size * 0.05);
  ctx.lineTo(-size * 0.35, size * 0.3);
  ctx.lineTo(size * 0.35, size * 0.3);
  ctx.lineTo(size * 0.3, -size * 0.05);
  ctx.closePath();
  ctx.fill();

  // Belt
  ctx.fillStyle = colors.belt;
  ctx.fillRect(-size * 0.32, size * 0.1, size * 0.64, size * 0.08);
  // Belt buckle
  ctx.fillStyle = "#FFD700";
  ctx.fillRect(-size * 0.06, size * 0.1, size * 0.12, size * 0.08);

  // Head
  ctx.fillStyle = colors.skin;
  ctx.beginPath(); ctx.arc(0, -size * 0.25, size * 0.25, 0, Math.PI * 2); ctx.fill();

  // Eyes
  const eyeDir = angle || 0;
  ctx.fillStyle = "#222";
  ctx.beginPath(); ctx.arc(-size * 0.1 + Math.cos(eyeDir) * 2, -size * 0.28 + Math.sin(eyeDir) * 1, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(size * 0.1 + Math.cos(eyeDir) * 2, -size * 0.28 + Math.sin(eyeDir) * 1, 2.5, 0, Math.PI * 2); ctx.fill();

  // Bandana / mouth area
  if (colors.bandana) {
    ctx.fillStyle = colors.bandana;
    ctx.beginPath();
    ctx.moveTo(-size * 0.18, -size * 0.15);
    ctx.lineTo(size * 0.18, -size * 0.15);
    ctx.lineTo(size * 0.12, -size * 0.03);
    ctx.lineTo(0, -size * 0.0);
    ctx.lineTo(-size * 0.12, -size * 0.03);
    ctx.closePath();
    ctx.fill();
  }

  // Hat
  ctx.fillStyle = colors.hat;
  // Brim
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.45, size * 0.5, size * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  // Crown
  ctx.fillRect(-size * 0.25, -size * 0.75, size * 0.5, size * 0.32);
  // Hat band
  ctx.fillStyle = colors.hatBand || "#8B4513";
  ctx.fillRect(-size * 0.25, -size * 0.48, size * 0.5, size * 0.05);

  // Gun arm
  if (angle !== null && angle !== undefined) {
    ctx.strokeStyle = colors.skin; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(size * 0.2, 0);
    ctx.lineTo(size * 0.2 + Math.cos(angle) * size * 0.6, Math.sin(angle) * size * 0.6);
    ctx.stroke();
    // Gun
    ctx.fillStyle = "#444";
    const gx = size * 0.2 + Math.cos(angle) * size * 0.6;
    const gy = Math.sin(angle) * size * 0.6;
    ctx.save(); ctx.translate(gx, gy); ctx.rotate(angle);
    ctx.fillRect(-2, -3, 12, 6);
    ctx.fillRect(6, -5, 4, 10);
    ctx.restore();
  }

  ctx.restore();
}

function drawCactus(ctx, x, y, h) {
  ctx.fillStyle = "#2d5a1e";
  // Main trunk
  ctx.fillRect(x - 6, y - h, 12, h);
  ctx.beginPath(); ctx.arc(x, y - h, 6, 0, Math.PI * 2); ctx.fill();
  // Left arm
  ctx.fillRect(x - 6 - 14, y - h * 0.65, 14, 8);
  ctx.fillRect(x - 6 - 14, y - h * 0.65 - 18, 8, 26);
  ctx.beginPath(); ctx.arc(x - 6 - 10, y - h * 0.65 - 18, 4, 0, Math.PI * 2); ctx.fill();
  // Right arm
  ctx.fillRect(x + 6, y - h * 0.45, 16, 8);
  ctx.fillRect(x + 6 + 8, y - h * 0.45 - 22, 8, 30);
  ctx.beginPath(); ctx.arc(x + 6 + 12, y - h * 0.45 - 22, 4, 0, Math.PI * 2); ctx.fill();
  // Highlights
  ctx.fillStyle = "rgba(100,180,60,0.3)";
  ctx.fillRect(x - 2, y - h, 4, h);
}

function drawTumbleweed(ctx, x, y, r, f) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(f * 0.03);
  ctx.strokeStyle = "rgba(160,120,60,0.5)"; ctx.lineWidth = 1.5;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3, r * 0.5, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawSkull(ctx, x, y, s) {
  ctx.fillStyle = "rgba(220,210,190,0.4)";
  ctx.beginPath(); ctx.ellipse(x, y, s, s * 1.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(80,60,40,0.3)";
  ctx.beginPath(); ctx.arc(x - s * 0.3, y - s * 0.15, s * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.3, y - s * 0.15, s * 0.2, 0, Math.PI * 2); ctx.fill();
}

// === GAME LOGIC ===
function getWaveDef(wave) {
  return { enemies: Math.min(3 + Math.floor(wave * 1.3), 30), shootRate: Math.max(120 - wave * 6, 20), speed: 1.2 + wave * 0.15, hp: 1 + Math.floor(wave / 3), label: getWaveTitle(wave) };
}
function getWaveTitle(w) {
  const t = ["Cattle Rustlers","Bandits","Outlaws","Desperados","Gunslingers","El Diablo's Gang","The Undertaker's Posse","Hell Riders","Death Valley Demons","Ghost Town Terrors","Blood Mesa Bandits","Canyon Crawlers","Tombstone Titans","Vulture's Nest","Scorpion Kings","Dustdevil Raiders","Deadwood Drifters","Bone Dry Killers","Cactus Jack's Crew","Sundown Slayers"];
  return w < t.length ? t[w] : "Wave " + (w + 1) + " - The Endless Horde";
}
function dist(a, b) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }
function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }
function rnd(a, b) { return a + Math.random() * (b - a); }

function spawnEnemy(wd, existing, W, H) {
  let x, y, tries = 0;
  do { const s = Math.floor(Math.random() * 4); if (s===0){x=rnd(30,W-30);y=-20;}else if(s===1){x=W+20;y=rnd(30,H-30);}else if(s===2){x=rnd(30,W-30);y=H+20;}else{x=-20;y=rnd(30,H-30);} tries++; } while (tries < 10 && existing.some(e => dist(e,{x,y}) < 60));
  const skins = [
    { hat: "#222", shirt: "#6b3a2a", skin: "#c49a6c", boots: "#3a2518", belt: "#2a1a0e", bandana: "#8b1a1a", hatBand: "#444" },
    { hat: "#1a1a2e", shirt: "#4a4a6a", skin: "#d4a574", boots: "#2a2a3e", belt: "#1a1a2a", bandana: "#2a4a2a", hatBand: "#3a3a5a" },
    { hat: "#3a2010", shirt: "#7a5a3a", skin: "#b8845c", boots: "#2a1508", belt: "#4a3020", bandana: "#6a2a1a", hatBand: "#5a4030" },
    { hat: "#555", shirt: "#888", skin: "#c9a07a", boots: "#333", belt: "#222", bandana: null, hatBand: "#666" },
  ];
  return { x, y, hp: wd.hp, maxHp: wd.hp, speed: wd.speed * rnd(0.8,1.2), shootTimer: Math.floor(rnd(30,wd.shootRate)), shootRate: wd.shootRate, hitFlash: 0, targetX: rnd(80,W-80), targetY: rnd(80,H-80), moveTimer: 0, id: Date.now()+Math.random(), skin: skins[Math.floor(Math.random()*skins.length)] };
}
function spawnBoss(wave, W, H) {
  const skin = { hat: "#1a0000", shirt: "#440000", skin: "#8a6a4a", boots: "#0a0000", belt: "#220000", bandana: "#000", hatBand: "#ff0000" };
  return { x: W/2, y: -30, hp: 10+wave*3, maxHp: 10+wave*3, speed: 1.0+wave*0.05, shootTimer: 30, shootRate: Math.max(25-wave,10), hitFlash: 0, targetX: W/2, targetY: H/2, moveTimer: 0, id: Date.now()+Math.random(), isBoss: true, skin };
}

const PLAYER_SKIN = { hat: "#8B6914", shirt: "#c8a050", skin: "#e8c090", boots: "#6a4a20", belt: "#5a3a18", bandana: null, hatBand: "#a08040" };

export default function CowboyShooter() {
  const canvasRef = useRef(null);
  const [screen, setScreen] = useState("menu");
  const [score, setScore] = useState(0);
  const [waveIndex, setWaveIndex] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const gameRef = useRef(null);
  const keysRef = useRef({});
  const mouseRef = useRef({ x: 400, y: 300, down: false });
  const frameRef = useRef(0);
  const scoreRef = useRef(0);
  const waveRef = useRef(0);
  const comboRef = useRef(0);
  const comboTimerRef = useRef(0);
  const bestScoreRef = useRef(0);
  const bestWaveRef = useRef(0);
  const leftJoy = useRef({ active: false, id: -1, cx: 0, cy: 0, dx: 0, dy: 0 });
  const rightJoy = useRef({ active: false, id: -1, cx: 0, cy: 0, dx: 0, dy: 0, angle: 0 });
  const isMobile = useRef(false);
  const doubleTapDodge = useRef(false);
  const sceneryRef = useRef(null);

  useEffect(() => {
    isMobile.current = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const resize = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    resize(); window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const W = dims.w, H = dims.h;

  // Generate scenery once per game size
  useEffect(() => {
    sceneryRef.current = {
      cacti: Array.from({ length: Math.floor(W / 200) + 2 }, () => ({ x: rnd(40, W - 40), y: rnd(H * 0.3, H * 0.85), h: rnd(35, 65) })),
      tumbleweeds: Array.from({ length: 3 }, () => ({ x: rnd(0, W), y: rnd(H * 0.4, H * 0.9), r: rnd(8, 16), vx: rnd(0.3, 0.8) })),
      skulls: Array.from({ length: Math.floor(W / 300) + 1 }, () => ({ x: rnd(30, W - 30), y: rnd(H * 0.5, H * 0.9), s: rnd(6, 10) })),
      rocks: Array.from({ length: 8 }, () => ({ x: rnd(20, W - 20), y: rnd(H * 0.2, H * 0.95), w: rnd(10, 25), h: rnd(6, 14) })),
    };
  }, [W, H]);

  const cleanup = useCallback(() => { if (gameRef.current) gameRef.current.running = false; }, []);

  const initGame = useCallback(() => {
    cleanup(); sfx.init();
    scoreRef.current = 0; waveRef.current = 0; comboRef.current = 0; comboTimerRef.current = 0;
    setScore(0); setWaveIndex(0); setCombo(0);
    gameRef.current = {
      running: true,
      player: { x: W / 2, y: H / 2, hp: MAX_HP, rolling: 0, rollCooldown: 0, rollDx: 0, rollDy: 0, shootCooldown: 0, invuln: 0, facing: 0 },
      enemies: [], playerBullets: [], enemyBullets: [], pickups: [], particles: [], floatingTexts: [],
      wave: 0, enemiesSpawned: 0, spawnTimer: 0, shakeTimer: 0, shakeIntensity: 0, totalKills: 0, bossSpawned: false,
      dustParticles: Array.from({ length: 20 }, () => ({ x: rnd(0, W), y: rnd(0, H), vx: rnd(-0.4, -0.1), vy: rnd(-0.15, 0.15), size: rnd(2, 6), opacity: rnd(0.04, 0.12) })),
    };
  }, [cleanup, W, H]);

  const startWave = useCallback((wi) => {
    const g = gameRef.current; if (!g) return;
    g.wave = wi; g.enemiesSpawned = 0; g.spawnTimer = 60; g.enemyBullets = []; g.bossSpawned = false;
    waveRef.current = wi; setWaveIndex(wi); setScreen("waveIntro");
    setTimeout(() => setScreen("playing"), 1800);
  }, []);

  const startGame = useCallback(() => { initGame(); startWave(0); }, [initGame, startWave]);

  // Keyboard
  useEffect(() => {
    const kd = (e) => { keysRef.current[e.code] = true; if (e.code === "Space") e.preventDefault(); };
    const ku = (e) => { keysRef.current[e.code] = false; };
    const mm = (e) => { const c = canvasRef.current; if (!c) return; const r = c.getBoundingClientRect(); mouseRef.current.x = ((e.clientX - r.left) / r.width) * W; mouseRef.current.y = ((e.clientY - r.top) / r.height) * H; };
    const md = (e) => { mm(e); mouseRef.current.down = true; };
    const mu = () => { mouseRef.current.down = false; };
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    window.addEventListener("mousemove", mm); window.addEventListener("mousedown", md); window.addEventListener("mouseup", mu);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("mousemove", mm); window.removeEventListener("mousedown", md); window.removeEventListener("mouseup", mu); };
  }, [W, H]);

  // Touch
  const handleTouchStart = useCallback((e) => {
    e.preventDefault(); sfx.init();
    const c = canvasRef.current; if (!c) return; const r = c.getBoundingClientRect();
    for (const t of e.changedTouches) {
      const sx = t.clientX - r.left, sy = t.clientY - r.top;
      const cx = (sx / r.width) * W;
      // Check dodge button first
      const dbx = W - 70, dby = H - 70;
      const dcx = (t.clientX - r.left) / r.width * W;
      const dcy = (t.clientY - r.top) / r.height * H;
      if (Math.sqrt((dcx - dbx) ** 2 + (dcy - dby) ** 2) < 40) {
        doubleTapDodge.current = true;
        setTimeout(() => { doubleTapDodge.current = false; }, 100);
        continue;
      }
      if (cx < W * 0.5) { if (!leftJoy.current.active) leftJoy.current = { active: true, id: t.identifier, cx: sx, cy: sy, dx: 0, dy: 0 }; }
      else { if (!rightJoy.current.active) rightJoy.current = { active: true, id: t.identifier, cx: sx, cy: sy, dx: 0, dy: 0, angle: 0 }; }
    }
  }, [W, H]);
  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const c = canvasRef.current; if (!c) return; const r = c.getBoundingClientRect();
      const sx = t.clientX - r.left, sy = t.clientY - r.top;
      if (leftJoy.current.active && t.identifier === leftJoy.current.id) {
        let ddx = sx - leftJoy.current.cx, ddy = sy - leftJoy.current.cy;
        const m = Math.sqrt(ddx*ddx+ddy*ddy); if (m > JOY_RADIUS) { ddx = (ddx/m)*JOY_RADIUS; ddy = (ddy/m)*JOY_RADIUS; }
        leftJoy.current.dx = ddx; leftJoy.current.dy = ddy;
      }
      if (rightJoy.current.active && t.identifier === rightJoy.current.id) {
        let ddx = sx - rightJoy.current.cx, ddy = sy - rightJoy.current.cy;
        const m = Math.sqrt(ddx*ddx+ddy*ddy); if (m > JOY_RADIUS) { ddx = (ddx/m)*JOY_RADIUS; ddy = (ddy/m)*JOY_RADIUS; }
        rightJoy.current.dx = ddx; rightJoy.current.dy = ddy;
        if (m > JOY_DEAD) rightJoy.current.angle = Math.atan2(ddy, ddx);
      }
    }
  }, []);
  const handleTouchEnd = useCallback((e) => {
    for (const t of e.changedTouches) {
      if (leftJoy.current.active && t.identifier === leftJoy.current.id) leftJoy.current = { active: false, id: -1, cx: 0, cy: 0, dx: 0, dy: 0 };
      if (rightJoy.current.active && t.identifier === rightJoy.current.id) rightJoy.current = { active: false, id: -1, cx: 0, cy: 0, dx: 0, dy: 0, angle: 0 };
    }
  }, []);

  // Game loop
  useEffect(() => {
    if (screen !== "playing" && screen !== "waveIntro") return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); let raf;

    const loop = () => {
      const g = gameRef.current; if (!g || !g.running) return;
      frameRef.current++; const f = frameRef.current, keys = keysRef.current, p = g.player;
      const waveDef = getWaveDef(g.wave);
      const isPlaying = screen === "playing";

      if (isPlaying) {
        let dx = 0, dy = 0;
        if (keys["KeyW"]||keys["ArrowUp"]) dy -= 1; if (keys["KeyS"]||keys["ArrowDown"]) dy += 1;
        if (keys["KeyA"]||keys["ArrowLeft"]) dx -= 1; if (keys["KeyD"]||keys["ArrowRight"]) dx += 1;
        if (leftJoy.current.active) { const lm = Math.sqrt(leftJoy.current.dx**2+leftJoy.current.dy**2); if (lm > JOY_DEAD) { dx += (leftJoy.current.dx/lm)*Math.min(lm/JOY_RADIUS,1); dy += (leftJoy.current.dy/lm)*Math.min(lm/JOY_RADIUS,1); } }

        if (p.rolling > 0) { p.x += p.rollDx*ROLL_SPEED; p.y += p.rollDy*ROLL_SPEED; p.rolling--; p.invuln = Math.max(p.invuln,1); }
        else {
          const mag = Math.sqrt(dx*dx+dy*dy);
          if (mag > 0) { p.x += (dx/mag)*PLAYER_SPEED; p.y += (dy/mag)*PLAYER_SPEED; p.facing = Math.atan2(dy,dx); }
          if ((keys["Space"]||doubleTapDodge.current) && p.rollCooldown <= 0 && mag > 0) {
            p.rolling = ROLL_DURATION; p.rollCooldown = ROLL_COOLDOWN; p.rollDx = dx/mag; p.rollDy = dy/mag;
            sfx.dodge();
            for (let i = 0; i < 8; i++) g.particles.push({ x: p.x, y: p.y, vx: rnd(-2,2), vy: rnd(-2,2), life: 20, maxLife: 20, color: "#c8a050", size: rnd(3,7) });
            doubleTapDodge.current = false;
          }
        }
        if (p.rollCooldown > 0) p.rollCooldown--; if (p.invuln > 0) p.invuln--;
        p.x = clamp(p.x, PLAYER_SIZE, W-PLAYER_SIZE); p.y = clamp(p.y, PLAYER_SIZE, H-PLAYER_SIZE);

        if (comboTimerRef.current > 0) { comboTimerRef.current--; if (comboTimerRef.current <= 0) { comboRef.current = 0; setCombo(0); } }

        let shooting = mouseRef.current.down, shootAngle = Math.atan2(mouseRef.current.y-p.y, mouseRef.current.x-p.x);
        if (rightJoy.current.active) { const rm = Math.sqrt(rightJoy.current.dx**2+rightJoy.current.dy**2); if (rm > JOY_DEAD) { shooting = true; shootAngle = rightJoy.current.angle; } }

        if (shooting && p.shootCooldown <= 0 && p.rolling <= 0) {
          g.playerBullets.push({ x: p.x+Math.cos(shootAngle)*20, y: p.y+Math.sin(shootAngle)*20, vx: Math.cos(shootAngle)*BULLET_SPEED, vy: Math.sin(shootAngle)*BULLET_SPEED, life: 80 });
          scoreRef.current = Math.max(0, scoreRef.current - 1); setScore(scoreRef.current);
          p.shootCooldown = SHOOT_COOLDOWN; p.facing = shootAngle; g.shakeTimer = 3; g.shakeIntensity = 2;
          sfx.shoot();
          for (let i = 0; i < 4; i++) g.particles.push({ x: p.x+Math.cos(shootAngle)*22, y: p.y+Math.sin(shootAngle)*22, vx: Math.cos(shootAngle+rnd(-0.3,0.3))*rnd(2,5), vy: Math.sin(shootAngle+rnd(-0.3,0.3))*rnd(2,5), life: 10, maxLife: 10, color: i < 2 ? "#ffdd44" : "#ff8800", size: rnd(2,5) });
        }
        if (p.shootCooldown > 0) p.shootCooldown--;

        if (g.enemiesSpawned < waveDef.enemies) { g.spawnTimer--; if (g.spawnTimer <= 0) { g.enemies.push(spawnEnemy(waveDef, g.enemies, W, H)); g.enemiesSpawned++; g.spawnTimer = Math.max(15, 70-g.wave*3); } }
        if (g.wave > 0 && g.wave%5 === 0 && g.enemiesSpawned === waveDef.enemies && !g.enemies.some(e=>e.isBoss) && !g.bossSpawned) { g.enemies.push(spawnBoss(g.wave, W, H)); g.bossSpawned = true; }

        g.enemies.forEach((e) => {
          e.moveTimer--; if (e.moveTimer <= 0) { e.targetX = rnd(60,W-60); e.targetY = rnd(60,H-60); e.moveTimer = Math.floor(rnd(60,150)); }
          const toX = e.targetX-e.x, toY = e.targetY-e.y, tD = Math.sqrt(toX**2+toY**2);
          if (tD > 5) { e.x += (toX/tD)*e.speed; e.y += (toY/tD)*e.speed; }
          e.x = clamp(e.x,20,W-20); e.y = clamp(e.y,20,H-20);
          e.shootTimer--;
          if (e.shootTimer <= 0) {
            const a = Math.atan2(p.y-e.y, p.x-e.x);
            const shots = e.isBoss ? 3 : 1;
            for (let s = 0; s < shots; s++) { const sa = a+(e.isBoss?(s-1)*0.3:rnd(-0.15,0.15)); g.enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(sa)*ENEMY_BULLET_SPEED, vy: Math.sin(sa)*ENEMY_BULLET_SPEED, life: 140 }); }
            e.shootTimer = Math.floor(e.shootRate*rnd(0.7,1.3));
            if (f % 3 === 0) sfx.enemyShoot();
          }
          if (e.hitFlash > 0) e.hitFlash--;
        });

        g.playerBullets.forEach((b) => { b.x += b.vx; b.y += b.vy; b.life--; });
        g.enemyBullets.forEach((b) => { b.x += b.vx; b.y += b.vy; b.life--; });
        g.playerBullets = g.playerBullets.filter((b) => b.life > 0 && b.x > -20 && b.x < W+20 && b.y > -20 && b.y < H+20);
        g.enemyBullets = g.enemyBullets.filter((b) => b.life > 0 && b.x > -20 && b.x < W+20 && b.y > -20 && b.y < H+20);

        g.playerBullets.forEach((b) => {
          g.enemies.forEach((e) => {
            const hd = e.isBoss ? ENEMY_SIZE*1.5 : ENEMY_SIZE;
            if (dist(b,e) < hd) {
              b.life = 0; e.hp--; e.hitFlash = 6; g.shakeTimer = 4; g.shakeIntensity = 3;
              sfx.hit();
              for (let i = 0; i < 6; i++) g.particles.push({ x: e.x, y: e.y, vx: rnd(-3,3), vy: rnd(-3,3), life: 20, maxLife: 20, color: i<3?"#ff4444":"#ff8800", size: rnd(2,6) });
              if (e.hp <= 0) {
                comboRef.current++; comboTimerRef.current = 90; setCombo(comboRef.current);
                if (comboRef.current > 2) sfx.combo();
                const cm = Math.min(comboRef.current,10);
                const pts = (100+g.wave*50)*cm + (e.isBoss?2000+g.wave*500:0);
                scoreRef.current += pts; setScore(scoreRef.current); g.totalKills++;
                if (e.isBoss) sfx.bossKill(); else sfx.kill();
                g.floatingTexts.push({ x: e.x, y: e.y-10, text: comboRef.current > 1 ? "+"+pts+" x"+comboRef.current : "+"+pts, color: comboRef.current >= 5 ? "#ff44ff" : comboRef.current >= 3 ? "#ffaa00" : "#ffdd44", life: 45, maxLife: 45, size: Math.min(14+comboRef.current*2,28) });
                if (e.isBoss) g.floatingTexts.push({ x: e.x, y: e.y-35, text: "BOSS KILLED!", color: "#ff3333", life: 60, maxLife: 60, size: 24 });
                const pc = e.isBoss ? 25 : 12;
                for (let i = 0; i < pc; i++) g.particles.push({ x: e.x, y: e.y, vx: rnd(-4,4), vy: rnd(-4,4), life: 30, maxLife: 30, color: e.isBoss?["#ff3333","#ffaa00","#ffdd44"][i%3]:(i<6?"#ff6633":"#ffaa44"), size: rnd(3,e.isBoss?10:8) });
                if (Math.random() < (e.isBoss?1.0:0.2)) g.pickups.push({ x: e.x, y: e.y, type: "hp", life: 300 });
              }
            }
          });
        });
        g.enemies = g.enemies.filter((e) => e.hp > 0);

        if (p.invuln <= 0 && p.rolling <= 0) {
          g.enemyBullets.forEach((b) => {
            if (dist(b,p) < PLAYER_SIZE*0.8) {
              b.life = 0; p.hp--; p.invuln = INVULN_FRAMES; g.shakeTimer = 8; g.shakeIntensity = 6;
              comboRef.current = 0; comboTimerRef.current = 0; setCombo(0);
              sfx.playerHit();
              for (let i = 0; i < 8; i++) g.particles.push({ x: p.x, y: p.y, vx: rnd(-3,3), vy: rnd(-3,3), life: 25, maxLife: 25, color: "#ff2222", size: rnd(3,7) });
              if (p.hp <= 0) {
                sfx.death();
                if (scoreRef.current > bestScoreRef.current) { bestScoreRef.current = scoreRef.current; setBestScore(scoreRef.current); }
                if (waveRef.current > bestWaveRef.current) bestWaveRef.current = waveRef.current;
                setScreen("dead");
              }
            }
          });
        }

        g.pickups.forEach((pk) => {
          pk.life--;
          if (dist(pk,p) < PLAYER_SIZE+16) { pk.life = 0; p.hp = Math.min(MAX_HP, p.hp+1); sfx.pickup(); g.floatingTexts.push({ x: p.x, y: p.y-20, text: "+1 HP", color: "#44ff44", life: 30, maxLife: 30, size: 16 }); }
        });
        g.pickups = g.pickups.filter((pk) => pk.life > 0);

        if (g.enemiesSpawned >= waveDef.enemies && g.enemies.length === 0) {
          const wb = 500+g.wave*200; scoreRef.current += wb; setScore(scoreRef.current);
          sfx.waveClear();
          g.floatingTexts.push({ x: W/2, y: H/2-40, text: "WAVE CLEAR +"+wb, color: "#44ffaa", life: 60, maxLife: 60, size: 22 });
          p.hp = Math.min(MAX_HP, p.hp+1);
          startWave(g.wave+1);
        }
      }

      g.particles.forEach((pt) => { pt.x += pt.vx; pt.y += pt.vy; pt.vx *= 0.95; pt.vy *= 0.95; pt.life--; });
      g.particles = g.particles.filter((pt) => pt.life > 0);
      g.floatingTexts.forEach((ft) => { ft.y -= 0.8; ft.life--; });
      g.floatingTexts = g.floatingTexts.filter((ft) => ft.life > 0);
      g.dustParticles.forEach((d) => { d.x += d.vx; d.y += d.vy; if (d.x < -10) d.x = W+10; if (d.y < -10) d.y = H+10; });
      // Tumbleweeds
      if (sceneryRef.current) sceneryRef.current.tumbleweeds.forEach((tw) => { tw.x += tw.vx; if (tw.x > W + 30) tw.x = -30; });
      if (g.shakeTimer > 0) g.shakeTimer--;

      // === DRAW ===
      ctx.save();
      if (g.shakeTimer > 0) ctx.translate(rnd(-g.shakeIntensity,g.shakeIntensity), rnd(-g.shakeIntensity,g.shakeIntensity));

      // Sky gradient at top
      const skyG = ctx.createLinearGradient(0, 0, 0, H * 0.15);
      skyG.addColorStop(0, "#87CEEB"); skyG.addColorStop(1, "#d4a056");
      ctx.fillStyle = skyG; ctx.fillRect(0, 0, W, H * 0.15);

      // Desert ground
      const grad = ctx.createLinearGradient(0, H * 0.1, 0, H);
      grad.addColorStop(0, "#d4a056"); grad.addColorStop(0.2, "#c89444"); grad.addColorStop(0.6, "#b58338"); grad.addColorStop(1, "#a07030");
      ctx.fillStyle = grad; ctx.fillRect(0, H * 0.1, W, H);

      // Ground texture
      ctx.fillStyle = "rgba(140,90,30,0.15)";
      for (let i = 0; i < 25; i++) { ctx.beginPath(); ctx.ellipse((i*173+f*0.05)%(W+40)-20, (i*97+30)%H, rnd(20,50), rnd(8,20), 0, 0, Math.PI*2); ctx.fill(); }

      // Scenery
      if (sceneryRef.current) {
        sceneryRef.current.rocks.forEach((r) => { ctx.fillStyle = "rgba(120,90,60,0.35)"; ctx.beginPath(); ctx.ellipse(r.x, r.y, r.w, r.h, 0, 0, Math.PI*2); ctx.fill(); });
        sceneryRef.current.skulls.forEach((s) => drawSkull(ctx, s.x, s.y, s.s));
        sceneryRef.current.cacti.forEach((c) => drawCactus(ctx, c.x, c.y, c.h));
        sceneryRef.current.tumbleweeds.forEach((tw) => drawTumbleweed(ctx, tw.x, tw.y, tw.r, f));
      }

      // Dust
      g.dustParticles.forEach((d) => { ctx.fillStyle = "rgba(200,170,120,"+d.opacity+")"; ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0, Math.PI*2); ctx.fill(); });

      // Pickups
      g.pickups.forEach((pk) => {
        if (!(pk.life < 60 && f%10 < 5)) {
          ctx.fillStyle = "#ff4466"; ctx.beginPath(); ctx.arc(pk.x, pk.y, 8+Math.sin(f*0.1)*2, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = "#fff"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center"; ctx.fillText("+", pk.x, pk.y+4);
        }
      });

      // Enemy bullets with trail
      g.enemyBullets.forEach((b) => {
        ctx.fillStyle = "#ff3322"; ctx.shadowColor = "#ff3322"; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(b.x, b.y, 4.5, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,50,30,0.25)"; ctx.beginPath(); ctx.arc(b.x-b.vx*1.5, b.y-b.vy*1.5, 3, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = "rgba(255,50,30,0.1)"; ctx.beginPath(); ctx.arc(b.x-b.vx*3, b.y-b.vy*3, 2, 0, Math.PI*2); ctx.fill();
      });
      // Player bullets with trail
      g.playerBullets.forEach((b) => {
        ctx.fillStyle = "#ffdd22"; ctx.shadowColor = "#ffdd22"; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,220,30,0.2)"; ctx.beginPath(); ctx.arc(b.x-b.vx, b.y-b.vy, 3, 0, Math.PI*2); ctx.fill();
      });

      // Enemies
      g.enemies.forEach((e) => {
        const sz = e.isBoss ? ENEMY_SIZE * 1.6 : ENEMY_SIZE;
        const eAngle = Math.atan2(p.y - e.y, p.x - e.x);
        ctx.globalAlpha = e.hitFlash > 0 ? 0.5 + Math.sin(f*2)*0.5 : 1;
        drawCowboy(ctx, e.x, e.y, sz, e.hitFlash > 0 ? { hat:"#fff",shirt:"#fff",skin:"#fff",boots:"#fff",belt:"#fff",bandana:null,hatBand:"#fff" } : e.skin, eAngle, f, false);
        ctx.globalAlpha = 1;
        if (e.isBoss) { ctx.strokeStyle = "rgba(255,0,0,"+(0.3+Math.sin(f*0.1)*0.2)+")"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, sz*0.8, 0, Math.PI*2); ctx.stroke(); }
        if (e.maxHp > 1) { const bw = e.isBoss?50:30; ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(e.x-bw/2, e.y-sz-12, bw, 6); ctx.fillStyle = e.isBoss?"#ff0000":"#ff4444"; ctx.fillRect(e.x-bw/2, e.y-sz-12, bw*(e.hp/e.maxHp), 6); ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1; ctx.strokeRect(e.x-bw/2, e.y-sz-12, bw, 6); }
      });

      // Player
      const pa = (p.invuln > 0 && f%6 < 3) ? 0.4 : 1;
      ctx.globalAlpha = pa;
      let aimAngle = p.facing;
      if (rightJoy.current.active && Math.sqrt(rightJoy.current.dx**2+rightJoy.current.dy**2) > JOY_DEAD) aimAngle = rightJoy.current.angle;
      else if (mouseRef.current.down) aimAngle = Math.atan2(mouseRef.current.y-p.y, mouseRef.current.x-p.x);
      drawCowboy(ctx, p.x, p.y, PLAYER_SIZE, PLAYER_SKIN, aimAngle, f, p.rolling > 0);
      ctx.globalAlpha = 1;

      // Particles
      g.particles.forEach((pt) => { ctx.fillStyle = pt.color; ctx.globalAlpha = pt.life/pt.maxLife; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size*(pt.life/pt.maxLife), 0, Math.PI*2); ctx.fill(); });
      ctx.globalAlpha = 1;
      // Floating texts
      g.floatingTexts.forEach((ft) => { ctx.globalAlpha = ft.life/ft.maxLife; ctx.fillStyle = ft.color; ctx.font = "bold "+ft.size+"px monospace"; ctx.textAlign = "center"; ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.lineWidth = 3; ctx.strokeText(ft.text, ft.x, ft.y); ctx.fillText(ft.text, ft.x, ft.y); });
      ctx.globalAlpha = 1;

      // HUD
      const hudH = Math.max(40, H*0.065);
      ctx.fillStyle = "rgba(20,10,5,0.75)"; ctx.fillRect(0, 0, W, hudH+4);
      // Western border
      ctx.strokeStyle = "#8B6914"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, hudH+4); ctx.lineTo(W, hudH+4); ctx.stroke();

      const hs = Math.max(16, hudH*0.45);
      for (let i = 0; i < MAX_HP; i++) { ctx.fillStyle = i < p.hp ? "#ff4466" : "#443333"; ctx.font = hs+"px serif"; ctx.textAlign = "left"; ctx.fillText("\u2665", 14+i*(hs+4), hudH*0.7); }
      ctx.fillStyle = "#ffdd44"; ctx.font = "bold "+Math.max(14,hudH*0.4)+"px monospace"; ctx.textAlign = "right"; ctx.fillText("SCORE: "+scoreRef.current, W-14, hudH*0.5);
      if (bestScoreRef.current > 0) { ctx.fillStyle = "rgba(255,221,68,0.4)"; ctx.font = Math.max(10,hudH*0.26)+"px monospace"; ctx.fillText("BEST: "+bestScoreRef.current, W-14, hudH*0.82); }
      ctx.fillStyle = "#f4a460"; ctx.font = "bold "+Math.max(12,hudH*0.35)+"px Georgia"; ctx.textAlign = "center"; ctx.fillText(waveDef.label, W/2, hudH*0.5);
      const rem = Math.max(0, waveDef.enemies-g.enemiesSpawned)+g.enemies.length;
      ctx.fillStyle = "#aaa"; ctx.font = Math.max(9,hudH*0.24)+"px Georgia"; ctx.fillText(rem+" left | Kills: "+g.totalKills, W/2, hudH*0.82);

      if (comboRef.current > 1) {
        const cc = comboRef.current >= 10 ? "#ff44ff" : comboRef.current >= 5 ? "#ffaa00" : "#44aaff";
        ctx.globalAlpha = 0.5+(comboTimerRef.current/90)*0.5;
        ctx.fillStyle = cc; ctx.font = "bold "+(20+Math.min(comboRef.current,10)*2)+"px monospace"; ctx.textAlign = "center";
        ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.lineWidth = 3;
        ctx.strokeText("x"+comboRef.current+" COMBO", W/2, hudH+35); ctx.fillText("x"+comboRef.current+" COMBO", W/2, hudH+35);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(W/2-60, hudH+40, 120, 5);
        ctx.fillStyle = cc; ctx.fillRect(W/2-60, hudH+40, 120*(comboTimerRef.current/90), 5);
      }

      // Joysticks
      if (isMobile.current) {
        const sx = W/canvas.clientWidth, sy = H/canvas.clientHeight;
        if (leftJoy.current.active) {
          ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(leftJoy.current.cx*sx, leftJoy.current.cy*sy, JOY_RADIUS*sx, 0, Math.PI*2); ctx.stroke();
          ctx.fillStyle = "rgba(255,255,255,0.3)";
          ctx.beginPath(); ctx.arc((leftJoy.current.cx+leftJoy.current.dx)*sx, (leftJoy.current.cy+leftJoy.current.dy)*sy, 22*sx, 0, Math.PI*2); ctx.fill();
        }
        if (rightJoy.current.active) {
          ctx.strokeStyle = "rgba(255,100,100,0.2)"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(rightJoy.current.cx*sx, rightJoy.current.cy*sy, JOY_RADIUS*sx, 0, Math.PI*2); ctx.stroke();
          ctx.fillStyle = "rgba(255,100,100,0.3)";
          ctx.beginPath(); ctx.arc((rightJoy.current.cx+rightJoy.current.dx)*sx, (rightJoy.current.cy+rightJoy.current.dy)*sy, 22*sx, 0, Math.PI*2); ctx.fill();
          const rm = Math.sqrt(rightJoy.current.dx**2+rightJoy.current.dy**2);
          if (rm > JOY_DEAD) { ctx.strokeStyle = "rgba(255,200,100,0.25)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(rightJoy.current.cx*sx, rightJoy.current.cy*sy); ctx.lineTo(rightJoy.current.cx*sx+Math.cos(rightJoy.current.angle)*JOY_RADIUS*sx*1.5, rightJoy.current.cy*sy+Math.sin(rightJoy.current.angle)*JOY_RADIUS*sy*1.5); ctx.stroke(); }
        }
        // Dodge button
        const dbx = W-70, dby = H-70, dbr = 30;
        if (p.rollCooldown <= 0) {
          ctx.fillStyle = "rgba(100,170,255,0.25)"; ctx.beginPath(); ctx.arc(dbx, dby, dbr, 0, Math.PI*2); ctx.fill();
          ctx.strokeStyle = "rgba(100,170,255,0.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(dbx, dby, dbr, 0, Math.PI*2); ctx.stroke();
          ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = "bold 11px monospace"; ctx.textAlign = "center"; ctx.fillText("DODGE", dbx, dby+4);
        } else {
          ctx.fillStyle = "rgba(50,50,50,0.25)"; ctx.beginPath(); ctx.arc(dbx, dby, dbr, 0, Math.PI*2); ctx.fill();
          ctx.strokeStyle = "rgba(100,170,255,0.4)"; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(dbx, dby, dbr, -Math.PI/2, -Math.PI/2+(1-p.rollCooldown/ROLL_COOLDOWN)*Math.PI*2); ctx.stroke();
        }
      } else {
        if (p.rollCooldown > 0) { ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(10,H-28,100,14); ctx.fillStyle = "#66aaff"; ctx.fillRect(10,H-28,100*(1-p.rollCooldown/ROLL_COOLDOWN),14); ctx.fillStyle = "#fff"; ctx.font = "9px monospace"; ctx.textAlign = "left"; ctx.fillText("DODGE [SPACE]", 14, H-17); }
        else { ctx.fillStyle = "rgba(100,180,255,0.3)"; ctx.fillRect(10,H-28,100,14); ctx.fillStyle = "#aaddff"; ctx.font = "9px monospace"; ctx.textAlign = "left"; ctx.fillText("DODGE READY", 14, H-17); }
      }

      ctx.restore();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
  }, [screen, startWave, W, H]);

  const cs = { width: "100vw", height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(180deg, #1a0a2e 0%, #2d1b4e 40%, #4a2040 100%)", fontFamily: "'Georgia', serif", overflow: "hidden", position: "relative", userSelect: "none" };
  const bs = { background: "linear-gradient(180deg, #c84b31 0%, #8B2500 100%)", color: "#f4e4c1", border: "3px solid #f4a460", padding: "16px 48px", fontSize: 22, fontFamily: "'Georgia', serif", fontWeight: "bold", letterSpacing: 3, cursor: "pointer", textTransform: "uppercase", boxShadow: "0 4px 20px rgba(200,75,49,0.5)", marginTop: 20 };

  if (screen === "menu") {
    return (<div style={cs} onClick={() => sfx.init()}>
      <div style={{ textAlign: "center", padding: 20 }}>
        <div style={{ fontSize: "clamp(36px, 8vw, 72px)", fontWeight: "bold", color: "#f4a460", textShadow: "3px 3px 0 #8B4513, 6px 6px 0 rgba(0,0,0,0.3)", letterSpacing: 4, lineHeight: 1.1 }}>DEAD MAN'S<br/>DRAW</div>
        <div style={{ color: "#c84b31", fontSize: 18, margin: "12px 0", fontWeight: "bold" }}>{"\u267E\uFE0F"} ENDLESS MODE</div>
        <div style={{ color: "#deb887", fontSize: 14, marginBottom: 6, opacity: 0.8, fontStyle: "italic" }}>How long can you survive?</div>
        {bestScoreRef.current > 0 && <div style={{ color: "#ffdd44", fontSize: 16, marginBottom: 6, fontFamily: "monospace" }}>Best: {bestScoreRef.current} pts</div>}
        <div style={{ color: "#a0855b", fontSize: 12, marginBottom: 25, opacity: 0.7, lineHeight: 2 }}>
          {isMobile.current ? "Left thumb = Move | Right thumb = Aim & Shoot" : "WASD = Move | Mouse = Aim & Shoot | SPACE = Dodge"}
        </div>
        <button onClick={startGame} style={bs}>{"\uD83D\uDD2B"} Start Game</button>
      </div>
    </div>);
  }

  if (screen === "dead") {
    return (<div style={cs}>
      <div style={{ textAlign: "center", padding: 20 }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>{"\u26B0\uFE0F"}</div>
        <div style={{ fontSize: "clamp(28px, 6vw, 42px)", fontWeight: "bold", color: "#666", textShadow: "2px 2px 4px rgba(0,0,0,0.8)", marginBottom: 8 }}>GAME OVER</div>
        <div style={{ color: "#deb887", fontSize: 15, fontStyle: "italic", marginBottom: 12 }}>Fell on Wave {waveIndex+1}: {getWaveDef(waveIndex).label}</div>
        <div style={{ color: "#ffdd44", fontSize: 28, fontWeight: "bold", fontFamily: "monospace", marginBottom: 4 }}>{score}</div>
        <div style={{ color: "#a0855b", fontSize: 14, marginBottom: 4 }}>Kills: {gameRef.current?.totalKills || 0}</div>
        {score >= bestScoreRef.current && score > 0 && <div style={{ color: "#ff44ff", fontSize: 18, fontWeight: "bold", marginBottom: 8 }}>{"\u2B50"} NEW BEST! {"\u2B50"}</div>}
        <button onClick={startGame} style={bs}>{"\uD83E\uDD20"} Ride Again</button>
      </div>
    </div>);
  }

  return (<div style={{ ...cs, cursor: isMobile.current ? "default" : "crosshair" }}>
    {screen === "waveIntro" && (<div style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", pointerEvents: "none" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ color: "#f4a460", fontSize: 16, letterSpacing: 4, textTransform: "uppercase", marginBottom: 8 }}>Wave {waveIndex+1}</div>
        <div style={{ color: "#fff", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>{getWaveDef(waveIndex).label}</div>
        <div style={{ color: "#c84b31", fontSize: 13, marginTop: 8 }}>{getWaveDef(waveIndex).enemies} enemies | HP: {getWaveDef(waveIndex).hp}{waveIndex > 0 && waveIndex%5 === 0 ? " | BOSS" : ""}</div>
      </div>
    </div>)}
    <canvas ref={canvasRef} width={W} height={H} style={{ width: "100vw", height: "100vh", display: "block", touchAction: "none" }} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} />
  </div>);
}
