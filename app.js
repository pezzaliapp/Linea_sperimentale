/* La Linea — Inline Character v3
   - Gap superabili con salto
   - Gap limitati
   - Mano che disegna ponti temporanei
   - Profilo umanizzato + bocca animata
   MIT 2025 pezzaliAPP
*/
(() => {
  'use strict';

  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  const W = cvs.width, H = cvs.height;

  // Colori
  const FG = '#ffffff';
  const SHADOW = 'rgba(255,255,255,.08)';

  // Stato base
  let running = true, t = 0, score = 0;
  let baseY0 = Math.round(H * 0.72);
  let speed = 4;

  // Ostacoli & “ponti”
  let obst = [];                    // step/bump/gap
  let bridges = [];                 // ponti temporanei {x,w,ttl}
  const BRIDGE_TTL = 120;           // ~2s @ 60fps

  // Mano scenica (può disegnare un ponte)
  let hand = { x: W + 120, y: baseY0 - 160, show: false, timer: 0, drawing: false };

  // 🔒 Zona sicura iniziale
  let safeFrames = 120;             // ~2s: niente spawn gap, no game over su gap

  // Omino integrato (mobile)
  let GUY_X = Math.round(W * 0.28);
  const GUY_W = 104;
  const STROKE = 8;
  const GUY_MIN_X = 40;
  const GUY_MAX_X = W - 40;

  // Salto (deformazione locale)
  const GRAV = 0.8, JUMP_V0 = -16, HOLD_ACC = 0.5, HOLD_TCK = 14;
  let inputHeldJump = false, holdTicks = 0, jumpVy = 0, jumpOffset = 0; // jumpOffset<0 = in aria

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

  // Bocca dinamica (0 chiusa .. 1 spalancata)
  let mouth = 0.25;
  const lerp = (a,b,k)=> a+(b-a)*k;
  function updateMouth(){
    let target = 0.25;
    if (holdStill && jumpOffset === 0) target = 0.1;
    if (jumpOffset < 0 || jumpVy < -1) target = 0.65;
    if (jumpOffset === 0 && Math.abs(jumpVy) > 0 && t%6<3) target = 0.45;
    if (!running) target = 1.0;
    mouth = lerp(mouth, target, 0.2);
    if (running && jumpOffset === 0 && (moveLeft || moveRight)) mouth += Math.sin(t*0.4)*0.03;
    mouth = Math.max(0, Math.min(1, mouth));
  }

  // === Ostacoli =============================================================

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
      // GAP con larghezza limitata ⇒ superabile col salto prolungato
      const w=70+Math.random()*50; // max ≈ 120px
      obst.push({type:'gap', x:W+40, w});
    }
  }

  // Baseline “pura” (senza ponti)
  function baselineAtRaw(x){
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

  // Baseline con ponti e “safe start”
  function baselineAt(x){
    // se c'è un ponte, la linea è continua alla quota base
    for (const b of bridges){
      if (x >= b.x && x <= b.x + b.w) return baseY0;
    }
    const y = baselineAtRaw(x);
    if (y == null && safeFrames > 0) return baseY0; // in avvio “pontiamo” virtualmente
    return y;
  }

  // === Rendering baseline (liscia, spezza solo ai gap veri) =================
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

  // === Profilo “umano” stile Cavandoli — path isolato + bocca dinamica =====
  function strokeInlineMan(gx, lift, mouthOpen){
    const start = gx - GUY_W/2, end = gx + GUY_W/2;
    const yL = baselineAt(start), yR = baselineAt(end);
    if (yL == null || yR == null){ running=false; return; }

    const s=1, h=126*s, w=60*s, arm=56*s, finger=18*s;
    const belly = 16*s;
    const x0 = gx - 6*s;
    const yTop = (yL + yR)/2 + lift;

    ctx.beginPath();
    ctx.lineWidth = STROKE;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = FG;

    // piede + pancia
    ctx.moveTo(start, yL);
    ctx.lineTo(start, yTop - (h*0.52));
    ctx.quadraticCurveTo(start + belly*0.2, yTop - (h*0.78), gx - w*0.25, yTop - (h*0.85));
    // sommità
    ctx.quadraticCurveTo(gx + w*0.20, yTop - (h*1.07), gx + w*0.08,  yTop - (h*0.99));
    // naso
    ctx.quadraticCurveTo(gx + w*0.04, yTop - (h*0.95), gx - w*0.02, yTop - (h*0.93));
    ctx.quadraticCurveTo(gx + w*0.34, yTop - (h*0.90), gx + w*0.40, yTop - (h*0.84));
    ctx.quadraticCurveTo(gx + w*0.16, yTop - (h*0.86), gx + w*0.04, yTop - (h*0.90));
    // spalla/braccio
    const armY = yTop - (h*0.70);
    ctx.lineTo(gx - w*0.02, armY);
    ctx.lineTo(gx - w*0.02 + arm, armY - Math.sin(t*0.12)*8);
    // dita
    const hx = gx - w*0.02 + arm;
    const hy = armY - Math.sin(t*0.12)*8;
    ctx.moveTo(hx, hy); ctx.lineTo(hx + finger, hy - finger*0.35);
    ctx.moveTo(hx, hy); ctx.lineTo(hx + finger, hy + finger*0.05);
    ctx.moveTo(hx, hy); ctx.lineTo(hx + finger*0.75, hy + finger*0.45);
    // fianco dx + aggancio
    ctx.moveTo(gx - w*0.06, armY + 8);
    ctx.lineTo(gx - w*0.06, yTop - (h*0.18));
    ctx.quadraticCurveTo(gx - w*0.06, yTop - (h*0.06), start + GUY_W - 8*s, yTop - (h*0.04));
    ctx.lineTo(start + GUY_W - 8*s, yR);
    ctx.stroke();

    // bocca (path separato)
    const gap = 2 + mouthOpen * 8;
    const mx1 = gx - w*0.02, my = yTop - (h*0.865);
    ctx.beginPath();
    ctx.moveTo(mx1 - 12, my - gap*0.5);
    ctx.lineTo(mx1 + 12, my - gap*0.5);
    ctx.moveTo(mx1 - 10, my + gap*0.5);
    ctx.lineTo(mx1 + 10, my + gap*0.5);
    ctx.lineWidth = STROKE;
    ctx.strokeStyle = FG;
    ctx.stroke();
  }

  // === Mano che disegna un ponte ===========================================
  // Cerca un gap vicino all’omino e crea un ponte (con TTL) sopra quel gap
  function maybeBridgeNearbyGap(){
    // cerca il gap più vicino davanti a GUY_X (entro 240px)
    let target = null, bestDist = 99999;
    for (const o of obst){
      if (o.type !== 'gap') continue;
      const dist = o.x - GUY_X;
      if (dist >= -40 && dist < 240 && dist < bestDist){ target = o; bestDist = dist; }
    }
    if (!target) return false;

    // crea ponte se non già presente
    const already = bridges.some(b => !(b.x + b.w < target.x || b.x > target.x + target.w));
    if (already) return false;

    bridges.push({ x: target.x, w: target.w, ttl: BRIDGE_TTL });
    // animazione mano in posizione ponte
    hand.show = true; hand.drawing = true;
    hand.x = target.x + target.w + 10;
    hand.y = baseY0 - 90;
    return true;
  }

  // === LOOP =================================================================
  function tick(){
    if (running){
      t++; score++;
      if (safeFrames > 0) safeFrames--;

      // spawn ostacoli solo dopo zona sicura
      if (safeFrames <= 0 && t%75===0) spawnObstacle();

      // scorrimento
      obst.forEach(o => o.x -= speed);
      bridges.forEach(b => { b.x -= speed; b.ttl--; });
      obst = obst.filter(o => o.x + o.w > -40);
      bridges = bridges.filter(b => (b.x + b.w > -40) && b.ttl > 0);

      // difficoltà
      if (t%600===0) speed += .25;

      // mano: a volte disegna un ponte vicino
      if (hand.timer-- <= 0){
        hand.show = Math.random() < .03;
        hand.timer = 180 + (Math.random()*240|0);
        if (hand.show){
          if (!maybeBridgeNearbyGap()){
            // se non c'era gap, mano scenica
            hand.drawing = false;
            hand.x = W-40; hand.y = baseY0 - (120 + Math.random()*80);
          }
        }
      } else if (hand.show){
        hand.x -= speed*.8;
        if (hand.x < -40) { hand.show = false; hand.drawing = false; }
      }

      // movimento orizzontale
      if (!holdStill){
        const dir = (moveRight?1:0) - (moveLeft?1:0);
        GUY_X = Math.max(GUY_MIN_X, Math.min(GUY_MAX_X, GUY_X + dir*MOVE_SPEED));
      }

      updateJump();
      updateMouth();

      // GAME OVER su gap: SOLO quando siamo A TERRA dentro un gap reale (no ponti)
      if (safeFrames <= 0){
        const gs = GUY_X - GUY_W/2 + 2, ge = GUY_X + GUY_W/2 - 2;
        let onRealGap = false;
        for (let x = gs; x <= ge; x += 2){
          const isGapRaw = (baselineAtRaw(x) == null);            // vero buco
          const isBridged = bridges.some(b => x >= b.x && x <= b.x + b.w);
          if (isGapRaw && !isBridged){ onRealGap = true; break; }
        }
        if (onRealGap && jumpOffset === 0) running = false;       // a terra nel buco ⇒ KO
      }
    }

    // DRAW
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = SHADOW;
    const yMid = baselineAt(Math.floor(W*.6)) ?? baseY0;
    ctx.fillRect(0, yMid-3, W, 6);

    // baseline e omino
    const L = GUY_X - GUY_W/2, R = GUY_X + GUY_W/2;
    strokeBaseline(0, Math.max(0, L));
    strokeInlineMan(GUY_X, jumpOffset, mouth);
    strokeBaseline(R, W);

    // mano
    if (hand.show){
      ctx.fillStyle = FG;
      ctx.beginPath(); ctx.arc(hand.x, hand.y, 14, 0, Math.PI*2); ctx.fill();
      ctx.fillRect(hand.x-2, hand.y, 4, 60);
      if (hand.drawing){
        // piccolo tratteggio sopra il ponte
        ctx.fillRect(hand.x-8, baseY0-2, 16, 4);
      }
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

  // ===== Input ==============================================================
  function pressDownJump(){ inputHeldJump = true; if(!running) return restart(); startJump(); }
  function releaseJump(){ inputHeldJump = false; }
  function restart(){
    running=true; t=0; score=0; speed=4;
    obst.length=0; bridges.length=0;
    jumpVy=0; jumpOffset=0; holdTicks=0; inputHeldJump=false;
    mouth=0.25; safeFrames=120;
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
    if (e.isPrimary === false) holdStill = true;
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
    ['touchend','touchcancel'].forEach(ev=> touchArea.addEventListener(ev, ()=>{ pointerUp(); }, {passive:false}));
  }

  // Bottoni UI
  document.getElementById('btnJump')?.addEventListener('pointerdown', pressDownJump);
  document.getElementById('btnJump')?.addEventListener('pointerup',   releaseJump);
  document.getElementById('btnRestart')?.addEventListener('click', restart);
  document.getElementById('btnPause')?.addEventListener('click', togglePause);

  // Start
  requestAnimationFrame(tick);
})();
