/* La Linea — Inline Character v2 (profilo + bocca animata) — MIT 2025 pezzaliAPP */
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
  let hand = { x: W + 120, y: baseY0 - 160, show: false, timer: 0 };

  // Omino integrato (posizione mobile)
  let GUY_X = Math.round(W * 0.28);
  const GUY_W = 104;               // un filo più largo per proporzioni "umane"
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

  // --- Stato espressivo: bocca (0 chiusa .. 1 spalancata) -------------------
  let mouth = 0.25;     // valore attuale
  function lerp(a,b,k){ return a + (b-a)*k; }
  function updateMouth(){
    // target in base alla situazione
    let target = 0.25;                     // corsetta/idle
    if (holdStill && jumpOffset === 0) target = 0.1;            // fermo → chiusa
    if (jumpOffset < 0 || jumpVy < -1)    target = 0.65;        // in volo → aperta
    if (jumpOffset === 0 && Math.abs(jumpVy) > 0 && t%6<3) target = 0.45; // atterra → mezzo
    if (!running) target = 1.0;                                   // game over → spalancata

    mouth = lerp(mouth, target, 0.2); // ammorbidisci
    // piccolo parlottio “grammelot” quando si muove a terra
    if (running && jumpOffset === 0 && (moveLeft || moveRight)) {
      mouth += Math.sin(t*0.4)*0.03;
    }
    mouth = Math.max(0, Math.min(1, mouth));
  }

  // Ostacoli
  function spawnObstacle(){
    const r=Math.random();
    if (r<0.55){
      const dir=Math.random()<0.5?-1:1;
      const step=35+Math.random()*28;
      obst.push({type:'step', x:W+40, w:110, h:dir*step});
    } else if (r<0.9){
      const h=26+Math.random()*40;
      obst.push({type:'bump', x:W+40, w:150, h});
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

  // baseline helper
  function strokeBaseline(x0, x1, step=2){
    ctx.beginPath();
    ctx.lineWidth = STROKE;
    ctx.lineCap   = 'round';
    ctx.lineJoin  = 'round';
    ctx.strokeStyle = FG;

    let penDown = false;
    for (let x=x0; x<=x1; x+=step){
      const y = baselineAt(x);
      if (y == null){ penDown = false; continue; }
      if (!penDown){ ctx.moveTo(x, y); penDown = true; }
      else ctx.lineTo(x, y);
    }
    const y1 = baselineAt(x1);
    if (y1 != null) ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  // === Profilo “umano” stile Cavandoli — path isolato + bocca dinamica ======
  function strokeInlineMan(gx, lift, mouthOpen){
    const start = gx - GUY_W/2, end = gx + GUY_W/2;
    const yL = baselineAt(start), yR = baselineAt(end);
    if (yL == null || yR == null){ running=false; return; }

    // proporzioni più umane
    const s=1, h=126*s, w=60*s, arm=56*s, finger=18*s;
    const belly = 16*s;           // “pancia” arcuata
    const x0 = gx - 6*s;          // offset per modellare testa/naso
    const yTop = (yL + yR)/2 + lift;

    ctx.beginPath();
    ctx.lineWidth = STROKE;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = FG;

    // piede a L (ancoraggio sinistro) + pancia arcuata
    ctx.moveTo(start, yL);
    ctx.lineTo(start, yTop - (h*0.52));                              // gamba sx
    ctx.quadraticCurveTo(start + belly*0.2, yTop - (h*0.78),
                         gx - w*0.25,     yTop - (h*0.85));          // salita morbida
    // sommità testa (ovale allungato)
    ctx.quadraticCurveTo(gx + w*0.20, yTop - (h*1.07),
                         gx + w*0.08,  yTop - (h*0.99));

    // fronte → naso a becco (più pronunciato) → guancia
    ctx.quadraticCurveTo(gx + w*0.04, yTop - (h*0.95),
                         gx - w*0.02, yTop - (h*0.93));
    ctx.quadraticCurveTo(gx + w*0.34, yTop - (h*0.90),   // punta becco
                         gx + w*0.40, yTop - (h*0.84));
    ctx.quadraticCurveTo(gx + w*0.16, yTop - (h*0.86),
                         gx + w*0.04, yTop - (h*0.90));  // rientro guancia

    // spalla/braccio dx (un po' più lungo)
    const armY = yTop - (h*0.70);
    ctx.lineTo(gx - w*0.02, armY);
    ctx.lineTo(gx - w*0.02 + arm, armY - Math.sin(t*0.12)*8);       // micro-gesto

    // dita (3 tratti corti)
    const hx = gx - w*0.02 + arm;
    const hy = armY - Math.sin(t*0.12)*8;
    ctx.moveTo(hx, hy); ctx.lineTo(hx + finger, hy - finger*0.35);
    ctx.moveTo(hx, hy); ctx.lineTo(hx + finger, hy + finger*0.05);
    ctx.moveTo(hx, hy); ctx.lineTo(hx + finger*0.75, hy + finger*0.45);

    // fianco destro e rientro alla baseline destra
    ctx.moveTo(gx - w*0.06, armY + 8);
    ctx.lineTo(gx - w*0.06, yTop - (h*0.18));
    ctx.quadraticCurveTo(gx - w*0.06, yTop - (h*0.06),
                         end - 8*s,   yTop - (h*0.04));
    ctx.lineTo(end - 8*s, yR);
    ctx.stroke();

    // — Bocca dinamica (path separato) —
    // mouthOpen: 0..1 → distanza tra “labbro” superiore/inferiore (stile fessura)
    const gap = 2 + mouthOpen * 8; // apertura in px
    const mx1 = gx - w*0.02, my = yTop - (h*0.865);
    ctx.beginPath();
    // labbro superiore
    ctx.moveTo(mx1 - 12, my - gap*0.5);
    ctx.lineTo(mx1 + 12, my - gap*0.5);
    // labbro inferiore
    ctx.moveTo(mx1 - 10, my + gap*0.5);
    ctx.lineTo(mx1 + 10, my + gap*0.5);
    ctx.lineWidth = STROKE;
    ctx.strokeStyle = FG;
    ctx.stroke();
  }

  // === Loop =================================================================
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
        GUY_X = Math.max(GUY_MIN_X, Math.min(GUY_MAX_X, GUY_X + dir*MOVE_SPEED));
      }

      updateJump();
      updateMouth();

      // se un gap attraversa la porzione dell’omino → game over
      for (let x=GUY_X-GUY_W/2+2; x<=GUY_X+GUY_W/2-2; x+=2){
        if (baselineAt(x) == null){ running = false; break; }
      }
    }

    // DRAW
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = SHADOW;
    const yMid = baselineAt(Math.floor(W*.6)) ?? baseY0;
    ctx.fillRect(0, yMid-3, W, 6);

    // baseline e omino (path separati → nessuna “linea appesa”)
    const L = GUY_X - GUY_W/2, R = GUY_X + GUY_W/2;
    strokeBaseline(0, Math.max(0, L));
    strokeInlineMan(GUY_X, jumpOffset, mouth);
    strokeBaseline(R, W);

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
    obst.length=0;
    jumpVy=0; jumpOffset=0; holdTicks=0; inputHeldJump=false;
    mouth = 0.25;
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
