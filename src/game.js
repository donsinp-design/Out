// OutRun Bangkok — game state, physics, traffic, input, main loop
(function (OB) {
  'use strict';
  const W = OB.W, H = OB.H, K = H / 2;
  const T = OB.track, A = OB.audio, R = OB.render;
  const G = {
    mode: 'loading', t: 0, position: 0, playerX: 0, playerZ: 0, cameraH: 1000, cameraDepth: 0, fov: 100, drawDistance: 300,
    speed: 0, maxSpeed: 12000, steer: 0, lean: 0, bgOffset: 0, bgShift: 0, cars: [], health: 100, ice: 100, time: 80, score: 0,
    nearMiss: 0, yadom: 0, yadomT: 0,   // พลังยาดม: near misses banked, the jar waiting to be tapped, seconds of it left
    stageNo: 1, stageKey: 'charoenkrung', light: 'day', station: 0, hiScore: 0, msg: null, shake: 0, invuln: 0, bounce: 0,
    forkHint: null, wallCd: 0, countdown: 0, overReason: null, result: null, seed: 20240808, paused: false, route: [], cur: null, nextInfo: null, nextKey: null,
    muted: false, drawShift: -200, playerDX: 0, course: 0, touchMode: false,
    wipe: 0, wipeDir: 1, parts: [], skidCd: 0, ranking: [], pendingRecord: null, nameEntry: null,
    flip: null, rider: null, drift: 0, driftDir: 1, driftHold: 0, driftCd: 0, driftK: 0, marks: [], goT: 0, pops: [], mult: 1, multStep: 1, multWhy: '', multLock: 0, draft: 0,
    day: 0, week: 0, bags: 3, delivered: 0, chain: 0, chainBest: 0, rec: null, ghost: null, ghostCar: null, medal: 0,
    // sprite-driven rider / world state
    crash: null, bumpT: 0, braking: false, crouch: false, riderT: 0, vxLat: 0, flutter: 0,
    hopY: 0, hopV: 0, stackY: 0, stackV: 0, stackC: 0, splashT: 0, splashSide: 1,
    cam: { pitch: 0, lean: 0, squash: 0, zoom: 1 }
  };
  OB.G = G;
  const WD = OB.world;
  // a knock to the ice stack: it lifts, then settles (and compresses if it lands hard)
  G.stackKick = function (k) { G.stackV -= 70 * k; };
  G.cameraDepth = 1 / Math.tan((G.fov / 2) * Math.PI / 180);
  G.playerZ = G.cameraDepth * G.cameraH * K / (457 - OB.HORIZON);
  const PLAYER_W = 480 / T.roadW;
  // พลังยาดม - inhaler power. Fifteen near misses puts the jar in the corner; tapping it freezes the clock for
  // five seconds while the bike runs 30% over its own top speed and picks its own line through the traffic.
  // YADOM_LIM is how far out the auto-line is allowed to end up. The line itself never asks to go past 0.78 of the
  // half width, but at 30% over top speed the curve pushes the bike outward faster than the steering can answer, so
  // it was arriving at the railing anyway; the lane is held here so the drift has nowhere to take it.
  const YADOM_NEED = 15, YADOM_TIME = 5, YADOM_SPEED = 1.3, YADOM_LIM = 0.95;
  // The line the bike takes on its own during พลังยาดม. Every place across the road is scored on the room it
  // leaves against the traffic ahead, weighted by how soon each car arrives, against how far it is from where the
  // bike already is so it does not weave for the sake of it, and against how far it is from the middle - the first
  // version had no such pull and happily picked the kerb, which is a wall, so it dodged the cars straight into it.
  // The samples stop well inside the road edge for the same reason.
  function dodgeLine(seg) {
    const pz = G.position + G.playerZ, RW = T.roadW, rw = seg.rw, ahead = [];
    for (const c of G.cars) {
      const dz = c.z - pz;
      if (dz < -250 || dz > 6500) continue;
      ahead.push({ x: c.offset * T.findSegment(c.z).rw, half: (PLAYER_W + c.spr.w / RW) / 2 + 0.06, near: OB.clamp(1 - dz / 6500, 0, 1) });
    }
    // and what is standing at the kerb, which is what caught it out next: a parked tuk-tuk is wide enough to
    // reach a bike sitting in the outside lane, so the line has to account for the roadside too
    const si = Math.floor(pz / T.segLen);
    for (let k = 0; k < 22; k++) {
      const s2 = T.segments[si + k]; if (!s2) break;
      for (const sp of s2.sprites) {
        const spr = sp.spr; if (!spr.solid) continue;
        const full = spr.w / RW, anchor = sp.anchor || 'center';
        let cx = sp.offset; if (anchor === 'left') cx -= full / 2; else if (anchor === 'right') cx += full / 2;
        ahead.push({ x: cx, half: (PLAYER_W + full * (spr.thin || 1)) / 2 + 0.05, near: OB.clamp(1 - k / 22, 0, 1) });
      }
    }
    // and the stalls and carts standing on the tarmac, which are actors rather than segment sprites
    for (const p of WD.propsAhead(pz, 6500, [])) ahead.push({ x: p.x, half: p.half + PLAYER_W / 2 + 0.04, near: OB.clamp(1 - p.dz / 6500, 0, 1) });
    // a central reservation is a wall down the middle of the road, so the line has to pick a side of it
    if (seg.median > 0) ahead.push({ x: 0, half: seg.median * rw + PLAYER_W * 0.5 + 0.04, near: 1 });
    const LIM = 0.78 * rw;
    // With nothing in the way the line is the middle of the road. It used to return nothing at all here, which
    // left the steering untouched, so the bike simply held whatever line the last dodge had left it on - usually
    // out by the kerb. The middle is also what the scoring pulls towards once the traffic clears: the pull is now
    // the stronger of the two soft terms, so a dodge is a deliberate move off centre and back again, rather than
    // a drift that never comes back. Both are still small beside the penalty for sharing a lane with anything.
    if (!ahead.length) return 0;
    let best = G.playerX, bestScore = -1e9;
    for (let i = -12; i <= 12; i++) {
      const x = (i / 12) * LIM;
      let sc = -Math.abs(x - G.playerX) * 0.25 - Math.abs(x) * 1.1, room = 0;
      for (const a of ahead) {
        const gap = Math.abs(x - a.x) - a.half;
        if (gap < 0) sc -= (3 + 7 * a.near) * (1 - gap); else room += Math.min(gap, 0.25) * a.near;
      }
      // the elbow room a line leaves is worth having, but it is capped: added up over a busy street it used to
      // outweigh the pull to the middle on its own and park the bike in whichever outside lane happened to be
      // emptiest. Sharing a lane still costs at least 3, so a real dodge always wins over both.
      sc += Math.min(room, 0.4);
      if (sc > bestScore) { bestScore = sc; best = x; }
    }
    return best;
  }
  function yadomTap() {
    if (G.mode !== 'play' || !G.yadom || G.yadomT > 0) return false;
    G.yadom = 0; G.yadomT = YADOM_TIME;
    A.sfx('go'); A.sfx('clink');
    pop('พลังยาดม!', '#ff2d2d');
    return true;
  }
  const CARS = ['taxi', 'taxi', 'taxi_orange', 'taxi_blue', 'taxi_green', 'sedan', 'sedan', 'sedan_black', 'sedan_red', 'green', 'green_yellow', 'green_purple', 'truck', 'pickup', 'pickup_w', 'moto', 'moto', 'moto', 'moto',
    'tuktuk0', 'tuktuk1', 'tuktuk2', 'tuktuk3', 'tuktuk4'];
  const ONCOMING = []; // no traffic comes the other way; every theme's oncoming rate is 0 so all lanes run with us
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  G.ranking = store.get('ob_ranking', []); if (!Array.isArray(G.ranking)) G.ranking = [];
  { const legacy = parseInt(store.get('ob_hiscore', 0)) || 0; if (legacy > 0 && !G.ranking.length) G.ranking.push({ name: 'ICE', score: legacy, route: '' }); }
  G.hiScore = G.ranking.length ? G.ranking[0].score : 0;
  G.station = Math.min(A.stations.length - 1, Math.max(0, store.get('ob_station', 0) | 0)); G.course = Math.min(6, Math.max(0, store.get('ob_course', 0) | 0));
  // ---------- the daily road ----------
  // The world was built from one constant, so every run anybody ever rode was the same city. The seed is the date
  // now: today's road is the same road for everyone playing today, which is what makes one score comparable to
  // another, and tomorrow is a different one to learn. Both keys are UTC so the day turns over at the same instant
  // everywhere rather than handing whoever lives furthest east a private head start.
  function dayKey(d) { d = d || new Date(); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); }
  function weekKey(d) {
    const t = new Date(d || Date.now());
    t.setUTCHours(0, 0, 0, 0);
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));            // ISO weeks: the Thursday decides the year
    const jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return t.getUTCFullYear() * 100 + Math.ceil(((t - jan1) / 86400000 + 1) / 7);
  }
  function newDay() { G.day = dayKey(); G.week = weekKey(); G.seed = G.day; }
  newDay();
  OB.dayKey = dayKey; OB.weekKey = weekKey;
  OB.lightFor = (themeKey) => T.THEMES[themeKey].light;
  OB.NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').concat(['<', 'END']);

  // ---------- input ----------
  const keys = { left: false, right: false, gas: false, brake: false };
  let startPressed = false, tuneDir = 0, driftReq = false, lastKey = '', lastKeyT = 0;
  const KEYMAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'gas', w: 'gas', W: 'gas', x: 'gas', X: 'gas', ArrowDown: 'brake', s: 'brake', S: 'brake', z: 'brake', Z: 'brake' };
  window.addEventListener('keydown', e => {
    if (e.repeat) { if (KEYMAP[e.key]) e.preventDefault(); return; }
    A.init(); A.unlock();
    if (G.mode === 'name') { nameKey(e); e.preventDefault(); return; }
    if (e.key === 'f' || e.key === 'F') { toggleFullscreen(); e.preventDefault(); return; }
    if ((e.key === 'e' || e.key === 'E') && yadomTap()) { e.preventDefault(); return; }   // the jar, for anyone without a screen to tap
    if (G.mode === 'play' && G.paused) { pauseKey(e); e.preventDefault(); return; }
    if (G.mode === 'over' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'a' || e.key === 'd')) { const n = (OB.MENU_OVER || ['RETRY', 'TITLE']).length, d = (e.key === 'ArrowLeft' || e.key === 'a') ? n - 1 : 1; G.overSel = ((G.overSel || 0) + d) % n; A.sfx('select'); e.preventDefault(); return; }
    if (KEYMAP[e.key]) { keys[KEYMAP[e.key]] = true; e.preventDefault(); }
    // drift: Shift / Space while steering hard, or a quick double tap of the steering key
    const dirKey = KEYMAP[e.key] === 'left' || KEYMAP[e.key] === 'right' ? KEYMAP[e.key] : null;
    if (dirKey) { const now = performance.now(); if (lastKey === dirKey && now - lastKeyT < 300) driftReq = true; lastKey = dirKey; lastKeyT = now; }
    if (e.key === 'Shift' || (e.key === ' ' && G.mode === 'play')) driftReq = true;
    if (e.key === 'Enter' || e.key === ' ') { startPressed = true; e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'a') tuneDir -= 1; if (e.key === 'ArrowRight' || e.key === 'd') tuneDir += 1; // accumulate so fast double presses are not lost
    if (e.key === 'ArrowUp' && (G.mode === 'radio' || G.mode === 'course')) startPressed = true;
    if (e.key === 'm' || e.key === 'M') { G.muted = !G.muted; A.setMusicVolume(G.muted ? 0 : A.MUSIC_VOL); }
    if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && (G.mode === 'play')) { G.paused = true; G.menuSel = 0; }
  });
  // ---------- full screen + pause menu ----------
  // launched from the home screen (standalone web app): already edge to edge, so the full screen controls go away
  const STANDALONE = !!(navigator.standalone || (window.matchMedia && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches)));
  OB.standalone = STANDALONE;
  let fsFailed = false;
  function toggleFullscreen(quiet) {
    if (STANDALONE) return;
    const el = document.documentElement;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
      const fn = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!fn) { if (!quiet) fsUnavailable(); return; }
      const p = fn.call(el, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => { if (!quiet) fsUnavailable(); });
    } catch (e) { if (!quiet) fsUnavailable(); }
  }
  function fsUnavailable() { fsFailed = true; say('FULL SCREEN NOT AVAILABLE HERE', 'iPhone: เพิ่มไปยังหน้าจอโฮม / ใช้แนวนอน', 2.6, '#ffd800', 10); }
  OB.isFullscreen = () => STANDALONE || !!(document.fullscreenElement || document.webkitFullscreenElement);
  const MENU = STANDALONE ? ['RESUME', 'RESTART', 'MUSIC', 'QUIT TO TITLE']
    : ['RESUME', 'RESTART', 'MUSIC', 'FULL SCREEN', 'QUIT TO TITLE'];
  OB.MENU = MENU;
  function menuAction(i) {
    A.sfx('select');
    const m = MENU[i];
    if (m === 'RESUME') G.paused = false;
    else if (m === 'RESTART') { G.paused = false; startRun(); }
    else if (m === 'MUSIC') { G.muted = !G.muted; A.setMusicVolume(G.muted ? 0 : A.MUSIC_VOL); }
    else if (m === 'FULL SCREEN') toggleFullscreen();
    else if (m === 'QUIT TO TITLE') { G.paused = false; A.stopMusic(); G.mode = 'title'; newGame(); }
  }
  function pauseKey(e) {
    const n = MENU.length, k = e.key;
    if (k === 'ArrowUp' || k === 'w' || k === 'W') { G.menuSel = ((G.menuSel || 0) + n - 1) % n; A.sfx('name'); }
    else if (k === 'ArrowDown' || k === 's' || k === 'S') { G.menuSel = ((G.menuSel || 0) + 1) % n; A.sfx('name'); }
    else if (k === 'Enter' || k === ' ') menuAction(G.menuSel || 0);
    else if (k === 'Escape' || k === 'p' || k === 'P') G.paused = false;
  }
  function overAction(i) {
    if (G.pendingRecord) { leaveOver(); return; }
    A.sfx('select'); startPressed = false;
    const label = (OB.MENU_OVER || [])[i];
    if (label === 'RENAME') { store.set('ob_name', ''); OB.savedNameLabel = null; OB.MENU_OVER = ['RETRY', 'TITLE']; G.overSel = 0; }
    else if (label === 'TITLE') { G.mode = 'title'; newGame(); }
    else startRun();
  }
  window.addEventListener('keyup', e => { if (KEYMAP[e.key]) { keys[KEYMAP[e.key]] = false; e.preventDefault(); } });
  // Touch: no on-screen buttons at all. The bike accelerates by itself; one finger on the left half of the glass
  // is a full left drift and one on the right half a full right one, for as long as it is held; two fingers down
  // together brake. Menus are tapped. A small pause button sits top-right during play.
  const touch = { steer: 0, active: false, fingers: 0 };
  const pointers = new Map();
  // Drop every held input. A finger whose lift was never delivered (it happens on iOS) would otherwise sit in the
  // map for good: steering follows the first finger recorded, so the bike would steer itself and ignore the real
  // finger, and that carries into the next run. Same for a key whose keyup was lost while the page was away.
  function resetInput() { pointers.clear(); touch.active = false; touch.steer = 0; touch.fingers = 0; for (const k in keys) keys[k] = false; driftReq = false; }
  window.addEventListener('blur', resetInput); window.addEventListener('pagehide', resetInput);
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetInput(); });
  // portrait phone: the stage is rotated 90 degrees by CSS to fill the screen; touches are mapped back through it
  function toCanvas(e) {
    const cv = document.getElementById('screen'), r = cv.getBoundingClientRect();
    if (document.body.classList.contains('rot')) return { x: (e.clientY - r.top) / r.height * W, y: (r.right - e.clientX) / r.width * H };
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }
  function fitPortrait() { const rot = G.touchMode && window.innerHeight > window.innerWidth * 1.1; document.body.classList.toggle('rot', rot); }
  window.addEventListener('resize', fitPortrait); window.addEventListener('orientationchange', () => setTimeout(fitPortrait, 200));
  // Take the keyboard. The game is usually embedded in someone else's page, and a click on a frame does not by
  // itself hand that frame the keys - the more so because the press handler below calls preventDefault, which is
  // what would otherwise have moved focus. Without this a player on a computer can start a run with the mouse and
  // then not drive it: no gas, no steering, not one keydown delivered. Asking for focus on every press costs
  // nothing when the page already has it, and takes it back the moment they click the game again.
  function grabKeys() {
    try { if (!document.hasFocus()) window.focus(); } catch (e) { }
  }
  OB.hasKeys = () => { try { return document.hasFocus(); } catch (e) { return true; } };
  function bindTouch() {
    const cv = document.getElementById('screen');
    G.touchMode = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const upd = () => {
      touch.fingers = pointers.size;
      if (!pointers.size) { touch.active = false; touch.steer = 0; return; }
      // Which half of the screen the finger is on, and that is the whole of it: a touch anywhere left is full
      // left lock, anywhere right is full right. It used to read how far out towards the edge the finger was,
      // which meant a thumb resting near the middle barely turned at all and nobody could tell why.
      const first = pointers.values().next().value; // the first finger down steers; extra fingers only count
      touch.steer = first.x < W / 2 ? -1 : 1; touch.active = true;
    };
    let swipeX = null;
    cv.addEventListener('pointerdown', e => {
      A.init(); A.unlock(); grabKeys();
      const pc = toCanvas(e), ix = pc.x, iy = pc.y;
      const inBox = (b) => !!b && ix >= b.x && ix <= b.x + b.w && iy >= b.y && iy <= b.y + b.h;
      if (e.pointerType !== 'mouse' && !G.touchMode) { G.touchMode = true; fitPortrait(); }
      if (G.mode === 'play' && !G.paused && G.yadom && inBox(R.hit.yadom) && yadomTap()) { e.preventDefault(); return; }
      if (G.mode === 'play' && G.paused) { const row = R.hit.rows.find(inBox); if (row) menuAction(row.i); else if (inBox(R.hit.pause)) G.paused = false; }
      else if (G.mode === 'play' && inBox(R.hit.pause)) { G.paused = true; G.menuSel = 0; A.sfx('select'); }
      else if (G.mode === 'play' || G.mode === 'countdown') {
        // capture the pointer so a hard turn that drags the finger past the canvas edge keeps steering
        // instead of firing pointerleave (read as the finger lifting) and snapping the steering to zero
        if (e.pointerType !== 'mouse') {
          pointers.set(e.pointerId, { x: ix, y: iy });
          upd(); try { cv.setPointerCapture(e.pointerId); } catch (_) {}
        }
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
      else if (G.mode === 'over') { const row = R.hit.rows.find(inBox); if (row) overAction(row.i); else if (!R.hit.rows.length) leaveOver(); }
      else if (G.mode === 'title' && inBox(R.hit.fs)) toggleFullscreen();
      else { startPressed = true; if (G.mode === 'title' && G.touchMode && !OB.isFullscreen() && !fsFailed) toggleFullscreen(true); }
      e.preventDefault();
    });
    cv.addEventListener('pointermove', e => { const o = pointers.get(e.pointerId); if (o) { const c = toCanvas(e); o.x = c.x; o.y = c.y; upd(); } });
    // There is no drift gesture left to listen for here. It was a second finger, then a pad to slide a thumb
    // into, then a quick tap that had to not travel - every one of them something to get right while the other
    // thumb was busy steering. The press itself is the drift now, decided in the update from which half of the
    // glass is being held, so a finger going down or coming up only has to be counted.
    const end = e => {
      if (pointers.delete(e.pointerId)) upd();
      if (swipeX !== null && (G.mode === 'radio' || G.mode === 'course')) { const ix = toCanvas(e).x; if (Math.abs(ix - swipeX) > 70) tuneDir = ix > swipeX ? 1 : -1; }
      swipeX = null;
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end); cv.addEventListener('pointerleave', end); cv.addEventListener('lostpointercapture', end);
    // The Touch API's touches list is the ground truth for fingers on the glass. Pointer events fire before the
    // matching touch event, so at each touch transition the map should hold exactly touches.length fingers; any
    // surplus is a finger whose lift went missing. Stale entries are always the oldest, so trim from the front.
    const reconcile = e => {
      const n = e.touches ? e.touches.length : 0; let guard = 0;
      while (pointers.size > n && guard++ < 10) pointers.delete(pointers.keys().next().value);
      upd();
    };
    for (const t of ['touchstart', 'touchend', 'touchcancel']) cv.addEventListener(t, reconcile, { passive: true });
  }

  // ---------- game setup ----------
  function buildStage(key, no) {
    const info = T.buildStage(key, no, G.seed);
    WD.populate(info.from, info.to, T.STAGES[key].theme, G.seed + no * 101 + key.length);
    return info;
  }
  function newGame(key, stageNo) {
    newDay();                        // a tab left open overnight starts the next run on the new day's road
    T.reset(); WD.clear();
    G.crash = null; G.bumpT = 0; G.hopY = 0; G.hopV = 0; G.stackY = 0; G.stackV = 0; G.stackC = 0; G.splashT = 0; G.flutter = 0; G.cam.pitch = 0; G.cam.lean = 0; G.cam.squash = 0; G.cam.zoom = 1;
    G.stageNo = stageNo || 1; G.stageKey = key || 'charoenkrung'; G.route = [G.stageKey]; G.nextKey = null; G.nextInfo = null;
    G.cur = buildStage(G.stageKey, G.stageNo);
    G.light = OB.lightFor(T.STAGES[G.stageKey].theme);
    G.position = 0; G.playerX = 0; G.speed = 0; G.steer = 0; G.lean = 0; G.bgOffset = 0;
    G.health = 100; G.ice = 100; G.score = 0; G.time = T.STAGES[G.stageKey].time + (G.stageNo > 1 ? 10 : 0);
    G.nearMiss = 0; G.yadom = 0; G.yadomT = 0;
    G.cars = []; G.msg = null; G.shake = 0; G.invuln = 0; G.forkHint = null; G.result = null; G.overReason = null; G.paused = false; G.mult = 1; G.multStep = 1; G.multArmed = false; G.multLock = 0; G.draft = 0;
    G.wipe = 0; G.parts = []; G.skidCd = 0; G.pops = [];
    G.flip = null; G.rider = null; G.drift = 0; G.driftHold = 0; G.driftCd = 0; G.driftK = 0; G.marks = []; markLast = -1; G.goT = 0;
    G.bags = BAGS_FULL; G.delivered = 0; G.chain = 0; G.chainBest = 0; G.medal = 0;
    recStart(); ghostStart();
    for (let i = 0; i < 8; i++) spawnCar(60 + i * 40);
  }
  // ---------- tyre marks ----------
  // The road behind the rear wheel is only a sliver in this view (the bike sits on the bottom edge), so rubber fixed to the
  // tarmac would vanish within a frame. The trail is a screen-space effect instead: points laid under the tyre
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
  // ---------- horns ----------
  // Traffic leans on the horn when the bike crowds it: cutting across a bonnet, sitting in a blind spot, or a hit.
  // Rate-limited per vehicle and globally, so heavy traffic never turns into a wall of noise.
  let hornCd = 0;
  // `force` is for the events that must always be heard — a hit, or a dodge close enough to count. Without it the
  // ordinary proximity honk fires first as you close in, sets the vehicle's cooldown, and swallows the one that matters.
  function horn(c, urgency, force) {
    if (hornCd > 0 && !force) return;
    if (c) { if (c.hornT > 0 && !force) return; c.hornT = 2.2 + Math.random() * 2; }
    if (force) hornCd = 0;
    hornCd = 0.28 + Math.random() * 0.25;
    A.sfx('horn', urgency);
    // an angry driver gets a second blast in; leave room after the first so it reads as two, not one long one
    if (urgency > 0.8 && Math.random() < 0.5) setTimeout(() => A.sfx('horn', urgency * 0.8), 620);
  }
  // any vehicle the bike is crowding from behind or alongside sounds off
  function proximityHorns(dt, G) {
    const pz = G.position + G.playerZ, RW = T.roadW, pct = G.speed / G.maxSpeed;
    for (const c of G.cars) {
      if (c.hornT > 0) { c.hornT -= dt; continue; }
      const dz = c.z - pz; if (dz < -700 || dz > 1500) continue;
      const cseg = T.findSegment(c.z);
      const halfSum = (PLAYER_W + c.spr.w / RW) / 2, lat = Math.abs(G.playerX - c.offset * cseg.rw);
      if (lat > halfSum * 1.5) continue;
      const behind = dz > 140 && dz < 900 && pct > 0.5 && G.speed > c.speed * 1.15;  // tailgating it
      const beside = Math.abs(dz) < 260 && lat < halfSum * 1.15;                      // squeezing alongside
      if (behind || beside) horn(c, beside ? 0.9 : 0.5);
    }
  }
  // ---------- combo multiplier ----------
  // One live multiplier feeds every score the run earns. It climbs while the riding is good — flat out, drifting,
  // tucked in a slipstream, and simply not taking damage — and drops straight back to 1.00 on any hit, so the
  // reward is continuous rather than a lump sum on a timer.
  const MULT_MAX = 9.99;
  // The combo starts when the bike has actually been at its top speed, not merely near it: the needle has to hit
  // the stop. The rate bonus for holding it up there is a band rather than a point, or it would blink on and off
  // against the speed clamp.
  const MULT_ARM_PCT = 1, MULT_TOP_PCT = 0.96;
  const MULT_LOCK = 5;                               // seconds off the combo after a hit, before it can be earned again
  function multGain(G, pct) {
    if (!G.multArmed) return 0;
    let g = 0.45;                                    // clean riding, the base rate
    if (pct > MULT_TOP_PCT) g += 1.05;               // held at top speed
    // and braking is riding too. Standing on the brake for a corner dropped the bike out of the top-speed band and
    // the combo simply stopped climbing, which punished the one thing that keeps a fast line clean.
    if (G.braking && pct > 0.3) g += 1.0;
    if (G.drift > 0) g += 1.15;
    if (G.draft > 0.25) g += 1.1 * G.draft;
    return g;
  }
  function multLabel(G, pct) {
    if (G.draft > 0.25) return 'DRAFT';
    if (G.drift > 0) return 'DRIFT';
    if (G.braking && pct > 0.3) return 'BRAKING';
    if (pct > MULT_TOP_PCT) return 'MAX SPEED';
    return 'NO DAMAGE';
  }
  // The combo coming and going is not announced any more. The multiplier appearing under the score is the whole
  // notice that it has started, and it going is the whole notice that it has gone.
  G.breakCombo = function (hard) {
    if (G.yadomT > 0) return;                         // and the combo survives พลังยาดม whatever it drives through
    G.mult = 1; G.multStep = 1; G.multArmed = false;  // earn it back by getting flat out again
    G.chain = 0;                                      // and everything strung together since the last shop with it
    G.multLock = MULT_LOCK;                           // and not straight away: a hit costs you the next few seconds
  };
  // ---------- the load ----------
  // The ice was only ever a second clock. It is cargo now: three bags leave the depot with you and at least two
  // have to reach each shop, so a leg is a delivery you can fail rather than a distance you survive. A bag bursts
  // when the bike goes down - not when it is scraped or nudged - which buys exactly one wipeout a leg and makes
  // the second one the end of the run. The count resets to three at every checkpoint, so a leg is never lost
  // before it starts.
  const BAGS_FULL = 3, BAGS_NEED = 2;
  function loseBag() {
    if (G.yadomT > 0 || G.bags <= 0) return;
    G.bags--;
    pop(G.bags >= BAGS_NEED ? 'BAG BURST  ' + G.bags + '/' + BAGS_FULL : 'LOAD SHORT  ' + G.bags + '/' + BAGS_FULL, G.bags >= BAGS_NEED ? '#7fe0ff' : '#ff6a5a');
  }
  // Delivering is the leg's whole point, so it is where the leg's riding gets paid: the chain is everything clean
  // you strung together to get here, and it banks at the shop door or not at all.
  function deliver(label) {
    if (G.bags < BAGS_NEED) { gameOver('short'); return false; }
    const bagPts = Math.round(G.bags * 4000 * G.mult), chainPts = Math.round(G.chain * 250 * G.mult);
    G.delivered += G.bags; G.score += bagPts + chainPts;
    G.chainBest = Math.max(G.chainBest, G.chain); G.chain = 0;
    G.bags = BAGS_FULL;
    if (chainPts > 0) pop(label + '  ' + G.delivered + ' BAGS  +' + (bagPts + chainPts), '#3fd07a');
    return true;
  }
  // Everything clean, counted in a row. Distance alone made a wild run and a careful one land within about twice
  // each other; the chain is what a leg was actually worth, and a crash takes all of it.
  function chain(n) { G.chain += (n || 1); }
  // ---------- people crossing the road ----------
  // Someone stepping off the kerb is scenery with a scoreboard attached, never an obstacle: crossers are not in
  // the collision set at all, so nothing here can cost health, end a run or break the combo, and they always get
  // clear on their own feet. Threading the gap pays; going straight through where they were standing pays
  // nothing and only costs you the horn.
  const PED_NEAR = 0.62;
  OB.pedPass = function (gap) {
    if (G.mode !== 'play' || G.crash || G.yadomT > 0) return;
    if (gap < 0.17) { G.shake = Math.max(G.shake, 0.2); G.bumpT = 0.22; G.flutter = 1; pop('ระวัง!', '#ff6a5a'); return; }
    if (gap > PED_NEAR) return;
    chain(); const pts = Math.round(250 * G.mult); G.score += pts;
    A.sfx('whoosh'); G.flutter = 1;
    pop('CLOSE ONE +' + pts, '#7fe0ff');
  };
  // ---------- slipstream ----------
  // Sitting square behind a vehicle and close to it pulls you along: free speed for a risky line.
  function draftAmount(G) {
    const pz = G.position + G.playerZ, RW = T.roadW; let best = 0;
    for (const c of G.cars) {
      const dz = c.z - pz;
      if (dz < 140 || dz > 1600) continue;                       // ahead of us, not already touching
      const cseg = T.findSegment(c.z);
      const halfSum = (PLAYER_W + c.spr.w / RW) / 2, lat = Math.abs(G.playerX - c.offset * cseg.rw);
      const window = halfSum * 1.3;
      if (lat > window) continue;                                // has to be lined up behind it
      const near = 1 - (dz - 140) / 1460, line = 1 - lat / window;
      const size = Math.min(1.25, c.spr.w / 940);                // a truck punches a bigger hole in the air
      best = Math.max(best, near * line * size);
    }
    return Math.min(1, best);
  }
  // ---------- leaderboards ----------
  // Published as an artifact, the page gets a shared document store, so the boards are world-wide with no account,
  // key or server of our own. Anywhere else - the standalone build, the iPhone app, a copy dropped on a plain web
  // host - claude.use is simply absent, everything below stays null, and the game runs on its own local ranking.
  // Nothing here may ever throw into a run.
  //
  // Three boards, each ONE document holding a sorted array rather than a document per score, so no amount of
  // playing can grow into the store's document cap. Today's and this week's are the ones that matter: an all-time
  // list nobody can catch is not a competition, and a board that resets is a reason to come back tomorrow.
  const NET = { db: null, day: [], week: [], board: [], state: 'off', ghost: null };
  OB.net = NET;
  const BOARD_MAX = 20;
  const dayDoc = () => 'boards/d' + G.day, weekDoc = () => 'boards/w' + G.week, ghostDoc = () => 'ghosts/d' + G.day;
  // Gold, silver, bronze for the top three of a board, and nothing else: a medal says where you placed, it never
  // hands anybody a faster bike or a longer clock. A game that pays its best players in power keeps them in front
  // by arithmetic rather than by riding, and everyone behind stops being able to catch up at all.
  NET.medalFor = function (list, name, score) {
    if (!name) return 0;
    for (let i = 0; i < 3 && i < list.length; i++) if (list[i].name === name && list[i].score === Math.floor(score)) return i + 1;
    return 0;
  };
  (async function () {
    try {
      if (!window.claude || typeof claude.use !== 'function') return;
      const db = await claude.use('db');
      if (!db) return;
      NET.db = db; NET.state = 'on';
      const watch = (path, key) => db.doc(path).onSnapshot(
        s => { const d = s.exists ? s.data() : null; NET[key] = (d && Array.isArray(d.top)) ? d.top : []; },
        () => { NET.state = 'off'; });
      watch(dayDoc(), 'day'); watch(weekDoc(), 'week'); watch('scores/global', 'board');
      db.doc(ghostDoc()).onSnapshot(s => { NET.ghost = s.exists ? s.data() : null; }, () => { });
    } catch (e) { NET.state = 'off'; }
  })();
  async function pushBoard(path, row) {
    const doc = NET.db.doc(path), snap = await doc.get();
    const cur = (snap.exists && Array.isArray((snap.data() || {}).top)) ? (snap.data().top || []).slice() : [];
    cur.push(row); cur.sort((a, b) => b.score - a.score);
    const top = cur.slice(0, BOARD_MAX);
    await doc.set({ top });
    return top;
  }
  NET.submit = async function (name, score, route, rec) {
    if (!NET.db) return;
    const row = { name: name, score: Math.floor(score), route: route || '', at: Date.now() };
    try {
      const dayTop = await pushBoard(dayDoc(), row);
      await pushBoard(weekDoc(), row);
      await pushBoard('scores/global', row);
      G.medal = NET.medalFor(dayTop, name, score);
      // The ghost is whoever leads today, so it is filed only by the run that takes the lead. Positions are
      // rounded and sampled a few times a second: a whole run is some tens of kilobytes, well inside a document.
      if (rec && rec.pos.length > 8 && dayTop.length && dayTop[0].name === name && dayTop[0].score === Math.floor(score)) {
        await NET.db.doc(ghostDoc()).set({ name: name, score: Math.floor(score), route: route || '', dt: REC_DT, pos: rec.pos, x: rec.x });
      }
    } catch (e) { /* a full store or a lost grant must never break the run */ }
  };
  // ---------- the ghost ----------
  // Today's leader, riding today's road beside you. Not a replay of your own best: the point is that the person
  // to beat is in front of you where you can see the line they took, and the split says by how much. Recorded as
  // distance-along-the-road and lane position five times a second, which is enough to read a line and small
  // enough to be one document.
  const REC_DT = 0.2;
  function recStart() { G.rec = { t: 0, pos: [], x: [] }; }
  function recTick(dt) {
    const r = G.rec; if (!r) return;
    r.t += dt;
    while (r.pos.length * REC_DT <= r.t) { r.pos.push(Math.round(G.position)); r.x.push(Math.round(G.playerX * 1000)); }
    if (r.pos.length > 6000) r.pos.length = r.x.length = 6000;        // ~20 minutes; nobody rides that long
  }
  // Only ride against a ghost that took the same forks: once the routes part, the two of you are on different
  // roads and its distance means nothing here.
  function ghostStart() {
    const g = NET.ghost;
    G.ghost = (g && Array.isArray(g.pos) && g.pos.length > 8) ? { t: 0, dt: g.dt || REC_DT, pos: g.pos, x: g.x || [], name: g.name || '???', route: g.route || '', pz: 0, gx: 0, live: true } : null;
  }
  function ghostTick(dt) {
    const gh = G.ghost; if (!gh) { G.ghostCar = null; return; }
    gh.t += dt;
    const f = gh.t / gh.dt, i = Math.floor(f);
    if (i >= gh.pos.length - 1) { gh.live = false; G.ghostCar = null; return; }   // they finished; nothing left to chase
    const k = f - i;
    gh.pz = gh.pos[i] + (gh.pos[i + 1] - gh.pos[i]) * k;
    gh.gx = (gh.x[i] + (gh.x[i + 1] - gh.x[i]) * k) / 1000;
    gh.live = gh.route === '' || routeStr() === gh.route.slice(0, routeStr().length);
    // handed to the renderer as one more vehicle, so it sits in the same per-segment draw order as the traffic
    // and is occluded by the road exactly as a real bike would be
    if (!gh.live || !OB.SPR.moto) { G.ghostCar = null; return; }
    const gz = gh.pz + G.playerZ, gseg = T.findSegment(gz);
    G.ghostCar = { z: gz, offset: gh.gx / (gseg.rw || 1), spr: OB.SPR.moto, ghost: true, brake: 0, ind: 0, oncoming: false, speed: 0 };
  }
  // ---------- today, on this phone ----------
  // Every finished run is written here the moment it ends - not only the ones that beat something. A list you can
  // get on to only by breaking your own record looks exactly like a list that keeps wiping itself: you ride, the
  // run ends, nothing is there. So: one key, one entry per run, kept per day.
  //
  // Nothing in the game ever clears storage, and a rebuild published to the same address keeps the same origin, so
  // these survive it. Reads are defensive on purpose - anything unreadable is treated as "no days yet" and merged
  // into rather than replaced, so a single bad value can never take the rest of the day's runs with it.
  const DAYS_KEY = 'ob_days_v1', DAYS_KEEP = 14, DAY_ROWS = 10;
  function allDays() { const d = store.get(DAYS_KEY, null); return (d && typeof d === 'object' && !Array.isArray(d)) ? d : {}; }
  function todayRuns() { const r = allDays()[String(G.day)]; return Array.isArray(r) ? r : []; }
  OB.todayRuns = todayRuns;
  function logRun(score, reason) {
    if (!(score > 0)) return;
    const all = allDays(), key = String(G.day);
    const rows = (Array.isArray(all[key]) ? all[key] : []).slice();
    rows.push({ s: Math.floor(score), b: G.delivered, c: G.chainBest, st: G.stageNo, r: reason || '', at: Date.now() });
    rows.sort((a, b) => b.s - a.s);
    all[key] = rows.slice(0, DAY_ROWS);
    const keys = Object.keys(all).sort((a, b) => Number(b) - Number(a)).slice(0, DAYS_KEEP);   // a fortnight, newest first
    const keep = {}; for (const k of keys) keep[k] = all[k];
    store.set(DAYS_KEY, keep);
  }
  // ---------- records / name entry ----------
  function qualifies(score) { return score >= 1000 && (G.ranking.length < 5 || score > G.ranking[G.ranking.length - 1].score); }
  function routeStr() { return G.route.map(k => T.STAGES[k].name.eng.split(' ').map(w => w[0]).join('')).join('>'); }
  // The name is remembered between runs: once it has been entered, a new record is filed under it straight away and
  // the entry screen is skipped, so a crash restarts immediately. Hold RENAME on the game over screen to change it.
  function savedName() { const n = String(store.get('ob_name', '') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3); return n || null; }
  function fileRecord(rec, name) {
    OB.net.submit(name, rec.score, rec.route, rec.run);
    G.ranking.push({ name, score: Math.floor(rec.score), route: rec.route });
    G.ranking.sort((a, b) => b.score - a.score); G.ranking = G.ranking.slice(0, 5);
    store.set('ob_ranking', G.ranking); G.hiScore = G.ranking[0].score; G.pendingRecord = null; G.nameEntry = null;
  }
  function enterName(force) {
    const saved = savedName();
    if (saved && !force) { fileRecord(G.pendingRecord, saved); G.mode = 'title'; newGame(); return; }
    G.mode = 'name'; G.nameEntry = { chars: ['_', '_', '_'], pos: 0, cursor: 0, time: 30, score: G.pendingRecord.score, route: G.pendingRecord.route };
  }
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
    store.set('ob_name', name); // remembered, so the next record files itself and the entry screen is skipped
    fileRecord({ score: ne.score, route: ne.route }, name);
    A.sfx('check'); G.mode = 'title'; newGame();
  }
  function leaveOver() { A.sfx('select'); startPressed = false; if (G.pendingRecord) enterName(); else { G.mode = 'title'; newGame(); } }
  // ---------- wipeout ----------
  function spawnParts(n) {
    const cx = W / 2 + (G.drawShift || 0) + (G.playerDX || 0), cy = 457 - 105;
    for (let i = 0; i < n; i++) G.parts.push({ x: cx + (Math.random() - 0.5) * 50, y: cy + (Math.random() - 0.5) * 30, vx: (Math.random() - 0.5) * 420, vy: -(220 + Math.random() * 260), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, life: 1.5 });
  }
  // Crash, with the sheet's fall frames: IMPACT -> LOSE CONTROL -> EJECT -> AIRBORNE -> GROUND HIT -> SLIDE -> STOP -> RECOVER,
  // about 1.9 s. Direction follows lateral momentum, else the side of the impact. Rider and bike are separate
  // screen-space objects around the bike's normal spot; the ice becomes world-space debris.
  function wipeout(n, hitX) {
    if (G.crash) return;
    const v = G.vxLat || 0;
    const dir = Math.abs(v) > 0.12 ? Math.sign(v) : (hitX !== undefined && hitX !== null ? (hitX > G.playerX ? 1 : -1) : (G.playerX > 0 ? -1 : 1));
    G.crash = { t: 0, dir, phase: 'lose', rider: { x: 0, y: 0, vx: dir * 150, vy: -440 }, bike: { x: 0, vx: dir * 150 }, spilled: false, groundT: 0, recT: 0 };
    G.drift = 0; G.driftK = 0; G.invuln = 3.5; G.steer = 0; G.lean = dir * 0.95; G.bumpT = 0;
    spawnParts(n); A.sfx('wipe'); A.sfx('flip'); G.shake = 1.4; G.shakeFast = true;
  }
  const pxToRoad = () => 1 / ((G.cameraDepth / G.playerZ) * K * T.roadW);
  function updateCrash(dt) {
    const c = G.crash; if (!c) return; c.t += dt;
    const pz = G.position + G.playerZ, k = pxToRoad();
    if (c.phase === 'lose' && c.t >= 0.15) c.phase = c.dir < 0 ? 'eject' : 'air';
    if (c.phase === 'eject' && c.t >= 0.32) c.phase = 'air';
    if (c.phase === 'air' || c.phase === 'eject') {
      if (!c.spilled) { c.spilled = true; WD.spillIce(pz - 120, G.playerX, 5, 10, G.speed, c.dir); WD.dust(pz - 80, G.playerX, 'L'); A.sfx('clink'); }
      if (c.phase === 'air') { c.rider.vy += 1500 * dt; c.rider.x += c.rider.vx * dt; c.rider.y += c.rider.vy * dt;
        if (c.rider.y >= 0 && c.rider.vy > 0) { c.rider.y = 0; c.phase = 'ground'; c.groundT = 0; A.sfx('thud'); G.shake = Math.max(G.shake, 0.5); WD.dust(pz - 100, G.playerX + c.rider.x * k, 'M'); } }
    }
    if (c.t > 0.15) { c.bike.x += c.bike.vx * dt; c.bike.vx *= Math.max(0, 1 - 2.4 * dt); if (Math.abs(c.bike.vx) > 40 && Math.random() < dt * 9) WD.dust(pz - 120, G.playerX + c.bike.x * k, 'S', { alpha: 0.6 }); }
    if (c.phase === 'ground') { c.groundT += dt; c.rider.x += c.rider.vx * dt; c.rider.vx *= Math.max(0, 1 - 3.5 * dt); if (Math.abs(c.rider.vx) > 30 && Math.random() < dt * 8) WD.dust(pz - 100, G.playerX + c.rider.x * k, 'S', { alpha: 0.5 }); if (c.groundT > 0.5) { c.phase = 'recover'; c.recT = 0; } }
    else if (c.phase === 'recover') { c.recT += dt; if (c.recT > 0.5) c.phase = 'done'; }
    if (c.phase === 'done' || c.t > 2.6) { G.crash = null; G.invuln = 1.5; G.lean = 0; }
  }
  function updateParts(dt) {
    for (let i = G.parts.length - 1; i >= 0; i--) { const p = G.parts[i]; p.vy += 1100 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life -= dt; if (p.life <= 0 || p.y > H + 30) G.parts.splice(i, 1); }
  }
  function say(text, sub, dur, fill, size) { G.msg = { text, sub, t: dur || 2, dur: dur || 2, fill, size }; }
  // a short score tag that rises off the rider, so a bonus is seen the moment it is earned rather than only in the total
  function pop(text, fill) { G.pops.push({ text, fill: fill || '#ffd800', t: 0 }); }
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
      if (spr.moto) speed = G.maxSpeed * (0.72 + rng() * 0.24);   // riders filter through far quicker than the cars
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
      if (!c.oncoming && !c.passed && c.z < pz - 200 && G.mode === 'play') { c.passed = true; G.score += Math.round(300 * G.mult); }
      // lane AI (same direction): avoid slower car ahead in same lane. A lane change is announced first:
      // indicator on and a small drift toward the line for a moment, then the move.
      if (c.brake > 0) c.brake -= dt;
      if (!c.oncoming) {
        for (const o of G.cars) {
          if (o === c || o.oncoming) continue;
          const dz = o.z - c.z;
          if (dz > 0 && dz < 25 * segLen && Math.abs(o.offset - c.offset) < 0.4 && o.speed < c.speed) {
            const all = T.laneList(), last = all[all.length - 1];
            const cand = all.filter(l => Math.abs(l - c.offset) > 0.2 && !(th.oncoming > 0 && l === last));
            let best = null;
            for (const l of cand) { let free = true; for (const q of G.cars) if (q !== c && Math.abs(q.z - c.z) < 30 * segLen && Math.abs(q.offset - l) < 0.4) free = false; if (free) { best = l; break; } }
            if (best !== null) { if (!c.intent) c.intent = { lane: best, t: c.spr.moto ? 0.55 : 0 }; } // riders dive for the gap
            else if (c.spr.moto) { /* a bike just filters past rather than queueing */ }
            else { if (c.speed > o.speed * 0.95) c.brake = 0.5; c.speed = Math.max(o.speed * 0.95, G.maxSpeed * 0.15); }
          }
        }
        if (c.intent) {
          c.intent.t += dt; c.ind = Math.sign(c.intent.lane - c.offset);
          if (c.intent.t < 0.7) c.offset += c.ind * 0.03 * dt; // reading the intention
          else { c.targetLane = c.intent.lane; if (Math.abs(c.targetLane - c.offset) < 0.01) { c.intent = null; c.ind = 0; } }
        } else c.ind = 0;
        if (Math.abs(c.targetLane - c.offset) > 0.005) c.offset += Math.sign(c.targetLane - c.offset) * Math.min(Math.abs(c.targetLane - c.offset), dt * 0.5);
      }
    }
    if (ahead < th.density && Math.random() < 0.5) spawnCar();
  }

  // ---------- collisions ----------
  function crash(kind, car) {
    if (G.yadomT > 0) return;   // พลังยาดม is invincible: nothing lands inside its five seconds
    if (kind === 'wall' || kind === 'median') { if (G.wallCd > 0) return; G.wallCd = 0.9; }
    else if (G.invuln > 0) return;
    A.sfx(kind === 'wall' || kind === 'median' ? 'bump' : 'crash');
    if (kind === 'car') horn(car && car.spr ? car : null, 1, true);            // whoever you hit lays on it
    G.shake = 1; G.invuln = 1.3; G.bounce = 4; G.breakCombo();
    if (kind === 'car') {
      const carX = car.offset * T.findSegment(car.z).rw;
      if (car.oncoming) { G.speed = 0; G.health -= 18; G.ice -= 8; loseBag(); wipeout(3, carX); }
      else if (G.speed - car.speed > G.maxSpeed * 0.55) { G.speed = 0; G.health -= 16; G.ice -= 7; loseBag(); wipeout(2, carX); } // rear-ended at speed: over the bars
      else { G.speed = Math.min(G.speed, Math.max(0, car.speed * 0.45)); G.health -= 12; G.ice -= 5; G.bumpT = 0.35; G.stackKick(0.8); WD.spillIce(G.position + G.playerZ, G.playerX, 0, 3, G.speed, G.playerX >= carX ? 1 : -1); }
      G.playerX += (G.playerX >= carX ? 1 : -1) * 0.12;
    } else if (kind === 'sprite') { G.speed = 0; G.health -= 20; G.ice -= 10; loseBag(); wipeout(3, car); G.playerX += (G.playerX > 0 ? -1 : 1) * 0.18; }
    else if (kind === 'wall') { G.speed *= 0.4; G.health -= 8; G.ice -= 3; }
    else if (kind === 'median') { G.speed *= 0.3; G.health -= 8; G.ice -= 4; }
    if (G.health <= 0) { G.health = 0; gameOver('wreck'); }
  }
  function checkCollisions(seg) {
    if (G.crash) return; // down already: nothing else can hit the bike
    const pz = G.position + G.playerZ, rw = seg.rw, RW = T.roadW;
    // พลังยาดม dodges the traffic, so the sides must not be what ends the run instead: for its five seconds the
    // railing, the median and everything standing at the kerb hold the bike off rather than put it down, the same
    // deal the traffic already gets. The auto-line still steers around all of it - this is only the backstop.
    const yadom = G.yadomT > 0;
    // hard edges: the pavement is rideable, but the railing / shopfront line at its outer edge is a wall (never into the river)
    const EDGE = 1.03; // bike centre; its outer side then just touches the railing, never beyond it
    if (Math.abs(G.playerX) > EDGE * rw) {
      G.playerX = Math.sign(G.playerX) * EDGE * rw;
      if (!yadom) { if (G.speed > G.maxSpeed * 0.2) G.speed *= 0.97; crash('wall'); }
    }
    // median
    if (seg.median > 0) {
      const mw = seg.median * rw + PLAYER_W * 0.5;
      if (Math.abs(G.playerX) < mw) { const s = G.playerX >= 0 ? 1 : -1; G.playerX = s * (mw + 0.02); if (!yadom) crash('median'); }
    }
    // roadside sprites (this + next segment)
    if (!yadom) for (let k = 0; k < 2; k++) {
      const s2 = T.segments[seg.index + k]; if (!s2) break;
      for (const sp of s2.sprites) {
        const s = sp.spr; if (!s.solid) continue;
        const sw = (s.w / RW) * (s.thin || 1);
        let cx = sp.offset; const full = s.w / RW; const anchor = sp.anchor || 'center';
        if (anchor === 'left') cx = sp.offset - full / 2; else if (anchor === 'right') cx = sp.offset + full / 2;
        if (OB.overlap(G.playerX, PLAYER_W, cx, sw, 0.9)) { crash('sprite', cx); return; }
      }
    }
    // cars
    for (const c of G.cars) {
      const dz = c.z - pz;
      const cseg = T.findSegment(c.z);
      const lat = Math.abs(G.playerX - c.offset * cseg.rw);
      // Near dodge, measured at the exact moment of passing. Sampling the gap once per frame cannot see this at
      // all: at racing speed the bike covers the whole few-hundred-unit passing zone in two or three frames, so
      // most vehicles are never sampled beside the bike even once, and the closest point of a pass that is
      // sampled falls between frames. Instead watch for the frame where the vehicle crosses from ahead of the
      // bike to behind it (or the reverse, when a faster one comes past) and interpolate the lateral gap at the
      // crossing itself, which does not depend on the frame rate. A gap inside the contact boundary means they
      // touched, so it pays nothing. Bigger vehicles keep the wider flinch; oncoming traffic pays more.
      if (!c.whooshed && c.pdz !== undefined && (c.pdz > 0) !== (dz > 0)) {
        const span = c.pdz - dz;
        if (span > 0 && span < segLen * 10) { // a sane one-frame step, not a gap left by the crash freeze
          c.whooshed = true;
          const gap = c.plat + (lat - c.plat) * OB.clamp(c.pdz / span, 0, 1);
          const halfSum = (PLAYER_W + c.spr.w / RW) / 2, crashHalf = halfSum * 0.8;
          const clearance = gap - crashHalf;
          if (clearance > 0 && clearance < halfSum) {
            const big = c.spr.w >= 1100;
            A.sfx('whoosh'); G.shake = Math.max(G.shake, big ? 0.3 : 0.2); G.bumpT = 0.35; G.flutter = 1;
            G.playerX += (G.playerX >= c.offset * cseg.rw ? 1 : -1) * (big ? 0.03 : 0.02); G.stackKick(big ? 0.5 : 0.35);
            chain(); const pts = Math.round((c.oncoming ? 600 : 300) * G.mult); G.score += pts;
          pop('NEAR MISS +' + pts, c.oncoming ? '#ff6a5a' : '#ffd800');
          if (!G.yadom && G.yadomT <= 0 && ++G.nearMiss >= YADOM_NEED) { G.nearMiss = 0; G.yadom = 1; A.sfx('check'); pop('ยาดม READY', '#3fd07a'); }
          horn(c, 0.9, true);                              // they lean on it as you cut past
          }
        }
      }
      c.pdz = dz; c.plat = lat;
      if (dz < -segLen * 0.6 || dz > segLen * 1.4) continue;
      // the near-miss scoring above still counts during พลังยาดม; only the contact does not, so a car that moves
      // across the line the bike had already committed to cannot end a run inside its own five seconds
      if (G.yadomT > 0) continue;
      if (OB.overlap(G.playerX, PLAYER_W, c.offset * cseg.rw, c.spr.w / RW, 0.8)) {
        if (c.oncoming) { crash('car', c); c.z = pz + segLen * 2; return; }
        if (G.speed > c.speed) {
          if (G.speed - c.speed < G.maxSpeed * 0.18) { // gentle nudge: match speed, no damage
            G.speed = c.speed * 0.92; G.shake = Math.max(G.shake, 0.3); if (G.wallCd <= 0) { A.sfx('bump'); horn(c, 1, true); G.wallCd = 0.5; }
          } else crash('car', c);
          return;
        }
      }
    }
  }

  // ---------- progression ----------
  function gameOver(reason) {
    if (G.mode === 'over') return;
    G.mode = 'over'; G.overReason = reason; G.forkHint = null; G.overSel = 0; A.stopMusic(); A.sfx('over'); resetInput();
    logRun(G.score, reason);                          // logged whether or not it beat anything
    OB.savedNameLabel = savedName(); OB.MENU_OVER = OB.savedNameLabel ? ['RETRY', 'TITLE', 'RENAME'] : ['RETRY', 'TITLE'];
    if (qualifies(G.score)) G.pendingRecord = { score: G.score, route: routeStr(), run: G.rec };
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
      if (!deliver('DELIVERED')) return;              // short load: the run ends at the shop door
      const bonus = Math.ceil(G.time) * 1000; G.score += bonus;
      G.stageNo++; G.stageKey = G.nextKey; G.route.push(G.nextKey); G.cur = G.nextInfo; G.nextInfo = null;
      const st = T.STAGES[G.stageKey]; G.time += st.time; G.ice = Math.min(100, G.ice + 22); G.health = Math.min(100, G.health + 12);
      G.light = OB.lightFor(st.theme);
      say('CHECK POINT', 'ส่งน้ำแข็ง  ·  ต่อเวลา +' + st.time, 2.6, '#ffd800', 22); A.sfx('check');
    }
    if (cur.goalAt && !cur.goalDone && i >= cur.goalAt) {
      cur.goalDone = true;
      if (!deliver('LAST DROP')) return;
      G.mode = 'goal'; G.forkHint = null; A.sfx('goal'); G.goalT = 0;
      const timeBonus = Math.ceil(G.time) * 3000, iceBonus = Math.round(G.ice) * 5000;
      const total = G.score + timeBonus + iceBonus;
      logRun(total, 'goal');
      const newHi = qualifies(total); if (newHi) G.pendingRecord = { score: total, route: routeStr(), run: G.rec };
      G.result = { timeBonus, iceBonus, route: G.route.map(k => T.STAGES[k].name.eng).join(' > '), total, reveal: -1, newHi, base: G.score };
    }
  }

  // ---------- update ----------
  function update(dt) {
    G.t += dt;
    if (G.msg) G.msg.t -= dt;
    for (let i = G.pops.length - 1; i >= 0; i--) { G.pops[i].t += dt; if (G.pops[i].t > 1.1) G.pops.splice(i, 1); }
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 3);
    if (G.invuln > 0) G.invuln -= dt;
    if (G.wallCd > 0) G.wallCd -= dt;
    if (G.wipe > 0) G.wipe -= dt / 0.7;
    if (G.skidCd > 0) G.skidCd -= dt;
    if (G.goT > 0) G.goT -= dt;
    if (G.bumpT > 0) G.bumpT -= dt;
    if (G.splashT > 0) G.splashT -= dt;
    if (G.flutter > 0) G.flutter -= dt * 1.5;
    updateParts(dt); updateCrash(dt);
    if (G.mode !== 'loading') WD.update(dt, G);
    G.bounce *= 0.8;
    // ice stack: a spring that lifts on knocks and compresses on landings; hop of the whole bike over bumps
    G.stackV += (-G.stackY * 260 - G.stackV * 9) * dt; G.stackY += G.stackV * dt;
    if (G.stackY > 2.5) { G.stackY = 2.5; if (G.stackV > 40) { G.stackC = Math.min(1, G.stackV / 120); G.stackV *= -0.35; } else G.stackV = 0; }
    if (G.stackC > 0) G.stackC = Math.max(0, G.stackC - dt * 6);
    if (G.hopV > 0 || G.hopY > 0) { G.hopY += G.hopV * dt; G.hopV -= 900 * dt; if (G.hopY <= 0) { G.hopY = 0; if (G.hopV < -120) { G.stackC = 1; G.cam.squash = 1; G.shake = Math.max(G.shake, 0.25); A.sfx('bump'); if (G.hopV < -250) { G.stackKick(0.6); WD.dust(G.position + G.playerZ - 40, G.playerX, 'S', { alpha: 0.6 }); } } G.hopV = 0; } }
    // camera: everything short-lived
    const cam = G.cam, pctNow = G.speed / G.maxSpeed;
    cam.zoom += ((1 - 0.035 * OB.clamp((pctNow - 0.8) / 0.2, 0, 1)) - cam.zoom) * Math.min(1, dt * 3);
    cam.squash = Math.max(0, cam.squash - dt * 9);
    if (G.shake > 0 && G.shakeFast) { G.shake = Math.max(0, G.shake - dt * 10); if (G.shake <= 0) G.shakeFast = false; }
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
        if (mode === 'title') { A.playMusic(G.station); A.setMusicVolume(G.muted ? 0 : A.MUSIC_VOL); startRun(); } // pickers hidden for now: straight into the run
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
    const yk = G.yadomT > 0 ? YADOM_SPEED : 1;
    const flipping = !!G.crash;
    // Touch is two states and nothing else. One finger is a drift to whichever half of the glass it is on; a
    // second finger down at the same time is the brake, and while it is down the bike goes straight - a brake
    // that also threw the bike into whichever drift the first thumb happened to land in would be unusable.
    // The brake had a pad in each top corner, because it used to want a third finger.
    const tBrake = G.touchMode && touch.fingers >= 2;
    const usingTouch = G.touchMode && touch.active && !tBrake;
    const gas = mode === 'play' && !flipping ? (keys.gas || (G.touchMode && !tBrake)) : false;
    const brake = mode === 'play' && !flipping ? (keys.brake || tBrake) : true;
    let steerIn = mode === 'play' && !flipping
      ? (usingTouch ? touch.steer : ((keys.left ? -1 : 0) + (keys.right ? 1 : 0)))
      : 0;
    if (G.yadomT > 0 && mode === 'play' && !flipping) {
      // steer for the line, damped by how fast the bike is already moving sideways. Proportional control alone
      // overshot every target and put it on the kerb: at this speed the bike crosses a lane in a few frames.
      const t = dodgeLine(seg);
      if (t !== null) steerIn = OB.clamp((t - G.playerX) * 2.6 - (G.vxLat || 0) * 0.4, -1, 1);
      if (Math.abs(G.playerX) > 0.82 * seg.rw) steerIn = -Math.sign(G.playerX);   // never let it reach the wall
    }
    // Drift, on touch, is the press. A finger anywhere on the left half throws the bike into a full left drift
    // and keeps it there for as long as it is held; the right half does the same the other way. Nothing to hold
    // for, nothing to double tap, no second finger - the side of the glass is the whole control. While the press
    // lasts the drift is topped back up rather than restarted, so one corner is one drift however long it runs.
    let askDrift = wantDrift;
    if (usingTouch && mode === 'play' && !flipping && G.yadomT <= 0) {
      if (G.drift > 0 && Math.sign(steerIn) === G.driftDir) G.drift = Math.max(G.drift, 0.3); else askDrift = true;
    }
    // on the keyboard it is still Shift, space or a double tap of the arrow, with the arrow held into the turn,
    // and it holds for a moment afterwards so a key lifting cannot cancel it at once
    const driftIn = Math.abs(steerIn) > 0.5 ? steerIn : 0;
    if (G.driftCd > 0) G.driftCd -= dt;
    if (askDrift && mode === 'play' && !flipping && G.drift <= 0 && pct > 0.3 && Math.abs(driftIn) > 0.5) {
      G.drift = 1.1; G.driftDir = Math.sign(driftIn); G.driftHold = 0.45;
      // the bonus and the skid are once a corner, not once a press: with a press starting a drift outright,
      // flicking from side to side would otherwise pay out several times a second
      if (G.driftCd <= 0) { chain(); G.score += Math.round(300 * G.mult); A.sfx('drift'); G.skidCd = 0.4; G.driftCd = 1.2; }
    }
    if (G.drift > 0) {
      G.drift -= dt;
      if (G.driftHold > 0) G.driftHold -= dt;
      else if (Math.abs(steerIn) < 0.3 || pct < 0.15 || Math.sign(steerIn) !== G.driftDir) G.drift = 0;
    }
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
    if (G.yadomT > 0 && mode === 'play' && !flipping) G.playerX = OB.clamp(G.playerX, -YADOM_LIM * seg.rw, YADOM_LIM * seg.rw);
    updateMarks(dt, (G.playerX - prevX) * T.roadW * 0.8 * (G.cameraDepth / G.playerZ) * K); // the road (and rubber on it) slides the other way as the camera follows
    G.vxLat += ((G.playerX - prevX) / dt - G.vxLat) * Math.min(1, dt * 12);
    // rider pose inputs and short camera cues
    const speedPrev = G.speed;
    G.braking = brake && pct > 0.04 && !flipping;
    G.riderT += dt * (3 + 9 * pct + 6 * Math.max(0, G.flutter));
    G.cam.lean += ((-G.steer * 3) - G.cam.lean) * Math.min(1, dt * 6);
    if (flipping) G.speed = Math.max(0, G.speed - G.maxSpeed * 2 * dt);
    else if (gas) G.speed += (G.maxSpeed / 3.4) * (1.2 - pct * 0.85 / yk) * dt * (1 + 0.55 * (G.draft || 0)) * yk; // the tow pulls harder than the engine alone
    else if (brake) G.speed -= G.maxSpeed * 0.85 * dt;
    else G.speed -= G.maxSpeed / 7 * dt;
    if (drifting) G.speed -= G.maxSpeed * 0.12 * dt; else if (pct > 0.8 && Math.abs(G.steer) > 0.85) G.speed -= G.maxSpeed * 0.04 * dt; // tyres scrub speed
    if (offroad) { if (G.speed > G.maxSpeed * 0.45) G.speed -= G.maxSpeed * 0.7 * dt; if (pct > 0.1) { G.bounce = (Math.random() - 0.5) * 4 * pct; if (Math.random() < dt * 3) { G.bumpT = 0.2; G.stackKick(0.4 * pct); } } }
    // a slipstream lets you run past your own top speed while you stay in it
    G.speed = OB.clamp(G.speed, 0, G.maxSpeed * yk * (1 + 0.07 * (G.draft || 0)));
    const accel = (G.speed - speedPrev) / dt;
    G.crouch = !flipping && ((gas && accel > G.maxSpeed * 0.12 && pct < 0.5) || pct > 0.9);
    G.cam.pitch += (((gas && accel > G.maxSpeed * 0.1 && pct < 0.7) ? 2 : 0) - G.cam.pitch) * Math.min(1, dt * 8);
    if (pct > 0.45 && Math.random() < dt * (0.4 + 4 * Math.pow(pct, 3))) G.stackV += (Math.random() - 0.5) * 6 * pct; // road buzz through the stack
    // rubber: a burnout off the line and a drift both lay marks
    const burnout = mode === 'play' && !flipping && gas && pct < 0.3;
    if (burnout && pct > 0.005) layMark(5); else if (drifting) layMark(7);
    if (mode === 'play' && G.skidCd <= 0 && (drifting || (pct > 0.55 && Math.abs(G.steer) > 0.85))) { A.sfx('skid'); G.skidCd = drifting ? 0.35 : 0.6; }
    if (mode === 'play') { recTick(dt); ghostTick(dt); checkCollisions(seg); }
    advance(dt, true);
    if (mode === 'play') {
      if (G.yadomT > 0) { G.yadomT = Math.max(0, G.yadomT - dt); if (G.yadomT === 0) A.sfx('melt'); }
      else { G.time -= dt; if (G.time <= 0) { G.time = 0; gameOver('time'); return; } }   // the clock is held for the five seconds
      G.ice -= dt * (100 / 290) * (pct < 0.08 ? 1.6 : 1);
      if (G.ice <= 0) { G.ice = 0; gameOver('ice'); return; }
      if (G.ice < 25 && Math.floor(G.t * 2) !== Math.floor((G.t - dt) * 2) && Math.floor(G.t * 2) % 4 === 0) A.sfx('melt');
      if (hornCd > 0) hornCd -= dt;
      proximityHorns(dt, G);
      // the multiplier climbs with the riding and every point earned is scaled by it
      G.draft = G.draft + (draftAmount(G) - G.draft) * Math.min(1, dt * 6);
      if (G.multLock > 0) G.multLock -= dt;
      if (!G.multArmed && G.multLock <= 0 && pct >= MULT_ARM_PCT) G.multArmed = true;   // the needle has to touch the stop
      G.mult = Math.min(MULT_MAX, G.mult + multGain(G, pct) * dt * 0.11);
      G.multWhy = multLabel(G, pct);
      G.score += pct * dt * 2000 * G.mult;
      // each whole step of the multiplier is worth a breather, in place of the old flat bonus on a timer
      if (G.mult >= G.multStep + 1) {
        G.multStep = Math.floor(G.mult);
        G.health = Math.min(100, G.health + 4); G.ice = Math.min(100, G.ice + 5);
        pop(G.multStep.toFixed(0) + 'x ' + G.multWhy, '#7CFF7C'); A.sfx('check');
      }
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
    newGame(c.key, c.stageNo); resetInput(); G.mode = 'countdown'; G.countdown = 3; G.speed = 0; G.playerX = 0; A.sfx('beep');
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
      case 'play': R.hud(G); if (G.goT > 0) R.go(G); if (G.paused) R.pause(G); break;
      case 'goal': R.hud(G); R.goal(G); break;
      case 'over': R.hud(G); R.gameover(G); break;
    }
  }
  // start-press handling for 'over'
  window.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && G.mode === 'over') overAction(G.overSel || 0); });

  // debug/testing hook: jump straight into a given stage
  OB.debugCrash = function (hx) { wipeout(3, hx); }; OB.debugDrift = function () { driftReq = true; };
  OB.debugHit = function (kind) { G.invuln = 0; G.wallCd = 0; crash(kind || 'sprite', 0); };   // the real collision path, bag and all
  OB.debugStage = function (key, no) {
    T.reset(); WD.clear(); G.stageNo = no || 2; G.stageKey = key; G.route = ['charoenkrung', key]; G.nextKey = null; G.nextInfo = null;
    G.cur = buildStage(key, G.stageNo); G.light = OB.lightFor(T.STAGES[key].theme);
    G.position = 0; G.playerX = -0.3; G.speed = G.maxSpeed * 0.5; G.cars = []; G.time = 90; G.mode = 'play'; G.drawShift = 0; G.parts = [];
    G.flip = null; G.rider = null; G.drift = 0; G.driftHold = 0; G.driftCd = 0; G.driftK = 0; G.marks = []; markLast = -1; G.goT = 0; G.crash = null; G.pops = []; G.mult = 1; G.multStep = 1; G.multArmed = false; G.multLock = 0; G.draft = 0;
    for (let i = 0; i < 8; i++) spawnCar(40 + i * 45);
  };
  // Belt and braces beyond the CSS (-webkit-touch-callout etc. on #screen): some WebKit versions still start the
  // long-press selection/lookup loupe, or a browser context menu, on a canvas even with those properties set.
  // None of these gestures do anything useful over the game canvas, so they are vetoed outright at the DOM level.
  for (const t of ['contextmenu', 'selectstart', 'dragstart', 'gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(t, e => e.preventDefault());
  }
  // iOS runs its double-tap gestures (zoom, and the word-select loupe) off the touch stream, which neither the CSS
  // above nor preventDefault on a pointer event reaches — pointer events are synthesised separately, so vetoing
  // them leaves the touch defaults untouched. Cancel the second tap of a quick pair instead. Steering is driven
  // from pointer events, which have already fired by this point, and a double tap is not a touch control here
  // (drift is a held second finger), so nothing the game reads is lost.
  let lastTapEnd = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - lastTapEnd <= 350) e.preventDefault();
    lastTapEnd = now;
  }, { passive: false });
  document.addEventListener('dblclick', e => e.preventDefault());
  // and the start of the touch too: iOS decides some double-tap behaviour on the second touchstart, before touchend.
  // Pointer events, which carry the steering, are dispatched independently of the touch defaults, so this costs nothing.
  for (const t of ['touchstart', 'touchmove']) document.addEventListener(t, e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  // ---------- boot ----------
  const canvas = document.getElementById('screen');
  R.init(canvas); R.ctx = canvas.getContext('2d');
  R.loading(0);
  OB.loadAssets().then(() => {
    bindTouch(); fitPortrait();
    newGame();
    G.mode = 'title';
    requestAnimationFrame(loop);
  }).catch(err => { console.error(err); const c = canvas.getContext('2d'); c.fillStyle = '#fff'; c.fillText('LOAD ERROR: ' + err.message, 20, 40); });
})(window.OB);
