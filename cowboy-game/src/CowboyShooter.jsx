import { useState, useEffect, useRef, useCallback } from "react";

// === CONSTANTS ===
const PLAYER_SIZE = 28;
const BULLET_SPEED = 7;
const ENEMY_BULLET_SPEED = 3.5;
const PLAYER_SPEED = 4;
const ROLL_SPEED = 9;
const ROLL_DURATION = 14;
const ROLL_COOLDOWN = 40;
const ENEMY_SIZE = 26;
const MAX_HP = 5;
const INVULN_FRAMES = 45;
const JOY_RADIUS = 55;
const JOY_DEAD = 10;

// === WEAPONS ===
const WEAPONS = {
  pistol: { name: "Revolver", cooldown: 12, bullets: 1, spread: 0.02, speed: 7, dmg: 1, dur: Infinity, color: "#ffdd22", icon: "\uD83D\uDD2B", trail: "#ffdd22" },
  shotgun: { name: "Shotgun", cooldown: 26, bullets: 5, spread: 0.32, speed: 6, dmg: 1, dur: 480, color: "#ff8844", icon: "\uD83C\uDF2A\uFE0F", trail: "#ff8844" },
  rifle: { name: "Rifle", cooldown: 7, bullets: 1, spread: 0.01, speed: 10, dmg: 2, dur: 480, color: "#44ddff", icon: "\u26A1", trail: "#44ddff" },
  dynamite: { name: "Dynamite", cooldown: 40, bullets: 8, spread: Math.PI, speed: 3, dmg: 2, dur: 300, color: "#ff4444", icon: "\uD83E\uDDE8", trail: "#ff4444" },
};

// === ACHIEVEMENTS ===
const ACH_DEFS = [
  { id: "first_blood", n: "First Blood", d: "Kill your first outlaw", ic: "\uD83D\uDDE1\uFE0F", k: (s) => s.tk >= 1 },
  { id: "combo5", n: "Combo Master", d: "Reach x5 combo", ic: "\uD83D\uDD25", k: (s) => s.mc >= 5 },
  { id: "combo10", n: "Combo Legend", d: "Reach x10 combo", ic: "\uD83C\uDF1F", k: (s) => s.mc >= 10 },
  { id: "wave5", n: "Survivor", d: "Reach Wave 5", ic: "\uD83C\uDFC5", k: (s) => s.mw >= 5 },
  { id: "wave10", n: "Veteran", d: "Reach Wave 10", ic: "\u2B50", k: (s) => s.mw >= 10 },
  { id: "wave20", n: "Legendary", d: "Reach Wave 20", ic: "\uD83D\uDC51", k: (s) => s.mw >= 20 },
  { id: "boss1", n: "Boss Slayer", d: "Kill a boss", ic: "\uD83D\uDC80", k: (s) => s.bk >= 1 },
  { id: "boss5", n: "Boss Hunter", d: "Kill 5 bosses", ic: "\u2620\uFE0F", k: (s) => s.bk >= 5 },
  { id: "kills100", n: "Centurion", d: "100 total kills", ic: "\uD83C\uDFAF", k: (s) => s.lk >= 100 },
  { id: "kills500", n: "Exterminator", d: "500 total kills", ic: "\uD83D\uDCA0", k: (s) => s.lk >= 500 },
  { id: "score10k", n: "High Roller", d: "Score 10,000", ic: "\uD83D\uDCB0", k: (s) => s.bs >= 10000 },
  { id: "nodmg", n: "Untouchable", d: "Clear a wave without damage", ic: "\uD83D\uDEE1\uFE0F", k: (s) => s.fw >= 1 },
  { id: "shotty", n: "Boomstick", d: "Pick up a shotgun", ic: "\uD83D\uDCA5", k: (s) => s.sp >= 1 },
  { id: "dynamo", n: "Dynamite!", d: "Pick up dynamite", ic: "\uD83E\uDDE8", k: (s) => s.dp >= 1 },
];

function loadStats() {
  try { return JSON.parse(localStorage.getItem("dmd_stats")) || {}; } catch { return {}; }
}
function saveStats(s) {
  try { localStorage.setItem("dmd_stats", JSON.stringify(s)); } catch {}
}
function loadAch() {
  try { return JSON.parse(localStorage.getItem("dmd_ach")) || []; } catch { return []; }
}
function saveAch(a) {
  try { localStorage.setItem("dmd_ach", JSON.stringify(a)); } catch {}
}

// === SOUND ENGINE ===
class SFX {
  constructor() { this.c = null; this.v = 0.3; }
  init() { if (this.c) return; try { this.c = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {} }
  p(fn) { if (!this.c) return; if (this.c.state === 'suspended') this.c.resume(); try { fn(this.c, this.v); } catch(e) {} }
  shoot(w) {
    const freq = w === 'shotgun' ? 400 : w === 'rifle' ? 800 : w === 'dynamite' ? 200 : 600;
    const dur = w === 'shotgun' ? 0.15 : w === 'dynamite' ? 0.2 : 0.1;
    this.p((c, v) => {
      const o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = w === 'rifle' ? 'sawtooth' : 'square';
      o.frequency.setValueAtTime(freq, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(80, c.currentTime + dur);
      g.gain.setValueAtTime(v * 0.4, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.start(c.currentTime); o.stop(c.currentTime + dur);
      const buf = c.createBuffer(1, c.sampleRate * 0.05, c.sampleRate);
      const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
      const n = c.createBufferSource(), ng = c.createGain();
      n.buffer = buf; n.connect(ng); ng.connect(c.destination);
      ng.gain.setValueAtTime(v * (w === 'shotgun' ? 0.7 : 0.4), c.currentTime);
      ng.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      n.start(c.currentTime); n.stop(c.currentTime + dur);
    });
  }
  hit() { this.p((c, v) => { const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.type = 'sine'; o.frequency.setValueAtTime(800, c.currentTime); o.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.15); g.gain.setValueAtTime(v * 0.3, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15); o.start(c.currentTime); o.stop(c.currentTime + 0.15); }); }
  kill() { this.p((c, v) => { const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.type = 'sawtooth'; o.frequency.setValueAtTime(400, c.currentTime); o.frequency.exponentialRampToValueAtTime(50, c.currentTime + 0.25); g.gain.setValueAtTime(v * 0.35, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25); o.start(c.currentTime); o.stop(c.currentTime + 0.25); const o2 = c.createOscillator(), g2 = c.createGain(); o2.connect(g2); g2.connect(c.destination); o2.type = 'sine'; o2.frequency.setValueAtTime(1200, c.currentTime); o2.frequency.exponentialRampToValueAtTime(300, c.currentTime + 0.1); g2.gain.setValueAtTime(v * 0.2, c.currentTime); g2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1); o2.start(c.currentTime); o2.stop(c.currentTime + 0.1); }); }
  bossKill() { this.p((c, v) => { for (let i = 0; i < 3; i++) { const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.type = 'sawtooth'; o.frequency.setValueAtTime(500 - i * 100, c.currentTime + i * 0.1); o.frequency.exponentialRampToValueAtTime(30, c.currentTime + i * 0.1 + 0.3); g.gain.setValueAtTime(v * 0.4, c.currentTime + i * 0.1); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.1 + 0.3); o.start(c.currentTime + i * 0.1); o.stop(c.currentTime + i * 0.1 + 0.3); } }); }
  plrHit() { this.p((c, v) => { const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.type = 'square'; o.frequency.setValueAtTime(200, c.currentTime); o.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.2); g.gain.setValueAtTime(v * 0.5, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2); o.start(c.currentTime); o.stop(c.currentTime + 0.2); }); }
  dodge() { this.p((c, v) => { const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.type = 'sine'; o.frequency.setValueAtTime(300, c.currentTime); o.frequency.exponentialRampToValueAtTime(900, c.currentTime + 0.12); g.gain.setValueAtTime(v * 0.2, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12); o.start(c.currentTime); o.stop(c.currentTime + 0.12); }); }
  pickup() { this.p((c, v) => { const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.type = 'sine'; o.frequency.setValueAtTime(500, c.currentTime); o.frequency.setValueAtTime(700, c.currentTime + 0.08); o.frequency.setValueAtTime(900, c.currentTime + 0.16); g.gain.setValueAtTime(v * 0.25, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25); o.start(c.currentTime); o.stop(c.currentTime + 0.25); }); }
  waveClear() { this.p((c, v) => { [0,0.1,0.2,0.3].forEach((t, i) => { const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.type = 'sine'; o.frequency.setValueAtTime([400,500,600,800][i], c.currentTime + t); g.gain.setValueAtTime(v * 0.25, c.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t + 0.15); o.start(c.currentTime + t); o.stop(c.currentTime + t + 0.15); }); }); }
  death() { this.p((c, v) => { const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.type = 'sawtooth'; o.frequency.setValueAtTime(400, c.currentTime); o.frequency.exponentialRampToValueAtTime(20, c.currentTime + 0.8); g.gain.setValueAtTime(v * 0.4, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.8); o.start(c.currentTime); o.stop(c.currentTime + 0.8); }); }
  combo() { this.p((c, v) => { const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.type = 'triangle'; o.frequency.setValueAtTime(600, c.currentTime); o.frequency.setValueAtTime(800, c.currentTime + 0.05); g.gain.setValueAtTime(v * 0.15, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1); o.start(c.currentTime); o.stop(c.currentTime + 0.1); }); }
  ach() { this.p((c, v) => { [0,0.08,0.16,0.24].forEach((t, i) => { const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.type = 'sine'; o.frequency.setValueAtTime([523,659,784,1047][i], c.currentTime + t); g.gain.setValueAtTime(v * 0.2, c.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t + 0.12); o.start(c.currentTime + t); o.stop(c.currentTime + t + 0.12); }); }); }
}
const sfx = new SFX();

// === DRAW HELPERS ===
function drawCowboy(ctx, x, y, sz, col, ang, f, rolling) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(0, sz * 0.6, sz * 0.8, 6, 0, 0, Math.PI * 2); ctx.fill();
  if (rolling) { ctx.rotate(f * 0.4); ctx.fillStyle = col.skin; ctx.beginPath(); ctx.arc(0, 0, sz * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = col.hat; ctx.fillRect(-sz * 0.3, -sz * 0.3, sz * 0.6, sz * 0.6); ctx.restore(); return; }
  ctx.fillStyle = col.boots; ctx.fillRect(-sz * 0.35, sz * 0.2, sz * 0.22, sz * 0.3); ctx.fillRect(sz * 0.13, sz * 0.2, sz * 0.22, sz * 0.3);
  ctx.fillStyle = col.shirt; ctx.beginPath(); ctx.moveTo(-sz * 0.3, -sz * 0.05); ctx.lineTo(-sz * 0.35, sz * 0.3); ctx.lineTo(sz * 0.35, sz * 0.3); ctx.lineTo(sz * 0.3, -sz * 0.05); ctx.closePath(); ctx.fill();
  ctx.fillStyle = col.belt; ctx.fillRect(-sz * 0.32, sz * 0.1, sz * 0.64, sz * 0.08);
  ctx.fillStyle = "#FFD700"; ctx.fillRect(-sz * 0.06, sz * 0.1, sz * 0.12, sz * 0.08);
  ctx.fillStyle = col.skin; ctx.beginPath(); ctx.arc(0, -sz * 0.25, sz * 0.25, 0, Math.PI * 2); ctx.fill();
  const ed = ang || 0; ctx.fillStyle = "#222";
  ctx.beginPath(); ctx.arc(-sz * 0.1 + Math.cos(ed) * 2, -sz * 0.28 + Math.sin(ed) * 1, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(sz * 0.1 + Math.cos(ed) * 2, -sz * 0.28 + Math.sin(ed) * 1, 2.5, 0, Math.PI * 2); ctx.fill();
  if (col.bandana) { ctx.fillStyle = col.bandana; ctx.beginPath(); ctx.moveTo(-sz * 0.18, -sz * 0.15); ctx.lineTo(sz * 0.18, -sz * 0.15); ctx.lineTo(sz * 0.12, -sz * 0.03); ctx.lineTo(0, 0); ctx.lineTo(-sz * 0.12, -sz * 0.03); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = col.hat; ctx.beginPath(); ctx.ellipse(0, -sz * 0.45, sz * 0.5, sz * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(-sz * 0.25, -sz * 0.75, sz * 0.5, sz * 0.32);
  ctx.fillStyle = col.hatBand || "#8B4513"; ctx.fillRect(-sz * 0.25, -sz * 0.48, sz * 0.5, sz * 0.05);
  if (ang !== null && ang !== undefined) {
    ctx.strokeStyle = col.skin; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(sz * 0.2, 0); ctx.lineTo(sz * 0.2 + Math.cos(ang) * sz * 0.6, Math.sin(ang) * sz * 0.6); ctx.stroke();
    ctx.fillStyle = "#444"; const gx = sz * 0.2 + Math.cos(ang) * sz * 0.6, gy = Math.sin(ang) * sz * 0.6;
    ctx.save(); ctx.translate(gx, gy); ctx.rotate(ang); ctx.fillRect(-2, -3, 12, 6); ctx.fillRect(6, -5, 4, 10); ctx.restore();
  }
  ctx.restore();
}
function drawCactus(ctx, x, y, h) { ctx.fillStyle = "#2d5a1e"; ctx.fillRect(x - 6, y - h, 12, h); ctx.beginPath(); ctx.arc(x, y - h, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x - 20, y - h * 0.65, 14, 8); ctx.fillRect(x - 20, y - h * 0.65 - 18, 8, 26); ctx.beginPath(); ctx.arc(x - 16, y - h * 0.65 - 18, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x + 6, y - h * 0.45, 16, 8); ctx.fillRect(x + 14, y - h * 0.45 - 22, 8, 30); ctx.beginPath(); ctx.arc(x + 18, y - h * 0.45 - 22, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "rgba(100,180,60,0.3)"; ctx.fillRect(x - 2, y - h, 4, h); }
function drawSkull(ctx, x, y, s) { ctx.fillStyle = "rgba(220,210,190,0.4)"; ctx.beginPath(); ctx.ellipse(x, y, s, s * 1.1, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "rgba(80,60,40,0.3)"; ctx.beginPath(); ctx.arc(x - s * 0.3, y - s * 0.15, s * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(x + s * 0.3, y - s * 0.15, s * 0.2, 0, Math.PI * 2); ctx.fill(); }

// === GAME LOGIC ===
function getWD(w) { return { enemies: Math.min(3 + Math.floor(w * 1.3), 30), shootRate: Math.max(120 - w * 6, 20), speed: 1.2 + w * 0.15, hp: 1 + Math.floor(w / 3), label: getWT(w) }; }
function getWT(w) { const t = ["Cattle Rustlers","Bandits","Outlaws","Desperados","Gunslingers","El Diablo's Gang","The Undertaker's Posse","Hell Riders","Death Valley Demons","Ghost Town Terrors","Blood Mesa Bandits","Canyon Crawlers","Tombstone Titans","Vulture's Nest","Scorpion Kings","Dustdevil Raiders","Deadwood Drifters","Bone Dry Killers","Cactus Jack's Crew","Sundown Slayers"]; return w < t.length ? t[w] : "Wave " + (w + 1) + " - Endless Horde"; }
function dist(a, b) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function rnd(a, b) { return a + Math.random() * (b - a); }

const SKINS = [
  { hat: "#222", shirt: "#6b3a2a", skin: "#c49a6c", boots: "#3a2518", belt: "#2a1a0e", bandana: "#8b1a1a", hatBand: "#444" },
  { hat: "#1a1a2e", shirt: "#4a4a6a", skin: "#d4a574", boots: "#2a2a3e", belt: "#1a1a2a", bandana: "#2a4a2a", hatBand: "#3a3a5a" },
  { hat: "#3a2010", shirt: "#7a5a3a", skin: "#b8845c", boots: "#2a1508", belt: "#4a3020", bandana: "#6a2a1a", hatBand: "#5a4030" },
  { hat: "#555", shirt: "#888", skin: "#c9a07a", boots: "#333", belt: "#222", bandana: null, hatBand: "#666" },
];
const BOSS_SKIN = { hat: "#1a0000", shirt: "#440000", skin: "#8a6a4a", boots: "#0a0000", belt: "#220000", bandana: "#000", hatBand: "#ff0000" };
const PLR_SKIN = { hat: "#8B6914", shirt: "#c8a050", skin: "#e8c090", boots: "#6a4a20", belt: "#5a3a18", bandana: null, hatBand: "#a08040" };

function spawnE(wd, ex, W, H) {
  let x, y, t = 0;
  do { const s = Math.floor(Math.random()*4); if(s===0){x=rnd(30,W-30);y=-20;}else if(s===1){x=W+20;y=rnd(30,H-30);}else if(s===2){x=rnd(30,W-30);y=H+20;}else{x=-20;y=rnd(30,H-30);} t++; } while (t < 10 && ex.some(e => dist(e,{x,y}) < 60));
  return { x, y, hp: wd.hp, maxHp: wd.hp, speed: wd.speed * rnd(0.8,1.2), shootTimer: Math.floor(rnd(30,wd.shootRate)), shootRate: wd.shootRate, hitFlash: 0, targetX: rnd(80,W-80), targetY: rnd(80,H-80), moveTimer: 0, id: Date.now()+Math.random(), skin: SKINS[Math.floor(Math.random()*SKINS.length)] };
}
function spawnB(w, W, H) { return { x: W/2, y: -30, hp: 10+w*3, maxHp: 10+w*3, speed: 1+w*0.05, shootTimer: 30, shootRate: Math.max(25-w,10), hitFlash: 0, targetX: W/2, targetY: H/2, moveTimer: 0, id: Date.now()+Math.random(), isBoss: true, skin: BOSS_SKIN }; }

export default function Game() {
  const canvasRef = useRef(null);
  const [screen, setScreen] = useState("menu");
  const [score, setScore] = useState(0);
  const [waveIndex, setWaveIndex] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const [achPopup, setAchPopup] = useState(null);
  const gRef = useRef(null);
  const keysRef = useRef({});
  const mouseRef = useRef({ x: 400, y: 300, down: false });
  const fRef = useRef(0);
  const scRef = useRef(0);
  const wRef = useRef(0);
  const coRef = useRef(0);
  const ctRef = useRef(0);
  const bsRef = useRef(0);
  const bwRef = useRef(0);
  const leftJ = useRef({ active: false, id: -1, cx: 0, cy: 0, dx: 0, dy: 0 });
  const rightJ = useRef({ active: false, id: -1, cx: 0, cy: 0, dx: 0, dy: 0, angle: 0 });
  const isM = useRef(false);
  const dtDodge = useRef(false);
  const scenRef = useRef(null);
  const statsRef = useRef(loadStats());
  const achRef = useRef(loadAch());
  const achQueueRef = useRef([]);
  const waveDmgRef = useRef(false); // track if player took damage this wave

  useEffect(() => {
    isM.current = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const r = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    r(); window.addEventListener("resize", r);
    const s = loadStats(); if (s.bs) { bsRef.current = s.bs; setBestScore(s.bs); }
    return () => window.removeEventListener("resize", r);
  }, []);

  const W = dims.w, H = dims.h;

  useEffect(() => {
    scenRef.current = {
      cacti: Array.from({ length: Math.floor(W / 200) + 2 }, () => ({ x: rnd(40, W - 40), y: rnd(H * 0.3, H * 0.85), h: rnd(35, 65) })),
      tw: Array.from({ length: 3 }, () => ({ x: rnd(0, W), y: rnd(H * 0.4, H * 0.9), r: rnd(8, 16), vx: rnd(0.3, 0.8) })),
      skulls: Array.from({ length: Math.floor(W / 300) + 1 }, () => ({ x: rnd(30, W - 30), y: rnd(H * 0.5, H * 0.9), s: rnd(6, 10) })),
      rocks: Array.from({ length: 8 }, () => ({ x: rnd(20, W - 20), y: rnd(H * 0.2, H * 0.95), w: rnd(10, 25), h: rnd(6, 14) })),
    };
  }, [W, H]);

  // Achievement checker
  const checkAch = useCallback((st) => {
    const unlocked = achRef.current;
    ACH_DEFS.forEach((a) => {
      if (!unlocked.includes(a.id) && a.k(st)) {
        unlocked.push(a.id);
        achRef.current = unlocked;
        saveAch(unlocked);
        achQueueRef.current.push(a);
        sfx.ach();
      }
    });
  }, []);

  // Process achievement popup queue
  useEffect(() => {
    if (achPopup) return;
    const iv = setInterval(() => {
      if (achQueueRef.current.length > 0 && !achPopup) {
        const a = achQueueRef.current.shift();
        setAchPopup(a);
        setTimeout(() => setAchPopup(null), 3000);
      }
    }, 500);
    return () => clearInterval(iv);
  }, [achPopup]);

  const cleanup = useCallback(() => { if (gRef.current) gRef.current.running = false; }, []);

  const initGame = useCallback(() => {
    cleanup(); sfx.init();
    scRef.current = 0; wRef.current = 0; coRef.current = 0; ctRef.current = 0;
    setScore(0); setWaveIndex(0); setCombo(0);
    waveDmgRef.current = false;
    gRef.current = {
      running: true,
      p: { x: W/2, y: H/2, hp: MAX_HP, rolling: 0, rollCd: 0, rollDx: 0, rollDy: 0, shootCd: 0, invuln: 0, facing: 0, weapon: 'pistol', weaponTimer: Infinity },
      enemies: [], pBullets: [], eBullets: [], pickups: [], particles: [], texts: [],
      wave: 0, spawned: 0, spawnT: 0, shakeT: 0, shakeI: 0, kills: 0, bossSpawned: false,
      maxCombo: 0, bossKills: 0,
      dust: Array.from({ length: 20 }, () => ({ x: rnd(0, W), y: rnd(0, H), vx: rnd(-0.4, -0.1), vy: rnd(-0.15, 0.15), size: rnd(2, 6), op: rnd(0.04, 0.12) })),
    };
  }, [cleanup, W, H]);

  const startWave = useCallback((wi) => {
    const g = gRef.current; if (!g) return;
    g.wave = wi; g.spawned = 0; g.spawnT = 60; g.eBullets = []; g.bossSpawned = false;
    waveDmgRef.current = false;
    wRef.current = wi; setWaveIndex(wi); setScreen("waveIntro");
    setTimeout(() => setScreen("playing"), 1800);
  }, []);

  const startGame = useCallback(() => { initGame(); startWave(0); }, [initGame, startWave]);

  // Keyboard
  useEffect(() => {
    const kd = (e) => { keysRef.current[e.code] = true; if (e.code === "Space") e.preventDefault(); };
    const ku = (e) => { keysRef.current[e.code] = false; };
    const mm = (e) => { const c = canvasRef.current; if (!c) return; const r = c.getBoundingClientRect(); mouseRef.current.x = ((e.clientX - r.left)/r.width)*W; mouseRef.current.y = ((e.clientY - r.top)/r.height)*H; };
    const md = (e) => { mm(e); mouseRef.current.down = true; };
    const mu = () => { mouseRef.current.down = false; };
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    window.addEventListener("mousemove", mm); window.addEventListener("mousedown", md); window.addEventListener("mouseup", mu);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("mousemove", mm); window.removeEventListener("mousedown", md); window.removeEventListener("mouseup", mu); };
  }, [W, H]);

  // Touch
  const tStart = useCallback((e) => {
    e.preventDefault(); sfx.init();
    const c = canvasRef.current; if (!c) return; const r = c.getBoundingClientRect();
    for (const t of e.changedTouches) {
      const sx = t.clientX - r.left, sy = t.clientY - r.top, cx = (sx/r.width)*W;
      const dcx = cx, dcy = (sy/r.height)*H;
      if (Math.sqrt((dcx-(W-70))**2+(dcy-(H-70))**2) < 40) { dtDodge.current = true; setTimeout(() => { dtDodge.current = false; }, 100); continue; }
      if (cx < W * 0.5) { if (!leftJ.current.active) leftJ.current = { active: true, id: t.identifier, cx: sx, cy: sy, dx: 0, dy: 0 }; }
      else { if (!rightJ.current.active) rightJ.current = { active: true, id: t.identifier, cx: sx, cy: sy, dx: 0, dy: 0, angle: 0 }; }
    }
  }, [W, H]);
  const tMove = useCallback((e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const c = canvasRef.current; if (!c) return; const r = c.getBoundingClientRect();
      const sx = t.clientX - r.left, sy = t.clientY - r.top;
      if (leftJ.current.active && t.identifier === leftJ.current.id) { let dx = sx-leftJ.current.cx, dy = sy-leftJ.current.cy; const m = Math.sqrt(dx*dx+dy*dy); if (m > JOY_RADIUS) { dx = (dx/m)*JOY_RADIUS; dy = (dy/m)*JOY_RADIUS; } leftJ.current.dx = dx; leftJ.current.dy = dy; }
      if (rightJ.current.active && t.identifier === rightJ.current.id) { let dx = sx-rightJ.current.cx, dy = sy-rightJ.current.cy; const m = Math.sqrt(dx*dx+dy*dy); if (m > JOY_RADIUS) { dx = (dx/m)*JOY_RADIUS; dy = (dy/m)*JOY_RADIUS; } rightJ.current.dx = dx; rightJ.current.dy = dy; if (m > JOY_DEAD) rightJ.current.angle = Math.atan2(dy, dx); }
    }
  }, []);
  const tEnd = useCallback((e) => {
    for (const t of e.changedTouches) {
      if (leftJ.current.active && t.identifier === leftJ.current.id) leftJ.current = { active: false, id: -1, cx: 0, cy: 0, dx: 0, dy: 0 };
      if (rightJ.current.active && t.identifier === rightJ.current.id) rightJ.current = { active: false, id: -1, cx: 0, cy: 0, dx: 0, dy: 0, angle: 0 };
    }
  }, []);

  // Game loop
  useEffect(() => {
    if (screen !== "playing" && screen !== "waveIntro") return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); let raf;

    const loop = () => {
      const g = gRef.current; if (!g || !g.running) return;
      fRef.current++; const f = fRef.current, keys = keysRef.current, p = g.p;
      const wd = getWD(g.wave);
      const wep = WEAPONS[p.weapon];
      const isP = screen === "playing";

      if (isP) {
        let dx = 0, dy = 0;
        if (keys["KeyW"]||keys["ArrowUp"]) dy-=1; if (keys["KeyS"]||keys["ArrowDown"]) dy+=1;
        if (keys["KeyA"]||keys["ArrowLeft"]) dx-=1; if (keys["KeyD"]||keys["ArrowRight"]) dx+=1;
        if (leftJ.current.active) { const lm = Math.sqrt(leftJ.current.dx**2+leftJ.current.dy**2); if (lm > JOY_DEAD) { dx += (leftJ.current.dx/lm)*Math.min(lm/JOY_RADIUS,1); dy += (leftJ.current.dy/lm)*Math.min(lm/JOY_RADIUS,1); } }

        if (p.rolling > 0) { p.x += p.rollDx*ROLL_SPEED; p.y += p.rollDy*ROLL_SPEED; p.rolling--; p.invuln = Math.max(p.invuln,1); }
        else {
          const mag = Math.sqrt(dx*dx+dy*dy);
          if (mag > 0) { p.x += (dx/mag)*PLAYER_SPEED; p.y += (dy/mag)*PLAYER_SPEED; p.facing = Math.atan2(dy,dx); }
          if ((keys["Space"]||dtDodge.current) && p.rollCd <= 0 && mag > 0) {
            p.rolling = ROLL_DURATION; p.rollCd = ROLL_COOLDOWN; p.rollDx = dx/mag; p.rollDy = dy/mag;
            sfx.dodge();
            for (let i = 0; i < 8; i++) g.particles.push({ x: p.x, y: p.y, vx: rnd(-2,2), vy: rnd(-2,2), life: 20, ml: 20, color: "#c8a050", size: rnd(3,7) });
            dtDodge.current = false;
          }
        }
        if (p.rollCd > 0) p.rollCd--; if (p.invuln > 0) p.invuln--;
        p.x = clamp(p.x, PLAYER_SIZE, W-PLAYER_SIZE); p.y = clamp(p.y, PLAYER_SIZE, H-PLAYER_SIZE);

        // Weapon timer
        if (p.weapon !== 'pistol') { p.weaponTimer--; if (p.weaponTimer <= 0) { p.weapon = 'pistol'; p.weaponTimer = Infinity; } }

        if (ctRef.current > 0) { ctRef.current--; if (ctRef.current <= 0) { coRef.current = 0; setCombo(0); } }

        let shooting = mouseRef.current.down, sAngle = Math.atan2(mouseRef.current.y-p.y, mouseRef.current.x-p.x);
        if (rightJ.current.active) { const rm = Math.sqrt(rightJ.current.dx**2+rightJ.current.dy**2); if (rm > JOY_DEAD) { shooting = true; sAngle = rightJ.current.angle; } }

        if (shooting && p.shootCd <= 0 && p.rolling <= 0) {
          for (let i = 0; i < wep.bullets; i++) {
            const spread = wep.bullets > 1 ? (i - (wep.bullets-1)/2) * (wep.spread * 2 / (wep.bullets-1)) : rnd(-wep.spread, wep.spread);
            const a = sAngle + spread;
            g.pBullets.push({ x: p.x+Math.cos(a)*20, y: p.y+Math.sin(a)*20, vx: Math.cos(a)*wep.speed, vy: Math.sin(a)*wep.speed, life: 80, dmg: wep.dmg, color: wep.color, trail: wep.trail });
          }
          scRef.current = Math.max(0, scRef.current - 1); setScore(scRef.current);
          p.shootCd = wep.cooldown; p.facing = sAngle; g.shakeT = 3; g.shakeI = wep.bullets > 3 ? 4 : 2;
          sfx.shoot(p.weapon);
          for (let i = 0; i < 4; i++) g.particles.push({ x: p.x+Math.cos(sAngle)*22, y: p.y+Math.sin(sAngle)*22, vx: Math.cos(sAngle+rnd(-0.3,0.3))*rnd(2,5), vy: Math.sin(sAngle+rnd(-0.3,0.3))*rnd(2,5), life: 10, ml: 10, color: wep.color, size: rnd(2,5) });
        }
        if (p.shootCd > 0) p.shootCd--;

        if (g.spawned < wd.enemies) { g.spawnT--; if (g.spawnT <= 0) { g.enemies.push(spawnE(wd, g.enemies, W, H)); g.spawned++; g.spawnT = Math.max(15, 70-g.wave*3); } }
        if (g.wave > 0 && g.wave%5 === 0 && g.spawned === wd.enemies && !g.enemies.some(e=>e.isBoss) && !g.bossSpawned) { g.enemies.push(spawnB(g.wave, W, H)); g.bossSpawned = true; }

        g.enemies.forEach((e) => {
          e.moveTimer--; if (e.moveTimer <= 0) { e.targetX = rnd(60,W-60); e.targetY = rnd(60,H-60); e.moveTimer = Math.floor(rnd(60,150)); }
          const tx = e.targetX-e.x, ty = e.targetY-e.y, td = Math.sqrt(tx**2+ty**2);
          if (td > 5) { e.x += (tx/td)*e.speed; e.y += (ty/td)*e.speed; }
          e.x = clamp(e.x,20,W-20); e.y = clamp(e.y,20,H-20);
          e.shootTimer--;
          if (e.shootTimer <= 0) {
            const a = Math.atan2(p.y-e.y, p.x-e.x); const sh = e.isBoss ? 3 : 1;
            for (let s = 0; s < sh; s++) { const sa = a+(e.isBoss?(s-1)*0.3:rnd(-0.15,0.15)); g.eBullets.push({ x: e.x, y: e.y, vx: Math.cos(sa)*ENEMY_BULLET_SPEED, vy: Math.sin(sa)*ENEMY_BULLET_SPEED, life: 140 }); }
            e.shootTimer = Math.floor(e.shootRate*rnd(0.7,1.3));
          }
          if (e.hitFlash > 0) e.hitFlash--;
        });

        g.pBullets.forEach((b) => { b.x += b.vx; b.y += b.vy; b.life--; });
        g.eBullets.forEach((b) => { b.x += b.vx; b.y += b.vy; b.life--; });
        g.pBullets = g.pBullets.filter((b) => b.life > 0 && b.x > -20 && b.x < W+20 && b.y > -20 && b.y < H+20);
        g.eBullets = g.eBullets.filter((b) => b.life > 0 && b.x > -20 && b.x < W+20 && b.y > -20 && b.y < H+20);

        // Player bullets hit enemies
        g.pBullets.forEach((b) => {
          g.enemies.forEach((e) => {
            const hd = e.isBoss ? ENEMY_SIZE*1.5 : ENEMY_SIZE;
            if (dist(b,e) < hd) {
              b.life = 0; e.hp -= b.dmg; e.hitFlash = 6; g.shakeT = 4; g.shakeI = 3;
              sfx.hit();
              for (let i = 0; i < 6; i++) g.particles.push({ x: e.x, y: e.y, vx: rnd(-3,3), vy: rnd(-3,3), life: 20, ml: 20, color: i<3?"#ff4444":"#ff8800", size: rnd(2,6) });
              if (e.hp <= 0) {
                coRef.current++; ctRef.current = 90; setCombo(coRef.current);
                if (coRef.current > g.maxCombo) g.maxCombo = coRef.current;
                if (coRef.current > 2) sfx.combo();
                const cm = Math.min(coRef.current,10);
                const pts = (100+g.wave*50)*cm + (e.isBoss?2000+g.wave*500:0);
                scRef.current += pts; setScore(scRef.current); g.kills++;
                if (e.isBoss) { sfx.bossKill(); g.bossKills++; } else sfx.kill();
                g.texts.push({ x: e.x, y: e.y-10, text: coRef.current > 1 ? "+"+pts+" x"+coRef.current : "+"+pts, color: coRef.current >= 5 ? "#ff44ff" : coRef.current >= 3 ? "#ffaa00" : "#ffdd44", life: 45, ml: 45, size: Math.min(14+coRef.current*2,28) });
                if (e.isBoss) g.texts.push({ x: e.x, y: e.y-35, text: "BOSS KILLED!", color: "#ff3333", life: 60, ml: 60, size: 24 });
                const pc = e.isBoss ? 25 : 12;
                for (let i = 0; i < pc; i++) g.particles.push({ x: e.x, y: e.y, vx: rnd(-4,4), vy: rnd(-4,4), life: 30, ml: 30, color: e.isBoss?["#ff3333","#ffaa00","#ffdd44"][i%3]:(i<6?"#ff6633":"#ffaa44"), size: rnd(3,e.isBoss?10:8) });
                // Drops: HP or weapon
                const dropRoll = Math.random();
                if (e.isBoss) {
                  // Boss always drops weapon + HP
                  g.pickups.push({ x: e.x-15, y: e.y, type: "hp", life: 300 });
                  const wps = ['shotgun','rifle','dynamite']; g.pickups.push({ x: e.x+15, y: e.y, type: wps[Math.floor(Math.random()*wps.length)], life: 400 });
                } else if (dropRoll < 0.12) {
                  g.pickups.push({ x: e.x, y: e.y, type: "hp", life: 300 });
                } else if (dropRoll < 0.2) {
                  const wps = ['shotgun','rifle','dynamite']; g.pickups.push({ x: e.x, y: e.y, type: wps[Math.floor(Math.random()*wps.length)], life: 400 });
                }
                // Check achievements
                const st = statsRef.current;
                st.tk = (st.tk||0); st.lk = (st.lk||0) + 1; st.mc = Math.max(st.mc||0, g.maxCombo);
                st.mw = Math.max(st.mw||0, wRef.current + 1); st.bk = (st.bk||0) + (e.isBoss?1:0);
                st.bs = Math.max(st.bs||0, scRef.current);
                saveStats(st); checkAch(st);
              }
            }
          });
        });
        g.enemies = g.enemies.filter((e) => e.hp > 0);

        // Enemy bullets hit player
        if (p.invuln <= 0 && p.rolling <= 0) {
          g.eBullets.forEach((b) => {
            if (dist(b,p) < PLAYER_SIZE*0.8) {
              b.life = 0; p.hp--; p.invuln = INVULN_FRAMES; g.shakeT = 8; g.shakeI = 6;
              coRef.current = 0; ctRef.current = 0; setCombo(0);
              waveDmgRef.current = true;
              sfx.plrHit();
              for (let i = 0; i < 8; i++) g.particles.push({ x: p.x, y: p.y, vx: rnd(-3,3), vy: rnd(-3,3), life: 25, ml: 25, color: "#ff2222", size: rnd(3,7) });
              if (p.hp <= 0) {
                sfx.death();
                if (scRef.current > bsRef.current) { bsRef.current = scRef.current; setBestScore(scRef.current); }
                if (wRef.current > bwRef.current) bwRef.current = wRef.current;
                const st = statsRef.current;
                st.tk = g.kills; st.bs = Math.max(st.bs||0, scRef.current);
                st.mw = Math.max(st.mw||0, wRef.current+1);
                saveStats(st); checkAch(st);
                setScreen("dead");
              }
            }
          });
        }

        // Pickups
        g.pickups.forEach((pk) => {
          pk.life--;
          if (dist(pk,p) < PLAYER_SIZE+16) {
            pk.life = 0; sfx.pickup();
            if (pk.type === "hp") { p.hp = Math.min(MAX_HP, p.hp+1); g.texts.push({ x: p.x, y: p.y-20, text: "+1 HP", color: "#44ff44", life: 30, ml: 30, size: 16 }); }
            else if (WEAPONS[pk.type]) {
              p.weapon = pk.type; p.weaponTimer = WEAPONS[pk.type].dur; p.shootCd = 0;
              g.texts.push({ x: p.x, y: p.y-20, text: WEAPONS[pk.type].name + "!", color: WEAPONS[pk.type].color, life: 40, ml: 40, size: 18 });
              const st = statsRef.current;
              if (pk.type === 'shotgun') st.sp = (st.sp||0)+1;
              if (pk.type === 'dynamite') st.dp = (st.dp||0)+1;
              saveStats(st); checkAch(st);
            }
          }
        });
        g.pickups = g.pickups.filter((pk) => pk.life > 0);

        // Wave complete
        if (g.spawned >= wd.enemies && g.enemies.length === 0) {
          const wb = 500+g.wave*200; scRef.current += wb; setScore(scRef.current);
          sfx.waveClear();
          g.texts.push({ x: W/2, y: H/2-40, text: "WAVE CLEAR +"+wb, color: "#44ffaa", life: 60, ml: 60, size: 22 });
          p.hp = Math.min(MAX_HP, p.hp+1);
          // Flawless check
          if (!waveDmgRef.current) {
            const st = statsRef.current; st.fw = (st.fw||0)+1; saveStats(st); checkAch(st);
            g.texts.push({ x: W/2, y: H/2-10, text: "FLAWLESS!", color: "#ffdd44", life: 50, ml: 50, size: 20 });
          }
          startWave(g.wave+1);
        }
      }

      g.particles.forEach((pt) => { pt.x += pt.vx; pt.y += pt.vy; pt.vx *= 0.95; pt.vy *= 0.95; pt.life--; });
      g.particles = g.particles.filter((pt) => pt.life > 0);
      g.texts.forEach((ft) => { ft.y -= 0.8; ft.life--; });
      g.texts = g.texts.filter((ft) => ft.life > 0);
      g.dust.forEach((d) => { d.x += d.vx; d.y += d.vy; if (d.x < -10) d.x = W+10; if (d.y < -10) d.y = H+10; });
      if (scenRef.current) scenRef.current.tw.forEach((tw) => { tw.x += tw.vx; if (tw.x > W+30) tw.x = -30; });
      if (g.shakeT > 0) g.shakeT--;

      // === DRAW ===
      ctx.save();
      if (g.shakeT > 0) ctx.translate(rnd(-g.shakeI,g.shakeI), rnd(-g.shakeI,g.shakeI));

      const skyG = ctx.createLinearGradient(0, 0, 0, H * 0.15);
      skyG.addColorStop(0, "#87CEEB"); skyG.addColorStop(1, "#d4a056");
      ctx.fillStyle = skyG; ctx.fillRect(0, 0, W, H * 0.15);
      const grad = ctx.createLinearGradient(0, H*0.1, 0, H);
      grad.addColorStop(0, "#d4a056"); grad.addColorStop(0.2, "#c89444"); grad.addColorStop(0.6, "#b58338"); grad.addColorStop(1, "#a07030");
      ctx.fillStyle = grad; ctx.fillRect(0, H*0.1, W, H);
      ctx.fillStyle = "rgba(140,90,30,0.15)";
      for (let i = 0; i < 25; i++) { ctx.beginPath(); ctx.ellipse((i*173+f*0.05)%(W+40)-20, (i*97+30)%H, rnd(20,50), rnd(8,20), 0, 0, Math.PI*2); ctx.fill(); }

      if (scenRef.current) {
        scenRef.current.rocks.forEach((r) => { ctx.fillStyle = "rgba(120,90,60,0.35)"; ctx.beginPath(); ctx.ellipse(r.x, r.y, r.w, r.h, 0, 0, Math.PI*2); ctx.fill(); });
        scenRef.current.skulls.forEach((s) => drawSkull(ctx, s.x, s.y, s.s));
        scenRef.current.cacti.forEach((c) => drawCactus(ctx, c.x, c.y, c.h));
        scenRef.current.tw.forEach((tw) => { ctx.save(); ctx.translate(tw.x, tw.y); ctx.rotate(f*0.03); ctx.strokeStyle = "rgba(160,120,60,0.5)"; ctx.lineWidth = 1.5; for (let i = 0; i < 8; i++) { const a = (i/8)*Math.PI*2; ctx.beginPath(); ctx.arc(Math.cos(a)*tw.r*0.3, Math.sin(a)*tw.r*0.3, tw.r*0.5, 0, Math.PI*2); ctx.stroke(); } ctx.restore(); });
      }
      g.dust.forEach((d) => { ctx.fillStyle = "rgba(200,170,120,"+d.op+")"; ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0, Math.PI*2); ctx.fill(); });

      // Pickups
      g.pickups.forEach((pk) => {
        if (pk.life < 60 && f%10 < 5) return;
        const bob = Math.sin(f * 0.08) * 3;
        if (pk.type === "hp") {
          ctx.fillStyle = "#ff4466"; ctx.beginPath(); ctx.arc(pk.x, pk.y+bob, 9, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = "#fff"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center"; ctx.fillText("+", pk.x, pk.y+bob+4);
        } else if (WEAPONS[pk.type]) {
          ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.arc(pk.x, pk.y+bob, 14, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = WEAPONS[pk.type].color; ctx.beginPath(); ctx.arc(pk.x, pk.y+bob, 12, 0, Math.PI*2); ctx.fill();
          // Glow
          ctx.strokeStyle = WEAPONS[pk.type].color; ctx.lineWidth = 2; ctx.globalAlpha = 0.3+Math.sin(f*0.1)*0.2;
          ctx.beginPath(); ctx.arc(pk.x, pk.y+bob, 16, 0, Math.PI*2); ctx.stroke(); ctx.globalAlpha = 1;
          ctx.fillStyle = "#fff"; ctx.font = "14px serif"; ctx.textAlign = "center"; ctx.fillText(WEAPONS[pk.type].icon, pk.x, pk.y+bob+5);
        }
      });

      // Enemy bullets
      g.eBullets.forEach((b) => { ctx.fillStyle = "#ff3322"; ctx.shadowColor = "#ff3322"; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(b.x, b.y, 4.5, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = "rgba(255,50,30,0.25)"; ctx.beginPath(); ctx.arc(b.x-b.vx*1.5, b.y-b.vy*1.5, 3, 0, Math.PI*2); ctx.fill(); });
      // Player bullets — color based on weapon
      g.pBullets.forEach((b) => { ctx.fillStyle = b.color; ctx.shadowColor = b.color; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(b.x, b.y, b.dmg > 1 ? 5 : 4, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = b.trail; ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(b.x-b.vx, b.y-b.vy, 3, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; });

      // Enemies
      g.enemies.forEach((e) => {
        const sz = e.isBoss ? ENEMY_SIZE*1.6 : ENEMY_SIZE;
        const ea = Math.atan2(p.y-e.y, p.x-e.x);
        ctx.globalAlpha = e.hitFlash > 0 ? 0.5+Math.sin(f*2)*0.5 : 1;
        drawCowboy(ctx, e.x, e.y, sz, e.hitFlash > 0 ? {hat:"#fff",shirt:"#fff",skin:"#fff",boots:"#fff",belt:"#fff",bandana:null,hatBand:"#fff"} : e.skin, ea, f, false);
        ctx.globalAlpha = 1;
        if (e.isBoss) { ctx.strokeStyle = "rgba(255,0,0,"+(0.3+Math.sin(f*0.1)*0.2)+")"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, sz*0.8, 0, Math.PI*2); ctx.stroke(); }
        if (e.maxHp > 1) { const bw = e.isBoss?50:30; ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(e.x-bw/2, e.y-sz-12, bw, 6); ctx.fillStyle = e.isBoss?"#ff0000":"#ff4444"; ctx.fillRect(e.x-bw/2, e.y-sz-12, bw*(Math.max(0,e.hp)/e.maxHp), 6); }
      });

      // Player
      ctx.globalAlpha = (p.invuln > 0 && f%6 < 3) ? 0.4 : 1;
      let aim = p.facing;
      if (rightJ.current.active && Math.sqrt(rightJ.current.dx**2+rightJ.current.dy**2) > JOY_DEAD) aim = rightJ.current.angle;
      else if (mouseRef.current.down) aim = Math.atan2(mouseRef.current.y-p.y, mouseRef.current.x-p.x);
      drawCowboy(ctx, p.x, p.y, PLAYER_SIZE, PLR_SKIN, aim, f, p.rolling > 0);
      ctx.globalAlpha = 1;

      g.particles.forEach((pt) => { ctx.fillStyle = pt.color; ctx.globalAlpha = pt.life/pt.ml; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size*(pt.life/pt.ml), 0, Math.PI*2); ctx.fill(); });
      ctx.globalAlpha = 1;
      g.texts.forEach((ft) => { ctx.globalAlpha = ft.life/ft.ml; ctx.fillStyle = ft.color; ctx.font = "bold "+ft.size+"px monospace"; ctx.textAlign = "center"; ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.lineWidth = 3; ctx.strokeText(ft.text, ft.x, ft.y); ctx.fillText(ft.text, ft.x, ft.y); });
      ctx.globalAlpha = 1;

      // === HUD ===
      const hH = Math.max(40, H*0.065);
      ctx.fillStyle = "rgba(20,10,5,0.75)"; ctx.fillRect(0, 0, W, hH+4);
      ctx.strokeStyle = "#8B6914"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, hH+4); ctx.lineTo(W, hH+4); ctx.stroke();

      const hs = Math.max(16, hH*0.45);
      for (let i = 0; i < MAX_HP; i++) { ctx.fillStyle = i < p.hp ? "#ff4466" : "#443333"; ctx.font = hs+"px serif"; ctx.textAlign = "left"; ctx.fillText("\u2665", 14+i*(hs+4), hH*0.7); }
      ctx.fillStyle = "#ffdd44"; ctx.font = "bold "+Math.max(14,hH*0.4)+"px monospace"; ctx.textAlign = "right"; ctx.fillText("SCORE: "+scRef.current, W-14, hH*0.5);
      if (bsRef.current > 0) { ctx.fillStyle = "rgba(255,221,68,0.4)"; ctx.font = Math.max(10,hH*0.26)+"px monospace"; ctx.fillText("BEST: "+bsRef.current, W-14, hH*0.82); }
      ctx.fillStyle = "#f4a460"; ctx.font = "bold "+Math.max(12,hH*0.35)+"px Georgia"; ctx.textAlign = "center"; ctx.fillText(wd.label, W/2, hH*0.5);
      const rem = Math.max(0, wd.enemies-g.spawned)+g.enemies.length;
      ctx.fillStyle = "#aaa"; ctx.font = Math.max(9,hH*0.24)+"px Georgia"; ctx.fillText(rem+" left | Kills: "+g.kills, W/2, hH*0.82);

      // Weapon indicator
      if (p.weapon !== 'pistol') {
        const wi = WEAPONS[p.weapon];
        const pct = p.weaponTimer / wi.dur;
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(W/2-50, hH+8, 100, 18);
        ctx.fillStyle = wi.color; ctx.globalAlpha = 0.6; ctx.fillRect(W/2-50, hH+8, 100*pct, 18); ctx.globalAlpha = 1;
        ctx.strokeStyle = wi.color; ctx.lineWidth = 1; ctx.strokeRect(W/2-50, hH+8, 100, 18);
        ctx.fillStyle = "#fff"; ctx.font = "bold 11px monospace"; ctx.textAlign = "center"; ctx.fillText(wi.icon+" "+wi.name, W/2, hH+21);
      }

      // Combo
      if (coRef.current > 1) {
        const cc = coRef.current >= 10 ? "#ff44ff" : coRef.current >= 5 ? "#ffaa00" : "#44aaff";
        ctx.globalAlpha = 0.5+(ctRef.current/90)*0.5;
        ctx.fillStyle = cc; ctx.font = "bold "+(20+Math.min(coRef.current,10)*2)+"px monospace"; ctx.textAlign = "center";
        ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.lineWidth = 3;
        const cy = p.weapon !== 'pistol' ? hH+50 : hH+35;
        ctx.strokeText("x"+coRef.current+" COMBO", W/2, cy); ctx.fillText("x"+coRef.current+" COMBO", W/2, cy);
        ctx.globalAlpha = 1;
      }

      // Joysticks + dodge button
      if (isM.current) {
        const sx = W/canvas.clientWidth, sy = H/canvas.clientHeight;
        if (leftJ.current.active) { ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(leftJ.current.cx*sx, leftJ.current.cy*sy, JOY_RADIUS*sx, 0, Math.PI*2); ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.beginPath(); ctx.arc((leftJ.current.cx+leftJ.current.dx)*sx, (leftJ.current.cy+leftJ.current.dy)*sy, 22*sx, 0, Math.PI*2); ctx.fill(); }
        if (rightJ.current.active) { ctx.strokeStyle = "rgba(255,100,100,0.2)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(rightJ.current.cx*sx, rightJ.current.cy*sy, JOY_RADIUS*sx, 0, Math.PI*2); ctx.stroke(); ctx.fillStyle = "rgba(255,100,100,0.3)"; ctx.beginPath(); ctx.arc((rightJ.current.cx+rightJ.current.dx)*sx, (rightJ.current.cy+rightJ.current.dy)*sy, 22*sx, 0, Math.PI*2); ctx.fill(); }
        const dbx = W-70, dby = H-70, dbr = 30;
        if (p.rollCd <= 0) { ctx.fillStyle = "rgba(100,170,255,0.25)"; ctx.beginPath(); ctx.arc(dbx, dby, dbr, 0, Math.PI*2); ctx.fill(); ctx.strokeStyle = "rgba(100,170,255,0.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(dbx, dby, dbr, 0, Math.PI*2); ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = "bold 11px monospace"; ctx.textAlign = "center"; ctx.fillText("DODGE", dbx, dby+4); }
        else { ctx.fillStyle = "rgba(50,50,50,0.25)"; ctx.beginPath(); ctx.arc(dbx, dby, dbr, 0, Math.PI*2); ctx.fill(); ctx.strokeStyle = "rgba(100,170,255,0.4)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(dbx, dby, dbr, -Math.PI/2, -Math.PI/2+(1-p.rollCd/ROLL_COOLDOWN)*Math.PI*2); ctx.stroke(); }
      } else {
        if (p.rollCd > 0) { ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(10,H-28,100,14); ctx.fillStyle = "#66aaff"; ctx.fillRect(10,H-28,100*(1-p.rollCd/ROLL_COOLDOWN),14); ctx.fillStyle = "#fff"; ctx.font = "9px monospace"; ctx.textAlign = "left"; ctx.fillText("DODGE [SPACE]", 14, H-17); }
        else { ctx.fillStyle = "rgba(100,180,255,0.3)"; ctx.fillRect(10,H-28,100,14); ctx.fillStyle = "#aaddff"; ctx.font = "9px monospace"; ctx.textAlign = "left"; ctx.fillText("DODGE READY", 14, H-17); }
      }

      ctx.restore();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
  }, [screen, startWave, W, H, checkAch]);

  const cs = { width: "100vw", height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(180deg, #1a0a2e 0%, #2d1b4e 40%, #4a2040 100%)", fontFamily: "'Georgia', serif", overflow: "hidden", position: "relative", userSelect: "none" };
  const bs = { background: "linear-gradient(180deg, #c84b31 0%, #8B2500 100%)", color: "#f4e4c1", border: "3px solid #f4a460", padding: "16px 48px", fontSize: 22, fontFamily: "'Georgia', serif", fontWeight: "bold", letterSpacing: 3, cursor: "pointer", textTransform: "uppercase", boxShadow: "0 4px 20px rgba(200,75,49,0.5)", marginTop: 20 };

  // Achievement popup overlay
  const achOverlay = achPopup ? (
    <div style={{ position: "absolute", top: 60, left: "50%", transform: "translateX(-50%)", zIndex: 100, background: "rgba(20,10,5,0.9)", border: "2px solid #FFD700", borderRadius: 8, padding: "12px 24px", textAlign: "center", animation: "slideDown 0.3s ease", pointerEvents: "none" }}>
      <div style={{ color: "#FFD700", fontSize: 13, letterSpacing: 2, marginBottom: 4 }}>ACHIEVEMENT UNLOCKED</div>
      <div style={{ fontSize: 28 }}>{achPopup.ic}</div>
      <div style={{ color: "#f4a460", fontSize: 16, fontWeight: "bold" }}>{achPopup.n}</div>
      <div style={{ color: "#deb887", fontSize: 12 }}>{achPopup.d}</div>
    </div>
  ) : null;

  const achCount = achRef.current.length;
  const achTotal = ACH_DEFS.length;

  if (screen === "menu") {
    return (<div style={cs} onClick={() => sfx.init()}>
      {achOverlay}
      <div style={{ textAlign: "center", padding: 20 }}>
        <div style={{ fontSize: "clamp(36px, 8vw, 72px)", fontWeight: "bold", color: "#f4a460", textShadow: "3px 3px 0 #8B4513, 6px 6px 0 rgba(0,0,0,0.3)", letterSpacing: 4, lineHeight: 1.1 }}>DEAD MAN'S<br/>DRAW</div>
        <div style={{ color: "#c84b31", fontSize: 18, margin: "12px 0", fontWeight: "bold" }}>{"\u267E\uFE0F"} ENDLESS MODE</div>
        <div style={{ color: "#deb887", fontSize: 14, marginBottom: 6, opacity: 0.8, fontStyle: "italic" }}>How long can you survive?</div>
        {bsRef.current > 0 && <div style={{ color: "#ffdd44", fontSize: 16, marginBottom: 4, fontFamily: "monospace" }}>Best: {bsRef.current} pts</div>}
        {achCount > 0 && <div style={{ color: "#FFD700", fontSize: 13, marginBottom: 6 }}>{"\uD83C\uDFC6"} {achCount}/{achTotal} Achievements</div>}
        <div style={{ color: "#a0855b", fontSize: 12, marginBottom: 20, opacity: 0.7, lineHeight: 2 }}>
          {isM.current ? "Left = Move | Right = Aim & Shoot | Dodge button" : "WASD = Move | Mouse = Aim & Shoot | SPACE = Dodge"}
          <br/>Pick up weapons: Shotgun, Rifle, Dynamite!
        </div>
        <button onClick={startGame} style={bs}>{"\uD83D\uDD2B"} Start Game</button>
      </div>
      <style>{`@keyframes slideDown { from { opacity: 0; transform: translateX(-50%) translateY(-20px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>
    </div>);
  }

  if (screen === "dead") {
    return (<div style={cs}>
      {achOverlay}
      <div style={{ textAlign: "center", padding: 20 }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>{"\u26B0\uFE0F"}</div>
        <div style={{ fontSize: "clamp(28px, 6vw, 42px)", fontWeight: "bold", color: "#666", textShadow: "2px 2px 4px rgba(0,0,0,0.8)", marginBottom: 8 }}>GAME OVER</div>
        <div style={{ color: "#deb887", fontSize: 15, fontStyle: "italic", marginBottom: 12 }}>Fell on Wave {waveIndex+1}: {getWD(waveIndex).label}</div>
        <div style={{ color: "#ffdd44", fontSize: 28, fontWeight: "bold", fontFamily: "monospace", marginBottom: 4 }}>{score}</div>
        <div style={{ color: "#a0855b", fontSize: 14, marginBottom: 4 }}>Kills: {gRef.current?.kills || 0} | Max Combo: x{gRef.current?.maxCombo || 0}</div>
        {score >= bsRef.current && score > 0 && <div style={{ color: "#ff44ff", fontSize: 18, fontWeight: "bold", marginBottom: 8 }}>{"\u2B50"} NEW BEST! {"\u2B50"}</div>}
        <div style={{ color: "#FFD700", fontSize: 12, marginBottom: 8 }}>{"\uD83C\uDFC6"} {achCount}/{achTotal} Achievements</div>
        <button onClick={startGame} style={bs}>{"\uD83E\uDD20"} Ride Again</button>
      </div>
      <style>{`@keyframes slideDown { from { opacity: 0; transform: translateX(-50%) translateY(-20px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>
    </div>);
  }

  return (<div style={{ ...cs, cursor: isM.current ? "default" : "crosshair" }}>
    {achOverlay}
    {screen === "waveIntro" && (<div style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", pointerEvents: "none" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ color: "#f4a460", fontSize: 16, letterSpacing: 4, textTransform: "uppercase", marginBottom: 8 }}>Wave {waveIndex+1}</div>
        <div style={{ color: "#fff", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>{getWD(waveIndex).label}</div>
        <div style={{ color: "#c84b31", fontSize: 13, marginTop: 8 }}>{getWD(waveIndex).enemies} enemies | HP: {getWD(waveIndex).hp}{waveIndex > 0 && waveIndex%5 === 0 ? " | BOSS" : ""}</div>
      </div>
    </div>)}
    <canvas ref={canvasRef} width={W} height={H} style={{ width: "100vw", height: "100vh", display: "block", touchAction: "none" }} onTouchStart={tStart} onTouchMove={tMove} onTouchEnd={tEnd} />
    <style>{`@keyframes slideDown { from { opacity: 0; transform: translateX(-50%) translateY(-20px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>
  </div>);
}
