// OutRun Bangkok — the living street: pooled NPCs (pedestrians, dogs, cats, lizards) as state machines,
// destructible props with debris physics, road decals (puddles, manholes, cracks, leaves, speed bumps),
// ambient loops (cooking smoke, exhaust, dripping air-cons, flickering lights) and the speed streaks.
// Everything here is world-space: z along the road (units), x across it (road units, 1 = road edge), y up (units).
(function (OB) {
  'use strict';
  const W = OB.W, H = OB.H, K = H / 2;
  const T = OB.track;
  const WD = {}; OB.world = WD;
  const RW = () => T.roadW, segLen = () => T.segLen;

  // ---------- frames ----------
  const F = (name) => { const r = OB.FRAMES[name]; return r ? { img: OB.IMG.atlas, x: r[0], y: r[1], w: r[2], h: r[3], name } : null; };
  WD.F = F;
  // draw a frame: bottom-centre anchored, nearest-neighbour, optional mirror / rotation (about the anchor) / alpha
  WD.blit = function (ctx, f, cx, by, dw, dh, flip, rot, alpha) {
    if (!f || dw < 1 || dh < 1) return;
    if (dw > 4000 || dh > 4000) return;
    ctx.save();
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(Math.round(cx), Math.round(by));
    if (rot) ctx.rotate(rot);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(f.img, f.x, f.y, f.w, f.h, Math.round(-dw / 2), Math.round(-dh), Math.round(dw), Math.round(dh));
    ctx.restore();
  };
  // frame drawn about its centre (tumbling debris)
  WD.blitC = function (ctx, f, cx, cy, dw, dh, rot, alpha, flip) {
    if (!f || dw < 1 || dh < 1 || dw > 4000) return;
    ctx.save();
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(Math.round(cx), Math.round(cy)); if (rot) ctx.rotate(rot); if (flip) ctx.scale(-1, 1);
    ctx.drawImage(f.img, f.x, f.y, f.w, f.h, Math.round(-dw / 2), Math.round(-dh / 2), Math.round(dw), Math.round(dh));
    ctx.restore();
  };
  // screen position of a world point (z along the road, x in road units, y up) using the projected segment geometry
  WD.project = function (seg, z, x, y) {
    const p1 = seg.p1.screen, p2 = seg.p2.screen, f = OB.clamp((z - seg.index * segLen()) / segLen(), 0, 1);
    const cs = OB.lerp(p1.scale, p2.scale, f);
    return { sx: OB.lerp(p1.x, p2.x, f) + cs * x * RW() * K, sy: OB.lerp(p1.y, p2.y, f) - cs * (y || 0) * K, cs };
  };

  // ---------- pools ----------
  function Pool(n, make) { this.items = []; this.n = 0; for (let i = 0; i < n; i++) this.items.push(make()); }
  Pool.prototype.get = function () { if (this.n >= this.items.length) return null; const o = this.items[this.n++]; o.alive = true; return o; };
  Pool.prototype.kill = function (i) { this.n--; const o = this.items[i]; this.items[i] = this.items[this.n]; this.items[this.n] = o; o.alive = false; };
  Pool.prototype.clear = function () { for (let i = 0; i < this.n; i++) this.items[i].alive = false; this.n = 0; };
  WD.Pool = Pool;
  const actors = new Pool(1000, () => ({ alive: false }));
  const debris = new Pool(260, () => ({ alive: false }));
  const streaks = new Pool(30, () => ({ alive: false }));
  WD.actors = actors; WD.debris = debris; WD.streaks = streaks;

  // ---------- cast ----------
  // each character only ever uses its own frames, so the shirt never changes between poses
  const PEDS = {
    manWhite: { idle: ['PA_WALK'], walk: ['PA_WALK'], react: 'PA_JUMP', jump: 'PA_JUMP', run: ['PE_CHASE'], point: 'PA_JUMP' },
    manClap: { idle: ['PD_JUMP'], walk: ['PD_JUMP'], react: 'PD_JUMP', jump: 'PD_JUMP', run: ['PD_JUMP'], point: 'PC_JUMP', still: true },
    manBlue: { idle: ['PA_IDLE'], walk: ['PA_IDLE'], react: 'PA_IDLE', jump: 'PA_IDLE', run: ['PA_IDLE'], point: 'PA_IDLE', still: true },
    womanYellow: { idle: ['PB_IDLE'], walk: ['PB_IDLE'], react: 'PB_REACT', jump: 'PB_REACT', run: ['PB_REACT'], point: 'PB_REACT', still: true },
    womanBag: { idle: ['PA_REACT'], walk: ['PA_REACT'], react: 'PA_REACT', jump: 'PA_REACT', run: ['PA_REACT'], point: 'PA_REACT' },
    schoolgirl: { idle: ['PC_WALK'], walk: ['PC_WALK'], react: 'PC_REACT', jump: 'PB_WALK', run: ['PC_RUN'], point: 'PC_REACT' },
    schoolboy: { idle: ['PC_IDLE'], walk: ['PC_IDLE'], react: 'PC_IDLE', jump: 'PC_IDLE', run: ['PC_IDLE'], point: 'PC_IDLE', still: true },
    girlPink: { idle: ['PB_JUMP'], walk: ['PB_JUMP'], react: 'PB_JUMP', jump: 'PB_JUMP', run: ['PB_JUMP'], point: 'PB_JUMP', skip: true },
    tourist: { idle: ['PD_RUN'], walk: ['PD_RUN'], react: 'PD_RUN', jump: 'PD_RUN', run: ['PD_RUN'], point: 'PD_RUN', still: true, photo: true },
    photoWoman: { idle: ['PE_IDLE'], walk: ['PE_IDLE', 'PD_IDLE'], react: 'PD_IDLE', jump: 'PD_IDLE', run: ['PD_IDLE', 'PE_IDLE'], point: 'PE_IDLE' },
    monk: { idle: ['MONK_WALK'], walk: ['MONK_WALK', 'MONK_STEP'], react: 'MONK_REACT', jump: 'MONK_STEP', run: ['MONK_STEP', 'MONK_WALK'], point: 'MONK_REACT', calm: true }
  };
  const CAST = { shop: ['manWhite', 'manClap', 'manBlue', 'womanYellow', 'womanBag', 'schoolgirl', 'schoolgirl', 'schoolboy', 'girlPink', 'photoWoman', 'monk'],
    city: ['manWhite', 'manBlue', 'womanBag', 'photoWoman', 'schoolgirl', 'manClap'], temple: ['monk', 'monk', 'monk', 'tourist', 'womanYellow'], park: ['tourist', 'photoWoman', 'girlPink', 'schoolboy', 'manWhite', 'monk'], water: ['tourist', 'photoWoman'] };
  const UPX = { ped: 9, dog: 8, cat: 7, lizard: 7, stall: 10, cart: 10, chair: 7, cone: 6, box: 7, sign: 8, vendor: 9, fruit: 9, pot: 9, boxbit: 8, cube: 2.7, bag: 8, dust: 9, leaf: 7, splash: 8, drop: 6 };

  // ---------- spawning ----------
  let rngS = null;
  function spawn(kind, sub, z, x, extra) {
    const a = actors.get(); if (!a) return null;
    a.kind = kind; a.sub = sub; a.z = z; a.x = x; a.y = 0; a.vx = 0; a.vz = 0; a.state = 'idle'; a.t = 0; a.age = 0; a.seed = Math.random() * 1000;
    a.frame = null; a.flip = false; a.rot = 0; a.hop = 0; a.side = x < 0 ? -1 : 1; a.home = x; a.dir = 1; a.hit = false; a.alpha = 1; a.chased = false; a.timer = 0; a.walkPh = 0;
    a.body = null; a.runF = null;   // locked frames are per-life: a pooled actor must not inherit the last one's body
    a.called = false; a.pdz = undefined; a.plat = 0;   // and so is the one bark or meow it gets, and the pass it is measured across
    a.calm = Math.random(); a.notice = 900 + Math.random() * 1400; a.risk = 0.3 + Math.random() * 0.35; a.reactDelay = 0.05 + Math.random() * 0.35;
    if (extra) Object.assign(a, extra);
    return a;
  }
  WD.spawn = spawn;
  WD.clear = function () { actors.clear(); debris.clear(); streaks.clear(); };
  // called once per built stage: place the cast and props for segments [from, to)
  WD.populate = function (from, to, themeKey, seed) {
    const th = T.THEMES[themeKey], rng = OB.rng((seed || 1) * 31 + from), segs = T.segments;
    const L = segLen();
    const sideKinds = { L: th.left, R: th.right };
    for (let i = from + 40; i < to - 40; i++) {
      const seg = segs[i], rel = i - from, z = i * L + rng.range(0, L);
      for (const sd of ['L', 'R']) {
        const env = sideKinds[sd], s = sd === 'L' ? -1 : 1, rw = seg.rw;
        if (!env) continue;
        const pave = (o) => s * (rw + 0.02 + (env === 'water' ? Math.min(o, 0.05) : o)); // x on the pavement, o in 0..0.11
        // pedestrians: dense along shophouses, sparse elsewhere
        const pedEvery = env === 'shop' ? 13 : env === 'city' ? 22 : env === 'temple' ? 26 : env === 'park' ? 30 : 90;
        if ((rel + (sd === 'L' ? 0 : 7)) % pedEvery === 3 && rng.chance(0.8)) {
          const sub = rng.pick(CAST[env] || CAST.shop), p = spawn('ped', sub, z, pave(rng.range(0.01, 0.1)));
          if (p) { p.flip = rng.chance(0.5); p.state = PEDS[sub].still ? 'idle' : (rng.chance(0.55) ? 'walk' : 'idle'); p.dir = rng.chance(0.5) ? 1 : -1; if (PEDS[sub].calm) p.calm = 0.9; p.walkPh = rng.range(0, 6);
            if (rng.chance(0.3) && !PEDS[sub].still) { const q = spawn('ped', rng.pick(CAST[env] || CAST.shop), z + 120, pave(rng.range(0.01, 0.1))); if (q) { q.state = 'idle'; q.flip = !p.flip; p.state = 'idle'; p.talk = true; q.talk = true; } } }
        }
        // dogs: asleep by the wall, idling at the kerb, or about to cross
        if (env !== 'water' && (rel + (sd === 'L' ? 11 : 53)) % 95 === 0 && rng.chance(0.75)) {
          const r = rng();
          if (r < 0.3) spawn('dog', 'sleep', z, pave(0.09), { state: 'sleep', flip: rng.chance(0.5), calm: 1 });
          else if (r < 0.65) spawn('dog', 'stray', z, pave(0.02), { state: 'idle', flip: s > 0, dogSeed: rng() });
          else spawn('dog', 'cross', z, pave(0.0), { state: 'wait', flip: s > 0, crossTo: -s, crossAt: 6000 + rng.range(0, 6000) });
        }
        if (env === 'shop' && (rel + (sd === 'L' ? 29 : 71)) % 130 === 0) spawn('cat', 'cat', z, pave(rng.range(0.04, 0.1)), { state: 'idle', flip: rng.chance(0.5) });
        // destructible props
        if (env === 'shop' || env === 'city' || env === 'park') {
          if ((rel + (sd === 'L' ? 5 : 41)) % 73 === 0 && env !== 'park') spawn('stall', 'stall', z, pave(0.06), { state: 'idle', flip: s > 0 });
          if ((rel + (sd === 'L' ? 17 : 63)) % 111 === 0 && env === 'shop') spawn('cart', 'cart', z, pave(0.05), { state: 'idle', flip: s > 0 });
          if ((rel + (sd === 'L' ? 47 : 101)) % 150 === 0 && (env === 'city' || rng.chance(0.4))) { const n = 1 + rng.int(3); for (let k = 0; k < n; k++) spawn('cone', 'cone', z + k * 1.6 * L, s * (rw - 0.04 - k * 0.02), { state: 'idle' }); }
        }
      }
      // road decals
      if (!seg.decals) seg.decals = [];
      if (rel % 57 === 20 && rng.chance(0.6)) seg.decals.push({ f: 'PUDDLE_' + (rng.chance(0.5) ? 'S' : 'L'), x: rng.range(-0.8, 0.8) * seg.rw, upx: 14, kind: 'puddle', seed: rng() });
      if (rel % 91 === 44 && rng.chance(0.5)) seg.decals.push({ f: 'MANHOLE', x: rng.range(-0.6, 0.6) * seg.rw, upx: 10, kind: 'manhole' });
      if (rel % 67 === 10 && rng.chance(0.5)) seg.decals.push({ f: 'ROAD_CRACK', x: rng.range(-0.7, 0.7) * seg.rw, upx: 10, kind: 'crack' });
      if (rel % 73 === 31 && rng.chance(0.55)) seg.decals.push({ f: rng.chance(0.45) ? 'POTHOLE' : 'POTHOLE_S', x: rng.range(-0.82, 0.82) * seg.rw, upx: 10, kind: 'pothole', seed: rng() });
      if ((th.left === 'temple' || th.right === 'park') && rel % 41 === 7 && rng.chance(0.6)) seg.decals.push({ f: 'LEAVES', x: rng.range(-0.9, 0.9) * seg.rw, upx: 8, kind: 'leaves' });
      if ((themeKey === 'oldtown' || themeKey === 'chinatown' || themeKey === 'final_park') && rel % 260 === 130 && seg.median === 0) seg.decals.push({ f: 'SPEED_BUMP', x: 0, upx: 42, kind: 'bump' });
      // only a few of the lit signs ever flicker, each on its own phase
      for (const sp of seg.sprites) { const nm = sp.spr && sp.spr.name; if (nm && /sign|redsign|seven|thatien|ckrd/.test(nm) && rng.chance(0.08)) sp.flick = 1 + rng.range(0, 10); }
    }
  };

  // ---------- debris ----------
  function throwDebris(frame, z, x, y, vx, vy, vz, upx, opts) {
    const d = debris.get(); if (!d) return null;
    d.f = F(frame); d.z = z; d.x = x; d.y = y; d.vx = vx; d.vy = vy; d.vz = vz; d.upx = upx || 8; d.rot = 0; d.vr = (Math.random() - 0.5) * 14; d.t = 0;
    d.life = 2.2; d.bounce = 0.4; d.kind = 'bit'; d.alpha = 1; d.grow = 0; d.flip = false; d.rest = 0; d.sparkle = false;
    if (opts) Object.assign(d, opts);
    return d;
  }
  WD.throwDebris = throwDebris;
  // ice out of the stack: bags tumble, cubes bounce and sparkle
  WD.spillIce = function (z, x, nBags, nCubes, fwd, side) {
    for (let i = 0; i < nBags; i++) throwDebris(['BAG_FULL', 'BAG_HALF', 'BAG_LEAK', 'BAG_CRUSHED'][i % 4], z, x + (Math.random() - 0.5) * 0.1, 500 + Math.random() * 300,
      (side || 0) * 0.25 + (Math.random() - 0.5) * 0.5, 1400 + Math.random() * 1600, fwd * 0.5 + Math.random() * 1500, UPX.bag, { kind: 'bag', bounce: 0.25, life: 2.6 });
    for (let i = 0; i < nCubes; i++) throwDebris(['ICE_CUBE_S', 'ICE_CUBE_M', 'ICE_CUBE_L', 'CUBE_0'][i % 4], z, x + (Math.random() - 0.5) * 0.08, 550 + Math.random() * 250,
      (side || 0) * 0.15 + (Math.random() - 0.5) * 0.8, 1200 + Math.random() * 2200, fwd * 0.4 + Math.random() * 2200, UPX.cube * (0.6 + Math.random() * 0.6), { kind: 'cube', bounce: 0.55, life: 1.6 + Math.random(), sparkle: true });
  };
  WD.dust = function (z, x, size, opts) {
    const f = size === 'L' ? 'DUST_L' : size === 'M' ? 'DUST_M' : 'DUST_S';
    return throwDebris(f, z, x, 0, (Math.random() - 0.5) * 0.06, 90 + Math.random() * 90, 0, UPX.dust, Object.assign({ kind: 'dust', life: 0.7 + Math.random() * 0.4, grow: 0.9, bounce: 0, vr: 0, alpha: 0.85, flip: Math.random() < 0.5 }, opts || {}));
  };
  const G_ACC = 4200;
  function updateDebris(dt, G) {
    const pz = G.position;
    for (let i = debris.n - 1; i >= 0; i--) {
      const d = debris.items[i]; d.t += dt;
      if (d.kind === 'dust' || d.kind === 'smoke' || d.kind === 'splash') { d.y += d.vy * dt; d.x += d.vx * dt; d.z += d.vz * dt; if (d.kind === 'smoke') d.x += Math.sin(d.t * 3 + d.z) * 0.02 * dt; }
      else if (d.kind === 'drop') { d.vy -= G_ACC * dt; d.y += d.vy * dt; if (d.y <= 0) { d.y = 0; debris.kill(i); throwDebris('WATER_SPLASH_S', d.z, d.x, 0, 0, 0, 0, 3, { kind: 'splash', life: 0.22, alpha: 0.7, vr: 0 }); continue; } }
      else {
        d.vy -= G_ACC * dt; d.y += d.vy * dt; d.x += d.vx * dt; d.z += d.vz * dt; d.rot += d.vr * dt;
        if (d.y <= 0) { d.y = 0; if (d.vy < -250 && d.bounce > 0) { d.vy = -d.vy * d.bounce; d.vr *= 0.7; d.vx *= 0.7; d.vz *= 0.7; if (d.kind === 'cube' && Math.random() < 0.4) d.sparkT = 0.12; } else { d.vy = 0; d.rest += dt; d.vx *= Math.max(0, 1 - 4 * dt); d.vz *= Math.max(0, 1 - 4 * dt); d.vr *= Math.max(0, 1 - 6 * dt); if (d.kind === 'cone' || d.kind === 'chair') d.rot += (Math.round(d.rot / (Math.PI / 2)) * (Math.PI / 2) - d.rot) * Math.min(1, dt * 6); } }
        if (d.z < pz - 8 * segLen()) { debris.kill(i); continue; }
      }
      if (d.sparkT > 0) d.sparkT -= dt;
      if (d.t >= d.life || d.z < pz - 4 * segLen()) { debris.kill(i); continue; }
    }
  }

  // ---------- state machines ----------
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  // Several characters' walk and run lists hold frames of DIFFERENT people at different heights - the
  // monk's two walk frames differ by 13% - so cycling them three times a second made the character
  // swap identity and change size on the spot. Each pedestrian locks one body for standing and walking
  // and one for running; the walk is carried by the hop, as it already is for the dogs and cats.
  function pedBody(a, ch) { if (!a.body) a.body = ch.idle[Math.abs(a.seed | 0) % ch.idle.length]; return a.body; }
  function pedRun(a, ch) { if (!a.runF) a.runF = ch.run[Math.abs((a.seed | 0) + 1) % ch.run.length]; return a.runF; }
  function pedUpdate(a, dt, G, pz, px, pct) {
    const ch = PEDS[a.sub], dz = a.z - pz, rw = T.findSegment(a.z).rw;
    const outer = a.side * (rw + 0.02), inner = outer, kerb = a.side * (rw + 0.005), wall = a.side * (rw + 0.125);
    a.t += dt; a.walkPh += dt;
    const danger = dz > -segLen() && dz < a.notice && (Math.abs(a.x - px) < a.risk || (Math.sign(px) === a.side && Math.abs(px) > rw * 0.92)) && G.speed > G.maxSpeed * 0.08;
    const late = dz > -segLen() && dz < 500 && Math.abs(a.x - px) < 0.22;
    switch (a.state) {
      case 'idle': case 'walk': case 'talk':
        if (a.state === 'walk') {
          a.z -= 150 * dt; a.frame = pedBody(a, ch); a.hop = Math.abs(Math.sin(a.walkPh * 5.5)) * 1.5; // front-view sprites: they walk toward the camera
          if (a.t > 4 + (a.seed % 5)) { a.state = 'idle'; a.t = 0; }
        } else { a.frame = pedBody(a, ch); a.hop = 0; if (ch.skip) a.hop = Math.abs(Math.sin(a.walkPh * 5)) * 6; if (a.t > 3 + (a.seed % 6) && !ch.still && !a.talk) { a.state = 'walk'; a.t = 0; a.dir = Math.random() < 0.5 ? 1 : -1; } }
        if ((danger && (a.calm < 0.75 || late)) || late) { a.state = 'notice'; a.t = 0; a.frame = ch.react; a.reactType = (Math.random() < 0.45 || ch.still) ? 'jump' : 'run'; if (ch.calm) a.reactType = 'step'; }
        break;
      case 'notice':
        a.frame = ch.react; a.flip = a.side > 0 ? px < a.x : px > a.x; // turns toward the bike
        if (a.t > a.reactDelay) { a.state = a.reactType; a.t = 0; a.jumpDir = a.side; }
        break;
      case 'jump': // hops back onto the pavement, away from the road
        a.frame = ch.jump; a.hop = Math.sin(Math.min(1, a.t / 0.42) * Math.PI) * 14; a.x += a.side * 0.35 * dt;
        if (a.t > 0.42) { a.hop = 0; a.state = 'recover'; a.t = 0; }
        break;
      case 'step': // monks: one restrained step aside
        a.frame = ch.jump; a.x += a.side * 0.14 * dt; if (a.t > 0.5) { a.state = 'recover'; a.t = 0; }
        break;
      case 'run': // runs away from the bike along the pavement
        a.frame = pedRun(a, ch); a.x += a.side * 0.25 * dt; a.z -= 380 * dt; a.hop = Math.abs(Math.sin(a.t * 14)) * 3;
        if (a.t > 0.7) { a.state = 'recover'; a.t = 0; }
        break;
      case 'recover': // watches / points after the bike, then goes back to what they were doing
        a.frame = dz < 0 ? ch.point : ch.react; a.flip = a.side > 0 ? px < a.x : px > a.x;
        if (a.t > 0.9 + a.calm) { a.state = ch.still ? 'idle' : 'walk'; a.t = 0; a.dir = Math.random() < 0.5 ? 1 : -1; }
        break;
    }
    if (a.x * a.side > wall * a.side) a.x = wall; if (a.x * a.side < kerb * a.side) a.x = kerb;
    if (ch.photo && Math.floor(a.age * 0.7 + a.seed) % 7 === 0 && (a.age % 1.4) < 0.05) a.flash = 0.08; // the tourist's camera flash
    if (a.flash > 0) a.flash -= dt;
  }
  // The sheet's animal frames are not one animal in several poses — DOG_IDLE is a tan dog while DOG_WALK and
  // DOG_RUN are different dogs entirely — so cycling frames swapped the breed mid-stride however the cycle was
  // written. Each animal instead picks ONE body at spawn and keeps it for life; movement is carried by the bob.
  const DOG_BODIES = ['DOG_IDLE', 'DOG_WALK', 'DOG_RUN', 'DOG_BARK'];
  const CAT_BODIES = ['CAT_IDLE', 'CAT_WALK', 'CAT_RUN'];
  function bodyOf(a, list) { if (!a.body) a.body = list[Math.abs(a.seed | 0) % list.length]; return a.body; }
  // An animal calls out only when the bike actually comes near it, the same way a driver only leans on the horn
  // when you cut past — one on the far pavement stays quiet. Done the same way as that near miss: watch for the
  // frame where the animal crosses from ahead of the bike to behind it and interpolate the lateral gap at the
  // crossing itself, because sampling the gap once per frame misses the pass entirely at speed. One call per
  // animal per life, and the level follows how close it was.
  const CALL_NEAR = 0.5;                                   // about a bike and a half either side
  function passingCall(a, dz, px, sfx) {
    const lat = Math.abs(a.x - px);
    if (!a.called && a.pdz !== undefined && (a.pdz > 0) !== (dz > 0)) {
      const span = a.pdz - dz;
      if (span > 0 && span < segLen() * 10) {              // a sane one-frame step, not a gap left by the crash freeze
        const gap = a.plat + (lat - a.plat) * OB.clamp(a.pdz / span, 0, 1);
        if (gap < CALL_NEAR) { a.called = true; OB.audio.sfx(sfx, OB.clamp(1 - (gap / CALL_NEAR) * 0.6, 0.4, 1)); }
      }
    }
    a.pdz = dz; a.plat = lat;
  }
  function dogUpdate(a, dt, G, pz, px, pct) {
    const dz = a.z - pz, rw = T.findSegment(a.z).rw; a.t += dt;
    if (a.state !== 'sleep') passingCall(a, dz, px, 'bark');   // let sleeping dogs lie
    const near = dz > -segLen() && dz < 1400;
    switch (a.state) {
      case 'sleep': a.frame = 'DOG_SLEEP'; break;
      case 'idle':
        a.frame = bodyOf(a, DOG_BODIES); a.hop = 0;
        if (a.t > 3 + (a.seed % 4)) { a.state = 'walk'; a.t = 0; a.dir = Math.random() < 0.5 ? 1 : -1; }
        if (near && Math.abs(px) > rw * 0.85 && Math.sign(px) === a.side) { a.state = 'flee'; a.t = 0; }
        if (dz < -segLen() && dz > -3 * segLen() && !a.chased && pct < 0.45 && a.dogSeed < 0.3) { a.state = 'chase'; a.t = 0; a.chased = true; OB.audio.sfx('bark', 1); }
        break;
      case 'walk':
        a.frame = bodyOf(a, DOG_BODIES); a.hop = Math.abs(Math.sin(a.t * 8)) * 0.5; a.z += a.dir * 160 * dt; a.flip = a.dir < 0 ? a.side < 0 : a.side > 0;
        if (a.t > 2.5 + (a.seed % 3)) { a.state = 'idle'; a.t = 0; }
        if (near && Math.abs(px) > rw * 0.85 && Math.sign(px) === a.side) { a.state = 'flee'; a.t = 0; }
        break;
      case 'wait': // crossing dog: sets off when the bike is still a way off
        a.frame = bodyOf(a, DOG_BODIES); if (dz > 0 && dz < a.crossAt) { a.state = 'cross'; a.t = 0; }
        break;
      case 'cross':
        a.frame = bodyOf(a, DOG_BODIES); a.hop = Math.abs(Math.sin(a.t * 13)) * 0.7; a.flip = a.crossTo > 0; a.x += a.crossTo * 0.45 * dt;
        if (near && Math.abs(a.x - px) < 0.6) { a.state = 'notice'; a.t = 0; }
        if (a.x * a.crossTo >= rw + 0.03) { a.x = a.crossTo * (rw + 0.03); a.side = a.crossTo; a.state = 'idle'; a.t = 0; }
        break;
      case 'notice': // freezes for a beat, then sprints to whichever kerb is nearer
        a.frame = bodyOf(a, DOG_BODIES); if (a.t > 0.12) { a.state = 'sprint'; a.t = 0; a.sprintTo = a.x >= 0 ? 1 : -1; if (Math.abs(a.x) < 0.25) a.sprintTo = -a.crossTo; }
        break;
      case 'sprint':
        a.frame = bodyOf(a, DOG_BODIES); a.hop = Math.abs(Math.sin(a.t * 16)) * 0.9; a.flip = a.sprintTo > 0; a.x += a.sprintTo * 1.3 * dt; a.z += 260 * dt;
        if (a.x * a.sprintTo >= rw + 0.03) { a.x = a.sprintTo * (rw + 0.03); a.side = a.sprintTo; a.state = 'idle'; a.t = 0; }
        break;
      case 'flee': // bike on its pavement: scatters along it
        a.frame = bodyOf(a, DOG_BODIES); a.hop = Math.abs(Math.sin(a.t * 15)) * 0.8; a.x += a.side * 0.3 * dt; a.z += 500 * dt; a.flip = a.side < 0;
        if (a.t > 0.8) { a.state = 'idle'; a.t = 0; }
        break;
      case 'chase': { // runs after the bike for a moment, then drops back
        a.frame = bodyOf(a, DOG_BODIES); a.hop = Math.abs(Math.sin(a.t * 15)) * 0.8;
        const v = Math.min(G.speed * 0.95, 2800); a.z += v * dt; a.x += (px + a.side * 0.35 - a.x) * Math.min(1, dt * 1.5); a.flip = a.x > px;
        if (a.t > 1.6 || dz > 400) { a.state = 'exit'; a.t = 0; }
        break; }
      case 'exit':
        a.frame = bodyOf(a, DOG_BODIES); a.hop = Math.abs(Math.sin(a.t * 11)) * 0.6; a.z += 300 * dt; a.x += (a.side * (rw + 0.03) - a.x) * Math.min(1, dt * 2);
        if (a.t > 1.5) { a.state = 'idle'; a.t = 0; }
        break;
    }
    if (Math.abs(a.x) > rw + 0.12) a.x = Math.sign(a.x) * (rw + 0.12);
  }
  function catUpdate(a, dt, G, pz, px) {
    const dz = a.z - pz, rw = T.findSegment(a.z).rw; a.t += dt;
    passingCall(a, dz, px, 'meow');
    switch (a.state) {
      case 'idle': a.frame = bodyOf(a, CAT_BODIES); a.hop = 0; if (a.t > 4 + (a.seed % 5)) { a.state = 'walk'; a.t = 0; a.dir = Math.random() < 0.5 ? 1 : -1; }
        if (dz > -segLen() && dz < 800 && (Math.abs(a.x - px) < 0.45)) { a.state = 'run'; a.t = 0; } break;
      // one body per state plus a step bob: alternating between two differently shaped frames read as the cat
      // swapping for a different animal mid-stride, the same way the pedestrians used to
      case 'walk': a.frame = bodyOf(a, CAT_BODIES); a.hop = Math.abs(Math.sin(a.t * 9)) * 0.5; a.z += a.dir * 110 * dt; a.flip = a.dir < 0 ? a.side < 0 : a.side > 0;
        if (a.t > 2) { a.state = 'idle'; a.t = 0; } if (dz > -segLen() && dz < 800 && Math.abs(a.x - px) < 0.45) { a.state = 'run'; a.t = 0; } break;
      case 'run': a.frame = bodyOf(a, CAT_BODIES); a.hop = Math.abs(Math.sin(a.t * 17)) * 0.8; a.x += a.side * 0.4 * dt; a.flip = a.side < 0; if (a.t > 0.5) { a.state = 'hide'; a.t = 0; } break;
      case 'hide': a.frame = bodyOf(a, CAT_BODIES); if (a.t > 3) { a.state = 'idle'; a.t = 0; } break;
    }
    if (Math.abs(a.x) > rw + 0.125) a.x = Math.sign(a.x) * (rw + 0.125);
  }
  function lizardUpdate(a, dt, G, pz, px) {
    const dz = a.z - pz; a.t += dt;
    if (dz > -segLen() && dz < 900 && Math.abs(a.x - px) < 0.5) { a.frame = 'LIZARD_WALK'; return; } // freezes
    a.frame = 'LIZARD_WALK'; a.hop = Math.abs(Math.sin(a.t * 7)) * 0.35; a.z += a.dir * 45 * dt; a.flip = a.dir < 0 ? a.side < 0 : a.side > 0;
  }
  // props: what happens when the bike ploughs through them
  const PROP_W = { stall: 0.34, cart: 0.27, chair: 0.22, cone: 0.1, box: 0.2, sign: 0.14 };
  // The stalls and carts at the kerb, for anything that needs to steer round them rather than find out the hard
  // way - the พลังยาดม auto-line asks for these the way it already asks for the traffic.
  WD.propsAhead = function (pz, range, out) {
    for (let i = 0; i < actors.n; i++) {
      const a = actors.items[i], w = PROP_W[a.kind];
      if (!w || a.hit || a.state === 'gone') continue;
      const dz = a.z - pz; if (dz < -250 || dz > range) continue;
      out.push({ x: a.x, half: w / 2 + 0.09, dz });
    }
    return out;
  };
  function propUpdate(a, dt, G, pz, px) {
    a.t += dt;
    const halfW = PROP_W[a.kind] / 2, dz = a.z - pz;
    if (!a.hit && a.state !== 'gone' && dz > -segLen() * 0.8 && dz < segLen() * 1.1 && Math.abs(a.x - px) < halfW + 0.09 && G.speed > 100) {
      // under พลังยาดม the stall still goes flying - that is half the fun of it - but the rider pays nothing for it
      const hp = G.health, sp = G.speed;
      hitProp(a, G, px);
      if (G.yadomT > 0) { G.health = hp; G.speed = sp; }
    }
    if (a.kind === 'stall') {
      a.frame = a.state === 'idle' ? 'STALL_IDLE' : a.state === 'hit1' ? 'STALL_HIT1' : 'STALL_HIT2';
      if (a.state === 'hit1' && a.t > 0.12) { a.state = 'hit2'; }
      if (a.state === 'hit2' && a.t > 0.7 && !a.vendor) { a.vendor = true; const v = spawn('vendor', 'vendor', a.z - 150, a.x - a.side * 0.05, { state: 'angry', flip: a.side > 0 }); if (v) v.frame = 'VENDOR_ANGRY'; }
      if (a.state === 'idle' && Math.random() < dt * 1.2) WD.dust(a.z + 60, a.x, 'S', { kind: 'smoke', alpha: 0.28, life: 1.3, vy: 260, upx: 5, grow: 1.6 }); // cooking smoke
    } else if (a.kind === 'cart') {
      a.frame = a.state === 'idle' ? 'CART_IDLE' : 'CART_HIT';
      if (a.state === 'idle' && Math.random() < dt * 1.6) WD.dust(a.z + 40, a.x, 'S', { kind: 'smoke', alpha: 0.3, life: 1.5, vy: 300, upx: 5, grow: 1.8 });
    } else if (a.kind === 'sign') {
      a.frame = 'SIGN_HIT';
      if (a.state === 'fall') { const k = Math.min(1, a.t / 0.55); a.rot = a.fallDir * (k * 1.35 + Math.sin(k * Math.PI * 3) * (1 - k) * 0.25); if (k >= 1) a.state = 'down'; }
    } else if (a.kind === 'vendor') { a.frame = 'VENDOR_ANGRY'; a.hop = a.t < 3 ? Math.abs(Math.sin(a.t * 14)) * 3 : 0; }
    else if (a.kind === 'chair') a.frame = 'CHAIR_IDLE';
    else if (a.kind === 'cone') a.frame = 'CONE_IDLE';
    else if (a.kind === 'box') a.frame = 'BOX_IDLE';
  }
  function hitProp(a, G, px) {
    const A = OB.audio, fwd = G.speed, side = a.x > px ? 1 : -1; // debris flies away from the bike
    a.hit = true;
    if (a.kind === 'stall') {
      a.state = 'hit1'; a.t = 0; A.sfx('crunch'); G.shake = Math.max(G.shake, 0.6); G.speed *= 0.72; G.health -= 4; G.bumpT = 0.4; G.stackKick(1.1);
      for (let i = 0; i < 12; i++) throwDebris('FRUIT_' + (i % 3), a.z + 80, a.x + (Math.random() - 0.5) * 0.2, 250 + Math.random() * 350, side * (0.1 + Math.random() * 0.5) + (Math.random() - 0.5) * 0.3, 1400 + Math.random() * 2400, fwd * 0.3 + Math.random() * 1800, UPX.fruit * (0.8 + Math.random() * 0.5), { kind: 'fruit', bounce: 0.45, life: 2.4 });
      for (let i = 0; i < 4; i++) throwDebris('BOXBIT_' + (i % 8), a.z + 60, a.x + (Math.random() - 0.5) * 0.2, 300, side * Math.random() * 0.4, 1000 + Math.random() * 1600, fwd * 0.25 + Math.random() * 1200, UPX.boxbit, { kind: 'bit', bounce: 0.3, life: 2.2 });
      WD.dust(a.z + 40, a.x, 'M'); WD.dust(a.z + 120, a.x + side * 0.1, 'L', { alpha: 0.7 });
    } else if (a.kind === 'cart') {
      a.state = 'hit'; a.t = 0; A.sfx('crunch'); A.sfx('clank'); G.shake = Math.max(G.shake, 0.55); G.speed *= 0.75; G.health -= 4; G.bumpT = 0.4; G.stackKick(1);
      for (let i = 0; i < 9; i++) throwDebris('POT_' + (i % 8), a.z + 60, a.x + (Math.random() - 0.5) * 0.2, 300 + Math.random() * 300, side * (0.1 + Math.random() * 0.45) + (Math.random() - 0.5) * 0.3, 1200 + Math.random() * 2400, fwd * 0.3 + Math.random() * 1600, UPX.pot * (0.7 + Math.random() * 0.6), { kind: 'pot', bounce: 0.35, life: 2.4 });
      WD.dust(a.z + 40, a.x, 'M', { alpha: 0.6 });
    } else if (a.kind === 'chair') {
      a.state = 'gone'; A.sfx('plastic'); G.speed *= 0.985; G.bumpT = 0.25;
      throwDebris('CHAIR_HIT', a.z + 40, a.x, 200, side * (0.2 + Math.random() * 0.3), 1500 + Math.random() * 900, fwd * 0.55 + 800, UPX.chair, { kind: 'chair', bounce: 0.35, life: 3, vr: side * (10 + Math.random() * 8), flip: a.flip });
    } else if (a.kind === 'cone') {
      a.state = 'gone'; A.sfx('plastic'); G.speed *= 0.992;
      throwDebris('CONE_HIT', a.z + 40, a.x, 150, side * (0.15 + Math.random() * 0.3), 1300 + Math.random() * 1200, fwd * 0.5 + 900, UPX.cone, { kind: 'cone', bounce: 0.5, life: 3, vr: side * (14 + Math.random() * 10) });
    } else if (a.kind === 'box') {
      a.state = 'gone'; A.sfx('box'); G.speed *= 0.985; G.bumpT = 0.2;
      for (let i = 0; i < 6; i++) throwDebris('BOXBIT_' + (i % 8), a.z + 40, a.x + (Math.random() - 0.5) * 0.15, 150 + Math.random() * 200, side * Math.random() * 0.5 + (Math.random() - 0.5) * 0.3, 900 + Math.random() * 1800, fwd * 0.35 + Math.random() * 1500, UPX.boxbit * (0.7 + Math.random() * 0.6), { kind: 'bit', bounce: 0.3, life: 2.2 });
      WD.dust(a.z + 40, a.x, 'S', { alpha: 0.6 });
    } else if (a.kind === 'sign') {
      a.state = 'fall'; a.t = 0; a.fallDir = side; A.sfx('clank'); G.speed *= 0.97; G.bumpT = 0.3; G.shake = Math.max(G.shake, 0.25);
    }
  }
  const UPDATERS = { ped: pedUpdate, dog: dogUpdate, cat: catUpdate, lizard: lizardUpdate, stall: propUpdate, cart: propUpdate, chair: propUpdate, cone: propUpdate, box: propUpdate, sign: propUpdate, vendor: propUpdate };

  // ---------- ambient: exhaust, dripping air-cons, road decals under the bike ----------
  let dripT = 0;
  function ambient(dt, G) {
    const pz = G.position + G.playerZ, L = segLen();
    for (const c of G.cars) {
      if (c.z < pz - 2 * L || c.z > pz + 200 * L) continue;
      c.exT = (c.exT || Math.random() * 0.8) - dt;
      if (c.exT <= 0) { c.exT = 0.45 + Math.random() * 0.7; const seg = T.findSegment(c.z); WD.dust(c.z - 60, c.offset * seg.rw + (c.oncoming ? -0.07 : 0.08), 'S', { kind: 'smoke', alpha: 0.22, life: 0.55, upx: 3.5, grow: 1.6, vy: 60, vz: c.speed * 0.15 }); }
    }
    dripT -= dt;
    if (dripT <= 0) { dripT = 0.9 + Math.random() * 1.6; const seg = T.findSegment(pz + (20 + Math.random() * 90) * L), th = T.THEMES[seg.theme]; const sides = []; if (th.left === 'shop' || th.left === 'city') sides.push(-1); if (th.right === 'shop' || th.right === 'city') sides.push(1);
      if (sides.length) { const s = pick(sides); throwDebris('ICE_CUBE_S', seg.index * L, s * (seg.rw + 0.09), 1500, 0, 0, 0, 1.6, { kind: 'drop', life: 3, vr: 0, alpha: 0.8 }); } }
  }
  // decals the bike drives over: puddle splash, manhole clunk, leaves scattering, the speed bump hop
  function decalsUnderBike(dt, G) {
    const pz = G.position + G.playerZ, seg = T.findSegment(pz);
    if (!seg.decals || !seg.decals.length) return;
    for (const d of seg.decals) {
      if (d.hitT === seg.index && d.kind !== 'bump') continue;
      const f = F(d.f); if (!f) continue;
      const half = f.w * d.upx / RW() / 2 + 0.06;
      if (Math.abs(G.playerX - d.x) > half) continue;
      const pct = G.speed / G.maxSpeed; if (pct < 0.03) continue;
      d.hitT = seg.index;
      if (d.kind === 'puddle') { G.splashT = 0.32; G.splashSide = G.steer > 0.2 ? 1 : G.steer < -0.2 ? -1 : (Math.random() < 0.5 ? -1 : 1); OB.audio.sfx('splash'); G.speed *= 0.995; }
      else if (d.kind === 'manhole') { OB.audio.sfx('clunk'); G.bounce = Math.max(G.bounce, 1.5); G.stackKick(0.35); }
      else if (d.kind === 'pothole') { // scrubs speed and shakes ice loose; worse the faster you hit it
        const big = d.f === 'POTHOLE', free = G.yadomT > 0;   // พลังยาดม rides straight over one
        if (!free) { G.speed *= big ? 0.82 : 0.9; G.ice = Math.max(0, G.ice - (big ? 3 : 1.5) * (0.5 + pct)); }
        G.bounce = Math.max(G.bounce, 3); G.hopV = Math.max(G.hopV || 0, 60 + 140 * pct); G.stackKick(0.9 + pct);
        G.shake = Math.max(G.shake, 0.35 + 0.3 * pct); G.bumpT = 0.35; G.cam.squash = 1;
        OB.audio.sfx('crunch');
        if (pct > 0.45 && !free) WD.spillIce(pz, G.playerX, 0, big ? 3 : 1, G.speed, 0);
        if (G.breakCombo) G.breakCombo();     // a pothole counts as damage: it ends the clean run
      }
      else if (d.kind === 'leaves') { for (let i = 0; i < 4; i++) throwDebris('LEAVES', pz - 60, G.playerX + (Math.random() - 0.5) * 0.2, 60, (Math.random() - 0.5) * 0.5, 500 + Math.random() * 700, -G.speed * 0.2 + Math.random() * 600, 4, { kind: 'leaf', bounce: 0.1, life: 1.4, vr: (Math.random() - 0.5) * 20 }); }
      else if (d.kind === 'bump' && !(d.lastBump > G.t - 1)) { d.lastBump = G.t; G.hopV = 90 + 220 * pct; G.stackKick(0.8 + pct); OB.audio.sfx('clunk'); if (pct > 0.7) { WD.spillIce(pz, G.playerX, 0, 2, G.speed, 0); G.ice = Math.max(0, G.ice - 1); } }
    }
  }

  // ---------- speed streaks: radiate from the vanishing point, only near top speed ----------
  function updateStreaks(dt, G) {
    const pct = G.speed / G.maxSpeed, k = OB.clamp((pct - 0.72) / 0.28, 0, 1);
    if (k > 0 && Math.random() < dt * (6 + 26 * k)) {
      const s = streaks.get();
      if (s) { const ang = Math.random() * Math.PI * 2; s.ang = ang; s.r = 110 + Math.random() * 120; s.v = 900 + Math.random() * 900; s.len = 50 + k * (90 + Math.random() * 200); s.a = 0.1 + k * 0.42; s.t = 0; s.life = 0.35 + Math.random() * 0.25; }
    }
    for (let i = streaks.n - 1; i >= 0; i--) { const s = streaks.items[i]; s.t += dt; s.r += s.v * dt; if (s.t > s.life || s.r > 900) streaks.kill(i); }
  }
  WD.drawStreaks = function (ctx, G, vpX, vpY) {
    if (!streaks.n) return;
    ctx.save(); ctx.lineCap = 'butt';
    for (let i = 0; i < streaks.n; i++) {
      const s = streaks.items[i], c = Math.cos(s.ang), sn = Math.sin(s.ang);
      // steeper angles are the sides and bottom; skip the strip straight up into the sky so they read as road speed
      if (sn > 0.35) continue; // not down through the bike
      const x1 = vpX + c * s.r, y1 = vpY + sn * s.r, x2 = vpX + c * (s.r + s.len), y2 = vpY + sn * (s.r + s.len);
      const fade = s.t < 0.08 ? s.t / 0.08 : 1 - (s.t - 0.08) / (s.life - 0.08);
      ctx.strokeStyle = 'rgba(255,255,255,' + (s.a * fade).toFixed(3) + ')'; ctx.lineWidth = 1 + (s.r > 300 ? 1 : 0) + (s.a > 0.4 && s.r > 500 ? 1 : 0);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.restore();
  };

  // ---------- per-frame update ----------
  WD.update = function (dt, G) {
    if (!OB.IMG.atlas) return;
    const pz = G.position + G.playerZ, px = G.playerX, pct = G.speed / G.maxSpeed, L = segLen();
    const far = pz + 420 * L, back = G.position - 12 * L;
    for (let i = actors.n - 1; i >= 0; i--) {
      const a = actors.items[i];
      if (a.z < back) { actors.kill(i); continue; }
      if (a.z > far) continue;
      a.age += dt;
      const fn = UPDATERS[a.kind]; if (fn) fn(a, dt, G, pz, px, pct);
    }
    updateDebris(dt, G);
    if (G.mode === 'play') { ambient(dt, G); decalsUnderBike(dt, G); updateStreaks(dt, G); }
    else if (streaks.n) streaks.clear();
  };
  // sprite-pass helpers: which actors / debris sit on a segment (rebuilt each frame by the renderer)
  WD.bucket = function (map, list, n, L) {
    for (let i = 0; i < n; i++) { const o = list[i]; const k = Math.floor(o.z / L); let b = map.get(k); if (!b) { b = []; map.set(k, b); } b.push(o); }
  };
  WD.drawActor = function (ctx, a, seg) {
    const f = F(a.frame); if (!f) return;
    const p = WD.project(seg, a.z, a.x, 0);
    const upx = UPX[a.kind] || 8, dw = f.w * upx * p.cs * K, dh = f.h * upx * p.cs * K;
    if (p.sx + dw < 0 || p.sx - dw > W) return;
    const clip = seg.clip;
    if (clip && p.sy - dh > clip) return;
    // an actor whose feet have gone under the bottom of the frame would be cut flat across its body with the
    // pavement still showing beside it; fade it out over the next third of its height instead
    let alpha = a.alpha === undefined ? 1 : a.alpha;
    if (p.sy > H) { alpha *= OB.clamp(1 - (p.sy - H) / (dh * 0.35), 0, 1); if (alpha <= 0.02) return; }
    // and across the side edges, so a stall or a pedestrian half out of frame dissolves rather than sitting as a
    // hard-cut fragment when the bike is stopped beside it
    const over = Math.max(0, dw / 2 - p.sx) + Math.max(0, p.sx + dw / 2 - W);
    if (over > 0) { alpha *= OB.clamp(1 - over / (dw * 0.6), 0, 1); if (alpha <= 0.02) return; }
    ctx.save(); if (clip) { ctx.beginPath(); ctx.rect(0, 0, W, clip); ctx.clip(); }
    WD.blit(ctx, f, p.sx, p.sy - (a.hop || 0) * p.cs * K * 12, dw, dh, a.flip, a.rot, alpha);
    if (a.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(Math.round(p.sx - dw * 0.1), Math.round(p.sy - dh * 0.8), Math.max(2, dw * 0.2), Math.max(2, dh * 0.08)); }
    ctx.restore();
  };
  WD.drawDebris = function (ctx, d, seg) {
    const f = d.f; if (!f) return;
    const p = WD.project(seg, d.z, d.x, d.y);
    const g = 1 + (d.grow ? d.grow * d.t / d.life : 0), dw = f.w * d.upx * g * p.cs * K, dh = f.h * d.upx * g * p.cs * K;
    if (p.sx + dw < 0 || p.sx - dw > W) return;
    let alpha = d.alpha;
    if (d.kind === 'dust' || d.kind === 'smoke' || d.kind === 'splash') alpha *= 1 - d.t / d.life; else if (d.t > d.life - 0.4) alpha *= (d.life - d.t) / 0.4;
    const clip = seg.clip; ctx.save(); if (clip) { ctx.beginPath(); ctx.rect(0, 0, W, clip); ctx.clip(); }
    if (d.kind === 'dust' || d.kind === 'smoke' || d.kind === 'splash' || d.kind === 'drop') WD.blit(ctx, f, p.sx, p.sy, dw, dh, d.flip, 0, alpha);
    else WD.blitC(ctx, f, p.sx, p.sy - dh / 2, dw, dh, d.rot, alpha, d.flip);
    // the glint off a tumbling cube. It was sized as a quarter of the cube, which is fine at a distance and a
    // 20px white block on one that lands by the front wheel - the square that showed up around a wipeout. A glint
    // is a glint at any range, so it is capped at three pixels.
    if (d.sparkle && (d.sparkT > 0 || ((Math.floor(d.t * 20) + Math.floor(d.z)) % 9 === 0))) {
      ctx.fillStyle = '#ffffff'; const s = OB.clamp(Math.round(dw * 0.22), 1, 3);
      ctx.fillRect(Math.round(p.sx - dw * 0.3), Math.round(p.sy - dh * 0.8), s, s);
    }
    ctx.restore();
  };
  // ground decals for one segment (called by the ground pass right after the road surface)
  WD.drawDecals = function (ctx, seg, G) {
    const p1 = seg.p1.screen, p2 = seg.p2.screen;
    for (const d of seg.decals) {
      const f = F(d.f); if (!f) continue;
      const cs = (p1.scale + p2.scale) / 2, sx = (p1.x + p2.x) / 2 + cs * d.x * RW() * K, sy = (p1.y + p2.y) / 2;
      const hole = d.kind === 'pothole';
      // a pothole you cannot see until you are in it is just an unfair hit, so hold it at a readable size
      // right out to the horizon instead of letting perspective shrink it into a single dark pixel
      let dw = f.w * d.upx * cs * K, dh = Math.max(1, f.h * d.upx * cs * K * 0.55);
      if (hole && dw < 11) { dh = Math.max(dh, dh * 11 / Math.max(dw, 0.01)); dw = 11; }
      if (dw < 2) continue;
      ctx.drawImage(f.img, f.x, f.y, f.w, f.h, Math.round(sx - dw / 2), Math.round(sy - dh / 2), Math.round(dw), Math.round(dh));
      if (hole) {
        // A ring right round the hole, pulsing, not just a highlight on the near lip. Tarmac is the same colour as
        // a hole in it, and at any distance the lip alone is two pixels that read as road grain - by the time it
        // reads as a hole you are already in it. The ring is what you pick out early and steer off.
        const k = 0.45 + 0.32 * Math.sin(G.t * 6 + (d.seed || 0) * 10);
        ctx.save();
        ctx.strokeStyle = 'rgba(255,190,70,' + k.toFixed(2) + ')';
        ctx.lineWidth = Math.max(1.6, dw * 0.1);
        ctx.beginPath(); ctx.ellipse(sx, sy, Math.max(1, dw * 0.5), Math.max(0.8, dh * 0.52), 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        ctx.fillStyle = 'rgba(255,214,120,' + Math.min(1, k + 0.2).toFixed(2) + ')';   // the near lip on top of it
        const lw = Math.max(2, Math.round(dw * 0.6)), lh = Math.max(1, Math.round(dh * 0.2));
        ctx.fillRect(Math.round(sx - lw / 2), Math.round(sy + dh / 2 - lh), lw, lh);
      }
      if (d.kind === 'puddle' && dw > 8) { // a flickering sky highlight stands in for the reflection
        const ph = (G.t * 2 + d.seed * 10) % 1; ctx.fillStyle = 'rgba(200,225,255,' + (0.25 + 0.2 * Math.sin(ph * Math.PI * 2)).toFixed(2) + ')';
        ctx.fillRect(Math.round(sx - dw * 0.25 + Math.sin(G.t * 3 + d.seed) * dw * 0.1), Math.round(sy - dh * 0.15), Math.max(1, Math.round(dw * 0.3)), Math.max(1, Math.round(dh * 0.18)));
      }
    }
  };
  WD.PEDS = PEDS; WD.UPX = UPX;
})(window.OB);
