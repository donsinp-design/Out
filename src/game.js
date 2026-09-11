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
    muted: false, drawShift: -200, playerDX: 0, course: 0, touchMode: false,
    wipe: 0, wipeDir: 1, parts: [], skidCd: 0, ranking: [], pendingRecord: null, nameEntry: null, smoke: [], smokeAcc: 0,
    flip: null, rider: null, drift: 0, driftDir: 1, driftK: 0, marks: [], goT: 0
  };
  OB.G = G;
  G.cameraDepth = 1 / Math.tan((G.fov / 2) * Math.PI / 180);
  G.playerZ = G.cameraDepth * G.cameraH * K / (457 - OB.HORIZON);
  const PLAYER_W = 480 / T.roadW;
  const CARS = ['taxi', 'taxi', 'taxi_orange', 'taxi_blue', 'taxi_green', 'sedan', 'sedan', 'sedan_black', 'sedan_red', 'green', 'green_yellow', 'green_purple'];
  const ONCOMING = ['bus', 'tuktuk', 'tuktuk'];
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  G.ranking = store.get('ob_ranking', []); if (!Array.isArray(G.ranking)) G.ranking = [];
  { const legacy = parseInt(store.get('ob_hiscore', 0)) || 0; if (legacy > 0 && !G.ranking.length) G.ranking.push({ name: 'ICE', score: legacy, route: '' }); }
  G.hiScore = G.ranking.length ? G.ranking[0].score : 0;
  G.station = Math.min(A.stations.length - 1, Math.max(0, store.get('ob_station', 0) | 0)); G.course = Math.min(6, Math.max(0, store.get('ob_course', 0) | 0));
  OB.NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').concat(['<', 'END']);

  // ---------- input ----------
  const keys = { left: false, right: false, gas: false, brake: false };
  let startPressed = false, tuneDir = 0, driftReq = false, lastKey = '', lastKeyT = 0;
  const KEYMAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'gas', w: 'gas', W: 'gas', x: 'gas', X: 'gas', ArrowDown: 'brake', s: 'brake', S: 'brake', z: 'brake', Z: 'brake' };
  window.addEventListener('keydown', e => {
    if (e.repeat) { if (KEYMAP[e.key]) e.preventDefault(); return; }
    A.init(); A.unlock();
    if (G.mode === 'name') { nameKey(e); e.preventDefault(); return; }
    if (KEYMAP[e.key]) { keys[KEYMAP[e.key]] = true; e.preventDefault(); }
    // drift: Shift / Space while steering hard, or a quick double tap of the steering key
    const dirKey = KEYMAP[e.key] === 'left' || KEYMAP[e.key] === 'right' ? KEYMAP[e.key] : null;
    if (dirKey) { const now = performance.now(); if (lastKey === dirKey && now - lastKeyT < 300) driftReq = true; lastKey = dirKey; lastKeyT = now; }
    if (e.key === 'Shift' || (e.key === ' ' && G.mode === 'play')) driftReq = true;
    if (e.key === 'Enter' || e.key === ' ') { startPressed = true; e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'a') tuneDir -= 1; if (e.key === 'ArrowRight' || e.key === 'd') tuneDir += 1; // accumulate so fast double presses are not lost
    if (e.key === 'ArrowUp' && (G.mode === 'radio' || G.mode === 'course')) startPressed = true;
    if (e.key === 'm' || e.key === 'M') { G.muted = !G.muted; A.setMusicVolume(G.muted ? 0 : A.MUSIC_VOL); }
    if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && (G.mode === 'play')) G.paused = !G.paused;
  });
  window.addEventListener('keyup', e => { if (KEYMAP[e.key]) { keys[KEYMAP[e.key]] = false; e.preventDefault(); } });
  // Touch: no on-screen buttons. The bike accelerates by itself; steering follows the finger's horizontal
  // position (left of centre steers left, further out steers harder); two fingers brake. Menus: tap left / right / centre.
  // A quick double tap (either the steering finger re-tapping, or a second finger tapping twice) while steering hard drifts.
  const touch = { steer: 0, active: false, fingers: 0, twoT: 0 };
  const pointers = new Map();
  let lastTapT = 0;
  function bindTouch() {
    const cv = document.getElementById('screen');
    G.touchMode = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const upd = () => {
      touch.fingers = pointers.size;
      if (!pointers.size) { touch.active = false; touch.steer = 0; return; }
      const first = pointers.values().next().value; // the first finger down steers; extra fingers only count
      const r = cv.getBoundingClientRect(), rel = (first - r.left) / r.width - 0.5;
      touch.steer = OB.clamp(rel / 0.3, -1, 1); touch.active = true;
    };
    let swipeX = null;
    cv.addEventListener('pointerdown', e => {
      A.init(); A.unlock();
      const r = cv.getBoundingClientRect(), ix = (e.clientX - r.left) / r.width * W, iy = (e.clientY - r.top) / r.height * H;
      const inBox = (b) => !!b && ix >= b.x && ix <= b.x + b.w && iy >= b.y && iy <= b.y + b.h;
      if (e.pointerType !== 'mouse') G.touchMode = true;
      if (G.mode === 'play' || G.mode === 'countdown') {
        if (e.pointerType !== 'mouse') { pointers.set(e.pointerId, e.clientX); upd(); }
        const now = performance.now(); if (G.mode === 'play' && now - lastTapT < 320) driftReq = true; lastTapT = now;
      }
      else if (G.mode === 'radio') { // tap a station row (tap the selected one again to start), START button, or swipe
        swipeX = ix;
        if (inBox(R.hit.start)) startPressed = true;
        else { const row = R.hit.rows.find(inBox); if (row) { if (row.i === G.station) startPressed = true; else { G.station = row.i; store.set('ob_station', G.station); A.playMusic(G.station); A.sfx('select'); } } }
      } else if (G.mode === 'course') {
        swipeX = ix;
        if (inBox(R.hit.start)) startPressed = true;
        else { const nd = R.hit.nodes.find(inBox); if (nd) { const ci = T.COURSES.findIndex(c => c.key === nd.key); if (ci === G.course) startPressed = true; else if (ci >= 0) { G.course = ci; store.set('ob_course', ci); A.sfx('select'); } } }
      } else if (G.mode === 'name') { const cell = R.hit.cells.find(inBox); if (cell) nameSelect(cell.i); }
      else if (G.mode === 'over') leaveOver();
      else startPressed = true;
      e.preventDefault();
    });
    cv.addEventListener('pointermove', e => { if (pointers.has(e.pointerId)) { pointers.set(e.pointerId, e.clientX); upd(); } });
    const end = e => {
      if (pointers.has(e.pointerId)) { pointers.delete(e.pointerId); upd(); }
      if (swipeX !== null && (G.mode === 'radio' || G.mode === 'course')) { const r = cv.getBoundingClientRect(), ix = (e.clientX - r.left) / r.width * W; if (Math.abs(ix - swipeX) > 70) tuneDir = ix > swipeX ? 1 : -1; }
      swipeX = null;
    };
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
    G.wipe = 0; G.parts = []; G.skidCd = 0; G.smoke = []; G.smokeAcc = 0;
    G.flip = null; G.rider = null; G.drift = 0; G.driftK = 0; G.marks = []; markLast = -1; G.goT = 0;
    for (let i = 0; i < 8; i++) spawnCar(60 + i * 40);
  }
  // ---------- tyre smoke ----------
  function emitSmoke(dir, ox) {
    const cx = W / 2 + (G.drawShift || 0) + (G.playerDX || 0) + (ox || 0), by = 457 + (G.bounce || 0);
    // OutRun-style: a low cloud that spreads sideways along the road behind the wheel and never rises
    // arcade-style: a flat, ragged band of tiny pixel clusters spreading sideways along the road behind the wheel
    const side = dir !== 0 ? dir : (Math.random() < 0.5 ? -1 : 1);
    if (G.smoke.length > 640) G.smoke.shift();
    const near = Math.random() < 0.35;
    G.smoke.push({ x: cx + side * (2 + Math.random() * 14), y: by - 6 - Math.random() * 10, vx: side * (near ? 20 + Math.random() * 60 : 80 + Math.random() * 200) * (dir !== 0 ? 1.3 : 1),
      vy: near ? -(4 + Math.random() * 10) : 4 + Math.random() * 10, life: 0.7 + Math.random() * 0.45, t: 0, seed: (Math.random() * 1000) | 0 });
  }
  function updateSmoke(dt) {
    for (let i = G.smoke.length - 1; i >= 0; i--) {
      const p = G.smoke[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.max(0, 1 - 2.4 * dt); // slows down so the band piles up
      if (p.t >= p.life) G.smoke.splice(i, 1);
    }
  }
  // ---------- tyre marks ----------
  // The road behind the rear wheel is only a sliver in this view (the bike sits on the bottom edge), so rubber fixed to the
  // tarmac would vanish within a frame. Like the smoke band, the trail is a screen-space effect: points laid under the tyre
  // slide sideways with the road (so a drift smears them out to the side) and recede slowly, fading as they go.
  let markLast = -1;
  function layMark(w) {
    const cx = W / 2 + (G.drawShift || 0) + (G.playerDX || 0) - (G.driftDir || 1) * (G.driftK || 0) * 6, by = 454 + (G.bounce || 0);
    G.marks.push({ x: cx, y: by, w, t: 0, start: G.t - markLast > 0.05 });
    markLast = G.t;
    if (G.marks.length > 80) G.marks.shift();
  }
  function updateMarks(dt, dpx) {
    const flow = 30 + 90 * (G.speed / G.maxSpeed); // recedes a little faster at speed (still far slower than the road, on purpose)
    for (let i = G.marks.length - 1; i >= 0; i--) { const p = G.marks[i]; p.t += dt; p.x -= dpx; p.y += flow * dt; if (p.t > 0.5) G.marks.splice(i, 1); }
  }
  // ---------- records / name entry ----------
  function qualifies(score) { return score >= 1000 && (G.ranking.length < 5 || score > G.ranking[G.ranking.length - 1].score); }
  function routeStr() { return G.route.map(k => T.STAGES[k].name.eng.split(' ').map(w => w[0]).join('')).join('>'); }
  function enterName() { G.mode = 'name'; G.nameEntry = { chars: ['_', '_', '_'], pos: 0, cursor: 0, time: 30, score: G.pendingRecord.score, route: G.pendingRecord.route }; }
  function nameSelect(i) {
    const ne = G.nameEntry; if (!ne) return; const ch = OB.NAME_CHARS[i]; ne.cursor = i; A.sfx('name');
    if (ch === 'END') { if (ne.pos > 0) finishName(); }
    else if (ch === '<') { if (ne.pos > 0) { ne.pos--; ne.chars[ne.pos] = '_'; } }
    else if (ne.pos < 3) { ne.chars[ne.pos] = ch; ne.pos++; if (ne.pos >= 3) finishName(); }
  }
  function nameKey(e) {
    const ne = G.nameEntry; if (!ne) return; const k = e.key, n = OB.NAME_CHARS.length;
    if (k === 'ArrowLeft') ne.cursor = (ne.cursor + n - 1) % n;
    else if (k === 'ArrowRight') ne.cursor = (ne.cursor + 1) % n;
    else if (k === 'ArrowUp') ne.cursor = Math.max(0, ne.cursor - 10);
    else if (k === 'ArrowDown') ne.cursor = Math.min(n - 1, ne.cursor + 10);
    else if (k === 'Enter' || k === ' ') nameSelect(ne.cursor);
    else if (k === 'Backspace') nameSelect(OB.NAME_CHARS.indexOf('<'));
    else if (/^[a-zA-Z0-9]$/.test(k)) nameSelect(OB.NAME_CHARS.indexOf(k.toUpperCase()));
  }
  function finishName() {
    const ne = G.nameEntry; if (!ne) return;
    const name = (ne.chars.map(c => c === '_' ? '' : c).join('') || 'ICE').slice(0, 3);
    G.ranking.push({ name, score: Math.floor(ne.score), route: ne.route }); G.ranking.sort((a, b) => b.score - a.score); G.ranking = G.ranking.slice(0, 5);
    store.set('ob_ranking', G.ranking); G.hiScore = G.ranking[0].score; G.pendingRecord = null; G.nameEntry = null;
    A.sfx('check'); G.mode = 'title'; newGame();
  }
  function leaveOver() { A.sfx('select'); startPressed = false; if (G.pendingRecord) enterName(); else { G.mode = 'title'; newGame(); } }
  // ---------- wipeout ----------
  function spawnParts(n) {
    const cx = W / 2 + (G.drawShift || 0) + (G.playerDX || 0), cy = 457 - 105;
    for (let i = 0; i < n; i++) G.parts.push({ x: cx + (Math.random() - 0.5) * 50, y: cy + (Math.random() - 0.5) * 30, vx: (Math.random() - 0.5) * 420, vy: -(220 + Math.random() * 260), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, life: 1.5 });
  }
  // OutRun-style crash: the bike is thrown up and barrel-rolls across the road, bouncing lower each time, while the
  // rider is flung off and lands sitting on the tarmac. Everything is in screen space around the bike's normal spot.
  function wipeout(n) {
    if (G.flip) return;
    const dir = G.playerX > 0 ? -1 : 1; // tumbles back toward the middle of the road
    G.flip = { t: 0, dir, x: 0, y: 0, vx: dir * 110, vy: -720, rot: 0, vr: dir * 9.5, bounces: 0, rest: 0 };
    G.rider = { x: 0, y: -40, vx: -dir * 70 + (Math.random() - 0.5) * 40, vy: -480, rot: 0, vr: -dir * 7, down: false };
    G.drift = 0; G.driftK = 0; G.invuln = 4; G.steer = 0; G.lean = 0;
    spawnParts(n); A.sfx('wipe'); A.sfx('flip');
  }
  function updateFlip(dt) {
    const f = G.flip; if (!f) return;
    f.t += dt;
    f.vy += 1500 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt;
    if (f.y >= 0) {
      f.y = 0;
      if (f.vy > 60) { // bounce: lower, slower, less spin; a puff of dust each time
        f.bounces++; f.vy = -f.vy * 0.5; f.vx *= 0.65; f.vr *= 0.6; G.shake = Math.max(G.shake, 0.6); A.sfx('bump');
        for (let i = 0; i < 10; i++) emitSmoke(i % 2 ? 1 : -1, f.x);
      } else { // down: skids to a stop lying on its side (nearest +-90 degrees), kicking up dust while it still slides
        f.vy = 0; f.vx *= Math.max(0, 1 - 3 * dt);
        const side = Math.round((f.rot - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2; f.rot += (side - f.rot) * Math.min(1, dt * 10); f.rest += dt;
        if (Math.abs(f.vx) > 15 && Math.random() < 0.6) emitSmoke(Math.sign(f.vx), f.x);
      }
    }
    const r = G.rider;
    if (r && !r.down) { r.vy += 1400 * dt; r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.vr * dt; if (r.y >= 0 && r.vy > 0) { r.y = 0; r.down = true; r.rot = 0; } }
    if (f.rest > 1.0 || f.t > 3.6) { G.flip = null; G.rider = null; G.invuln = 1.6; } // reset: rider back on the bike, which blinks while getting going
  }
  function updateParts(dt) {
    for (let i = G.parts.length - 1; i >= 0; i--) { const p = G.parts[i]; p.vy += 1100 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life -= dt; if (p.life <= 0 || p.y > H + 30) G.parts.splice(i, 1); }
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
    const all = T.laneList(), oncomingLane = all[all.length - 1];
    let lane, spr, speed;
    if (oncoming) { lane = oncomingLane; spr = OB.SPR[ONCOMING[Math.floor(rng() * ONCOMING.length)]]; speed = -G.maxSpeed * (0.22 + rng() * 0.16); }
    else {
      const pool = th.oncoming > 0 ? all.slice(0, all.length - 1) : all;
      lane = pool[Math.floor(rng() * pool.length)];
      spr = OB.SPR[CARS[Math.floor(rng() * CARS.length)]]; speed = G.maxSpeed * (th.min + rng() * (th.max - th.min));
    }
    // avoid stacking
    for (const c of G.cars) if (Math.abs(c.z - segIdx * segLen) < 8 * segLen && Math.abs(c.offset - lane) < 0.4) return false;
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
          if (dz > 0 && dz < 25 * segLen && Math.abs(o.offset - c.offset) < 0.4 && o.speed < c.speed) {
            const all = T.laneList(), last = all[all.length - 1];
            const cand = all.filter(l => Math.abs(l - c.offset) > 0.2 && !(th.oncoming > 0 && l === last));
            let best = null;
            for (const l of cand) { let free = true; for (const q of G.cars) if (q !== c && Math.abs(q.z - c.z) < 30 * segLen && Math.abs(q.offset - l) < 0.4) free = false; if (free) { best = l; break; } }
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
      if (car.oncoming) { G.speed = 0; G.health -= 18; G.ice -= 8; wipeout(8); }
      else if (G.speed - car.speed > G.maxSpeed * 0.55) { G.speed = 0; G.health -= 16; G.ice -= 7; wipeout(6); } // rear-ended at speed: over the bars
      else { G.speed = Math.min(G.speed, Math.max(0, car.speed * 0.45)); G.health -= 12; G.ice -= 5; spawnParts(2); }
      G.playerX += (G.playerX >= car.offset ? 1 : -1) * 0.12;
    } else if (kind === 'sprite') { G.speed = 0; G.health -= 20; G.ice -= 10; G.playerX += (G.playerX > 0 ? -1 : 1) * 0.18; wipeout(8); }
    else if (kind === 'wall') { G.speed *= 0.4; G.health -= 8; G.ice -= 3; }
    else if (kind === 'median') { G.speed *= 0.3; G.health -= 8; G.ice -= 4; }
    if (G.health <= 0) { G.health = 0; gameOver('wreck'); }
  }
  function checkCollisions(seg) {
    if (G.flip) return; // tumbling: nothing else can hit the bike
    const pz = G.position + G.playerZ, rw = seg.rw, RW = T.roadW;
    // hard edges: the pavement is rideable, but the railing / shopfront line at its outer edge is a wall (never into the river)
    const EDGE = 1.03; // bike centre; its outer side then just touches the railing, never beyond it
    if (Math.abs(G.playerX) > EDGE * rw) { G.playerX = Math.sign(G.playerX) * EDGE * rw; if (G.speed > G.maxSpeed * 0.2) G.speed *= 0.97; crash('wall'); }
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
    if (qualifies(G.score)) G.pendingRecord = { score: G.score, route: routeStr() };
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
      const newHi = qualifies(total); if (newHi) G.pendingRecord = { score: total, route: routeStr() };
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
    if (G.wipe > 0) G.wipe -= dt / 0.7;
    if (G.skidCd > 0) G.skidCd -= dt;
    if (G.goT > 0) G.goT -= dt;
    updateParts(dt); updateSmoke(dt); updateFlip(dt);
    G.bounce *= 0.8;
    const wantDrift = driftReq; driftReq = false;
    const mode = G.mode;
    if (mode === 'loading') return;
    if (mode === 'over' || (mode === 'play' && G.paused)) { G.speed = Math.max(0, G.speed - G.maxSpeed * dt * 0.6); if (mode === 'over') advance(dt, false); A.setEngine(0, false, false, false); return; }
    if (mode === 'title' || mode === 'radio' || mode === 'course' || mode === 'name') {
      if (mode === 'name') { G.nameEntry.time -= dt; if (G.nameEntry.time <= 0) { finishName(); return; } startPressed = false; tuneDir = 0; }
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
      if (mode === 'radio' && tuneDir) { const ns = A.stations.length; G.station = (((G.station + tuneDir) % ns) + ns) % ns; store.set('ob_station', G.station); A.playMusic(G.station); A.sfx('select'); }
      if (mode === 'course' && tuneDir) { const n = T.COURSES.length; G.course = (((G.course + tuneDir) % n) + n) % n; store.set('ob_course', G.course); A.sfx('select'); }
      tuneDir = 0;
      A.setEngine(G.speed / G.maxSpeed, false, false, A.ready());
      return;
    }
    if (mode === 'countdown') { // 3 - 2 - 1, three seconds flat; GO flashes over the first moments of play
      G.drawShift = 0;
      const before = Math.ceil(G.countdown); G.countdown -= dt; const after = Math.ceil(G.countdown);
      if (after !== before && after > 0) A.sfx('beep');
      if (G.countdown <= 0) { G.mode = 'play'; G.goT = 0.9; A.sfx('go'); }
      G.speed = 0; A.setEngine(0.05 + (keys.gas ? 0.15 : 0), keys.gas, false, true);
      return;
    }
    // ---- play / goal physics ----
    const seg = T.findSegment(G.position + G.playerZ);
    const pct = G.speed / G.maxSpeed;
    const usingTouch = G.touchMode && touch.active;
    const flipping = !!G.flip;
    if (touch.fingers >= 2) touch.twoT += dt; else touch.twoT = 0; // a held second finger brakes; quick taps do not
    const gas = mode === 'play' && !flipping ? (keys.gas || (G.touchMode && touch.twoT < 0.18)) : false;
    const brake = mode === 'play' && !flipping ? (keys.brake || (G.touchMode && touch.twoT >= 0.18)) : true;
    const steerIn = mode === 'play' && !flipping ? (usingTouch ? touch.steer : ((keys.left ? -1 : 0) + (keys.right ? 1 : 0))) : 0;
    // drift: double tap (or Shift) while steering hard at speed. Sharper turn, less push from the curve, some speed scrubbed.
    if (wantDrift && mode === 'play' && !flipping && G.drift <= 0 && pct > 0.3 && Math.abs(steerIn) > 0.5) { G.drift = 1.1; G.driftDir = Math.sign(steerIn); G.score += 300; A.sfx('drift'); G.skidCd = 0.4; }
    if (G.drift > 0) { G.drift -= dt; if (Math.abs(steerIn) < 0.3 || pct < 0.15 || Math.sign(steerIn) !== G.driftDir) G.drift = 0; }
    const drifting = G.drift > 0;
    G.driftK += ((drifting ? 1 : 0) - G.driftK) * Math.min(1, dt * (drifting ? 12 : 5));
    // handling: quick to turn in, quicker to straighten up; less grip on the pavement; the curve pushes you outward
    G.steer += (steerIn - G.steer) * Math.min(1, dt * (Math.abs(steerIn) > Math.abs(G.steer) ? 10 : 14));
    G.lean += ((G.steer * Math.min(1, pct * 2 + 0.2)) - G.lean) * Math.min(1, dt * 8);
    const offroad = Math.abs(G.playerX) > 1.0 * seg.rw;
    const dx = pct > 0.01 ? dt * (0.35 + 2.1 * pct) : 0;
    const prevX = G.playerX;
    G.playerX += G.steer * dx * (offroad ? 0.75 : 1) * (1 + 0.35 * G.driftK);
    G.playerX -= dx * pct * seg.curve * 0.25 * (1 - 0.55 * G.driftK);
    updateMarks(dt, (G.playerX - prevX) * T.roadW * 0.8 * (G.cameraDepth / G.playerZ) * K); // the road (and rubber on it) slides the other way as the camera follows
    if (flipping) G.speed = Math.max(0, G.speed - G.maxSpeed * 2 * dt);
    else if (gas) G.speed += (G.maxSpeed / 3.4) * (1.2 - pct * 0.85) * dt;
    else if (brake) G.speed -= G.maxSpeed * 0.85 * dt;
    else G.speed -= G.maxSpeed / 7 * dt;
    if (drifting) G.speed -= G.maxSpeed * 0.12 * dt; else if (pct > 0.8 && Math.abs(G.steer) > 0.85) G.speed -= G.maxSpeed * 0.04 * dt; // tyres scrub speed
    if (offroad) { if (G.speed > G.maxSpeed * 0.45) G.speed -= G.maxSpeed * 0.7 * dt; if (pct > 0.1) G.bounce = (Math.random() - 0.5) * 4 * pct; }
    G.speed = OB.clamp(G.speed, 0, G.maxSpeed);
    // tyre smoke + rubber: burnout off the line and drifting lay marks; a hard corner at speed only smokes a little
    const burnout = mode === 'play' && !flipping && gas && pct < 0.3, corner = mode === 'play' && !flipping && !drifting && pct > 0.6 && Math.abs(G.steer) > 0.85;
    if (burnout) G.smokeAcc += dt * 520; else if (drifting) G.smokeAcc += dt * 460; else if (corner) G.smokeAcc += dt * 90;
    while (G.smokeAcc >= 1) { G.smokeAcc -= 1; emitSmoke(drifting ? -G.driftDir : (corner ? -Math.sign(G.steer) : 0)); }
    if (!burnout && !drifting && !corner) G.smokeAcc = 0;
    if (burnout && pct > 0.005) layMark(5); else if (drifting) layMark(7);
    if (mode === 'play' && G.skidCd <= 0 && (drifting || (pct > 0.55 && Math.abs(G.steer) > 0.85))) { A.sfx('skid'); G.skidCd = drifting ? 0.35 : 0.6; }
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
      if (G.goalT > 4.5 && startPressed) { startPressed = false; A.stopMusic(); if (G.pendingRecord) enterName(); else { G.mode = 'title'; newGame(); } }
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
    newGame(c.key, c.stageNo); G.mode = 'countdown'; G.countdown = 3; G.speed = 0; G.playerX = 0; A.sfx('beep');
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
      case 'name': R.name(G); break;
      case 'countdown': R.hud(G); R.countdown(G); break;
      case 'play': R.hud(G); if (G.goT > 0) R.go(G); if (G.paused) { OB.text(R.ctx || document.getElementById('screen').getContext('2d'), 'PAUSE', W / 2, 200, { size: 24, sy: 1.3, fill: '#fff', outline: '#000', outlineW: 6, align: 'center' }); } break;
      case 'goal': R.hud(G); R.goal(G); break;
      case 'over': R.hud(G); R.gameover(G); break;
    }
  }
  // start-press handling for 'over'
  window.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && G.mode === 'over') leaveOver(); });

  // debug/testing hook: jump straight into a given stage
  OB.debugCrash = function () { wipeout(8); }; OB.debugDrift = function () { driftReq = true; };
  OB.debugStage = function (key, no) {
    T.reset(); G.stageNo = no || 2; G.stageKey = key; G.route = ['charoenkrung', key]; G.nextKey = null; G.nextInfo = null;
    G.cur = buildStage(key, G.stageNo); G.light = T.THEMES[T.STAGES[key].theme].light;
    G.position = 0; G.playerX = -0.3; G.speed = G.maxSpeed * 0.5; G.cars = []; G.time = 90; G.mode = 'play'; G.drawShift = 0; G.smoke = []; G.parts = [];
    G.flip = null; G.rider = null; G.drift = 0; G.driftK = 0; G.marks = []; markLast = -1; G.goT = 0;
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
