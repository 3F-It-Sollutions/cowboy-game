import { useState, useEffect, useRef, useCallback } from "react";

const W = 800;
const H = 600;
const PLAYER_SIZE = 28;
const BULLET_SPEED = 7;
const ENEMY_BULLET_SPEED = 3.5;
const PLAYER_SPEED = 4;
const ROLL_SPEED = 9;
const ROLL_DURATION = 14;
const ROLL_COOLDOWN = 40;
const SHOOT_COOLDOWN = 10;
const ENEMY_SIZE = 26;
const PICKUP_SIZE = 16;
const MAX_HP = 5;
const INVULN_FRAMES = 45;

const WAVE_DEFS = [
  { enemies: 3, shootRate: 120, speed: 1.2, hp: 1, label: "Cattle Rustlers" },
  { enemies: 5, shootRate: 100, speed: 1.4, hp: 1, label: "Bandits" },
  { enemies: 4, shootRate: 80, speed: 1.6, hp: 2, label: "Outlaws" },
  { enemies: 6, shootRate: 70, speed: 1.8, hp: 2, label: "Desperados" },
  { enemies: 5, shootRate: 55, speed: 2.0, hp: 3, label: "Gunslingers" },
  { enemies: 8, shootRate: 50, speed: 2.2, hp: 3, label: "El Diablo's Gang" },
  { enemies: 6, shootRate: 40, speed: 2.4, hp: 4, label: "The Undertaker's Posse" },
];

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function rnd(min, max) {
  return min + Math.random() * (max - min);
}

function spawnEnemy(waveDef, existing) {
  let x, y;
  let tries = 0;
  do {
    const side = Math.floor(Math.random() * 4);
    if (side === 0) { x = rnd(30, W - 30); y = -20; }
    else if (side === 1) { x = W + 20; y = rnd(30, H - 30); }
    else if (side === 2) { x = rnd(30, W - 30); y = H + 20; }
    else { x = -20; y = rnd(30, H - 30); }
    tries++;
  } while (tries < 10 && existing.some(e => dist(e, { x, y }) < 60));

  return {
    x, y,
    hp: waveDef.hp,
    maxHp: waveDef.hp,
    speed: waveDef.speed * rnd(0.8, 1.2),
    shootTimer: Math.floor(rnd(30, waveDef.shootRate)),
    shootRate: waveDef.shootRate,
    hitFlash: 0,
    targetX: rnd(80, W - 80),
    targetY: rnd(80, H - 80),
    moveTimer: 0,
    id: Date.now() + Math.random(),
  };
}

export default function CowboyShooter() {
  const canvasRef = useRef(null);
  const [screen, setScreen] = useState("menu"); // menu, playing, waveIntro, dead, victory
  const [score, setScore] = useState(0);
  const [waveIndex, setWaveIndex] = useState(0);
  const gameRef = useRef(null);
  const keysRef = useRef({});
  const mouseRef = useRef({ x: 400, y: 300, down: false });
  const touchShootRef = useRef(false);
  const touchMoveRef = useRef({ active: false, dx: 0, dy: 0 });
  const frameRef = useRef(0);
  const scoreRef = useRef(0);
  const waveRef = useRef(0);

  const initGame = useCallback(() => {
    scoreRef.current = 0;
    waveRef.current = 0;
    setScore(0);
    setWaveIndex(0);
    gameRef.current = {
      player: { x: W / 2, y: H / 2, hp: MAX_HP, rolling: 0, rollCooldown: 0, rollDx: 0, rollDy: 0, shootCooldown: 0, invuln: 0, facing: 0 },
      enemies: [],
      playerBullets: [],
      enemyBullets: [],
      pickups: [],
      particles: [],
      wave: 0,
      enemiesSpawned: 0,
      spawnTimer: 0,
      shakeTimer: 0,
      shakeIntensity: 0,
      dustParticles: Array.from({ length: 15 }, () => ({
        x: rnd(0, W), y: rnd(0, H), vx: rnd(-0.3, -0.1), vy: rnd(-0.1, 0.1),
        size: rnd(2, 5), opacity: rnd(0.05, 0.15),
      })),
    };
  }, []);

  const startWave = useCallback((wi) => {
    const g = gameRef.current;
    if (!g) return;
    g.wave = wi;
    g.enemiesSpawned = 0;
    g.spawnTimer = 60;
    g.enemies = [];
    g.enemyBullets = [];
    waveRef.current = wi;
    setWaveIndex(wi);
    setScreen("waveIntro");
    setTimeout(() => setScreen("playing"), 2000);
  }, []);

  const startGame = useCallback(() => {
    initGame();
    startWave(0);
  }, [initGame, startWave]);

  // Input handlers
  useEffect(() => {
    const kd = (e) => {
      keysRef.current[e.code] = true;
      if (e.code === "Space") e.preventDefault();
    };
    const ku = (e) => { keysRef.current[e.code] = false; };
    const mm = (e) => {
      const c = canvasRef.current;
      if (!c) return;
      const r = c.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - r.left) / r.width) * W;
      mouseRef.current.y = ((e.clientY - r.top) / r.height) * H;
    };
    const md = (e) => {
      mm(e);
      mouseRef.current.down = true;
    };
    const mu = () => { mouseRef.current.down = false; };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("mousemove", mm);
    window.addEventListener("mousedown", md);
    window.addEventListener("mouseup", mu);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mousedown", md);
      window.removeEventListener("mouseup", mu);
    };
  }, []);

  // Touch controls
  const handleTouchStart = useCallback((e) => {
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    for (const t of e.changedTouches) {
      const tx = ((t.clientX - r.left) / r.width) * W;
      if (tx > W * 0.5) {
        touchShootRef.current = true;
        mouseRef.current.x = ((t.clientX - r.left) / r.width) * W;
        mouseRef.current.y = ((t.clientY - r.top) / r.height) * H;
      } else {
        touchMoveRef.current = { active: true, startX: t.clientX, startY: t.clientY, dx: 0, dy: 0, id: t.identifier };
      }
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    for (const t of e.changedTouches) {
      if (touchMoveRef.current.active && t.identifier === touchMoveRef.current.id) {
        const dx = t.clientX - touchMoveRef.current.startX;
        const dy = t.clientY - touchMoveRef.current.startY;
        const mag = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 40;
        if (mag > 5) {
          touchMoveRef.current.dx = (dx / mag) * Math.min(mag / maxDist, 1);
          touchMoveRef.current.dy = (dy / mag) * Math.min(mag / maxDist, 1);
        } else {
          touchMoveRef.current.dx = 0;
          touchMoveRef.current.dy = 0;
        }
      } else {
        mouseRef.current.x = ((t.clientX - r.left) / r.width) * W;
        mouseRef.current.y = ((t.clientY - r.top) / r.height) * H;
      }
    }
  }, []);

  const handleTouchEnd = useCallback((e) => {
    for (const t of e.changedTouches) {
      if (touchMoveRef.current.active && t.identifier === touchMoveRef.current.id) {
        touchMoveRef.current = { active: false, dx: 0, dy: 0 };
      } else {
        touchShootRef.current = false;
      }
    }
  }, []);

  // Game loop
  useEffect(() => {
    if (screen !== "playing" && screen !== "waveIntro") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;

    const loop = () => {
      const g = gameRef.current;
      if (!g || screen === "menu" || screen === "dead" || screen === "victory") return;
      frameRef.current++;
      const f = frameRef.current;
      const keys = keysRef.current;
      const p = g.player;
      const waveDef = WAVE_DEFS[g.wave] || WAVE_DEFS[WAVE_DEFS.length - 1];
      const isPlaying = screen === "playing";

      // === UPDATE ===
      if (isPlaying) {
        // Player movement
        let dx = 0, dy = 0;
        if (keys["KeyW"] || keys["ArrowUp"]) dy -= 1;
        if (keys["KeyS"] || keys["ArrowDown"]) dy += 1;
        if (keys["KeyA"] || keys["ArrowLeft"]) dx -= 1;
        if (keys["KeyD"] || keys["ArrowRight"]) dx += 1;
        if (touchMoveRef.current.active) {
          dx += touchMoveRef.current.dx;
          dy += touchMoveRef.current.dy;
        }

        if (p.rolling > 0) {
          p.x += p.rollDx * ROLL_SPEED;
          p.y += p.rollDy * ROLL_SPEED;
          p.rolling--;
          p.invuln = Math.max(p.invuln, 1);
        } else {
          const mag = Math.sqrt(dx * dx + dy * dy);
          if (mag > 0) {
            p.x += (dx / mag) * PLAYER_SPEED;
            p.y += (dy / mag) * PLAYER_SPEED;
            p.facing = Math.atan2(dy, dx);
          }

          // Roll on Space or double-tap
          if (keys["Space"] && p.rollCooldown <= 0 && mag > 0) {
            p.rolling = ROLL_DURATION;
            p.rollCooldown = ROLL_COOLDOWN;
            p.rollDx = dx / mag;
            p.rollDy = dy / mag;
            for (let i = 0; i < 6; i++) {
              g.particles.push({ x: p.x, y: p.y, vx: rnd(-2, 2), vy: rnd(-2, 2), life: 20, maxLife: 20, color: "#c8a050", size: rnd(3, 6) });
            }
          }
        }
        if (p.rollCooldown > 0) p.rollCooldown--;
        if (p.invuln > 0) p.invuln--;

        p.x = clamp(p.x, PLAYER_SIZE, W - PLAYER_SIZE);
        p.y = clamp(p.y, PLAYER_SIZE, H - PLAYER_SIZE);

        // Shooting
        const shooting = mouseRef.current.down || touchShootRef.current;
        if (shooting && p.shootCooldown <= 0 && p.rolling <= 0) {
          const angle = Math.atan2(mouseRef.current.y - p.y, mouseRef.current.x - p.x);
          g.playerBullets.push({
            x: p.x + Math.cos(angle) * 20,
            y: p.y + Math.sin(angle) * 20,
            vx: Math.cos(angle) * BULLET_SPEED,
            vy: Math.sin(angle) * BULLET_SPEED,
            life: 80,
          });
          p.shootCooldown = SHOOT_COOLDOWN;
          p.facing = angle;
          g.shakeTimer = 3;
          g.shakeIntensity = 2;
          // Muzzle flash
          for (let i = 0; i < 3; i++) {
            g.particles.push({
              x: p.x + Math.cos(angle) * 22, y: p.y + Math.sin(angle) * 22,
              vx: Math.cos(angle + rnd(-0.3, 0.3)) * rnd(2, 5), vy: Math.sin(angle + rnd(-0.3, 0.3)) * rnd(2, 5),
              life: 8, maxLife: 8, color: "#ffdd44", size: rnd(2, 5),
            });
          }
        }
        if (p.shootCooldown > 0) p.shootCooldown--;

        // Spawn enemies
        if (g.enemiesSpawned < waveDef.enemies) {
          g.spawnTimer--;
          if (g.spawnTimer <= 0) {
            g.enemies.push(spawnEnemy(waveDef, g.enemies));
            g.enemiesSpawned++;
            g.spawnTimer = Math.max(30, 80 - g.wave * 8);
          }
        }

        // Update enemies
        g.enemies.forEach((e) => {
          e.moveTimer--;
          if (e.moveTimer <= 0) {
            e.targetX = rnd(60, W - 60);
            e.targetY = rnd(60, H - 60);
            e.moveTimer = Math.floor(rnd(60, 150));
          }
          const toTargetX = e.targetX - e.x;
          const toTargetY = e.targetY - e.y;
          const tDist = Math.sqrt(toTargetX ** 2 + toTargetY ** 2);
          if (tDist > 5) {
            e.x += (toTargetX / tDist) * e.speed;
            e.y += (toTargetY / tDist) * e.speed;
          }
          e.x = clamp(e.x, 20, W - 20);
          e.y = clamp(e.y, 20, H - 20);

          e.shootTimer--;
          if (e.shootTimer <= 0) {
            const angle = Math.atan2(p.y - e.y, p.x - e.x);
            const spread = 0.15;
            g.enemyBullets.push({
              x: e.x, y: e.y,
              vx: Math.cos(angle + rnd(-spread, spread)) * ENEMY_BULLET_SPEED,
              vy: Math.sin(angle + rnd(-spread, spread)) * ENEMY_BULLET_SPEED,
              life: 140,
            });
            e.shootTimer = Math.floor(e.shootRate * rnd(0.7, 1.3));
          }
          if (e.hitFlash > 0) e.hitFlash--;
        });

        // Update bullets
        g.playerBullets.forEach((b) => { b.x += b.vx; b.y += b.vy; b.life--; });
        g.enemyBullets.forEach((b) => { b.x += b.vx; b.y += b.vy; b.life--; });
        g.playerBullets = g.playerBullets.filter((b) => b.life > 0 && b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20);
        g.enemyBullets = g.enemyBullets.filter((b) => b.life > 0 && b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20);

        // Player bullet → enemy collision
        g.playerBullets.forEach((b) => {
          g.enemies.forEach((e) => {
            if (dist(b, e) < ENEMY_SIZE) {
              b.life = 0;
              e.hp--;
              e.hitFlash = 6;
              g.shakeTimer = 4;
              g.shakeIntensity = 3;
              for (let i = 0; i < 5; i++) {
                g.particles.push({
                  x: e.x, y: e.y, vx: rnd(-3, 3), vy: rnd(-3, 3),
                  life: 20, maxLife: 20, color: "#ff4444", size: rnd(2, 5),
                });
              }
              if (e.hp <= 0) {
                scoreRef.current += 100 + g.wave * 50;
                setScore(scoreRef.current);
                for (let i = 0; i < 12; i++) {
                  g.particles.push({
                    x: e.x, y: e.y, vx: rnd(-4, 4), vy: rnd(-4, 4),
                    life: 30, maxLife: 30, color: i < 6 ? "#ff6633" : "#ffaa44", size: rnd(3, 8),
                  });
                }
                if (Math.random() < 0.25) {
                  g.pickups.push({ x: e.x, y: e.y, type: "hp", life: 300 });
                }
              }
            }
          });
        });
        g.enemies = g.enemies.filter((e) => e.hp > 0);

        // Enemy bullet → player collision
        if (p.invuln <= 0 && p.rolling <= 0) {
          g.enemyBullets.forEach((b) => {
            if (dist(b, p) < PLAYER_SIZE * 0.8) {
              b.life = 0;
              p.hp--;
              p.invuln = INVULN_FRAMES;
              g.shakeTimer = 8;
              g.shakeIntensity = 6;
              for (let i = 0; i < 8; i++) {
                g.particles.push({
                  x: p.x, y: p.y, vx: rnd(-3, 3), vy: rnd(-3, 3),
                  life: 25, maxLife: 25, color: "#ff2222", size: rnd(3, 7),
                });
              }
              if (p.hp <= 0) {
                setScreen("dead");
              }
            }
          });
        }

        // Pickups
        g.pickups.forEach((pk) => {
          pk.life--;
          if (dist(pk, p) < PLAYER_SIZE + PICKUP_SIZE) {
            pk.life = 0;
            if (pk.type === "hp") p.hp = Math.min(MAX_HP, p.hp + 1);
          }
        });
        g.pickups = g.pickups.filter((pk) => pk.life > 0);

        // Wave complete check
        if (g.enemiesSpawned >= waveDef.enemies && g.enemies.length === 0) {
          if (g.wave < WAVE_DEFS.length - 1) {
            startWave(g.wave + 1);
          } else {
            setScreen("victory");
          }
        }
      }

      // Particles
      g.particles.forEach((pt) => { pt.x += pt.vx; pt.y += pt.vy; pt.vx *= 0.95; pt.vy *= 0.95; pt.life--; });
      g.particles = g.particles.filter((pt) => pt.life > 0);

      // Dust
      g.dustParticles.forEach((d) => {
        d.x += d.vx; d.y += d.vy;
        if (d.x < -10) d.x = W + 10;
        if (d.y < -10) d.y = H + 10;
        if (d.y > H + 10) d.y = -10;
      });

      // Shake
      if (g.shakeTimer > 0) g.shakeTimer--;

      // === DRAW ===
      ctx.save();
      if (g.shakeTimer > 0) {
        ctx.translate(rnd(-g.shakeIntensity, g.shakeIntensity), rnd(-g.shakeIntensity, g.shakeIntensity));
      }

      // Background - desert floor
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#d4a056");
      grad.addColorStop(0.3, "#c89444");
      grad.addColorStop(1, "#a07030");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Ground details
      ctx.fillStyle = "rgba(160,100,40,0.3)";
      for (let i = 0; i < 20; i++) {
        const gx = (i * 137 + f * 0.1) % (W + 40) - 20;
        const gy = (i * 89) % H;
        ctx.beginPath();
        ctx.ellipse(gx, gy, rnd(20, 40), rnd(8, 15), 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw dust
      g.dustParticles.forEach((d) => {
        ctx.fillStyle = `rgba(200,170,120,${d.opacity})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Pickups
      g.pickups.forEach((pk) => {
        const blink = pk.life < 60 && f % 10 < 5;
        if (!blink) {
          ctx.fillStyle = "#ff4466";
          ctx.font = "20px serif";
          ctx.textAlign = "center";
          ctx.fillText("❤️", pk.x, pk.y + 7);
        }
      });

      // Enemy bullets (red)
      g.enemyBullets.forEach((b) => {
        ctx.fillStyle = "#ff3322";
        ctx.shadowColor = "#ff3322";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // Trail
        ctx.fillStyle = "rgba(255,50,30,0.3)";
        ctx.beginPath();
        ctx.arc(b.x - b.vx, b.y - b.vy, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      // Player bullets (yellow)
      g.playerBullets.forEach((b) => {
        ctx.fillStyle = "#ffdd22";
        ctx.shadowColor = "#ffdd22";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Enemies
      g.enemies.forEach((e) => {
        ctx.save();
        ctx.translate(e.x, e.y);
        // Shadow
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath();
        ctx.ellipse(0, ENEMY_SIZE * 0.6, ENEMY_SIZE * 0.7, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        if (e.hitFlash > 0) {
          ctx.fillStyle = "#fff";
        } else {
          ctx.fillStyle = "#8B2500";
        }
        // Body
        ctx.beginPath();
        ctx.arc(0, 0, ENEMY_SIZE * 0.5, 0, Math.PI * 2);
        ctx.fill();
        // Hat
        ctx.fillStyle = e.hitFlash > 0 ? "#fff" : "#333";
        ctx.fillRect(-ENEMY_SIZE * 0.6, -ENEMY_SIZE * 0.7, ENEMY_SIZE * 1.2, 6);
        ctx.fillRect(-ENEMY_SIZE * 0.35, -ENEMY_SIZE * 0.95, ENEMY_SIZE * 0.7, ENEMY_SIZE * 0.3);

        // HP bar
        if (e.maxHp > 1) {
          const bw = 30;
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.fillRect(-bw / 2, -ENEMY_SIZE - 8, bw, 4);
          ctx.fillStyle = "#ff4444";
          ctx.fillRect(-bw / 2, -ENEMY_SIZE - 8, bw * (e.hp / e.maxHp), 4);
        }
        ctx.restore();
      });

      // Player
      ctx.save();
      ctx.translate(p.x, p.y);
      // Shadow
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(0, PLAYER_SIZE * 0.6, PLAYER_SIZE * 0.7, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      const playerAlpha = (p.invuln > 0 && f % 6 < 3) ? 0.4 : 1;
      ctx.globalAlpha = playerAlpha;

      if (p.rolling > 0) {
        // Rolling - spinning circle
        ctx.fillStyle = "#deb887";
        ctx.beginPath();
        ctx.arc(0, 0, PLAYER_SIZE * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#8B6914";
        const ra = f * 0.5;
        ctx.fillRect(-3 + Math.cos(ra) * 5, -3 + Math.sin(ra) * 5, 6, 6);
      } else {
        // Body
        ctx.fillStyle = "#deb887";
        ctx.beginPath();
        ctx.arc(0, 0, PLAYER_SIZE * 0.5, 0, Math.PI * 2);
        ctx.fill();
        // Hat
        ctx.fillStyle = "#8B6914";
        ctx.fillRect(-PLAYER_SIZE * 0.65, -PLAYER_SIZE * 0.7, PLAYER_SIZE * 1.3, 6);
        ctx.fillRect(-PLAYER_SIZE * 0.35, -PLAYER_SIZE, PLAYER_SIZE * 0.7, PLAYER_SIZE * 0.35);
        // Gun arm
        const gunAngle = Math.atan2(mouseRef.current.y - p.y, mouseRef.current.x - p.x);
        ctx.strokeStyle = "#a08050";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(gunAngle) * 22, Math.sin(gunAngle) * 22);
        ctx.stroke();
        // Gun
        ctx.fillStyle = "#555";
        ctx.beginPath();
        ctx.arc(Math.cos(gunAngle) * 22, Math.sin(gunAngle) * 22, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // Particles
      g.particles.forEach((pt) => {
        const alpha = pt.life / pt.maxLife;
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // HUD
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(10, 10, 200, 36);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 15px Georgia";
      ctx.textAlign = "left";
      // Hearts
      for (let i = 0; i < MAX_HP; i++) {
        ctx.fillStyle = i < p.hp ? "#ff4466" : "#443333";
        ctx.font = "18px serif";
        ctx.fillText("♥", 18 + i * 24, 33);
      }
      // Score
      ctx.fillStyle = "#ffdd44";
      ctx.font = "bold 15px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`SCORE: ${scoreRef.current}`, W - 16, 30);

      // Wave indicator
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(W / 2 - 80, 10, 160, 24);
      ctx.fillStyle = "#f4a460";
      ctx.font = "bold 13px Georgia";
      ctx.textAlign = "center";
      ctx.fillText(`Wave ${g.wave + 1}: ${WAVE_DEFS[g.wave]?.label || "???"}`, W / 2, 27);

      // Enemies remaining
      const remaining = WAVE_DEFS[g.wave] ? (WAVE_DEFS[g.wave].enemies - g.enemiesSpawned + g.enemies.length) : 0;
      ctx.fillStyle = "#aaa";
      ctx.font = "12px Georgia";
      ctx.fillText(`${g.enemies.length} enemies on field | ${Math.max(0, WAVE_DEFS[g.wave]?.enemies - g.enemiesSpawned || 0)} incoming`, W / 2, 48);

      // Roll cooldown indicator
      if (p.rollCooldown > 0) {
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(10, H - 30, 100, 16);
        ctx.fillStyle = "#66aaff";
        ctx.fillRect(10, H - 30, 100 * (1 - p.rollCooldown / ROLL_COOLDOWN), 16);
        ctx.fillStyle = "#fff";
        ctx.font = "10px monospace";
        ctx.textAlign = "left";
        ctx.fillText("DODGE [SPACE]", 14, H - 19);
      } else if (isPlaying) {
        ctx.fillStyle = "rgba(100,180,255,0.3)";
        ctx.fillRect(10, H - 30, 100, 16);
        ctx.fillStyle = "#aaddff";
        ctx.font = "10px monospace";
        ctx.textAlign = "left";
        ctx.fillText("DODGE READY", 14, H - 19);
      }

      // Touch controls hint
      if (touchMoveRef.current.active || touchShootRef.current) {
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.beginPath();
        ctx.arc(100, H - 100, 50, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.font = "14px Georgia";
        ctx.textAlign = "center";
        ctx.fillText("MOVE", 100, H - 95);
      }

      ctx.restore();
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [screen, startWave]);

  const containerStyle = {
    width: "100vw",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(180deg, #1a0a2e 0%, #2d1b4e 40%, #4a2040 100%)",
    fontFamily: "'Georgia', serif",
    overflow: "hidden",
    position: "relative",
    userSelect: "none",
  };

  const btnStyle = {
    background: "linear-gradient(180deg, #c84b31 0%, #8B2500 100%)",
    color: "#f4e4c1",
    border: "3px solid #f4a460",
    padding: "16px 48px",
    fontSize: 22,
    fontFamily: "'Georgia', serif",
    fontWeight: "bold",
    letterSpacing: 3,
    cursor: "pointer",
    textTransform: "uppercase",
    boxShadow: "0 4px 20px rgba(200,75,49,0.5)",
    marginTop: 20,
  };

  if (screen === "menu") {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "clamp(40px, 8vw, 72px)", fontWeight: "bold", color: "#f4a460", textShadow: "3px 3px 0 #8B4513, 6px 6px 0 rgba(0,0,0,0.3)", letterSpacing: 4, lineHeight: 1.1 }}>
            DEAD MAN'S
            <br />DRAW
          </div>
          <div style={{ color: "#deb887", fontSize: 16, margin: "12px 0 8px", opacity: 0.8, fontStyle: "italic" }}>
            Survive 7 waves of outlaws
          </div>
          <div style={{ color: "#a0855b", fontSize: 13, marginBottom: 30, opacity: 0.7, lineHeight: 1.8 }}>
            WASD / Arrows — Move &nbsp;|&nbsp; Mouse — Aim & Shoot
            <br />
            SPACE — Dodge Roll &nbsp;|&nbsp; Touch: Left=Move, Right=Shoot
          </div>
          <button onClick={startGame} style={btnStyle}>🔫 Start Game</button>
        </div>
      </div>
    );
  }

  if (screen === "dead") {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 12 }}>⚰️</div>
          <div style={{ fontSize: 48, fontWeight: "bold", color: "#666", textShadow: "2px 2px 4px rgba(0,0,0,0.8)", marginBottom: 8 }}>GAME OVER</div>
          <div style={{ color: "#deb887", fontSize: 16, fontStyle: "italic", marginBottom: 8 }}>
            You fell on Wave {waveIndex + 1}: {WAVE_DEFS[waveIndex]?.label}
          </div>
          <div style={{ color: "#ffdd44", fontSize: 28, fontWeight: "bold", fontFamily: "monospace", marginBottom: 16 }}>
            Score: {score}
          </div>
          <button onClick={startGame} style={btnStyle}>🤠 Ride Again</button>
        </div>
      </div>
    );
  }

  if (screen === "victory") {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 12 }}>🏆</div>
          <div style={{ fontSize: 42, fontWeight: "bold", color: "#FFD700", textShadow: "2px 2px 4px rgba(0,0,0,0.8)", marginBottom: 12 }}>THE WEST IS YOURS!</div>
          <div style={{ color: "#deb887", fontSize: 16, fontStyle: "italic", marginBottom: 8 }}>
            All outlaws have been defeated
          </div>
          <div style={{ color: "#ffdd44", fontSize: 32, fontWeight: "bold", fontFamily: "monospace", marginBottom: 16 }}>
            Final Score: {score}
          </div>
          <button onClick={startGame} style={btnStyle}>🤠 Play Again</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...containerStyle, cursor: "crosshair" }}>
      {/* Wave intro overlay */}
      {screen === "waveIntro" && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 20,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.6)",
          animation: "fadeIn 0.3s ease",
          pointerEvents: "none",
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#f4a460", fontSize: 18, letterSpacing: 4, textTransform: "uppercase", marginBottom: 8 }}>Wave {waveIndex + 1}</div>
            <div style={{ color: "#fff", fontSize: 36, fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
              {WAVE_DEFS[waveIndex]?.label}
            </div>
            <div style={{ color: "#c84b31", fontSize: 14, marginTop: 8 }}>
              {WAVE_DEFS[waveIndex]?.enemies} enemies | HP: {WAVE_DEFS[waveIndex]?.hp}
            </div>
          </div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{
          maxWidth: "100vw",
          maxHeight: "100vh",
          objectFit: "contain",
          touchAction: "none",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
