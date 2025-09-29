/* La Linea — Inline Character — smooth baseline + path isolation — MIT 2025 pezzaliAPP */
(() => {
  'use strict';

  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  const W = cvs.width, H = cvs.height;

  // Colori
  const FG = '#ffffff';
  const SHADOW = 'rgba(255,255,255,.08)';

  // Stato
  let running = true, t = 0, score = 0;
  let baseY0 = Math.round(H * 0.72);
  let speed = 4;
  let obst = [];
  let particles = [];
  let hand = { x: W + 120, y: baseY0 - 160, show: false, timer: 0 };

  // Omino integrato (posizione mobile)
  let GUY_X = Math.round(W * 0.28);
  const GUY_W = 96;
  const STROKE = 8;
  const GUY_MIN_X = 40;
  const GUY_MAX_X = W - 40;

  // Salto come deformazione locale
  const GRAV = 0.8, JUMP_V0 = -16, HOLD_ACC = 0.5, HOLD_TCK = 14;
  let inputHeldJump = false, holdTicks = 0, jumpVy = 0, jumpOffset = 0;

  function startJump(){ if (!running) return; if (jumpOffset === 0){ jumpVy = JUMP_V0; holdTicks = HOLD_TCK; } }
  function updateJump(){
    if (jumpOffset !== 0 || jumpVy !== 0){
      if (inputHeldJump && holdTicks > 0 && jumpVy < 0){ jumpVy -= HOLD_ACC; holdTicks--; }
      jumpVy += GRAV; jumpOffset += jumpVy;
      if (jumpOffset > 0) jumpOffset = 0;
      if (jumpOffset >= 0 && jumpVy > 0){ jumpOffset = 0; jumpVy = 0; holdTicks = 0; }
    }
  }

  // Movimento orizzontale
  let moveLeft=false, moveRight=false, holdStill=false;
  const MOVE_SPEED = 5;

  // Ostacoli
  function spawnObstacle(){
    const r=Math.random();
    if (r<0.55){
      const dir=Math.random()<0.5?-1:1;
      const step=35+Math.random()*28;
      obst.push({type:'step', x:W+40, w:100, h:dir*step});
    } else if (r<0.9){
      const h=26+Math.random()*40;
      obst.push({type:'bump', x:W+40, w:140, h});
    } else {
      const w=80+Math.random()*80;
      obst.push({type:'gap', x:W+40, w});
    }
  }

  // Baseline locale
  function baselineAt(x){
    let y = baseY0;
    for (const o of obst){
      const L=o.x, R=o.x+o.w;
      if (x<L || x>R) continue;
      if (o.type==='gap') return null;
      if (o.type==='step'){
        const u=(x-L)/o.w, tri = u<.5 ? u*2 : (1-(u-.5)*2);
        y = baseY0 + o.h*tri;
      } else if (o.type==='bump'){
        const u=(x-L)/o.w;
        y = baseY0 - o.h*Math.sin(u*Math.PI);
      }
    }
    return y;
  }

  // === Rendering helpers ====================================================

  // baseline in [x0,x1] con campionamento fine e spezzatura ai gap
  function strokeBaseline(x0, x1, step=2){
    ctx.beginPath();
    ctx.lineWidth = STROKE;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = FG;

    let penDown = false;
    for (let x=x0; x<=x1; x+=step){
      const y = baselineAt(x);
      if (y == null){ penDown = false; continue; }
      if (!penDown){ ctx.moveTo(x, y); penDown = true; }
      else ctx.lineTo(x, y);
    }
    // ultimo punto preciso a x1
    const y1 = baselineAt(x1);
    if (y1 != null) ctx.lineTo(x1, y1);

    ctx.stroke();
  }

  // profilo dell’omino come path totalmente isolato (nessun “filo” possibile)
  function strokeInlineMan(gx, lift){
    const start = gx - GUY_W/2, end = gx + GUY_W/2;
    const yL = baselineAt(start), yR = baselineAt(end);
    if (yL == null || yR == null){ running=false; return; }

    const s=1, h=120*s, w=56*s, arm=46*s;
    const x0 = gx - 10*s;
    const yTop = (yL + yR)/2 + lift;

    ctx.beginPath();
    ctx.lineWidth = STROKE;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = FG;

    // collegamenti rigorosi ai bordi baseline
    ctx.moveTo(start, yL);                      // attacco sinistro
    ctx.lineTo(start, yTop-(h*.55));            // gamba

    // testa
    ctx.quadraticCurveTo(start, yTop-(h*.80), x0+(w*.05), yTop-(h*.90));
    ctx.quadraticCurveTo(x0+(w*.45), yTop-(h*1.05), x0+(w*.35), yTop-(h*1.00));

    // naso
    ctx.quadraticCurveTo(x0+(w*.30), yTop-(h*.95), x0+(w*.22), yTop-(h*.93));
    ctx.quadraticCurveTo(x0+(w*.42), yTop-(h*.90), x0+(w*.46), yTop-(h*.84));
    ctx.quadraticCurveTo(x0+(w*.28), yTop-(h*.86), x0+(w*.18), yTop-(h*.88));

    // braccio
    const armY = yTop-(h*.70);
    ctx.lineTo(x0+(w*.05), armY);
    ctx.lineTo(x0+(w*.05)+arm, armY);

    // rientro e attacco destro
    ctx.moveTo(x0+(w*.02), armY+6);
    ctx.lineTo(x0+(w*.02), yTop-(h*.20));
    ctx.quadraticCurveTo(x0+(w*.02), yTop-(h*.08), end-8*s, yTop-(h*.06));
    ctx.lineTo(end-8*s, yR);                    // attacco destro esatto

    ctx.stroke();

    // bocca: micro-path separato (evita fili)
    ctx.beginPath();
    ctx.moveTo(x0+(w*.10), yTop-(h*.86));
    ctx.lineTo(x0+(w*.26), yTop-(h*.84));
    ctx.lineWidth = STROKE;
    ctx.strokeStyle = FG;
    ctx.stroke();
  }

  // === Loop di gioco ========================================================
  function tick(){
    if (running){
      t++; score++;

      if (t%600===0) speed += .25;
      if (t%75===0) spawnObstacle();

      obst.forEach(o => o.x -= speed);
      obst = obst.filter(o => o.x + o.w > -40);

      if (hand.timer-- <= 0){
        hand.show = Math.random() < .02;
        hand.timer = 180 + (Math.random()*240|0);
        if (hand.show){ hand.x = W-40; hand.y = baseY0 - (120 + Math.random()*80); }
      } else if (hand.show){
        hand.x -= speed*.8;
      }

      if (!holdStill){
        const dir = (moveRight?1:0) - (moveLeft?1:0);
        GUY_X = Math.max(GUY_MIN_X, Math.min(GUY_MAX_X, GUY_X + dir*5));
      }

      updateJump();

      // se un gap attraversa la porzione dell’omino → game over
      for (let x=GUY_X-GUY_W/2+2; x<=GUY_X+GUY_W/2-2; x+=2){
        if (baselineAt(x) == null){ running = false; break; }
      }

      // polvere
      if (t%2===0) particles.push({
        x: GUY_X-20+Math.random()*8,
        y: (baselineAt(GUY_X) ?? baseY0)-2+Math.random()*4,
        a: .5
      });
      particles = particles.filter(p => (p.a -= .02) > 0);
    }

    // DRAW
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = SHADOW;
    const yMid = baselineAt(Math.floor(W*.6)) ?? baseY0;
    ctx.fillRect(0, yMid-3, W, 6);

    // baseline sinistra, omino, baseline destra — ognuno in PATH dedicato
    const L = GUY_X - GUY_W/2, R = GUY_X + GUY_W/2;
    strokeBaseline(0, Math.max(0, L));        // 1) fino a prima dell’omino
    strokeInlineMan(GUY_X, jumpOffset);       // 2) profilo integrato
    strokeBaseline(R, W);                     // 3) dopo l’omino

    // mano scenica
    if (hand.show){
      ctx.fillStyle = FG;
      ctx.beginPath(); ctx.arc(hand.x, hand.y, 14, 0, Math.PI*2); ctx.fill();
      ctx.fillRect(hand.x-2, hand.y, 4, 60);
    }

    // HUD
    ctx.fillStyle = FG;
    ctx.font = '20px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText(`PUNTI ${score}`, 18, 30);

    if (!running){
      ctx.textAlign='center';
      ctx.font='bold 44px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText('GAME OVER', W/2, H/2-10);
      ctx.font='20px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText('Tocca/Space per ripartire', W/2, H/2+24);
      ctx.textAlign='start';
    }

    requestAnimationFrame(tick);
  }

  // ===== Input =====
  function pressDownJump(){ inputHeldJump = true; if(!running) return restart(); startJump(); }
  function releaseJump(){ inputHeldJump = false; }
  function restart(){
    running=true; t=0; score=0; speed=4;
    obst.length=0; particles.length=0;
    jumpVy=0; jumpOffset=0; holdTicks=0; inputHeldJump=false;
  }
  function togglePause(){
    running=!running;
    const b=document.getElementById('btnPause');
    if (b) b.textContent = running ? '⏸︎ Pausa' : '▶︎ Riprendi';
  }

  // Tastiera
  window.addEventListener('keydown', e=>{
    if(e.code==='Space'){ e.preventDefault(); pressDownJump(); }
    if(e.code==='ArrowLeft')  moveLeft=true;
    if(e.code==='ArrowRight') moveRight=true;
    if(e.code==='ArrowDown')  holdStill=true;
    if(e.code==='KeyR') restart();
    if(e.code==='KeyP') togglePause();
  });
  window.addEventListener('keyup', e=>{
    if(e.code==='Space'){ e.preventDefault(); releaseJump(); }
    if(e.code==='ArrowLeft')  moveLeft=false;
    if(e.code==='ArrowRight') moveRight=false;
    if(e.code==='ArrowDown')  holdStill=false;
  });

  // Touch (3 zone: sinistra=←, centro=salto, destra=→) + fallback iOS
  const touchArea = document.getElementById('touch') || cvs;
  function localX(evt){
    const r = touchArea.getBoundingClientRect();
    const scaleX = cvs.width / r.width;
    return (evt.clientX - r.left) * scaleX;
  }
  function zoneFor(x){ if(x < W/3) return 'left'; if(x > 2*W/3) return 'right'; return 'center'; }

  function pointerDown(e){
    const zone = zoneFor(localX(e));
    if (e.isPrimary === false) holdStill = true; // multi-touch ⇒ fermo
    if (zone==='left')  moveLeft=true;
    if (zone==='right') moveRight=true;
    if (zone==='center') pressDownJump();
  }
  function pointerUp(){ moveLeft=moveRight=holdStill=false; releaseJump(); }

  if (window.PointerEvent){
    touchArea.addEventListener('pointerdown', pointerDown);
    ['pointerup','pointercancel','pointerleave'].forEach(ev=>touchArea.addEventListener(ev, pointerUp));
  }
  // fallback iOS
  if ('ontouchstart' in window){
    touchArea.addEventListener('touchstart', e=>{
      const t=e.changedTouches[0];
      const r=touchArea.getBoundingClientRect();
      const x=(t.clientX-r.left)*(cvs.width/r.width);
      const zone=zoneFor(x);
      if (e.touches.length>1) holdStill=true;
      if (zone==='left')  moveLeft=true;
      if (zone==='right') moveRight=true;
      if (zone==='center') pressDownJump();
      e.preventDefault();
    }, {passive:false});
    touchArea.addEventListener('touchend', ()=>{ pointerUp(); }, {passive:false});
    touchArea.addEventListener('touchcancel', ()=>{ pointerUp(); }, {passive:false});
  }

  // Bottoni UI
  document.getElementById('btnJump')?.addEventListener('pointerdown', pressDownJump);
  document.getElementById('btnJump')?.addEventListener('pointerup',   releaseJump);
  document.getElementById('btnRestart')?.addEventListener('click', restart);
  document.getElementById('btnPause')?.addEventListener('click', togglePause);

  // Start
  requestAnimationFrame(tick);
})();
