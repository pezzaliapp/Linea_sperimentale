/* La Linea — Gioco Tributo (B/N) — MIT 2025 pezzaliAPP — Inline Character Prototype */
(() => {
  'use strict';

  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  const W = cvs.width, H = cvs.height;

  // Colori (B/N)
  const FG = '#ffffff';
  const SHADOW = 'rgba(255,255,255,.08)';

  // Stato di gioco
  let running = true;
  let t = 0;                // tempo
  let score = 0;
  let baseY0 = Math.round(H * 0.72);
  let speed = 4;            // velocità scorrimento linea
  let obst = [];            // ostacoli (scalini, buchi, gobbe)
  let particles = [];       // polvere bianca
  let hand = {x: W+120, y: baseY0-160, show: false, timer: 0};

  // Parametri “omino nella linea”
  const GUY_X = Math.round(W * 0.28); // posizione orizzontale fissa del personaggio
  const GUY_W = 96;                   // larghezza del profilo “occupata” lungo la linea
  const STROKE = 8;

  // Fisica salto come deformazione della linea
  const GRAV = 0.8;
  const JUMP_V0 = -16;
  const HOLD_ACC = 0.5;
  const HOLD_TCK = 14;

  let inputHeld = false;
  let jumpVy = 0;
  let jumpOffset = 0;   // quanto la deformazione solleva l’omino sopra la baseline locale
  let holdTicks = 0;
  function startJump() {
    if (!running) return;
    if (jumpOffset === 0) {        // parte solo da “terra” (aderente alla baseline)
      jumpVy = JUMP_V0;
      holdTicks = HOLD_TCK;
    }
  }
  function updateJump() {
    if (jumpOffset !== 0 || jumpVy !== 0) {
      // fase in aria
      if (inputHeld && holdTicks > 0 && jumpVy < 0) {
        jumpVy -= HOLD_ACC;
        holdTicks--;
      }
      jumpVy += GRAV;
      jumpOffset += jumpVy;
      if (jumpOffset > 0) jumpOffset = 0; // non andare sotto la baseline
      if (jumpOffset >= 0 && jumpVy > 0) { // atterrato
        jumpOffset = 0; jumpVy = 0; holdTicks = 0;
      }
    }
  }

  // Generatore ostacoli “alla Linea”
  function spawnObstacle() {
    const r = Math.random();
    if (r < 0.55) {
      // scalino (triangolo su/giù)
      const dir = Math.random() < 0.5 ? -1 : 1;
      const step = 35 + Math.random()*28;
      obst.push({type:'step', x: W+40, w: 100, h: dir*step});
    } else if (r < 0.9) {
      // gobba (seno)
      const h = 26 + Math.random()*40;
      obst.push({type:'bump', x: W+40, w: 140, h});
    } else {
      // buco — più raro per non frustrare (coerente: se passa sotto l’omino -> game over)
      const w = 80 + Math.random()*80;
      obst.push({type:'gap', x: W+40, w});
    }
  }

  // Baseline “locale”: y(x) oppure null se c’è un gap
  function baselineAt(x) {
    let y = baseY0;
    for (const o of obst) {
      const left = o.x, right = o.x + o.w;
      if (x < left || x > right) continue;

      if (o.type === 'gap') return null;

      if (o.type === 'step') {
        // triangolo (sale poi scende)
        const u = (x - left) / o.w; // 0..1
        const t = u < 0.5 ? (u*2) : (1 - (u-0.5)*2);
        y = baseY0 + o.h * t;
      } else if (o.type === 'bump') {
        const u = (x - left) / o.w; // 0..1
        y = baseY0 - o.h * Math.sin(u*Math.PI);
      }
    }
    return y;
  }

  // Disegna il profilo dell’omino come parte unica della linea, centrato su (x0,y0)
  function drawInlineMan(x0, y0, lift = 0) {
    // lift è negativo quando “si alza” (salto): disegniamo il profilo traslato verso l’alto
    const y = y0 + lift;

    const s = 1;
    const h = 120*s, w = 56*s, arm = 46*s, finger = 18*s;
    const start = x0 - GUY_W/2;  // punto dove iniziamo a “staccarci” dalla linea
    const end   = x0 + GUY_W/2;  // punto dove rientriamo nella linea

    // 1) dalla baseline arriviamo al piede a L
    ctx.lineTo(start, y0);              // fino al bordo sinistro alla quota baseline
    ctx.lineTo(start, y - (h*0.55));    // su per la gamba sinistra (stando connessi)
    // 2) saliamo verso la testa
    ctx.quadraticCurveTo(start, y - (h*0.80), x0 - 10*s + (w*0.05), y - (h*0.90));
    ctx.quadraticCurveTo(x0 - 10*s + (w*0.45), y - (h*1.05), x0 - 10*s + (w*0.35), y - (h*1.00));
    // 3) fronte → naso → rientro
    ctx.quadraticCurveTo(x0 - 10*s + (w*0.30), y - (h*0.95), x0 - 10*s + (w*0.22), y - (h*0.93));
    ctx.quadraticCurveTo(x0 - 10*s + (w*0.42), y - (h*0.90), x0 - 10*s + (w*0.46), y - (h*0.84)); // punta naso
    ctx.quadraticCurveTo(x0 - 10*s + (w*0.28), y - (h*0.86), x0 - 10*s + (w*0.18), y - (h*0.88));
    // 4) spalla + braccio (solo contorno)
    const armY = y - (h*0.70);
    ctx.lineTo(x0 - 10*s + (w*0.05), armY);
    ctx.lineTo(x0 - 10*s + (w*0.05) + arm, armY); // braccio dritto
    // 5) rientro al fianco destro fino alla baseline
    ctx.moveTo(x0 - 10*s + (w*0.02), armY + 6);
    ctx.lineTo(x0 - 10*s + (w*0.02), y - (h*0.20));
    ctx.quadraticCurveTo(x0 - 10*s + (w*0.02), y - (h*0.08), end - 8*s, y - (h*0.06));
    ctx.lineTo(end - 8*s, y0); // IMPORTANTISSIMO: torniamo alla baseline locale (continuità)
    // 6) bocca (decorativa; non interrompe la linea principale)
    ctx.moveTo(x0 - 10*s + (w*0.10), y - (h*0.86));
    ctx.lineTo(x0 - 10*s + (w*0.26), y - (h*0.84));
    return {start, end};
  }

  // Disegno mondo come traccia unica, inserendo l’omino “inline”
  function drawWorldInline() {
    ctx.lineWidth = STROKE;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = FG;

    ctx.beginPath();
    // costruiamo la polilinea campionando y(x) e sostituendo il tratto dell’omino
    const step = 8; // campionamento
    const guyStart = GUY_X - GUY_W/2;
    const guyEnd   = GUY_X + GUY_W/2;

    let drewGuy = false;
    let moved = false;

    for (let x=0; x<=W; x+=step) {
      if (!drewGuy && x >= guyStart) {
        // prima di disegnare l’omino, spostiamoci al punto esatto
        const y0 = baselineAt(guyStart);
        if (y0 === null) {
          // la linea è interrotta proprio dove dovrebbe emergere l’omino => game over
          running = false;
          break;
        }
        if (!moved) { ctx.moveTo(0, baselineAt(0) ?? baseY0); moved = true; }
        // “lineTo” fino a guyStart alla sua baseline
        // (se ci sono gap in mezzo, spezzare e riprendere)
        for (let xx = 0; xx < guyStart; xx += step) {
          const yy = baselineAt(xx);
          if (yy === null) { ctx.moveTo(xx+step, baselineAt(xx+step) ?? baseY0); continue; }
          ctx.lineTo(xx, yy);
        }
        // inseriamo l’omino come deformazione
        drawInlineMan(GUY_X, y0, jumpOffset);
        drewGuy = true;
        x = guyEnd; // salta avanti
        continue;
      }

      // dopo (o prima) dell’omino: polilinea normale
      const y = baselineAt(x);
      if (y === null) {
        // la linea è interrotta: stacchiamo il path
        moved = false;
        continue;
      } else {
        if (!moved) { ctx.moveTo(x, y); moved = true; }
        ctx.lineTo(x, y);
      }
    }
    // coda fino a W se non già tracciata (evita buchi visuali)
    const yW = baselineAt(W);
    if (yW !== null) ctx.lineTo(W, yW);
    ctx.stroke();
  }

  // Loop
  function step() {
    if (running) {
      t++;
      score += 1;

      // difficoltà progressiva
      if (t % 600 === 0) speed += 0.25;

      // ostacoli
      if (t % 75 === 0) spawnObstacle();
      obst.forEach(o => o.x -= speed);
      obst = obst.filter(o => o.x + o.w > -40);

      // mano: appare ogni tanto
      if (hand.timer-- <= 0) {
        hand.show = Math.random() < 0.02;
        hand.timer = 180 + (Math.random()*240|0);
        if (hand.show) {
          hand.x = W - 40;
          hand.y = baseY0 - (120 + Math.random()*80);
        }
      } else if (hand.show) {
        hand.x -= speed*0.8;
      }

      // aggiornamento salto (deformazione)
      updateJump();

      // regola chiave: se sotto il tratto occupato dall’omino c’è un GAP ⇒ game over
      const gs = GUY_X - GUY_W/2 + 8, ge = GUY_X + GUY_W/2 - 8;
      for (let x = gs; x <= ge; x += 8) {
        if (baselineAt(x) === null) { running = false; break; }
      }

      // polvere lungo la baseline
      if (t % 2 === 0) particles.push({
        x: GUY_X - 20 + Math.random()*8,
        y: (baselineAt(GUY_X) ?? baseY0) - 2 + Math.random()*4,
        a: 0.5
      });
      particles = particles.filter(p => (p.a -= 0.02) > 0);
    }

    // draw
    ctx.clearRect(0,0,W,H);
    // alone sottile
    ctx.fillStyle = SHADOW;
    const bYmid = baselineAt(W*0.6) ?? baseY0;
    ctx.fillRect(0, bYmid-3, W, 6);

    drawWorldInline();

    // mano (solo scenica)
    if (hand.show) {
      ctx.fillStyle = FG;
      ctx.beginPath();
      ctx.arc(hand.x, hand.y, 14, 0, Math.PI*2);
      ctx.fill();
      ctx.fillRect(hand.x-2, hand.y, 4, 60);
    }

    // HUD
    ctx.fillStyle = FG;
    ctx.font = '20px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText(`PUNTI ${score}`, 18, 30);

    if (!running) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 44px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText('GAME OVER', W/2, H/2 - 10);
      ctx.font = '20px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText('Tocca o premi SPAZIO per ripartire', W/2, H/2 + 24);
      ctx.textAlign = 'start';
    }

    const el = document.getElementById('score');
    if (el) el.textContent = score.toString();

    requestAnimationFrame(step);
  }

  // Input (tap/hold & keyboard) — salto come deformazione
  function pressDown() {
    inputHeld = true;
    if (!running) return restart();
    startJump();
  }
  function pressUp() { inputHeld = false; }

  function restart() {
    running = true;
    t = 0; score = 0; speed = 4;
    obst.length = 0; particles.length = 0;
    jumpVy = 0; jumpOffset = 0; holdTicks = 0; inputHeld = false;
  }

  // Tastiera
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); pressDown(); }
    if (e.code === 'KeyR') restart();
    if (e.code === 'KeyP') togglePause();
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'Space') { e.preventDefault(); pressUp(); }
  });

  // Touch / Mouse
  const touch = document.getElementById('touch');
  touch?.addEventListener('pointerdown', pressDown);
  touch?.addEventListener('pointerup', pressUp);
  touch?.addEventListener('pointercancel', pressUp);
  touch?.addEventListener('pointerleave', pressUp);

  // Bottoni UI
  document.getElementById('btnJump')?.addEventListener('pointerdown', pressDown);
  document.getElementById('btnJump')?.addEventListener('pointerup', pressUp);
  document.getElementById('btnRestart')?.addEventListener('click', restart);
  document.getElementById('btnPause')?.addEventListener('click', togglePause);

  function togglePause(){
    running = !running;
    const b = document.getElementById('btnPause');
    if (b) b.textContent = running ? '⏸︎ Pausa' : '▶︎ Riprendi';
  }

  // avvio
  requestAnimationFrame(step);
})();
