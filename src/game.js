// OutRun Bangkok — game state, physics, traffic, input, main loop
(function (OB) {
  'use strict';
  const W = OB.W, H = OB.H, K = H / 2;
  const T = OB.track, A = OB.audio, R = OB.render;
  const G = {
    mode: 'loading', t: 0, position: 0, playerX: 0, playerZ: 0, cameraH: 1000, cameraDepth: 0, fov: 100, drawDistance: 300,
    speed: 0, maxSpeed: 12000, steer: 0, lean: 0, bgOffset: 0, bgShift: 0, cars: [], health: 100, ice: 100, time: 80, score: 0,
    stageNo: 1, stageKey: 'charoenkrung', light: 'day', station: 0, hiScore: 0, msg: null, shake: 0, invuln: 0, bounce: 0,
    forkHint: null, wallCd: 0, countdown: 0, overReason: null, result: null, seed: 20240808, paused: false, route: [], cur: null, nextInfo: null, nextKey: null,
    muted: false, drawShift: -200, playerDX: 0, course: 0, touchMode: false
  };
  OB.G = G;
  G.cameraDepth = 1 / Math.tan((G.fov / 2) * Math.PI / 180);
  G.playerZ = G.cameraDepth * G.cameraH * K / (457 - OB.HORIZON);
  const PLAYER_W = 480 / T.roadW;
  const CARS = ['taxi', 'taxi', 'taxi_orange', 'taxi_blue', 'taxi_green', 'sedan', 'sedan', 'sedan_black', 'sedan_red', 'green', 'green_yellow', 'green_purple'];
  const ONCOMING = ['bus', 'tuktuk', 'tuktuk'];
  try { G.hiScore = parseInt(localStorage.getItem('ob_hiscore') || '0') || 0; } catch (e) { }

  // ---------- input ----------
  const keys = { left: false, right: false, gas: false, brake: false };
  let startPressed = false, tuneDir = 0;
  const KEYMAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'gas', w: 'gas', W: 'gas', x: 'gas', X: 'gas', ArrowDown: 'brake', s: 'brake', S: 'brake', z: 'brake', Z: 'brake' };
  window.addEventListener('keydown', e => {
    if (e.repeat) { if (KEYMAP[e.key]) e.preventDefault(); return; }
    A.init(); A.unlock();
    if (KEYMAP[e.key]) { keys[KEYMAP[e.key]] = true; e.preventDefault(); }
    if (e.key === 'Enter' || e.key === ' ') { startPressed = true; e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'a') tuneDir = -1; if (e.key === 'ArrowRight' || e.key === 'd') tuneDir = 1;
    if (e.key === 'ArrowUp' && (G.mode === 'radio' || G.mode === 'course')) startPressed = true;
    if (e.key === 'm' || e.key === 'M') { G.muted = !G.muted; A.setMusicVolume(G.muted ? 0 : A.MUSIC_VOL); }
    if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && (G.mode === 'play')) G.paused = !G.paused;
  });
  window.addEventListener('keyup', e => { if (KEYMAP[e.key]) { keys[KEYMAP[e.key]] = false; e.preventDefault(); } });
  // Touch: no on-screen buttons. The bike accelerates by itself; steering follows the finger's horizontal
  // position (left of centre steers left, further out steers harder); two fingers brake. Menus: tap left / right / centre.
  const touch = { steer: 0, active: false, fingers: 0 };
  const pointers = new Map();
  function bindTouch() {
    const cv = document.getElementById('screen');
    G.touchMode = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const upd = () => {
      touch.fingers = pointers.size;
      if (!pointers.size) { touch.active = false; touch.steer = 0; return; }
      let sx = 0; for (const x of pointers.values()) sx += x;
      const r = cv.getBoundingClientRect(), rel = (sx / pointers.size - r.left) / r.width - 0.5;
      touch.steer = OB.clamp(rel / 0.3, -1, 1); touch.active = true;
    };
    cv.addEventListener('pointerdown', e => {
      A.init(); A.unlock();
      const r = cv.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width;
      if (e.pointerType !== 'mouse') G.touchMode = true;
      if (G.mode === 'play' || G.mode === 'countdown') { if (e.pointerType !== 'mouse') { pointers.set(e.pointerId, e.clientX); upd(); } }
      else if (G.mode === 'radio' || G.mode === 'course') { if (fx < 0.35) tuneDir = -1; else if (fx > 0.65) tuneDir = 1; else startPressed = true; }
      else if (G.mode === 'over') { A.sfx('select'); G.mode = 'title'; newGame(); startPressed = false; }
      else startPressed = true;
      e.preventDefault();
    });
    cv.addEventListener('pointermove', e => { if (pointers.has(e.pointerId)) { pointers.set(e.pointerId, e.clientX); upd(); } });
    const end = e => { if (pointers.has(e.pointerId)) { pointers.delete(e.pointerId); upd(); } };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end); cv.addEventListener('pointerleave', end);
  }

  // ---------- game setup ----------
  function buildStage(key, no) {
    const info = T.buildStage(key, no, G.seed);
    return info;
  }
  function newGame(key, stageNo) {
    T.reset();
    G.stageNo = stageNo || 1; G.stageKey = key || 'charoenkrung'; G.route = [G.stageKey]; G.nextKey = null; G.nextInfo = null;
    G.cur = buildStage(G.stageKey, G.stageNo);
    G.light = T.THEMES[T.STAGES[G.stageKey].theme].light;
    G.position = 0; G.playerX = 0; G.speed = 0; G.steer = 0; G.lean = 0; G.bgOffset = 0;
    G.health = 100; G.ice = 100; G.score = 0; G.time = T.STAGES[G.stageKey].time + (G.stageNo > 1 ? 10 : 0);
    G.cars = []; G.msg = null; G.shake = 0; G.invuln = 0; G.forkHint = null; G.result = null; G.overReason = null; G.paused = false;
    for (let i = 0; i < 8; i++) spawnCar(60 + i * 40);
  }
  function say(text, sub, dur, fill, size) { G.msg = { text, sub, t: dur || 2, dur: dur || 2, fill, size }; }
  const segLen = T.segLen;

  // ---------- traffic ----------
  function themeNow() { return T.THEMES[T.findSegment(G.position + G.playerZ).theme]; }
  function spawnCar(atSeg) {
    const th = themeNow().traffic, rng = Math.random;
    const pz = G.position + G.playerZ;
    const segIdx = Math.floor(pz / segLen) + (atSeg || (310 + Math.floor(rng() * 260)));
    if (segIdx >= T.segments.length - 60) return false;
    const seg = T.segments[segIdx];
    if (seg.median > 0) return false;
    const oncoming = rng() < th.oncoming * 0.45;
    let lane, spr, speed;
    if (oncoming) { lane = 0.66; spr = OB.SPR[ONCOMING[Math.floor(rng() * ONCOMING.length)]]; speed = -G.maxSpeed * (0.22 + rng() * 0.16); }
    else {
      const lanes = th.oncoming > 0 ? [-0.66, 0, -0.66, 0, 0.66] : [-0.66, 0, 0.66];
      lane = lanes[Math.floor(rng() * lanes.length)];
      spr = OB.SPR[CARS[Math.floor(rng() * CARS.length)]]; speed = G.maxSpeed * (th.min + rng() * (th.max - th.min));
    }
    // avoid stacking
    for (const c of G.cars) if (Math.abs(c.z - segIdx * segLen) < 8 * segLen && Math.abs(c.offset - lane) < 0.5) return false;
    G.cars.push({ z: segIdx * segLen + rng() * segLen, offset: lane, targetLane: lane, spr, speed, oncoming, passed: false });
    return true;
  }
  function updateCars(dt) {
    const pz = G.position + G.playerZ;
    const th = themeNow().traffic;
    let ahead = 0;
    for (let i = G.cars.length - 1; i >= 0; i--) {
      const c = G.cars[i];
      c.z += c.speed * dt;
      if (c.z < G.position - 30 * segLen || c.z > pz + 700 * segLen) { G.cars.splice(i, 1); continue; }
      if (c.z > pz) ahead++;
      // overtake bonus
      if (!c.oncoming && !c.passed && c.z < pz - 200 && G.mode === 'play') { c.passed = true; G.score += 300; }
      // lane AI (same direction): avoid slower car ahead in same lane
      if (!c.oncoming) {
        for (const o of G.cars) {
          if (o === c || o.oncoming) continue;
          const dz = o.z - c.z;
          if (dz > 0 && dz < 25 * segLen && Math.abs(o.offset - c.offset) < 0.45 && o.speed < c.speed) {
            const cand = [-0.66, 0, 0.66].filter(l => Math.abs(l - c.offset) > 0.3 && !(th.oncoming > 0 && l > 0.5));
            let best = null;
            for (const l of cand) { let free = true; for (const q of G.cars) if (q !== c && Math.abs(q.z - c.z) < 30 * segLen && Math.abs(q.offset - l) < 0.45) free = false; if (free) { best = l; break; } }
            if (best !== null) c.targetLane = best; else c.speed = Math.max(o.speed * 0.95, G.maxSpeed * 0.15);
          }
        }
        if (Math.abs(c.targetLane - c.offset) > 0.005) c.offset += Math.sign(c.targetLane - c.offset) * Math.min(Math.abs(c.targetLane - c.offset), dt * 0.5);
      }
    }
    if (ahead < th.density && Math.random() < 0.5) spawnCar();
  }

  // ---------- collisions ----------
  function crash(kind, car) {
    if (kind === 'wall' || kind === 'median') { if (G.wallCd > 0) return; G.wallCd = 0.9; }
    else if (G.invuln > 0) return;
    A.sfx(kind === 'wall' || kind === 'median' ? 'bump' : 'crash');
    G.shake = 1; G.invuln = 1.3; G.bounce = 4;
    if (kind === 'car') {
      if (car.oncoming) { G.speed *= 0.12; G.health -= 18; G.ice -= 8; }
      else { G.speed = Math.min(G.speed, Math.max(0, car.speed * 0.45)); G.health -= 12; G.ice -= 5; }
      G.playerX += (G.playerX >= car.offset ? 1 : -1) * 0.12;
    } else if (kind === 'sprite') { G.speed *= 0.18; G.health -= 20; G.ice -= 10; G.playerX += (G.playerX > 0 ? -1 : 1) * 0.18; }
    else if (kind === 'wall') { G.speed *= 0.4; G.health -= 8; G.ice -= 3; }
    else if (kind === 'median') { G.speed *= 0.3; G.health -= 8; G.ice -= 4; }
    if (G.health <= 0) { G.health = 0; gameOver('wreck'); }
  }
  function checkCollisions(seg) {
    const pz = G.position + G.playerZ, rw = seg.rw, RW = T.roadW;
    // walls
    if (Math.abs(G.playerX) > 1.3 * rw) { G.playerX = Math.sign(G.playerX) * 1.3 * rw; if (G.speed > G.maxSpeed * 0.2) G.speed *= 0.97; crash('wall'); }
    // median
    if (seg.median > 0) {
      const mw = seg.median * rw + PLAYER_W * 0.5;
      if (Math.abs(G.playerX) < mw) { const s = G.playerX >= 0 ? 1 : -1; G.playerX = s * (mw + 0.02); crash('median'); }
    }
    // roadside sprites (this + next segment)
    for (let k = 0; k < 2; k++) {
      const s2 = T.segments[seg.index + k]; if (!s2) break;
      for (const sp of s2.sprites) {
        const s = sp.spr; if (!s.solid) continue;
        const sw = (s.w / RW) * (s.thin || 1);
        let cx = sp.offset; const full = s.w / RW; const anchor = sp.anchor || 'center';
        if (anchor === 'left') cx = sp.offset - full / 2; else if (anchor === 'right') cx = sp.offset + full / 2;
        if (OB.overlap(G.playerX, PLAYER_W, cx, sw, 0.9)) { crash('sprite'); return; }
      }
    }
    // cars
    for (const c of G.cars) {
      const dz = c.z - pz;
      if (dz < -segLen * 0.6 || dz > segLen * 1.4) continue;
      const cseg = T.findSegment(c.z);
      if (OB.overlap(G.playerX, PLAYER_W, c.offset * cseg.rw, c.spr.w / RW, 0.8)) {
        if (c.oncoming) { crash('car', c); c.z = pz + segLen * 2; return; }
        if (G.speed > c.speed) {
          if (G.speed - c.speed < G.maxSpeed * 0.18) { // gentle nudge: match speed, no damage
            G.speed = c.speed * 0.92; G.shake = Math.max(G.shake, 0.3); if (G.wallCd <= 0) { A.sfx('bump'); G.wallCd = 0.5; }
          } else crash('car', c);
          return;
        }
      }
    }
  }

  // ---------- progression ----------
  function gameOver(reason) {
    if (G.mode === 'over') return;
    G.mode = 'over'; G.overReason = reason; G.forkHint = null; A.stopMusic(); A.sfx('over');
    if (G.score > G.hiScore) { G.hiScore = G.score; try { localStorage.setItem('ob_hiscore', String(G.hiScore)); } catch (e) { } }
  }
  function progress(seg) {
    const cur = G.cur; if (!cur) return;
    const i = seg.index;
    if (cur.forkAt) {
      G.forkHint = (i > cur.forkAt - 520 && i < cur.forkAt) ? [T.STAGES[cur.next[0]].name, T.STAGES[cur.next[1]].name] : null;
      if (!cur.forkDone && i >= cur.forkAt) {
        cur.forkDone = true;
        const choice = G.playerX < 0 ? cur.next[0] : cur.next[1];
        G.nextKey = choice; G.nextInfo = buildStage(choice, G.stageNo + 1);
        const nm = T.STAGES[choice].name; say(nm.eng, nm.thai, 2.2, '#7fe0ff', 18); A.sfx('fork');
      }
    }
    if (cur.checkAt && !cur.checkDone && i >= cur.checkAt) {
      cur.checkDone = true;
      const bonus = Math.ceil(G.time) * 1000; G.score += bonus;
      G.stageNo++; G.stageKey = G.nextKey; G.route.push(G.nextKey); G.cur = G.nextInfo; G.nextInfo = null;
      const st = T.STAGES[G.stageKey]; G.time += st.time; G.ice = Math.min(100, G.ice + 22); G.health = Math.min(100, G.health + 12);
      G.light = T.THEMES[st.theme].light;
      say('CHECK POINT', 'ต่อเวลา +' + st.time + '  ·  ' + st.name.thai, 2.6, '#ffd800', 22); A.sfx('check');
    }
    if (cur.goalAt && !cur.goalDone && i >= cur.goalAt) {
      cur.goalDone = true; G.mode = 'goal'; G.forkHint = null; A.sfx('goal'); G.goalT = 0;
      const timeBonus = Math.ceil(G.time) * 3000, iceBonus = Math.round(G.ice) * 5000;
      const total = G.score + timeBonus + iceBonus;
      const newHi = total > G.hiScore; if (newHi) { G.hiScore = total; try { localStorage.setItem('ob_hiscore', String(total)); } catch (e) { } }
      G.result = { timeBonus, iceBonus, route: G.route.map(k => T.STAGES[k].name.eng).join(' > '), total, reveal: -1, newHi, base: G.score };
    }
  }

  // ---------- update ----------
  function update(dt) {
    G.t += dt;
    if (G.msg) G.msg.t -= dt;
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 3);
    if (G.invuln > 0) G.invuln -= dt;
    if (G.wallCd > 0) G.wallCd -= dt;
    G.bounce *= 0.8;
    const mode = G.mode;
    if (mode === 'loading') return;
    if (mode === 'over' || (mode === 'play' && G.paused)) { G.speed = Math.max(0, G.speed - G.maxSpeed * dt * 0.6); if (mode === 'over') advance(dt, false); A.setEngine(0, false, false, false); return; }
    if (mode === 'title' || mode === 'radio' || mode === 'course') {
      G.drawShift += ((mode === 'title' ? -200 : 0) - G.drawShift) * Math.min(1, dt * 3);
      const target = mode === 'title' ? G.maxSpeed * 0.28 : G.maxSpeed * 0.12;
      G.speed += (target - G.speed) * Math.min(1, dt * 0.8);
      const seg = T.findSegment(G.position + G.playerZ);
      G.playerX += (-0.15 - G.playerX) * dt; G.playerX -= dt * 2 * (G.speed / G.maxSpeed) * (G.speed / G.maxSpeed) * seg.curve * 0.24;
      G.lean += ((-seg.curve * 0.15) - G.lean) * dt * 3;
      advance(dt, true);
      if (seg.index > T.segments.length - 700) { newGame(); }
      if (startPressed) { startPressed = false; A.init(); A.sfx('select');
        if (mode !== 'title' && !A.music.playing && A.ready()) A.playMusic(G.station); // audio may have unlocked late
        if (mode === 'title') { G.mode = 'radio'; A.playMusic(G.station); A.setMusicVolume(G.muted ? 0 : A.MUSIC_VOL); }
        else if (mode === 'radio') { G.mode = 'course'; }
        else { startRun(); } }
      if (mode === 'radio' && tuneDir) { G.station = (G.station + tuneDir + 3) % 3; A.playMusic(G.station); A.sfx('select'); }
      if (mode === 'course' && tuneDir) { const n = T.COURSES.length; G.course = (G.course + tuneDir + n) % n; A.sfx('select'); }
      tuneDir = 0;
      A.setEngine(G.speed / G.maxSpeed, false, false, A.ready());
      return;
    }
    if (mode === 'countdown') {
      G.drawShift = 0;
      const before = Math.ceil(G.countdown); G.countdown -= dt; const after = Math.ceil(G.countdown);
      if (after !== before) { if (after > 0) A.sfx('beep'); else if (after === 0) A.sfx('go'); }
      if (G.countdown <= -0.7) { G.mode = 'play'; }
      G.speed = 0; A.setEngine(0.05 + (keys.gas ? 0.15 : 0), keys.gas, false, true);
      return;
    }
    // ---- play / goal physics ----
    const seg = T.findSegment(G.position + G.playerZ);
    const pct = G.speed / G.maxSpeed;
    const usingTouch = G.touchMode && touch.active;
    const gas = mode === 'play' ? (keys.gas || (G.touchMode && touch.fingers < 2)) : false;
    const brake = mode === 'play' ? (keys.brake || (G.touchMode && touch.fingers >= 2)) : true;
    const steerIn = mode === 'play' ? (usingTouch ? touch.steer : ((keys.left ? -1 : 0) + (keys.right ? 1 : 0))) : 0;
    G.steer += (steerIn - G.steer) * Math.min(1, dt * 9);
    G.lean += ((G.steer * Math.min(1, pct * 2 + 0.2)) - G.lean) * Math.min(1, dt * 8);
    const dx = pct > 0.01 ? dt * (0.35 + 2.1 * pct) : 0;
    G.playerX += G.steer * dx;
    G.playerX -= dx * pct * seg.curve * 0.25;
    if (gas) G.speed += (G.maxSpeed / 3.4) * (1.2 - pct * 0.85) * dt;
    else if (brake) G.speed -= G.maxSpeed * 0.85 * dt;
    else G.speed -= G.maxSpeed / 7 * dt;
    const offroad = Math.abs(G.playerX) > 1.0 * seg.rw;
    if (offroad) { if (G.speed > G.maxSpeed * 0.45) G.speed -= G.maxSpeed * 0.7 * dt; if (pct > 0.1) G.bounce = (Math.random() - 0.5) * 4 * pct; }
    G.speed = OB.clamp(G.speed, 0, G.maxSpeed);
    if (mode === 'play') checkCollisions(seg);
    advance(dt, true);
    if (mode === 'play') {
      G.time -= dt; if (G.time <= 0) { G.time = 0; gameOver('time'); return; }
      G.ice -= dt * (100 / 290) * (pct < 0.08 ? 1.6 : 1);
      if (G.ice <= 0) { G.ice = 0; gameOver('ice'); return; }
      if (G.ice < 25 && Math.floor(G.t * 2) !== Math.floor((G.t - dt) * 2) && Math.floor(G.t * 2) % 4 === 0) A.sfx('melt');
      G.score += pct * dt * 2000;
      progress(seg);
    } else if (mode === 'goal') {
      G.goalT += dt;
      if (G.goalT > 1.2) { G.result.reveal = Math.min(4, Math.floor((G.goalT - 1.2) / 0.7)); if (G.result.reveal >= 3) G.score = G.result.total; }
      if (G.goalT > 4.5 && startPressed) { startPressed = false; A.stopMusic(); G.mode = 'title'; newGame(); }
    }
    A.setEngine(pct, gas, offroad, true);
    startPressed = false;
  }
  function advance(dt, withCars) {
    G.position += G.speed * dt;
    const maxPos = (T.segments.length - 2) * segLen - G.playerZ;
    if (G.position > maxPos) { G.position = maxPos; G.speed = 0; }
    if (withCars) updateCars(dt);
  }
  function startRun() {
    const c = T.COURSES[G.course] || T.COURSES[0];
    newGame(c.key, c.stageNo); G.mode = 'countdown'; G.countdown = 3.99; G.speed = 0; G.playerX = 0;
  }

  // ---------- loop ----------
  let last = 0, acc = 0; const STEP = 1 / 60;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!last) last = ts;
    let dt = (ts - last) / 1000; last = ts; if (dt > 0.25) dt = 0.25;
    acc += dt; let n = 0;
    while (acc >= STEP && n < 6) { update(STEP); acc -= STEP; n++; }
    draw();
  }
  function draw() {
    R.frame(G);
    switch (G.mode) {
      case 'title': R.title(G); break;
      case 'radio': R.radio(G); break;
      case 'course': R.course(G); break;
      case 'countdown': R.hud(G); R.countdown(G); break;
      case 'play': R.hud(G); if (G.paused) { OB.text(R.ctx || document.getElementById('screen').getContext('2d'), 'PAUSE', W / 2, 200, { size: 24, sy: 1.3, fill: '#fff', outline: '#000', outlineW: 6, align: 'center' }); } break;
      case 'goal': R.hud(G); R.goal(G); break;
      case 'over': R.hud(G); R.gameover(G); break;
    }
  }
  // start-press handling for 'over'
  window.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && G.mode === 'over') { A.sfx('select'); G.mode = 'title'; newGame(); startPressed = false; } });

  // debug/testing hook: jump straight into a given stage
  OB.debugStage = function (key, no) {
    T.reset(); G.stageNo = no || 2; G.stageKey = key; G.route = ['charoenkrung', key]; G.nextKey = null; G.nextInfo = null;
    G.cur = buildStage(key, G.stageNo); G.light = T.THEMES[T.STAGES[key].theme].light;
    G.position = 0; G.playerX = -0.3; G.speed = G.maxSpeed * 0.5; G.cars = []; G.time = 90; G.mode = 'play'; G.drawShift = 0;
    for (let i = 0; i < 8; i++) spawnCar(40 + i * 45);
  };
  // ---------- boot ----------
  const canvas = document.getElementById('screen');
  R.init(canvas); R.ctx = canvas.getContext('2d');
  R.loading(0);
  OB.loadAssets().then(() => {
    bindTouch();
    newGame();
    G.mode = 'title';
    requestAnimationFrame(loop);
  }).catch(err => { console.error(err); const c = canvas.getContext('2d'); c.fillStyle = '#fff'; c.fillText('LOAD ERROR: ' + err.message, 20, 40); });
})(window.OB);
