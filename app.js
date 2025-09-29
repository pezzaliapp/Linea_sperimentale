/* La Linea — Gioco Tributo (B/N) — MIT 2025 pezzaliAPP */
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
  let baseY = Math.round(H * 0.72);
  let speed = 4;            // velocità scorrimento linea
  let obst = [];            // ostacoli (scalini, buchi, gobbe)
  let particles = [];       // polvere bianca della traccia
  let popups = [];          // testi fluttuanti (es. +50)
  let hand = {x: W+120, y: baseY-160, show: false, timer: 0};
  let bonuses = [];         // bonus in aria (valenze variabili)
  let lifesaver = null;     // bonus speciale salvavita (stellina)
  let shields = 0;          // scudi attivi (1 per ogni salvavita preso)

  // === Audio (click breve B/N) =============================================
  let AC = null, gain;
  function ensureAudio() {
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      gain = AC.createGain();
      gain.connect(AC.destination);
      gain.gain.value = 0.4;
    } else if (AC.state === 'suspended') {
      AC.resume();
    }
  }
  function clickSound(pitch = 1200, dur = 0.05) {
    if (!AC) return;
    const osc = AC.createOscillator();
    const g   = AC.createGain();
    osc.type = 'square';
    osc.frequency.value = pitch;
    const now = AC.currentTime;
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.5, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g).connect(gain);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  // === Parametri fisici =====================================================
  const GRAVITY       = 0.8;
  const JUMP_V0       = -16; // spinta iniziale
  const JUMP_HOLD     = 0.5; // spinta addizionale per frame mentre si tiene premuto
  const JUMP_HOLD_TCK = 14;  // ~14 frame ≈ 230 ms di “hang time” extra

  // === Personaggio ridisegnato stile "La Linea" ============================
  const STROKE = 8;   // spessore tratto
  const SCALE  = 1;   // scala del personaggio

  function drawLineaMan(ctx, x, y, time, s = SCALE) {
    const wobble = Math.sin(time * 0.15) * 6; // micro-gestualità del braccio

    ctx.save();
    ctx.lineWidth   = STROKE;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.strokeStyle = FG;

    const h = 120 * s;
    const w = 56  * s;
    const arm = 46 * s;
    const finger = 18 * s;

    ctx.beginPath();

    // Piede a L e gamba sinistra
    ctx.moveTo(x - 10*s, y);
    ctx.lineTo(x - 10*s, y - (h * 0.55));

    // Fianco sinistro che sale fino alla testa
    ctx.quadraticCurveTo(x - 10*s, y - (h*0.80), x + (w*0.05), y - (h*0.90));
    // Sommità della testa (ovale)
    ctx.quadraticCurveTo(x + (w*0.45), y - (h*1.05), x + (w*0.35), y - (h*1.00));

    // Fronte → Naso a becco → rientro
    ctx.quadraticCurveTo(x + (w*0.30), y - (h*0.95), x + (w*0.22), y - (h*0.93));
    ctx.quadraticCurveTo(x + (w*0.42), y - (h*0.90), x + (w*0.46), y - (h*0.84)); // punta naso
    ctx.quadraticCurveTo(x + (w*0.28), y - (h*0.86), x + (w*0.18), y - (h*0.88)); // rientro

    // Spalla/braccio destro
    const armY = y - (h*0.70);
    ctx.lineTo(x + (w*0.05), armY);
    ctx.lineTo(x + (w*0.05) + arm, armY - wobble);

    // Mano a tre dita
    const hx = x + (w*0.05) + arm;
    const hy = armY - wobble;
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + finger, hy - finger*0.35);
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + finger, hy + finger*0.05);
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + finger*0.75, hy + finger*0.45);

    // Fianco destro e ritorno alla baseline
    ctx.moveTo(x + (w*0.02), armY + 6);
    ctx.lineTo(x + (w*0.02), y - (h*0.20));
    ctx.quadraticCurveTo(x + (w*0.02), y - (h*0.08), x - 6*s, y - (h*0.06));
    ctx.lineTo(x - 6*s, y);

    ctx.stroke();

    // Bocca (trattino)
    ctx.beginPath();
    ctx.moveTo(x + (w*0.10), y - (h*0.86));
    ctx.lineTo(x + (w*0.26), y - (h*0.84));
    ctx.stroke();

    ctx.restore();
  }

  // Personaggio (fisica + salto prolungato)
  let inputHeld = false;      // true mentre il dito/space è tenuto premuto
  const guy = {
    x: Math.round(W*0.28),
    y: baseY,
    vy: 0,
    onGround: true,
    holdTicks: 0,            // quanti frame restano di “trattenuta” in aria
    jump() {
      if (!running) return;
      ensureAudio(); // sblocca audio al primo input
      if (this.onGround) {
        this.vy = JUMP_V0;
        this.onGround = false;
        this.holdTicks = JUMP_HOLD_TCK; // ricarica finestra di hold all’avvio del salto
      }
    },
    update() {
      // gravità base
      this.vy += GRAVITY;

      // salto prolungato: mentre si tiene premuto, per un breve periodo
      if (!this.onGround && inputHeld && this.holdTicks > 0 && this.vy < 0) {
        this.vy -= JUMP_HOLD; // riduce la caduta (o aumenta l’ascesa) di un po’
        this.holdTicks--;
      }

      this.y += this.vy;

      // contatto con baseline
      if (this.y > baseY) {
        this.y = baseY;
        this.vy = 0;
        this.onGround = true;
        this.holdTicks = 0; // reset
      }
    },
    draw() {
      drawLineaMan(ctx, this.x, this.y, t);
    }
  };

  // Generatore ostacoli “alla Linea”
  function spawnObstacle() {
    const r = Math.random();
    if (r < 0.5) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      const step = 35 + Math.random()*25;
      obst.push({type:'step', x: W+40, w: 80, h: dir*step});
    } else if (r < 0.8) {
      const h = 30 + Math.random()*40;
      obst.push({type:'bump', x: W+40, w: 120, h});
    } else {
      const w = 90 + Math.random()*90;
      obst.push({type:'gap', x: W+40, w});
    }
  }

  // —— Bonus in aria (valenze variabili) ------------------------------------
  function randomBonusValue() {
    // 70%: +25, 25%: +50, 5%: +100 (rarissimo)
    const r = Math.random();
    if (r < 0.70) return 25;
    if (r < 0.95) return 50;
    return 100;
  }
  function spawnBonus() {
    if (Math.random() < 0.035) {
      const r = 12; // raggio
      const y = baseY - (80 + Math.random()*140); // in aria
      bonuses.push({x: W+60, y, r, v: randomBonusValue()});
    }
  }

  // —— Bonus speciale salvavita disegnato dalla “mano” ----------------------
  function maybeSpawnLifesaver() {
    if (!hand.show || lifesaver) return;
    if (Math.random() < 0.08) {
      lifesaver = { x: hand.x - 20, y: hand.y + 22, r: 14 };
    }
  }

  // Collisioni rispetto alla baseline deformata
  function collide(o, x) {
    if (o.type === 'gap') {
      const inGap = (x > o.x && x < o.x + o.w);
      return inGap && guy.onGround;
    }
    if (o.type === 'step') {
      const inStep = (x > o.x && x < o.x + o.w);
      if (!inStep) return false;
      const local = (x - o.x) / o.w; // 0..1
      const yOffset = o.h * (local < 0.5 ? (local*2) : (1 - (local-0.5)*2));
      return guy.y > baseY + yOffset - 8;
    }
    if (o.type === 'bump') {
      const inB = (x > o.x && x < o.x + o.w);
      if (!inB) return false;
      const local = (x - o.x) / o.w; // 0..1
      const yOffset = -o.h * Math.sin(local*Math.PI);
      return guy.y > baseY + yOffset - 8;
    }
    return false;
  }

  // Disegno baseline, ostacoli, mano, bonus, salvavita
  function drawWorld() {
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = FG;

    ctx.beginPath();
    ctx.moveTo(0, baseY);

    for (const o of obst) {
      if (o.x > W) continue;
      ctx.lineTo(o.x, baseY);

      if (o.type === 'gap') {
        ctx.moveTo(o.x + o.w, baseY);
      } else if (o.type === 'step') {
        const mid = o.x + o.w/2;
        ctx.lineTo(mid, baseY + o.h);
        ctx.lineTo(o.x + o.w, baseY);
      } else if (o.type === 'bump') {
        const s = 16;
        for (let i=0;i<=o.w;i+=s){
          const px = o.x + i;
          const py = baseY - o.h*Math.sin((i/o.w)*Math.PI);
          ctx.lineTo(px, py);
        }
      }
    }
    ctx.lineTo(W, baseY);
    ctx.stroke();

    // mano che disegna
    if (hand.show) {
      ctx.fillStyle = FG;
      ctx.beginPath();
      ctx.arc(hand.x, hand.y, 14, 0, Math.PI*2);
      ctx.fill();
      ctx.fillRect(hand.x-2, hand.y, 4, 60);
    }

    // bonus in aria (cerchio + simbolo '+')
    bonuses.forEach(b => {
      ctx.save();
      ctx.lineWidth = 4;
      ctx.strokeStyle = FG;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(b.x - b.r*0.5, b.y);
      ctx.lineTo(b.x + b.r*0.5, b.y);
      ctx.moveTo(b.x, b.y - b.r*0.5);
      ctx.lineTo(b.x, b.y + b.r*0.5);
      ctx.stroke();
      ctx.restore();
    });

    // salvavita (stellina)
    if (lifesaver) {
      const s = lifesaver;
      ctx.save();
      ctx.lineWidth = 4;
      ctx.strokeStyle = FG;
      ctx.beginPath();
      const spikes = 5, outer = s.r, inner = s.r*0.5;
      let rot = -Math.PI/2, step = Math.PI/spikes;
      ctx.moveTo(s.x + Math.cos(rot)*outer, s.y + Math.sin(rot)*outer);
      for (let i=0;i<spikes;i++){
        rot += step;
        ctx.lineTo(s.x + Math.cos(rot)*inner, s.y + Math.sin(rot)*inner);
        rot += step;
        ctx.lineTo(s.x + Math.cos(rot)*outer, s.y + Math.sin(rot)*outer);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2.5, 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();
    }

    // polvere
    particles.forEach(p=>{
      ctx.globalAlpha = p.a;
      ctx.fillStyle = FG;
      ctx.fillRect(p.x, p.y, 3, 3);
      ctx.globalAlpha = 1;
    });
    particles = particles.filter(p => (p.a -= 0.02) > 0);

    // popup
    popups.forEach(pp => {
      ctx.globalAlpha = pp.a;
      ctx.fillStyle = FG;
      ctx.font = '20px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText(pp.text, pp.x, pp.y);
      ctx.globalAlpha = 1;
    });
  }

  // Loop principale
  function step() {
    if (running) {
      t++;
      score += 1;

      // difficoltà progressiva
      if (t % 600 === 0) speed += 0.3;

      // ostacoli
      if (t % 70 === 0) spawnObstacle();
      obst.forEach(o => o.x -= speed);
      obst = obst.filter(o => o.x + o.w > -20);

      // mano: appare ogni tanto
      if (hand.timer-- <= 0) {
        hand.show = Math.random() < 0.02;
        hand.timer = 180 + (Math.random()*240|0);
        if (hand.show) {
          hand.x = W - 40;
          hand.y = baseY - (120 + Math.random()*80);
        }
      } else if (hand.show) {
        hand.x -= speed*0.8;
        maybeSpawnLifesaver();
      }

      // bonus
      if (t % 50 === 0) spawnBonus();
      bonuses.forEach(b => b.x -= speed);
      bonuses = bonuses.filter(b => {
        // collisione circolare semplice solo se NON a terra (bonus “in aria”)
        const dx = Math.abs(guy.x - b.x);
        const dy = Math.abs((guy.y - 60) - b.y); // offset per "petto"
        const hit = !guy.onGround && Math.hypot(dx, dy) < (b.r + 18);
        if (hit) {
          score += b.v;
          clickSound(1300, 0.045);
          for (let i=0;i<12;i++) particles.push({x:b.x, y:b.y, a:0.9});
          popups.push({text:`+${b.v}`, x:b.x-16, y:b.y-8, a:1});
          return false;
        }
        return b.x > -40;
      });

      // salvavita
      if (lifesaver) {
        lifesaver.x -= speed;
        const dx = Math.abs(guy.x - lifesaver.x);
        const dy = Math.abs((guy.y - 70) - lifesaver.y);
        const take = Math.hypot(dx, dy) < (lifesaver.r + 20);
        if (take) {
          shields += 1;
          clickSound(900, 0.06);
          for (let i=0;i<16;i++) particles.push({x:lifesaver.x, y:lifesaver.y, a:0.95});
          popups.push({text:'SCUDO +1', x:lifesaver.x-40, y:lifesaver.y-10, a:1});
          lifesaver = null;
        } else if (lifesaver.x < -40) {
          lifesaver = null;
        }
      }

      // popup
      popups.forEach(pp => { pp.y -= 0.6; pp.a -= 0.02; });
      popups = popups.filter(pp => pp.a > 0);

      // personaggio
      guy.update();

      // collisioni con ostacoli (usa scudo se presente)
      for (const o of obst) {
        if (collide(o, guy.x)) {
          if (shields > 0) {
            shields -= 1; // consuma scudo e salta automaticamente
            guy.vy = JUMP_V0 * 0.9; // piccolo rimbalzo di salvataggio
            guy.onGround = false;
            guy.holdTicks = Math.max(guy.holdTicks, Math.floor(JUMP_HOLD_TCK*0.6)); // concede un po’ di aria
            clickSound(700, 0.07);
            popups.push({text:'SALVATO', x:guy.x-30, y:guy.y-90, a:1});
            for (let i=0;i<20;i++) particles.push({x:guy.x, y:guy.y-60, a:0.9});
            break; // continua il gioco
          } else {
            running = false; // game over
            break;
          }
        }
      }

      // particelle sulla linea
      if (t % 2 === 0) particles.push({x:guy.x-18+Math.random()*8, y:baseY-2+Math.random()*4, a:0.5});
    }

    // draw
    ctx.clearRect(0,0,W,H);
    // leggero bagliore
    ctx.fillStyle = SHADOW;
    ctx.fillRect(0, baseY-3, W, 6);

    drawWorld();
    guy.draw();

    // HUD overlay
    ctx.fillStyle = FG;
    ctx.font = '20px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText(`PUNTI ${score}`, 18, 30);
    if (shields > 0) {
      ctx.textAlign = 'right';
      ctx.fillText(`★ ${shields}`, W - 18, 30);
      ctx.textAlign = 'start';
    }

    if (!running) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 44px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText('GAME OVER', W/2, H/2 - 10);
      ctx.font = '20px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText('Premi e tieni premuto SPAZIO o tocca per ripartire', W/2, H/2 + 24);
      ctx.textAlign = 'start';
    }

    const el = document.getElementById('score');
    if (el) el.textContent = score.toString();

    requestAnimationFrame(step);
  }

  // === Input (tap/hold & keyboard) =========================================
  function pressDown() {
    inputHeld = true;
    if (!running) return restart();
    guy.jump();
  }
  function pressUp() {
    inputHeld = false; // rilasci: interrompe l’“hang time” se ancora attivo
  }

  function onPress() { // compat legacy (click singolo)
    pressDown();
    // rilascia subito per click
    setTimeout(pressUp, 0);
  }

  function restart() {
    running = true;
    t = 0; score = 0; speed = 4;
    obst.length = 0; particles.length = 0; bonuses.length = 0; popups.length = 0;
    lifesaver = null; shields = 0;
    guy.y = baseY; guy.vy = 0; guy.onGround = true; guy.holdTicks = 0;
  }

  // Tastiera: Space hold
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); ensureAudio(); pressDown(); }
    if (e.code === 'KeyR') restart();
    if (e.code === 'KeyP') togglePause();
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'Space') { e.preventDefault(); pressUp(); }
  });

  // Touch / Mouse sulla zona di gioco
  const touch = document.getElementById('touch');
  touch?.addEventListener('pointerdown', ()=>{ ensureAudio(); pressDown(); });
  touch?.addEventListener('pointerup', pressUp);
  touch?.addEventListener('pointercancel', pressUp);
  touch?.addEventListener('pointerleave', pressUp);

  // Bottoni UI
  document.getElementById('btnJump')?.addEventListener('pointerdown', ()=>{ ensureAudio(); pressDown(); });
  document.getElementById('btnJump')?.addEventListener('pointerup', pressUp);
  document.getElementById('btnRestart')?.addEventListener('click', restart);
  document.getElementById('btnPause')?.addEventListener('click', togglePause);

  function togglePause(){
    running = !running;
    const b = document.getElementById('btnPause');
    if (b) b.textContent = running ? '⏸︎ Pausa' : '▶︎ Riprendi';
    if (running && AC && AC.state === 'suspended') AC.resume();
  }

  // start
  requestAnimationFrame(step);
})();
