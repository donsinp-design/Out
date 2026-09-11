// OutRun Bangkok — track segments, themes, stages and routes
(function (OB) {
  'use strict';
  const T = { segments: [], segLen: 200, roadW: 2600, lanes: 4 };
  T.laneX = (i) => -1 + (2 * i + 1) / T.lanes; // centre of lane i in road-half-width units
  T.laneList = () => { const a = []; for (let i = 0; i < T.lanes; i++) a.push(T.laneX(i)); return a; };
  OB.track = T;

  T.STAGES = {
    charoenkrung: { theme: 'riverside', name: { thai: 'ถนนเจริญกรุง', eng: 'CHAROEN KRUNG' }, next: ['yaowarat', 'sathorn'], time: 80 },
    yaowarat: { theme: 'chinatown', name: { thai: 'เยาวราช', eng: 'YAOWARAT' }, next: ['siam', 'rattanakosin'], time: 70 },
    sathorn: { theme: 'city', name: { thai: 'สาทร', eng: 'SATHORN' }, next: ['siam', 'rattanakosin'], time: 68 },
    siam: { theme: 'siam', name: { thai: 'สยาม', eng: 'SIAM' }, next: ['sanamluang', 'thatien'], time: 68 },
    rattanakosin: { theme: 'oldtown', name: { thai: 'รัตนโกสินทร์', eng: 'RATTANAKOSIN' }, next: ['sanamluang', 'thatien'], time: 68 },
    sanamluang: { theme: 'final_park', name: { thai: 'สนามหลวง', eng: 'SANAM LUANG' }, next: null, time: 66 },
    thatien: { theme: 'final_river', name: { thai: 'ท่าเตียน', eng: 'THA TIEN' }, next: null, time: 66 }
  };

  // env types: shop | water | city | temple | park
  T.THEMES = {
    riverside: { left: 'shop', right: 'water', light: 'day', curv: 1.6, hills: 0.3, straight: 0.12, traffic: { density: 9, min: 0.28, max: 0.62, oncoming: 0.25 } },
    chinatown: { left: 'shop', right: 'shop', light: 'day', curv: 1.1, hills: 0.2, traffic: { density: 13, min: 0.22, max: 0.55, oncoming: 0.35 } },
    city: { left: 'city', right: 'city', light: 'day', curv: 1.0, hills: 0.6, traffic: { density: 11, min: 0.35, max: 0.7, oncoming: 0.1 } },
    siam: { left: 'city', right: 'city', light: 'golden', curv: 1.15, hills: 0.5, traffic: { density: 12, min: 0.3, max: 0.68, oncoming: 0.15 }, skytrain: true },
    oldtown: { left: 'temple', right: 'park', light: 'golden', curv: 1.3, hills: 0.4, traffic: { density: 8, min: 0.25, max: 0.6, oncoming: 0.4 } },
    final_park: { left: 'temple', right: 'park', light: 'dusk', curv: 1.4, hills: 0.5, traffic: { density: 10, min: 0.3, max: 0.65, oncoming: 0.3 } },
    final_river: { left: 'temple', right: 'water', light: 'dusk', curv: 1.4, hills: 0.5, traffic: { density: 10, min: 0.3, max: 0.65, oncoming: 0.3 } }
  };

  T.reset = function () { T.segments.length = 0; };
  T.length = () => T.segments.length * T.segLen;
  T.findSegment = (z) => { const n = T.segments.length; let i = Math.floor(z / T.segLen); if (!(i >= 0)) i = 0; if (i >= n) i = n - 1; return T.segments[i]; };
  T.lastY = () => T.segments.length ? T.segments[T.segments.length - 1].p2.world.y : 0;

  function addSegment(curve, y, stage) {
    const n = T.segments.length;
    T.segments.push({
      index: n, curve,
      p1: { world: { x: 0, y: T.lastY(), z: n * T.segLen }, camera: {}, screen: {} },
      p2: { world: { x: 0, y: y, z: (n + 1) * T.segLen }, camera: {}, screen: {} },
      sprites: [], stage, theme: stage.theme, rw: 1, median: 0, deck: false, kind: 'road', bounds: { l: -1.32, r: 1.32 }
    });
  }
  function addRoad(enter, hold, leave, curve, y, stage) {
    const startY = T.lastY(), endY = startY + (y || 0) * T.segLen, total = enter + hold + leave;
    for (let n = 0; n < enter; n++) addSegment(OB.easeIn(0, curve, n / enter), OB.easeInOut(startY, endY, n / total), stage);
    for (let n = 0; n < hold; n++) addSegment(curve, OB.easeInOut(startY, endY, (enter + n) / total), stage);
    for (let n = 0; n < leave; n++) addSegment(OB.easeInOut(curve, 0, n / leave), OB.easeInOut(startY, endY, (enter + hold + n) / total), stage);
  }

  // ---------- road plan per theme ----------
  function buildBody(stage, len, rng, stageNo) {
    const th = T.THEMES[stage.theme], start = T.segments.length;
    const diff = 1 + stageNo * 0.18;
    addRoad(0, 60, 0, 0, 0, stage);
    while (T.segments.length - start < len - 80) {
      const r = rng(), pStraight = th.straight === undefined ? 0.28 : th.straight;
      const c = (rng.chance(0.5) ? -1 : 1) * rng.range(1.6, 3.2) * th.curv * diff;
      if (r < pStraight) addRoad(rng.int(40) + 30, rng.int(60) + 30, rng.int(40) + 30, 0, 0, stage);
      else if (r < pStraight + 0.32) addRoad(50, rng.int(80) + 40, 50, c, 0, stage);
      else if (r < pStraight + 0.5) { addRoad(40, 40, 40, c, 0, stage); addRoad(40, 40, 40, -c, 0, stage); }
      else if (r < pStraight + 0.62 && th.hills > 0.25) addRoad(50, 30, 50, c * 0.5, rng.range(8, 20) * th.hills, stage), addRoad(40, 20, 40, 0, -rng.range(8, 20) * th.hills, stage);
      else addRoad(30, 60, 30, c * 1.4, 0, stage);
    }
    while (T.segments.length - start < len) addSegment(0, T.lastY(), stage);
    // flatten back to 0
    const yEnd = T.lastY();
    if (Math.abs(yEnd) > 1) for (let i = 0; i < 60; i++) addSegment(0, OB.easeInOut(yEnd, 0, i / 60), stage);
  }

  // ---------- population ----------
  const FACADES = []; for (let i = 0; i < 10; i++) FACADES.push('blk' + i);
  const CNFACADES = []; for (let i = 0; i < 6; i++) CNFACADES.push('blkcn' + i);
  const BACKROW = []; for (let i = 0; i < 4; i++) BACKROW.push('blkb' + i);
  const TOWERS = ['tower0', 'tower1', 'tower2', 'tower3', 'tower4', 'tower5', 'tower6', 'tower7'];
  // shophouse picker: composed reference facades, never the same one twice in a row per side
  const lastPick = {};
  function pickShop(rng, theme, side) {
    const list = theme === 'chinatown' ? (rng.chance(0.75) ? CNFACADES : FACADES) : FACADES;
    let n = rng.pick(list), tries = 0;
    while (n === lastPick[side] && tries++ < 5) n = rng.pick(list);
    lastPick[side] = n; return n;
  }
  function put(seg, name, offset, extra) { const spr = OB.SPR[name]; if (!spr) return; seg.sprites.push(Object.assign({ spr, offset }, extra || {})); }

  function populate(stage, from, to, rng, opts) {
    opts = opts || {};
    const th = T.THEMES[stage.theme];
    const segs = T.segments;
    for (let i = from; i < to; i++) {
      const seg = segs[i], rel = i - from, edgeL = -1.2 * seg.rw, edgeR = 1.2 * seg.rw;
      if (opts.noSprites) continue;
      // ---- LEFT ----
      if (th.left === 'shop') {
        if (rel % 10 === 0) put(seg, pickShop(rng, stage.theme, 'L'), edgeL - 0.12, { anchor: 'left' });
        if (rel % 14 === 5) put(seg, rng.pick(BACKROW), edgeL - 1.6, { anchor: 'left' });
        if (rel % 16 === 4) { put(seg, rng.chance(0.7) ? 'pole' : 'pole2', edgeL + 0.1, { pole: 'L' }); }
        if (rel % 160 === 40) put(seg, 'signs_pole', edgeL + 0.08);
        if (rel % 210 === 120) put(seg, 'ckrd_pole', edgeL + 0.1);
        if (rel % 260 === 200) put(seg, 'seven_pole', edgeL + 0.02);
        if (rel % 140 === 90) put(seg, 'tuktuk_parked', edgeL + 0.32);
        if (rel % 95 === 60) { put(seg, 'vendor', edgeL - 0.02); if (rng.chance(0.7)) put(segs[i + 3] || seg, 'yen', edgeL + 0.12); }
        if (stage.theme === 'chinatown' && rel % 33 === 20) put(seg, 'redsign_pole', edgeL + 0.1);
      } else if (th.left === 'city') {
        // street level stays the shophouse wall; towers rise behind it, the reference's own tower clusters further back
        if (rel % 10 === 0) put(seg, pickShop(rng, 'city', 'L'), edgeL - 0.12, { anchor: 'left' });
        if (rel % 26 === 13) put(seg, rng.pick(TOWERS), edgeL - 1.9 - rng.range(0, 0.9), { anchor: 'left' });
        if (rel % 34 === 7) put(seg, rng.pick(['towers0', 'towers1', 'towers2']), edgeL - 4.5 - rng.range(0, 3), { anchor: 'left' });
        if (rel % 26 === 8) put(seg, 'lamp', edgeL + 0.06, { flip: true });
        if (rel % 44 === 20) put(seg, rng.pick(['tree0', 'tree1', 'palm0']), edgeL + 0.03);
        if (th.skytrain && rel % 14 === 7) put(seg, 'pillar', edgeL + 0.05, { pillar: true });
      } else if (th.left === 'temple') {
        if (rel % 16 === 0) put(seg, 'wall', edgeL - 0.15, { anchor: 'left' });
        if (rel % 90 === 30) put(seg, 'wat', edgeL - 0.5, { anchor: 'left' });
        if (rel % 70 === 55) put(seg, 'chedi', edgeL - 0.5, { anchor: 'left' });
        if (rel % 18 === 9) put(seg, rng.pick(['tree0', 'tree1', 'tree2', 'tree3', 'palm1']), edgeL - 0.25);
        if (rel % 34 === 4) put(seg, 'pole2', edgeL + 0.06, { pole: 'L' });
        if (rel % 120 === 100) put(seg, 'spirit', edgeL + 0.1);
      }
      // ---- RIGHT ----
      if (th.right === 'water') {
        seg.rail = true;
        // everything on the river side stands on the walkway (1.0 .. 1.13), never past the railing
        if (rel % 24 === 12) put(seg, 'lamp', edgeR - 0.21, { flip: true });
        if (rel % 230 === 150) put(seg, 'spirit_small', edgeR - 0.13);
        if (rel % 330 === 60) put(seg, 'thatien_pole', edgeR - 0.12);
        if (rel % 60 === 30) put(seg, rng.pick(['boat0', 'boat1', 'boat2']), edgeR + rng.range(1.2, 3.5), { water: true });
      } else if (th.right === 'shop') {
        if (rel % 10 === 5) put(seg, pickShop(rng, stage.theme, 'R'), edgeR + 0.12, { anchor: 'right' });
        if (rel % 14 === 12) put(seg, rng.pick(BACKROW), edgeR + 1.6, { anchor: 'right' });
        if (rel % 16 === 4) put(seg, 'pole2', edgeR - 0.1, { pole: 'R', flip: true });
        if (rel % 33 === 20 && stage.theme === 'chinatown') put(seg, 'redsign_pole', edgeR - 0.1);
        if (rel % 150 === 75) put(seg, 'vendor', edgeR + 0.02, { flip: true });
        if (rel % 120 === 100) put(seg, 'tuktuk_parked', edgeR - 0.32);
      } else if (th.right === 'city') {
        if (rel % 10 === 5) put(seg, pickShop(rng, 'city', 'R'), edgeR + 0.12, { anchor: 'right' });
        if (rel % 26 === 0) put(seg, rng.pick(TOWERS), edgeR + 1.9 + rng.range(0, 0.9), { anchor: 'right' });
        if (rel % 34 === 24) put(seg, rng.pick(['towers0', 'towers1', 'towers2']), edgeR + 4.5 + rng.range(0, 3), { anchor: 'right' });
        if (rel % 26 === 21) put(seg, 'lamp', edgeR - 0.06);
        if (rel % 44 === 30) put(seg, rng.pick(['tree2', 'tree3', 'palm2']), edgeR - 0.03);
        if (th.skytrain && rel % 14 === 7) put(seg, 'pillar', edgeR - 0.05, { pillar: true });
      } else if (th.right === 'park') {
        if (rel % 10 === 5) put(seg, rng.pick(['tree0', 'tree1', 'tree2', 'tree3']), edgeR + rng.range(0.1, 1.2));
        if (rel % 17 === 3) put(seg, rng.pick(['palm0', 'palm1', 'palm2']), edgeR + rng.range(0, 0.4));
        if (rel % 26 === 12) put(seg, 'lamp', edgeR - 0.06);
        if (rel % 200 === 140) put(seg, 'spirit', edgeR - 0.1);
        if (rel % 240 === 60) put(seg, 'chedi', edgeR + rng.range(2, 5));
      }
      if (th.skytrain && rel > 60 && rel < to - from - 60) seg.deck = true;
    }
  }

  // ---------- stage assembly ----------
  const BODY = 2500, WIDEN = 120, MEDIAN = 260, NARROW = 330;
  T.COURSES = [
    { key: 'charoenkrung', stageNo: 1, label: 'FULL RUN' }, { key: 'yaowarat', stageNo: 2 }, { key: 'sathorn', stageNo: 2 },
    { key: 'siam', stageNo: 3 }, { key: 'rattanakosin', stageNo: 3 }, { key: 'sanamluang', stageNo: 4 }, { key: 'thatien', stageNo: 4 }
  ];
  T.buildStage = function (stageKey, stageNo, seed) {
    const stage = T.STAGES[stageKey];
    const rng = OB.rng(seed + stageNo * 7919 + stageKey.length * 131);
    const from = T.segments.length;
    if (!OB.SPR.redsign_pole && OB.IMG.redsign) { // lazily add hanging red sign on pole
      const im = OB.IMG.redsign; const c = OB.makeCanvas(24, 130), g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      g.fillStyle = '#8d8d8a'; g.fillRect(9, 0, 6, 130); g.drawImage(im, 4, 6, 16, 35); OB.SPR.redsign_pole = { img: c, w: 320, h: 320 * 130 / 24, solid: true, thin: 0.3 };
    }
    buildBody(stage, BODY, rng, stageNo);
    const bodyEnd = T.segments.length;
    if (stage.next) {
      // fork zone
      for (let i = 0; i < WIDEN; i++) { addSegment(0, T.lastY(), stage); T.segments[T.segments.length - 1].rw = OB.easeInOut(1, 1.6, i / WIDEN); }
      const medStart = T.segments.length;
      for (let i = 0; i < MEDIAN; i++) { addSegment(0, T.lastY(), stage); const s = T.segments[T.segments.length - 1]; s.rw = 1.6; s.median = 0.1; s.kind = 'fork'; }
      const medEnd = T.segments.length;
      for (let i = 0; i < NARROW; i++) { addSegment(0, T.lastY(), stage); T.segments[T.segments.length - 1].rw = OB.easeInOut(1.6, 1, Math.min(1, i / (NARROW - 60))); }
      const end = T.segments.length;
      populate(stage, from, end, rng);
      // gantry sign before the fork + median head
      const L = T.STAGES[stage.next[0]].name, R = T.STAGES[stage.next[1]].name;
      const gs = OB.makeGantry(L, R);
      put(T.segments[medStart - 30], gs, 0, { anchor: 'center', overhead: true });
      put(T.segments[medStart], 'median_head', 0, { anchor: 'center' });
      put(T.segments[end - 40], 'banner_check', 0, { anchor: 'center', overhead: true });
      return { from, to: end, stage, forkAt: medEnd, checkAt: end - 40, goalAt: null, next: stage.next };
    } else {
      for (let i = 0; i < 200; i++) addSegment(0, T.lastY(), stage);
      const goal = T.segments.length - 1;
      for (let i = 0; i < 400; i++) { addSegment(0, T.lastY(), stage); }
      populate(stage, from, goal, rng);
      // goal area: temple + palms both sides
      for (let i = goal + 5; i < goal + 400; i += 10) { put(T.segments[i], i % 20 ? 'palm0' : 'wat', -1.35, { anchor: 'left' }); put(T.segments[i], 'palm1', 1.3); }
      put(T.segments[goal], 'banner_goal', 0, { anchor: 'center', overhead: true });
      return { from, to: T.segments.length, stage, forkAt: null, checkAt: null, goalAt: goal, next: null };
    }
  };
})(window.OB);
