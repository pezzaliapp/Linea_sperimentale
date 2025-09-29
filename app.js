/* La Linea — Inline Character Prototype — continuity fix + arrows — MIT 2025 pezzaliAPP */
(() => {
  'use strict';

  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  const W = cvs.width, H = cvs.height;

  // colori B/N
  const FG = '#fff';
  const SHADOW = 'rgba(255,255,255,.08)';

  // stato
  let running = true, t = 0, score = 0;
  let baseY0 = Math.round(H * 0.72);
  let speed = 4;
  let obst = [];
  let particles = [];
  let hand = { x: W + 120, y: baseY0 - 160, show: false, timer: 0 };

  // omino inline (mobile)
  let GUY_X = Math.round(W * 0.28);
  const GUY_W = 96;
  const STROKE = 8;
  const GUY_MIN_X = 40;
  const GUY_MAX_X = W - 40;

  // salto (deformazione locale)
  const GRAV = 0.8, JUMP_V0 = -16, HOLD_ACC = 0.5, HOLD_TCK = 14;
  let inputHeldJump = false, holdTicks = 0, jumpVy = 0, jumpOffset = 0;

  function startJump() {
    if (!running) return;
    if (jumpOffset === 0) { jumpVy = JUMP_V0; holdTicks = HOLD_TCK; }
  }
  function updateJump() {
    if (jumpOffset !== 0 || jumpVy !== 0) {
      if (inputHeldJump && holdTicks > 0 && jumpVy < 0) {
        jumpVy -= HOLD_ACC; holdTicks--;
      }
      jumpVy += GRAV; jumpOffset += jumpVy;
      if (jumpOffset > 0) jumpOffset = 0;
      if (jumpOffset >= 0 && jumpVy > 0) { jumpOffset = 0; jumpVy = 0; holdTicks = 0; }
    }
  }

  // movimento orizzontale
  let moveLeft = false, moveRight = false, holdStill = false;
  const MOVE_SPEED = 5;

  // ostacoli
  function spawnObstacle() {
    const r = Math.random();
    if (r < 0.55) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      const step = 35 + Math.random() * 28;
      obst.push({ type: 'step', x: W + 40, w: 100, h: dir * step });
    } else if (r < 0.9) {
      const h = 26 + Math.random() * 40;
      obst.push({ type: 'bump', x: W + 40, w: 140, h });
    } else {
      const w = 80 + Math.random() * 80;
      obst.push({ type: 'gap', x: W + 40, w });
    }
  }

  // baseline locale
  function baselineAt(x) {
    let y = baseY0;
    for (const o of obst) {
      const L = o.x, R = o.x + o.w;
      if (x < L || x > R) continue;
      if (o.type === 'gap') return null;
      if (o.type === 'step') {
        const u = (x - L) / o.w, tri = u < .5 ? u * 2 : (1 - (u - .5) * 2);
        y = baseY0 + o.h * tri;
      } else if (o.type === 'bump') {
        const u = (x - L) / o.w;
        y = baseY0 - o.h * Math.sin(u * Math.PI);
      }
    }
    return y;
  }

  // profilo inline — con aggancio esatto a yL/yR e BOCCA in path separato (fix "linea appesa")
  function drawInlineMan(gx, lift) {
    const start = gx - GUY_W / 2, end = gx + GUY_W / 2;
    const yL = baselineAt(start), yR = baselineAt(end);
    if (yL === null || yR === null) { running = false; return { broke: true }; }

    const s = 1, h = 120 * s, w = 56 * s, arm = 46 * s;
    const x0 = gx - 10 * s;
    const yTop = (yL + yR) / 2 + lift;    // segue eventuale pendenza

    // piede a L dalla baseline sinistra
    ctx.lineTo(start, yL);
    ctx.lineTo(start, yTop - (h * .55));

    // testa
    ctx.quadraticCurveTo(start, yTop - (h * .80), x0 + (w * .05), yTop - (h * .90));
    ctx.quadraticCurveTo(x0 + (w * .45), yTop - (h * 1.05), x0 + (w * .35), yTop - (h * 1.00));

    // naso
    ctx.quadraticCurveTo(x0 + (w * .30), yTop - (h * .95), x0 + (w * .22), yTop - (h * .93));
    ctx.quadraticCurveTo(x0 + (w * .42), yTop - (h * .90), x0 + (w * .46), yTop - (h * .84));
    ctx.quadraticCurveTo(x0 + (w * .28), yTop - (h * .86), x0 + (w * .18), yTop - (h * .88));

    // braccio
    const armY = yTop - (h * .70);
    ctx.lineTo(x0 + (w * .05), armY);
    ctx.lineTo(x0 + (w * .05) + arm, armY);

    // rientro e aggancio baseright
    ctx.moveTo(x0 + (w * .02), armY + 6);
    ctx.lineTo(x0 + (w * .02), yTop - (h * .20));
    ctx.quadraticCurveTo(x0 + (w * .02), yTop - (h * .08), end - 8 * s, yTop - (h * .06));
    ctx.lineTo(end - 8 * s, yR);

    // — BOCCA in path SEPARATO: evita il filo che partiva dal labbro —
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0 + (w * .10), yTop - (h * .86));
    ctx.lineTo(x0 + (w * .26), yTop - (h * .84));
    ctx.lineWidth = STROKE;
    ctx.strokeStyle = FG;
    ctx.stroke();
    ctx.restore();

    return { start, end, broke: false };
  }

  // mondo: unica traccia con omino "inserito"
  function drawWorldInline() {
    ctx.lineWidth = STROKE;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = FG;

    ctx.beginPath();

    const step = 8, guyStart = GUY_X - GUY_W / 2, guyEnd = GUY_X + GUY_W / 2;
    let moved = false;

    // tratto prima dell’omino
    for (let x = 0; x < Math.max(0, guyStart); x += step) {
      const y = baselineAt(x);
      if (y === null) { moved = false; continue; }
      if (!moved) { ctx.moveTo(x, y); moved = true; } else ctx.lineTo(x, y);
    }

    // omino
    const yCheckL = baselineAt(guyStart), yCheckR = baselineAt(guyEnd);
    if (yCheckL === null || yCheckR === null) {
      running = false;
    } else {
      if (!moved) { ctx.moveTo(guyStart, yCheckL); moved = true; }
      const seg = drawInlineMan(GUY_X, jumpOffset);
      if (seg.broke) { ctx.stroke(); return; }
    }

    // tratto dopo l’omino
    for (let x = guyEnd; x <= W; x += step) {
      const y = baselineAt(x);
      if (y === null) { moved = false; continue; }
      if (!moved) { ctx.moveTo(x, y); moved = true; } else ctx.lineTo(x, y);
    }

    const yW = baselineAt(W);
    if (yW !== null) ctx.lineTo(W, yW);
    ctx.stroke();
  }

  // loop
  function tick() {
    if (running) {
      t++; score++;

      if (t % 600 === 0) speed += .25;

      if (t % 75 === 0) spawnObstacle();
      obst.forEach(o => o.x -= speed);
      obst = obst.filter(o => o.x + o.w > -40);

      // mano scenica
      if (hand.timer-- <= 0) {
        hand.show = Math.random() < .02;
        hand.timer = 180 + (Math.random() * 240 | 0);
        if (hand.show) { hand.x = W - 40; hand.y = baseY0 - (120 + Math.random() * 80); }
      } else if (hand.show) {
        hand.x -= speed * .8;
      }

      // movimento orizzontale
      if (!holdStill) {
        const dir = (moveRight ? 1 : 0) - (moveLeft ? 1 : 0);
        GUY_X = Math.max(GUY_MIN_X, Math.min(GUY_MAX_X, GUY_X + dir * MOVE_SPEED));
      }

      // salto
      updateJump();

      // se un gap attraversa la porzione dell’omino → game over
      for (let x = GUY_X - GUY_W / 2 + 8; x <= GUY_X + GUY_W / 2 - 8; x += 8) {
        if (baselineAt(x) === null) { running = false; break; }
      }

      // polvere
      if (t % 2 === 0) particles.push({
        x: GUY_X - 20 + Math.random() * 8,
        y: (baselineAt(GUY_X) ?? baseY0) - 2 + Math.random() * 4,
        a: .5
      });
      particles = particles.filter(p => (p.a -= .02) > 0);
    }

    // draw
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = SHADOW;
    const yMid = baselineAt(W * .6) ?? baseY0;
    ctx.fillRect(0, yMid - 3, W, 6);

    drawWorldInline();

    if (hand.show) {
      ctx.fillStyle = FG;
      ctx.beginPath(); ctx.arc(hand.x, hand.y, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(hand.x - 2, hand.y, 4, 60);
    }

    // HUD
    ctx.fillStyle = FG; ctx.font = '20px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText(`PUNTI ${score}`, 18, 30);

    if (!running) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 44px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText('GAME OVER', W / 2, H / 2 - 10);
      ctx.font = '20px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText('Tocca/Space per ripartire', W / 2, H / 2 + 24);
      ctx.textAlign = 'start';
    }

    document.getElementById('score')?.textContent = String(score);
    requestAnimationFrame(tick);
  }

  // ===== Input =====
  function pressDownJump() { inputHeldJump = true; if (!running) return restart(); startJump(); }
  function releaseJump() { inputHeldJump = false; }
  function restart() {
    running = true; t = 0; score = 0; speed = 4;
    obst.length = 0; particles.length = 0;
    jumpVy = 0; jumpOffset = 0; holdTicks = 0; inputHeldJump = false;
  }
  function togglePause() {
    running = !running;
    const b = document.getElementById('btnPause');
    if (b) b.textContent = running ? '⏸︎ Pausa' : '▶︎ Riprendi';
  }

  // tastiera
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); pressDownJump(); }
    if (e.code === 'ArrowLeft') { moveLeft = true; }
    if (e.code === 'ArrowRight') { moveRight = true; }
    if (e.code === 'ArrowDown') { holdStill = true; }
    if (e.code === 'KeyR') restart();
    if (e.code === 'KeyP') togglePause();
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'Space') { e.preventDefault(); releaseJump(); }
    if (e.code === 'ArrowLeft') { moveLeft = false; }
    if (e.code === 'ArrowRight') { moveRight = false; }
    if (e.code === 'ArrowDown') { holdStill = false; }
  });

  // touch: sinistra=←, destra=→, centro=salto. Multi-touch ⇒ fermo
  const touch = document.getElementById('touch') || cvs;
  function whichZone(x) { if (x < W / 3) return 'left'; if (x > 2 * W / 3) return 'right'; return 'center'; }
  touch.addEventListener('pointerdown', e => {
    const rect = cvs.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const zone = whichZone(x);
    if (e.isPrimary === false) { holdStill = true; } // secondo dito ⇒ fermo
    if (zone === 'left') moveLeft = true;
    else if (zone === 'right') moveRight = true;
    else { pressDownJump(); setTimeout(releaseJump, 0); }
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => {
    touch.addEventListener(ev, () => { moveLeft = moveRight = holdStill = false; releaseJump(); });
  });

  // bottoni UI
  document.getElementById('btnJump')?.addEventListener('pointerdown', () => { pressDownJump(); });
  document.getElementById('btnJump')?.addEventListener('pointerup', () => { releaseJump(); });
  document.getElementById('btnRestart')?.addEventListener('click', restart);
  document.getElementById('btnPause')?.addEventListener('click', togglePause);

  requestAnimationFrame(tick);
})();
