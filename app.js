/* La Linea — Inline Character v4
   - Gap superabili con salto
   - Baseline continua sotto i piedi in aria
   - Profilo umanizzato + bocca animata
   - Mano che disegna ponti temporanei
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
  let obst = [];
  let bridges = [];
  const BRIDGE_TTL = 120;

  // Mano
  let hand = { x: W + 120, y: baseY0 - 160, show: false, timer: 0, drawing: false };

  // Zona sicura iniziale
  let safeFrames = 120;

  // Omino
  let GUY_X = Math.round(W * 0.28);
  const GUY_W = 104;
  const STROKE = 8;
  const GUY_MIN_X = 40;
  const GUY_MAX_X = W - 40;

  // Salto
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

  // Movimento
  let moveLeft=false, moveRight=false, holdStill=false;
  const MOVE_SPEED = 5;

  // Bocca
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
      const w=70+Math.random()*50; // max 120
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

  // Baseline con ponti e salti
  function baselineAt(x){
    for (const b of bridges){
      if (x >= b.x && x <= b.x + b.w) return baseY0;
    }
    let y = baselineAtRaw(x);
    if (y == null && jumpOffset < 0) return baseY0;   // 🔧 linea continua durante salto
    if (y == null && safeFrames > 0) return baseY0;
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

  // Disegno omino
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

    ctx.moveTo(start, yL);
    ctx.lineTo(start, yTop - (h*0.52));
    ctx.quadraticCurveTo(start + belly*0.2, yTop - (h*0.78), gx - w*0.25, yTop - (h*0.85));
    ctx.quadraticCurveTo(gx + w*0.20, yTop - (h*1.07), gx + w*0.08,  yTop - (h*0.99));
    ctx.quadraticCurveTo(gx + w*0.04, yTop - (h*0.95), gx - w*0.02, yTop - (h*0.93));
    ctx.quadraticCurveTo(gx + w*0.34, yTop - (h*0.90), gx + w*0.40, yTop - (h*0.84));
    const armY = yTop - (h*0.70);
    ctx.lineTo(gx - w*0.02, armY);
    ctx.lineTo(gx - w*0.02 + arm, armY - Math.sin(t*0.12)*8);
    const hx = gx - w*0.02 + arm;
    const hy = armY - Math.sin(t*0.12)*8;
    ctx.moveTo(hx, hy); ctx.lineTo(hx + finger, hy - finger*0.35);
    ctx.moveTo(hx, hy); ctx.lineTo(hx + finger, hy + finger*0.05);
    ctx.moveTo(hx, hy); ctx.lineTo(hx + finger*0.75, hy + finger*0.45);
    ctx.moveTo(gx - w*0.06, armY + 8);
    ctx.lineTo(gx - w*0.06, yTop - (h*0.18));
    ctx.quadraticCurveTo(gx - w*0.06, yTop - (h*0.06), start + GUY_W - 8*s, yTop - (h*0.04));
    ctx.lineTo(start + GUY_W - 8*s, yR);
    ctx.stroke();

    // bocca
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

  // LOOP
  function tick(){
    if (running){
      t++; score++;
      if (safeFrames > 0) safeFrames--;

      if (safeFrames <= 0 && t%75===0) spawnObstacle();

      obst.forEach(o => o.x -= speed);
      bridges.forEach(b => { b.x -= speed; b.ttl--; });
      obst = obst.filter(o => o.x + o.w > -40);
      bridges = bridges.filter(b => (b.x + b.w > -40) && b.ttl > 0);

      if (t%600===0) speed += .25;

      updateJump();
      updateMouth();

      // GAME OVER → solo se a terra in un gap reale
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

    // Draw
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = SHADOW;
    const yMid = baselineAt(Math.floor(W*.6)) ?? baseY0;
    ctx.fillRect(0, yMid-3, W, 6);

    const L = GUY_X - GUY_W/2, R = GUY_X + GUY_W/2;
    strokeBaseline(0, Math.max(0, L));
    strokeInlineMan(GUY_X, jumpOffset, mouth);
    strokeBaseline(R, W);

    requestAnimationFrame(tick);
  }

  // Input
  function pressDownJump(){ inputHeldJump = true; if(!running) return restart(); startJump(); }
  function releaseJump(){ inputHeldJump = false; }
  function restart(){
    running=true; t=0; score=0; speed=4;
    obst.length=0; bridges.length=0;
    jumpVy=0; jumpOffset=0; holdTicks=0; inputHeldJump=false;
    mouth=0.25; safeFrames=120;
  }

  window.addEventListener('keydown', e=>{
    if(e.code==='Space'){ e.preventDefault(); pressDownJump(); }
  });
  window.addEventListener('keyup', e=>{
    if(e.code==='Space'){ e.preventDefault(); releaseJump(); }
  });

  requestAnimationFrame(tick);
})();
