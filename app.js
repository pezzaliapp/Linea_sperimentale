/* La Linea — Inline Character v8 (mobile controls)
   - Gap superabili col salto (linea continua in aria)
   - Game Over solo a terra su gap reale non pontato
   - Mano che disegna ponti (TTL) con inchiostro limitato + ricarica automatica
   - Bonus in aria (+10/+50/+100) con hitbox ellittica migliorata
   - Profilo umanizzato + bocca animata, braccia alzate su bonus
   - Effetto pellicola (flicker/grana), HUD, pausa, restart, input tastiera + touch
   - NEW: barra comandi visibile su mobile (← SALTA →)
   MIT 2025 pezzaliAPP
*/
(() => {
  'use strict';

  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  const W = cvs.width, H = cvs.height;

  // Colori (B/N)
  const FG = '#ffffff';
  const SHADOW = 'rgba(255,255,255,.08)';

  // Stato base
  let running = true, t = 0, score = 0;
  let baseY0 = Math.round(H * 0.72);
  let speed = 4;

  // Ostacoli & ponti
  let obst = [];
  let bridges = [];
  const BRIDGE_TTL = 120; // ~2s @60fps

  // Inchiostro (ponti) + ricarica
  const inkMax = 3;
  let ink = inkMax;
  const INK_RECHARGE_FRAMES = 1800; // ~30s
  let inkRechargeCounter = INK_RECHARGE_FRAMES;

  // Mano
  let hand = { x: W + 120, y: baseY0 - 160, show: false, timer: 0, drawing: false };

  // Zona sicura iniziale
  let safeFrames = 120;

  // Omino integrato
  let GUY_X = Math.round(W * 0.28);
  const GUY_W = 104;
  const STROKE = 8;
  const GUY_MIN_X = 40;
  const GUY_MAX_X = W - 40;

  // Salto (prolungabile)
  const GRAV = 0.8, JUMP_V0 = -16, HOLD_ACC = 0.5, HOLD_TCK = 14;
  let inputHeldJump = false, holdTicks = 0, jumpVy = 0, jumpOffset = 0; // <0 = in aria

  function startJump(){ if (!running) return; if (jumpOffset === 0){ jumpVy = JUMP_V0; holdTicks = HOLD_TCK; } }
  function updateJump(){
    if (jumpOffset !== 0 || jumpVy !== 0){
      if (inputHeldJump && holdTicks > 0 && jumpVy < 0){ jumpVy -= HOLD_ACC; holdTicks--; }
      jumpVy += GRAV; jumpOffset += jumpVy;
      if (jumpOffset > 0) jumpOffset = 0;
      if (jumpOffset >= 0 && jumpVy > 0){ jumpOffset = 0; jumpVy = 0; holdTicks = 0; }
    }
  }

  // Movimento
  let moveLeft=false, moveRight=false, holdStill=false;
  const MOVE_SPEED = 5;

  // Bocca + braccia
  let mouth = 0.25;
  let armRaiseTimer = 0;
  const lerp = (a,b,k)=> a+(b-a)*k;
  function updateMouth(){
    let target = 0.25;
    if (holdStill && jumpOffset === 0) target = 0.1;
    if (jumpOffset < 0 || jumpVy < -1) target = 0.65;
    if (armRaiseTimer > 0) target = 0.8;
    if (jumpOffset === 0 && Math.abs(jumpVy) > 0 && t%6<3) target = 0.45;
    if (!running) target = 1.0;
    mouth = lerp(mouth, target, 0.2);
    if (running && jumpOffset === 0 && (moveLeft || moveRight)) mouth += Math.sin(t*0.4)*0.03;
    mouth = Math.max(0, Math.min(1, mouth));
    if (armRaiseTimer>0) armRaiseTimer--;
  }

  // Audio click
  let audioCtx = null;
  function clickSound(freq=1000, dur=0.06, gain=0.12){
    try{
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      g.gain.setValueAtTime(gain, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }catch(_){}
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
      const w=70+Math.random()*50; // 70..120
      obst.push({type:'gap', x:W+40, w});
    }
  }

  // Baseline pura
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

  // Baseline con ponti + continuità in salto + safe start
  function baselineAt(x){
    for (const b of bridges){
      if (x >= b.x && x <= b.x + b.w) return baseY0;
    }
    let y = baselineAtRaw(x);
    if (y == null && jumpOffset < 0) return baseY0; // linea continua in aria
    if (y == null && safeFrames > 0) return baseY0; // inizio sicuro
    return y;
  }

  // Disegno baseline
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

  // === Bonus ================================================================
  let bonuses = []; // {x,y,val,ttl}
  function spawnBonus(){
    if (safeFrames>0) return;
    if (Math.random() < 0.25){
      const r = Math.random();
      let val = 10;
      if (r > 0.85) val = 50;
      if (r > 0.97) val = 100; // rarissimo
      const y = baseY0 - (80 + Math.random()*120);
      bonuses.push({ x: W + 20, y, val, ttl: 600 });
    }
  }

  function drawBonus(b){
    ctx.lineWidth = STROKE;
    ctx.strokeStyle = FG;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 12, 0, Math.PI*2);
    ctx.stroke();
    ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = FG;
    ctx.textAlign='center';
    ctx.fillText('+'+b.val, b.x, b.y - 16);
    ctx.textAlign='start';
  }

  // 👤 Posizione testa (per pickup bonus)
  function headPos(){
    const yL = (baselineAt(GUY_X - GUY_W/2) ?? baseY0);
    const yR = (baselineAt(GUY_X + GUY_W/2) ?? baseY0);
    const yBase = (yL + yR) / 2;
    const x = GUY_X;
    const y = yBase + jumpOffset - 100; // ~altezza testa
    return {x,y};
  }

  function tryCollectBonus(){
    const {x: hx, y: hy} = headPos();
    const RX = 34, RY = 42; // ellisse comoda per la corsa
    for (let i=bonuses.length-1;i>=0;i--){
      const b = bonuses[i];
      const dx = b.x - hx, dy = b.y - hy;
      const inside = (dx*dx)/(RX*RX) + (dy*dy)/(RY*RY) <= 1;
      if (inside){
        score += b.val;
        armRaiseTimer = 28;
        const freq = b.val >= 100 ? 1600 : (b.val >= 50 ? 1450 : 1300);
        clickSound(freq, 0.06, 0.10);
        bonuses.splice(i,1);
      }
    }
  }

  // === Omino integrato ======================================================
  function strokeInlineMan(gx, lift, mouthOpen){
    const start = gx - GUY_W/2, end = gx + GUY_W/2;
    const yL = baselineAt(start) ?? baseY0;
    const yR = baselineAt(end)   ?? baseY0;

    const s=1, h=126*s, w=60*s, arm=56*s, finger=18*s;
    const belly = 16*s;
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

    // braccio + dita (alzato su bonus)
    const armRaise = armRaiseTimer>0 ? 26 : 0;
    const armY = yTop - (h*0.70) - armRaise;
    ctx.lineTo(gx - w*0.02, armY);
    ctx.lineTo(gx - w*0.02 + arm, armY - Math.sin(t*0.12)*8 - armRaise*0.3);
    const hx = gx - w*0.02 + arm;
    const hy = armY - Math.sin(t*0.12)*8 - armRaise*0.3;
    ctx.moveTo(hx, hy); ctx.lineTo(hx + finger, hy - finger*0.35);
    ctx.moveTo(hx, hy); ctx.lineTo(hx + finger, hy + finger*0.05);
    ctx.moveTo(hx, hy); ctx.lineTo(hx + finger*0.75, hy + finger*0.45);

    // fianco dx + aggancio
    ctx.moveTo(gx - w*0.06, armY + 8 + armRaise*0.2);
    ctx.lineTo(gx - w*0.06, yTop - (h*0.18));
    ctx.quadraticCurveTo(gx - w*0.06, yTop - (h*0.06), start + GUY_W - 8*s, yTop - (h*0.04));
    ctx.lineTo(start + GUY_W - 8*s, yR);
    ctx.stroke();

    // bocca (apertura dinamica)
    const mgap = 2 + mouthOpen * 8;
    const mx1 = gx - w*0.02, my = yTop - (h*0.865);
    ctx.beginPath();
    ctx.moveTo(mx1 - 12, my - mgap*0.5);
    ctx.lineTo(mx1 + 12, my - mgap*0.5);
    ctx.moveTo(mx1 - 10, my + mgap*0.5);
    ctx.lineTo(mx1 + 10, my + mgap*0.5);
    ctx.lineWidth = STROKE;
    ctx.strokeStyle = FG;
    ctx.stroke();
  }

  // === Mano / ponte =========================================================
  function maybeBridgeNearbyGap(){
    if (ink <= 0) return false;
    let target = null, bestDist = 99999;
    for (const o of obst){
      if (o.type !== 'gap') continue;
      const dist = o.x - GUY_X;
      if (dist >= -40 && dist < 240 && dist < bestDist){ target = o; bestDist = dist; }
    }
    if (!target) return false;
    const already = bridges.some(b => !(b.x + b.w < target.x || b.x > target.x + target.w));
    if (already) return false;

    bridges.push({ x: target.x, w: target.w, ttl: BRIDGE_TTL });
    ink = Math.max(0, ink - 1);
    hand.show = true; hand.drawing = true;
    hand.x = target.x + target.w + 10;
    hand.y = baseY0 - 90;
    clickSound(1000, 0.06, 0.12);
    return true;
  }

  // Effetto pellicola
  function filmFlicker(){
    ctx.save();
    ctx.globalAlpha = 0.04 + Math.random()*0.05;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,0,W,H);
    ctx.restore();
    if (Math.random() < 0.12){
      const x = (Math.random()*W)|0;
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, 0, 1, H);
      ctx.restore();
    }
  }

  // === LOOP =================================================================
  function tick(){
    if (running){
      t++; score++;
      if (safeFrames > 0) safeFrames--;

      // spawn
      if (safeFrames <= 0 && t%75===0) spawnObstacle();
      if (t%90===0) spawnBonus();

      // scorrimento
      obst.forEach(o => o.x -= speed);
      bridges.forEach(b => { b.x -= speed; b.ttl--; });
      bonuses.forEach(b => { b.x -= speed; b.ttl--; });

      obst     = obst.filter(o => o.x + o.w > -40);
      bridges  = bridges.filter(b => (b.x + b.w > -40) && b.ttl > 0);
      bonuses  = bonuses.filter(b => b.x > -30 && b.ttl > 0);

      // difficoltà
      if (t%600===0) speed += .25;

      // ricarica inchiostro
      if (ink < inkMax){
        if (--inkRechargeCounter <= 0){
          ink = Math.min(inkMax, ink + 1);
          inkRechargeCounter = INK_RECHARGE_FRAMES;
        }
      } else {
        inkRechargeCounter = INK_RECHARGE_FRAMES;
      }

      // mano
      if (hand.timer-- <= 0){
        hand.show = Math.random() < .03;
        hand.timer = 180 + (Math.random()*240|0);
        if (hand.show){
          if (!maybeBridgeNearbyGap()){
            hand.drawing = false;
            hand.x = W-40; hand.y = baseY0 - (120 + Math.random()*80);
          }
        }
      } else if (hand.show){
        hand.x -= speed*.8;
        if (hand.x < -40) { hand.show = false; hand.drawing = false; }
      }

      // movimento
      if (!holdStill){
        const dir = (moveRight?1:0) - (moveLeft?1:0);
        GUY_X = Math.max(GUY_MIN_X, Math.min(GUY_MAX_X, GUY_X + dir*MOVE_SPEED));
      }

      updateJump();
      updateMouth();
      tryCollectBonus();

      // GAME OVER (solo a terra nel gap reale non pontato)
      if (safeFrames <= 0){
        const gs = GUY_X - GUY_W/2 + 2, ge = GUY_X + GUY_W/2 - 2;
        let onRealGap = false;
        for (let x = gs; x <= ge; x += 2){
          const isGapRaw = (baselineAtRaw(x) == null);
          const isBridged = bridges.some(b => x >= b.x && x <= b.x + b.w);
          if (isGapRaw && !isBridged){ onRealGap = true; break; }
        }
        if (onRealGap && jumpOffset === 0) running = false;
      }
    }

    // DRAW
    ctx.clearRect(0,0,W,H);
    filmFlicker();

    // glow linea
    ctx.fillStyle = SHADOW;
    const yMid = baselineAt(Math.floor(W*.6)) ?? baseY0;
    ctx.fillRect(0, yMid-3, W, 6);

    // baseline + omino
    const L = GUY_X - GUY_W/2, R = GUY_X + GUY_W/2;
    strokeBaseline(0, Math.max(0, L));
    strokeInlineMan(GUY_X, jumpOffset, mouth);
    strokeBaseline(R, W);

    // bonus
    bonuses.forEach(drawBonus);

    // mano
    if (hand.show){
      ctx.fillStyle = FG;
      ctx.beginPath(); ctx.arc(hand.x, hand.y, 14, 0, Math.PI*2); ctx.fill();
      ctx.fillRect(hand.x-2, hand.y, 4, 60);
      if (hand.drawing){
        ctx.fillRect(hand.x-8, baseY0-2, 16, 4);
      }
    }

    // HUD
    ctx.fillStyle = FG;
    ctx.font = '20px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText(`PUNTI ${score}`, 18, 30);
    ctx.fillText(`PONTI ${ink}/${inkMax}`, 18, 54);

    if (!running){
      ctx.textAlign='center';
      ctx.font='bold 44px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText('GAME OVER', W/2, H/2-10);
      ctx.font='20px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText('Space/Touch per ripartire — R per restart', W/2, H/2+24);
      ctx.textAlign='start';
    }

    requestAnimationFrame(tick);
  }

  // ===== Input ==============================================================
  function pressDownJump(){ inputHeldJump = true; if(!running) return restart(); startJump(); }
  function releaseJump(){ inputHeldJump = false; }
  function restart(){
    running=true; t=0; score=0; speed=4;
    obst.length=0; bridges.length=0; bonuses.length=0;
    jumpVy=0; jumpOffset=0; holdTicks=0; inputHeldJump=false;
    mouth=0.25; armRaiseTimer=0; safeFrames=120;
    ink = inkMax; inkRechargeCounter = INK_RECHARGE_FRAMES;
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

  // Touch (3 zone: sinistra=←, centro=salto, destra=→)
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

  // Bottoni opzionali UI già esistenti
  document.getElementById('btnJump')?.addEventListener('pointerdown', pressDownJump);
  document.getElementById('btnJump')?.addEventListener('pointerup',   releaseJump);
  document.getElementById('btnRestart')?.addEventListener('click', restart);
  document.getElementById('btnPause')?.addEventListener('click', togglePause);

  // === Controlli touch visibili (iOS/Android) ===============================
  function createTouchControls(){
    if (document.getElementById('ctlBar')) return; // già creati

    const bar = document.createElement('div');
    bar.id = 'ctlBar';
    bar.innerHTML = `
      <style>
        #ctlBar{
          position: fixed; inset:auto 0 12px 0; display:flex; gap:12px;
          justify-content:center; align-items:center; z-index:9999;
          pointer-events:auto; user-select:none;
        }
        #ctlBar .btn{
          font: 20px ui-monospace, Menlo, Consolas, monospace;
          color:#000; background:#fff; border:none; border-radius:14px;
          padding:14px 18px; min-width:72px;
          box-shadow:0 6px 18px rgba(255,255,255,.18);
          touch-action:none;
        }
        #ctlBar .btn:active{ transform:translateY(1px); }
        @media (min-width: 800px){ #ctlBar{ display:none; } } /* desktop: nascosti */
      </style>
      <button class="btn" id="btnLeft">←</button>
      <button class="btn" id="btnJumpBig">SALTA</button>
      <button class="btn" id="btnRight">→</button>
    `;
    document.body.appendChild(bar);

    const left  = document.getElementById('btnLeft');
    const right = document.getElementById('btnRight');
    const jump  = document.getElementById('btnJumpBig');

    const down = (el, fn)=>{ ['pointerdown','touchstart','mousedown'].forEach(e=>el.addEventListener(e, fn, {passive:false})); };
    const upA  = (el, fn)=>{ ['pointerup','pointercancel','pointerleave','touchend','touchcancel','mouseup'].forEach(e=>el.addEventListener(e, fn, {passive:false})); };

    down(left,  e=>{ e.preventDefault(); moveLeft  = true;  holdStill=false; });
    upA (left,  e=>{ e.preventDefault(); moveLeft  = false; });

    down(right, e=>{ e.preventDefault(); moveRight = true;  holdStill=false; });
    upA (right, e=>{ e.preventDefault(); moveRight = false; });

    down(jump,  e=>{ e.preventDefault(); pressDownJump(); });
    upA (jump,  e=>{ e.preventDefault(); releaseJump(); });
  }

  if ('ontouchstart' in window) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createTouchControls);
    } else {
      createTouchControls();
    }
  }

  // Start
  requestAnimationFrame(tick);
})();
