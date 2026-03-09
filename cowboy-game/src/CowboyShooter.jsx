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

function getWaveDef(wave) {
  return {
    enemies: Math.min(3 + Math.floor(wave * 1.3), 30),
    shootRate: Math.max(120 - wave * 6, 20),
    speed: 1.2 + wave * 0.15,
    hp: 1 + Math.floor(wave / 3),
    label: getWaveTitle(wave),
  };
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
  do {
    const s = Math.floor(Math.random() * 4);
    if (s === 0) { x = rnd(30, W - 30); y = -20; } else if (s === 1) { x = W + 20; y = rnd(30, H - 30); }
    else if (s === 2) { x = rnd(30, W - 30); y = H + 20; } else { x = -20; y = rnd(30, H - 30); }
    tries++;
  } while (tries < 10 && existing.some(e => dist(e, { x, y }) < 60));
  return { x, y, hp: wd.hp, maxHp: wd.hp, speed: wd.speed * rnd(0.8, 1.2), shootTimer: Math.floor(rnd(30, wd.shootRate)), shootRate: wd.shootRate, hitFlash: 0, targetX: rnd(80, W - 80), targetY: rnd(80, H - 80), moveTimer: 0, id: Date.now() + Math.random() };
}
function spawnBoss(wave, W, H) {
  return { x: W / 2, y: -30, hp: 10 + wave * 3, maxHp: 10 + wave * 3, speed: 1.0 + wave * 0.05, shootTimer: 30, shootRate: Math.max(25 - wave, 10), hitFlash: 0, targetX: W / 2, targetY: H / 2, moveTimer: 0, id: Date.now() + Math.random(), isBoss: true };
}

export default function CowboyShooter() {
  const canvasRef = useRef(null);
  const [screen, setScreen] = useState("menu");
  const [score, setScore] = useState(0);
  const [waveIndex, setWaveIndex] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [bestWave, setBestWave] = useState(0);
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

  // Joystick state
  const leftJoy = useRef({ active: false, id: -1, cx: 0, cy: 0, dx: 0, dy: 0 });
  const rightJoy = useRef({ active: false, id: -1, cx: 0, cy: 0, dx: 0, dy: 0, angle: 0 });
  const isMobile = useRef(false);

  useEffect(() => {
    isMobile.current = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setDims({ w, h });
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const W = dims.w;
  const H = dims.h;

  const cleanup = useCallback(() => { if (gameRef.current) gameRef.current.running = false; }, []);

  const initGame = useCallback(() => {
    cleanup();
    scoreRef.current = 0; waveRef.current = 0; comboRef.current = 0; comboTimerRef.current = 0;
    setScore(0); setWaveIndex(0); setCombo(0);
    gameRef.current = {
      running: true,
      player: { x: W / 2, y: H / 2, hp: MAX_HP, rolling: 0, rollCooldown: 0, rollDx: 0, rollDy: 0, shootCooldown: 0, invuln: 0, facing: 0 },
      enemies: [], playerBullets: [], enemyBullets: [], pickups: [], particles: [], floatingTexts: [],
      wave: 0, enemiesSpawned: 0, spawnTimer: 0, shakeTimer: 0, shakeIntensity: 0, totalKills: 0, bossSpawned: false,
      dustParticles: Array.from({ length: 15 }, () => ({ x: rnd(0, W), y: rnd(0, H), vx: rnd(-0.3, -0.1), vy: rnd(-0.1, 0.1), size: rnd(2, 5), opacity: rnd(0.05, 0.15) })),
    };
  }, [cleanup, W, H]);

  const startWave = useCallback((wi) => {
    const g = gameRef.current; if (!g) return;
    g.wave = wi; g.enemiesSpawned = 0; g.spawnTimer = 60; g.enemyBullets = []; g.bossSpawned = false;
    waveRef.current = wi; setWaveIndex(wi); setScreen("waveIntro");
    setTimeout(() => setScreen("playing"), 1800);
  }, []);

  const startGame = useCallback(() => { initGame(); startWave(0); }, [initGame, startWave]);

  // Keyboard (desktop)
  useEffect(() => {
    const kd = (e) => { keysRef.current[e.code] = true; if (e.code === "Space") e.preventDefault(); };
    const ku = (e) => { keysRef.current[e.code] = false; };
    const mm = (e) => {
      const c = canvasRef.current; if (!c) return; const r = c.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - r.left) / r.width) * W;
      mouseRef.current.y = ((e.clientY - r.top) / r.height) * H;
    };
    const md = (e) => { mm(e); mouseRef.current.down = true; };
    const mu = () => { mouseRef.current.down = false; };
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    window.addEventListener("mousemove", mm); window.addEventListener("mousedown", md); window.addEventListener("mouseup", mu);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("mousemove", mm); window.removeEventListener("mousedown", md); window.removeEventListener("mouseup", mu); };
  }, [W, H]);

  // Touch (mobile dual joystick)
  const handleTouchStart = useCallback((e) => {
    e.preventDefault();
    const c = canvasRef.current; if (!c) return;
    const r = c.getBoundingClientRect();
    for (const t of e.changedTouches) {
      const sx = t.clientX - r.left;
      const sy = t.clientY - r.top;
      const cx = (sx / r.width) * W;
      // Left half = move joystick, right half = aim joystick
      if (cx < W * 0.5) {
        if (!leftJoy.current.active) {
          leftJoy.current = { active: true, id: t.identifier, cx: sx, cy: sy, dx: 0, dy: 0 };
        }
      } else {
        if (!rightJoy.current.active) {
          rightJoy.current = { active: true, id: t.identifier, cx: sx, cy: sy, dx: 0, dy: 0, angle: 0 };
        }
      }
    }
  }, [W]);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const c = canvasRef.current; if (!c) return;
      const r = c.getBoundingClientRect();
      const sx = t.clientX - r.left;
      const sy = t.clientY - r.top;

      if (leftJoy.current.active && t.identifier === leftJoy.current.id) {
        let ddx = sx - leftJoy.current.cx;
        let ddy = sy - leftJoy.current.cy;
        const m = Math.sqrt(ddx * ddx + ddy * ddy);
        if (m > JOY_RADIUS) { ddx = (ddx / m) * JOY_RADIUS; ddy = (ddy / m) * JOY_RADIUS; }
        leftJoy.current.dx = ddx;
        leftJoy.current.dy = ddy;
      }
      if (rightJoy.current.active && t.identifier === rightJoy.current.id) {
        let ddx = sx - rightJoy.current.cx;
        let ddy = sy - rightJoy.current.cy;
        const m = Math.sqrt(ddx * ddx + ddy * ddy);
        if (m > JOY_RADIUS) { ddx = (ddx / m) * JOY_RADIUS; ddy = (ddy / m) * JOY_RADIUS; }
        rightJoy.current.dx = ddx;
        rightJoy.current.dy = ddy;
        if (m > JOY_DEAD) {
          rightJoy.current.angle = Math.atan2(ddy, ddx);
        }
      }
    }
  }, []);

  const handleTouchEnd = useCallback((e) => {
    for (const t of e.changedTouches) {
      if (leftJoy.current.active && t.identifier === leftJoy.current.id) {
        leftJoy.current = { active: false, id: -1, cx: 0, cy: 0, dx: 0, dy: 0 };
      }
      if (rightJoy.current.active && t.identifier === rightJoy.current.id) {
        rightJoy.current = { active: false, id: -1, cx: 0, cy: 0, dx: 0, dy: 0, angle: 0 };
      }
    }
  }, []);

  // Double-tap to dodge
  const lastTapRef = useRef(0);
  const doubleTapDodge = useRef(false);

  // Game loop
  useEffect(() => {
    if (screen !== "playing" && screen !== "waveIntro") return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); let raf;

    const loop = () => {
      const g = gameRef.current;
      if (!g || !g.running) return;
      frameRef.current++;
      const f = frameRef.current, keys = keysRef.current, p = g.player;
      const waveDef = getWaveDef(g.wave);
      const isPlaying = screen === "playing";

      if (isPlaying) {
        // Movement from keyboard OR left joystick
        let dx = 0, dy = 0;
        if (keys["KeyW"] || keys["ArrowUp"]) dy -= 1;
        if (keys["KeyS"] || keys["ArrowDown"]) dy += 1;
        if (keys["KeyA"] || keys["ArrowLeft"]) dx -= 1;
        if (keys["KeyD"] || keys["ArrowRight"]) dx += 1;

        // Left joystick input
        if (leftJoy.current.active) {
          const lm = Math.sqrt(leftJoy.current.dx ** 2 + leftJoy.current.dy ** 2);
          if (lm > JOY_DEAD) {
            dx += (leftJoy.current.dx / lm) * Math.min(lm / JOY_RADIUS, 1);
            dy += (leftJoy.current.dy / lm) * Math.min(lm / JOY_RADIUS, 1);
          }
        }

        if (p.rolling > 0) {
          p.x += p.rollDx * ROLL_SPEED; p.y += p.rollDy * ROLL_SPEED; p.rolling--; p.invuln = Math.max(p.invuln, 1);
        } else {
          const mag = Math.sqrt(dx * dx + dy * dy);
          if (mag > 0) {
            p.x += (dx / mag) * PLAYER_SPEED;
            p.y += (dy / mag) * PLAYER_SPEED;
            p.facing = Math.atan2(dy, dx);
          }
          // Space to dodge (desktop) or double-tap dodge handled elsewhere
          if (keys["Space"] && p.rollCooldown <= 0 && mag > 0) {
            p.rolling = ROLL_DURATION; p.rollCooldown = ROLL_COOLDOWN; p.rollDx = dx / mag; p.rollDy = dy / mag;
            for (let i = 0; i < 6; i++) g.particles.push({ x: p.x, y: p.y, vx: rnd(-2, 2), vy: rnd(-2, 2), life: 20, maxLife: 20, color: "#c8a050", size: rnd(3, 6) });
          }
          // Double tap dodge on mobile
          if (doubleTapDodge.current && p.rollCooldown <= 0 && mag > 0) {
            p.rolling = ROLL_DURATION; p.rollCooldown = ROLL_COOLDOWN; p.rollDx = dx / mag; p.rollDy = dy / mag;
            for (let i = 0; i < 6; i++) g.particles.push({ x: p.x, y: p.y, vx: rnd(-2, 2), vy: rnd(-2, 2), life: 20, maxLife: 20, color: "#c8a050", size: rnd(3, 6) });
            doubleTapDodge.current = false;
          }
        }
        if (p.rollCooldown > 0) p.rollCooldown--;
        if (p.invuln > 0) p.invuln--;
        p.x = clamp(p.x, PLAYER_SIZE, W - PLAYER_SIZE); p.y = clamp(p.y, PLAYER_SIZE, H - PLAYER_SIZE);

        // Combo timer
        if (comboTimerRef.current > 0) { comboTimerRef.current--; if (comboTimerRef.current <= 0) { comboRef.current = 0; setCombo(0); } }

        // Shooting - mouse (desktop) or right joystick (mobile)
        let shooting = mouseRef.current.down;
        let shootAngle = Math.atan2(mouseRef.current.y - p.y, mouseRef.current.x - p.x);

        // Right joystick overrides mouse
        if (rightJoy.current.active) {
          const rm = Math.sqrt(rightJoy.current.dx ** 2 + rightJoy.current.dy ** 2);
          if (rm > JOY_DEAD) {
            shooting = true;
            shootAngle = rightJoy.current.angle;
          }
        }

        if (shooting && p.shootCooldown <= 0 && p.rolling <= 0) {
          g.playerBullets.push({ x: p.x + Math.cos(shootAngle) * 20, y: p.y + Math.sin(shootAngle) * 20, vx: Math.cos(shootAngle) * BULLET_SPEED, vy: Math.sin(shootAngle) * BULLET_SPEED, life: 80 });
          scoreRef.current = Math.max(0, scoreRef.current - 1); setScore(scoreRef.current);
          p.shootCooldown = SHOOT_COOLDOWN; p.facing = shootAngle; g.shakeTimer = 3; g.shakeIntensity = 2;
          for (let i = 0; i < 3; i++) g.particles.push({ x: p.x + Math.cos(shootAngle) * 22, y: p.y + Math.sin(shootAngle) * 22, vx: Math.cos(shootAngle + rnd(-0.3, 0.3)) * rnd(2, 5), vy: Math.sin(shootAngle + rnd(-0.3, 0.3)) * rnd(2, 5), life: 8, maxLife: 8, color: "#ffdd44", size: rnd(2, 5) });
        }
        if (p.shootCooldown > 0) p.shootCooldown--;

        // Spawn enemies
        if (g.enemiesSpawned < waveDef.enemies) {
          g.spawnTimer--;
          if (g.spawnTimer <= 0) { g.enemies.push(spawnEnemy(waveDef, g.enemies, W, H)); g.enemiesSpawned++; g.spawnTimer = Math.max(15, 70 - g.wave * 3); }
        }
        if (g.wave > 0 && g.wave % 5 === 0 && g.enemiesSpawned === waveDef.enemies && !g.enemies.some(e => e.isBoss) && !g.bossSpawned) {
          g.enemies.push(spawnBoss(g.wave, W, H)); g.bossSpawned = true;
        }

        // Enemies
        g.enemies.forEach((e) => {
          e.moveTimer--;
          if (e.moveTimer <= 0) { e.targetX = rnd(60, W - 60); e.targetY = rnd(60, H - 60); e.moveTimer = Math.floor(rnd(60, 150)); }
          const toX = e.targetX - e.x, toY = e.targetY - e.y, tD = Math.sqrt(toX ** 2 + toY ** 2);
          if (tD > 5) { e.x += (toX / tD) * e.speed; e.y += (toY / tD) * e.speed; }
          e.x = clamp(e.x, 20, W - 20); e.y = clamp(e.y, 20, H - 20);
          e.shootTimer--;
          if (e.shootTimer <= 0) {
            const a = Math.atan2(p.y - e.y, p.x - e.x);
            const shots = e.isBoss ? 3 : 1;
            for (let s = 0; s < shots; s++) {
              const sa = a + (e.isBoss ? (s - 1) * 0.3 : rnd(-0.15, 0.15));
              g.enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(sa) * ENEMY_BULLET_SPEED, vy: Math.sin(sa) * ENEMY_BULLET_SPEED, life: 140 });
            }
            e.shootTimer = Math.floor(e.shootRate * rnd(0.7, 1.3));
          }
          if (e.hitFlash > 0) e.hitFlash--;
        });

        // Bullets update
        g.playerBullets.forEach((b) => { b.x += b.vx; b.y += b.vy; b.life--; });
        g.enemyBullets.forEach((b) => { b.x += b.vx; b.y += b.vy; b.life--; });
        g.playerBullets = g.playerBullets.filter((b) => b.life > 0 && b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20);
        g.enemyBullets = g.enemyBullets.filter((b) => b.life > 0 && b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20);

        // Player bullets hit enemies
        g.playerBullets.forEach((b) => {
          g.enemies.forEach((e) => {
            const hd = e.isBoss ? ENEMY_SIZE * 1.5 : ENEMY_SIZE;
            if (dist(b, e) < hd) {
              b.life = 0; e.hp--; e.hitFlash = 6; g.shakeTimer = 4; g.shakeIntensity = 3;
              for (let i = 0; i < 5; i++) g.particles.push({ x: e.x, y: e.y, vx: rnd(-3, 3), vy: rnd(-3, 3), life: 20, maxLife: 20, color: "#ff4444", size: rnd(2, 5) });
              if (e.hp <= 0) {
                comboRef.current++; comboTimerRef.current = 90; setCombo(comboRef.current);
                const cm = Math.min(comboRef.current, 10);
                const pts = (100 + g.wave * 50) * cm + (e.isBoss ? 2000 + g.wave * 500 : 0);
                scoreRef.current += pts; setScore(scoreRef.current); g.totalKills++;
                g.floatingTexts.push({ x: e.x, y: e.y - 10, text: comboRef.current > 1 ? "+" + pts + " x" + comboRef.current : "+" + pts, color: comboRef.current >= 5 ? "#ff44ff" : comboRef.current >= 3 ? "#ffaa00" : "#ffdd44", life: 45, maxLife: 45, size: Math.min(14 + comboRef.current * 2, 28) });
                if (e.isBoss) g.floatingTexts.push({ x: e.x, y: e.y - 35, text: "BOSS KILLED!", color: "#ff3333", life: 60, maxLife: 60, size: 24 });
                const pc = e.isBoss ? 25 : 12;
                for (let i = 0; i < pc; i++) g.particles.push({ x: e.x, y: e.y, vx: rnd(-4, 4), vy: rnd(-4, 4), life: 30, maxLife: 30, color: e.isBoss ? ["#ff3333","#ffaa00","#ffdd44"][i%3] : (i < 6 ? "#ff6633" : "#ffaa44"), size: rnd(3, e.isBoss ? 10 : 8) });
                if (Math.random() < (e.isBoss ? 1.0 : 0.2)) g.pickups.push({ x: e.x, y: e.y, type: "hp", life: 300 });
              }
            }
          });
        });
        g.enemies = g.enemies.filter((e) => e.hp > 0);

        // Enemy bullets hit player
        if (p.invuln <= 0 && p.rolling <= 0) {
          g.enemyBullets.forEach((b) => {
            if (dist(b, p) < PLAYER_SIZE * 0.8) {
              b.life = 0; p.hp--; p.invuln = INVULN_FRAMES; g.shakeTimer = 8; g.shakeIntensity = 6;
              comboRef.current = 0; comboTimerRef.current = 0; setCombo(0);
              for (let i = 0; i < 8; i++) g.particles.push({ x: p.x, y: p.y, vx: rnd(-3, 3), vy: rnd(-3, 3), life: 25, maxLife: 25, color: "#ff2222", size: rnd(3, 7) });
              if (p.hp <= 0) {
                if (scoreRef.current > bestScoreRef.current) { bestScoreRef.current = scoreRef.current; setBestScore(scoreRef.current); }
                if (waveRef.current > bestWaveRef.current) { bestWaveRef.current = waveRef.current; setBestWave(waveRef.current); }
                setScreen("dead");
              }
            }
          });
        }

        // Pickups
        g.pickups.forEach((pk) => {
          pk.life--;
          if (dist(pk, p) < PLAYER_SIZE + 16) {
            pk.life = 0; p.hp = Math.min(MAX_HP, p.hp + 1);
            g.floatingTexts.push({ x: p.x, y: p.y - 20, text: "+1 HP", color: "#44ff44", life: 30, maxLife: 30, size: 16 });
          }
        });
        g.pickups = g.pickups.filter((pk) => pk.life > 0);

        // Wave complete
        if (g.enemiesSpawned >= waveDef.enemies && g.enemies.length === 0) {
          const wb = 500 + g.wave * 200;
          scoreRef.current += wb; setScore(scoreRef.current);
          g.floatingTexts.push({ x: W / 2, y: H / 2 - 40, text: "WAVE CLEAR +" + wb, color: "#44ffaa", life: 60, maxLife: 60, size: 22 });
          p.hp = Math.min(MAX_HP, p.hp + 1);
          startWave(g.wave + 1);
        }
      }

      // Update particles, texts, dust
      g.particles.forEach((pt) => { pt.x += pt.vx; pt.y += pt.vy; pt.vx *= 0.95; pt.vy *= 0.95; pt.life--; });
      g.particles = g.particles.filter((pt) => pt.life > 0);
      g.floatingTexts.forEach((ft) => { ft.y -= 0.8; ft.life--; });
      g.floatingTexts = g.floatingTexts.filter((ft) => ft.life > 0);
      g.dustParticles.forEach((d) => { d.x += d.vx; d.y += d.vy; if (d.x < -10) d.x = W + 10; if (d.y < -10) d.y = H + 10; });
      if (g.shakeTimer > 0) g.shakeTimer--;

      // === DRAW ===
      ctx.save();
      if (g.shakeTimer > 0) ctx.translate(rnd(-g.shakeIntensity, g.shakeIntensity), rnd(-g.shakeIntensity, g.shakeIntensity));

      // Desert BG
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#d4a056"); grad.addColorStop(0.3, "#c89444"); grad.addColorStop(1, "#a07030");
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(160,100,40,0.3)";
      for (let i = 0; i < 20; i++) { ctx.beginPath(); ctx.ellipse((i * 137 + f * 0.1) % (W + 40) - 20, (i * 89) % H, 30, 12, 0, 0, Math.PI * 2); ctx.fill(); }
      g.dustParticles.forEach((d) => { ctx.fillStyle = "rgba(200,170,120," + d.opacity + ")"; ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2); ctx.fill(); });

      // Pickups
      g.pickups.forEach((pk) => { if (!(pk.life < 60 && f % 10 < 5)) { ctx.font = "20px serif"; ctx.textAlign = "center"; ctx.fillText("\u2764\uFE0F", pk.x, pk.y + 7); } });

      // Enemy bullets
      g.enemyBullets.forEach((b) => { ctx.fillStyle = "#ff3322"; ctx.shadowColor = "#ff3322"; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = "rgba(255,50,30,0.3)"; ctx.beginPath(); ctx.arc(b.x - b.vx, b.y - b.vy, 3, 0, Math.PI * 2); ctx.fill(); });
      // Player bullets
      g.playerBullets.forEach((b) => { ctx.fillStyle = "#ffdd22"; ctx.shadowColor = "#ffdd22"; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; });

      // Enemies
      g.enemies.forEach((e) => {
        ctx.save(); ctx.translate(e.x, e.y);
        const sz = e.isBoss ? ENEMY_SIZE * 1.6 : ENEMY_SIZE;
        ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.beginPath(); ctx.ellipse(0, sz * 0.6, sz * 0.7, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = e.hitFlash > 0 ? "#fff" : e.isBoss ? "#660000" : "#8B2500";
        ctx.beginPath(); ctx.arc(0, 0, sz * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = e.hitFlash > 0 ? "#fff" : e.isBoss ? "#220000" : "#333";
        ctx.fillRect(-sz * 0.6, -sz * 0.7, sz * 1.2, 6); ctx.fillRect(-sz * 0.35, -sz * 0.95, sz * 0.7, sz * 0.3);
        if (e.isBoss) { ctx.strokeStyle = "rgba(255,0,0," + (0.3 + Math.sin(f * 0.1) * 0.2) + ")"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, sz * 0.65, 0, Math.PI * 2); ctx.stroke(); }
        if (e.maxHp > 1) { const bw = e.isBoss ? 50 : 30; ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(-bw / 2, -sz - 8, bw, 5); ctx.fillStyle = e.isBoss ? "#ff0000" : "#ff4444"; ctx.fillRect(-bw / 2, -sz - 8, bw * (e.hp / e.maxHp), 5); }
        ctx.restore();
      });

      // Player
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(0, PLAYER_SIZE * 0.6, PLAYER_SIZE * 0.7, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = (p.invuln > 0 && f % 6 < 3) ? 0.4 : 1;
      if (p.rolling > 0) {
        ctx.fillStyle = "#deb887"; ctx.beginPath(); ctx.arc(0, 0, PLAYER_SIZE * 0.4, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = "#deb887"; ctx.beginPath(); ctx.arc(0, 0, PLAYER_SIZE * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#8B6914"; ctx.fillRect(-PLAYER_SIZE * 0.65, -PLAYER_SIZE * 0.7, PLAYER_SIZE * 1.3, 6); ctx.fillRect(-PLAYER_SIZE * 0.35, -PLAYER_SIZE, PLAYER_SIZE * 0.7, PLAYER_SIZE * 0.35);
        // Gun arm pointing at aim direction
        let ga = p.facing;
        if (rightJoy.current.active && Math.sqrt(rightJoy.current.dx ** 2 + rightJoy.current.dy ** 2) > JOY_DEAD) {
          ga = rightJoy.current.angle;
        } else if (mouseRef.current.down) {
          ga = Math.atan2(mouseRef.current.y - p.y, mouseRef.current.x - p.x);
        }
        ctx.strokeStyle = "#a08050"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ga) * 22, Math.sin(ga) * 22); ctx.stroke();
        ctx.fillStyle = "#555"; ctx.beginPath(); ctx.arc(Math.cos(ga) * 22, Math.sin(ga) * 22, 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.restore();

      // Particles
      g.particles.forEach((pt) => { ctx.fillStyle = pt.color; ctx.globalAlpha = pt.life / pt.maxLife; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * (pt.life / pt.maxLife), 0, Math.PI * 2); ctx.fill(); });
      ctx.globalAlpha = 1;
      // Floating texts
      g.floatingTexts.forEach((ft) => { ctx.globalAlpha = ft.life / ft.maxLife; ctx.fillStyle = ft.color; ctx.font = "bold " + ft.size + "px monospace"; ctx.textAlign = "center"; ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 3; ctx.strokeText(ft.text, ft.x, ft.y); ctx.fillText(ft.text, ft.x, ft.y); });
      ctx.globalAlpha = 1;

      // HUD - top bar
      const hudH = Math.max(36, H * 0.06);
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 0, W, hudH + 8);
      // Hearts
      const heartSize = Math.max(14, hudH * 0.5);
      for (let i = 0; i < MAX_HP; i++) { ctx.fillStyle = i < p.hp ? "#ff4466" : "#443333"; ctx.font = heartSize + "px serif"; ctx.textAlign = "left"; ctx.fillText("\u2665", 12 + i * (heartSize + 6), hudH - 4); }
      // Score
      ctx.fillStyle = "#ffdd44"; ctx.font = "bold " + Math.max(13, hudH * 0.4) + "px monospace"; ctx.textAlign = "right"; ctx.fillText("SCORE: " + scoreRef.current, W - 12, hudH * 0.55);
      if (bestScoreRef.current > 0) { ctx.fillStyle = "rgba(255,221,68,0.5)"; ctx.font = Math.max(10, hudH * 0.28) + "px monospace"; ctx.fillText("BEST: " + bestScoreRef.current, W - 12, hudH * 0.85); }
      // Wave
      ctx.fillStyle = "#f4a460"; ctx.font = "bold " + Math.max(11, hudH * 0.35) + "px Georgia"; ctx.textAlign = "center"; ctx.fillText(waveDef.label, W / 2, hudH * 0.55);
      const rem = Math.max(0, waveDef.enemies - g.enemiesSpawned) + g.enemies.length;
      ctx.fillStyle = "#aaa"; ctx.font = Math.max(9, hudH * 0.25) + "px Georgia"; ctx.fillText(rem + " left | Kills: " + g.totalKills, W / 2, hudH * 0.85);

      // Combo
      if (comboRef.current > 1) {
        const cc = comboRef.current >= 10 ? "#ff44ff" : comboRef.current >= 5 ? "#ffaa00" : "#44aaff";
        ctx.globalAlpha = 0.5 + (comboTimerRef.current / 90) * 0.5;
        ctx.fillStyle = cc; ctx.font = "bold " + (18 + Math.min(comboRef.current, 10) * 2) + "px monospace"; ctx.textAlign = "center";
        ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 3;
        ctx.strokeText("x" + comboRef.current + " COMBO", W / 2, H * 0.15); ctx.fillText("x" + comboRef.current + " COMBO", W / 2, H * 0.15);
        ctx.globalAlpha = 1;
      }

      // Draw joysticks on mobile
      if (isMobile.current) {
        // Left joystick
        if (leftJoy.current.active) {
          const scaleX = W / canvas.clientWidth;
          const scaleY = H / canvas.clientHeight;
          const jcx = leftJoy.current.cx * scaleX;
          const jcy = leftJoy.current.cy * scaleY;
          const jdx = leftJoy.current.dx * scaleX;
          const jdy = leftJoy.current.dy * scaleY;
          // Base circle
          ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(jcx, jcy, JOY_RADIUS * scaleX, 0, Math.PI * 2); ctx.stroke();
          // Thumb
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.beginPath(); ctx.arc(jcx + jdx, jcy + jdy, 20 * scaleX, 0, Math.PI * 2); ctx.fill();
        }
        // Right joystick
        if (rightJoy.current.active) {
          const scaleX = W / canvas.clientWidth;
          const scaleY = H / canvas.clientHeight;
          const jcx = rightJoy.current.cx * scaleX;
          const jcy = rightJoy.current.cy * scaleY;
          const jdx = rightJoy.current.dx * scaleX;
          const jdy = rightJoy.current.dy * scaleY;
          ctx.strokeStyle = "rgba(255,100,100,0.25)"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(jcx, jcy, JOY_RADIUS * scaleX, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = "rgba(255,100,100,0.35)";
          ctx.beginPath(); ctx.arc(jcx + jdx, jcy + jdy, 20 * scaleX, 0, Math.PI * 2); ctx.fill();
          // Direction line
          const rm = Math.sqrt(rightJoy.current.dx ** 2 + rightJoy.current.dy ** 2);
          if (rm > JOY_DEAD) {
            ctx.strokeStyle = "rgba(255,200,100,0.3)"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(jcx, jcy);
            ctx.lineTo(jcx + Math.cos(rightJoy.current.angle) * JOY_RADIUS * scaleX * 1.5, jcy + Math.sin(rightJoy.current.angle) * JOY_RADIUS * scaleY * 1.5);
            ctx.stroke();
          }
        }

        // Dodge button
        if (p.rollCooldown <= 0) {
          const bx = W - 70, by = H - 70, br = 28;
          ctx.fillStyle = "rgba(100,170,255,0.3)"; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "rgba(100,170,255,0.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = "bold 11px monospace"; ctx.textAlign = "center"; ctx.fillText("DODGE", bx, by + 4);
        } else {
          const bx = W - 70, by = H - 70, br = 28;
          ctx.fillStyle = "rgba(50,50,50,0.3)"; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
          // Cooldown arc
          ctx.strokeStyle = "rgba(100,170,255,0.4)"; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(bx, by, br, -Math.PI / 2, -Math.PI / 2 + (1 - p.rollCooldown / ROLL_COOLDOWN) * Math.PI * 2); ctx.stroke();
        }
      } else {
        // Desktop dodge indicator
        if (p.rollCooldown > 0) {
          ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(10, H - 28, 100, 14); ctx.fillStyle = "#66aaff"; ctx.fillRect(10, H - 28, 100 * (1 - p.rollCooldown / ROLL_COOLDOWN), 14);
          ctx.fillStyle = "#fff"; ctx.font = "9px monospace"; ctx.textAlign = "left"; ctx.fillText("DODGE [SPACE]", 14, H - 17);
        } else {
          ctx.fillStyle = "rgba(100,180,255,0.3)"; ctx.fillRect(10, H - 28, 100, 14); ctx.fillStyle = "#aaddff"; ctx.font = "9px monospace"; ctx.textAlign = "left"; ctx.fillText("DODGE READY", 14, H - 17);
        }
      }

      ctx.restore();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [screen, startWave, W, H]);

  // Dodge button touch handler
  const handleDodgeTap = useCallback(() => {
    doubleTapDodge.current = true;
    setTimeout(() => { doubleTapDodge.current = false; }, 100);
  }, []);

  const cs = { width: "100vw", height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(180deg, #1a0a2e 0%, #2d1b4e 40%, #4a2040 100%)", fontFamily: "'Georgia', serif", overflow: "hidden", position: "relative", userSelect: "none" };
  const bs = { background: "linear-gradient(180deg, #c84b31 0%, #8B2500 100%)", color: "#f4e4c1", border: "3px solid #f4a460", padding: "16px 48px", fontSize: 22, fontFamily: "'Georgia', serif", fontWeight: "bold", letterSpacing: 3, cursor: "pointer", textTransform: "uppercase", boxShadow: "0 4px 20px rgba(200,75,49,0.5)", marginTop: 20 };

  if (screen === "menu") {
    return (
      <div style={cs}>
        <div style={{ textAlign: "center", padding: 20 }}>
          <div style={{ fontSize: "clamp(36px, 8vw, 72px)", fontWeight: "bold", color: "#f4a460", textShadow: "3px 3px 0 #8B4513, 6px 6px 0 rgba(0,0,0,0.3)", letterSpacing: 4, lineHeight: 1.1 }}>DEAD MAN'S<br/>DRAW</div>
          <div style={{ color: "#c84b31", fontSize: 18, margin: "12px 0", fontWeight: "bold" }}>{"\u267E\uFE0F"} ENDLESS MODE</div>
          <div style={{ color: "#deb887", fontSize: 14, marginBottom: 6, opacity: 0.8, fontStyle: "italic" }}>How long can you survive?</div>
          {bestScoreRef.current > 0 && <div style={{ color: "#ffdd44", fontSize: 16, marginBottom: 6, fontFamily: "monospace" }}>Best: {bestScoreRef.current} pts | Wave {bestWaveRef.current + 1}</div>}
          <div style={{ color: "#a0855b", fontSize: 12, marginBottom: 25, opacity: 0.7, lineHeight: 2 }}>
            {isMobile.current ? "Left thumb = Move | Right thumb = Aim & Shoot\nDodge button = Roll" : "WASD = Move | Mouse = Aim & Shoot | SPACE = Dodge"}
          </div>
          <button onClick={startGame} style={bs}>{"\uD83D\uDD2B"} Start Game</button>
        </div>
      </div>
    );
  }

  if (screen === "dead") {
    return (
      <div style={cs}>
        <div style={{ textAlign: "center", padding: 20 }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>{"\u26B0\uFE0F"}</div>
          <div style={{ fontSize: "clamp(28px, 6vw, 42px)", fontWeight: "bold", color: "#666", textShadow: "2px 2px 4px rgba(0,0,0,0.8)", marginBottom: 8 }}>GAME OVER</div>
          <div style={{ color: "#deb887", fontSize: 15, fontStyle: "italic", marginBottom: 12 }}>Fell on Wave {waveIndex + 1}: {getWaveDef(waveIndex).label}</div>
          <div style={{ color: "#ffdd44", fontSize: 28, fontWeight: "bold", fontFamily: "monospace", marginBottom: 4 }}>{score}</div>
          <div style={{ color: "#a0855b", fontSize: 14, marginBottom: 4 }}>Kills: {gameRef.current?.totalKills || 0}</div>
          {score >= bestScoreRef.current && score > 0 && <div style={{ color: "#ff44ff", fontSize: 18, fontWeight: "bold", marginBottom: 8 }}>{"\u2B50"} NEW BEST! {"\u2B50"}</div>}
          <button onClick={startGame} style={bs}>{"\uD83E\uDD20"} Ride Again</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...cs, cursor: isMobile.current ? "default" : "crosshair" }}>
      {screen === "waveIntro" && (
        <div style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", pointerEvents: "none" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#f4a460", fontSize: 16, letterSpacing: 4, textTransform: "uppercase", marginBottom: 8 }}>Wave {waveIndex + 1}</div>
            <div style={{ color: "#fff", fontSize: "clamp(24px, 5vw, 32px)", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>{getWaveDef(waveIndex).label}</div>
            <div style={{ color: "#c84b31", fontSize: 13, marginTop: 8 }}>{getWaveDef(waveIndex).enemies} enemies | HP: {getWaveDef(waveIndex).hp}{waveIndex > 0 && waveIndex % 5 === 0 ? " | BOSS" : ""}</div>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} width={W} height={H}
        style={{ width: "100vw", height: "100vh", display: "block", touchAction: "none" }}
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
      />
      {/* Dodge button overlay for mobile */}
      {isMobile.current && screen === "playing" && (
        <div
          onTouchStart={(e) => { e.stopPropagation(); handleDodgeTap(); }}
          style={{ position: "absolute", bottom: 30, right: 20, width: 64, height: 64, borderRadius: "50%", background: "transparent", zIndex: 30, touchAction: "none" }}
        />
      )}
    </div>
  );
}
