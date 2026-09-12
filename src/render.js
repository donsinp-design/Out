// OutRun Bangkok — renderer (pseudo-3D road, sprites, HUD, overlays)
(function (OB) {
  'use strict';
  const W = OB.W, H = OB.H, HZ = OB.HORIZON, K = H / 2;
  const R = {}; OB.render = R;
  let ctx, cv;
  R.init = function (canvas) { cv = canvas; ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false; buildPalettes(); };

  // ---------- palettes ----------
  function tint(hex, r, g, b) {
    const n = parseInt(hex.slice(1), 16);
    const c = [((n >> 16) & 255) * r, ((n >> 8) & 255) * g, (n & 255) * b].map(v => OB.clamp(Math.round(v), 0, 255));
    return '#' + ((1 << 24) + (c[0] << 16) + (c[1] << 8) + c[2]).toString(16).slice(1);
  }
  const DAY = {
    road: ['#413d40', '#454145'], lane: '#e6e4de', edge: '#d9d7d1', side: ['#a8a39a', '#a09b92'], curb: '#5b5753', curbTop: '#cfcac1',
    shop: ['#7e786f', '#78726a'], water: ['#2b63b0', '#3571c2'], park: ['#6d9a42', '#65913d'], temple: ['#b4a98f', '#ada288'], city: ['#8f8c88', '#898683'],
    rail: '#1e3a2b', railPost: '#2a4a38', ground: '#6d6a66', deck: ['#5e6266', '#585c60'], deckEdge: '#3f4245', median: '#b9b4ab', medianEdge: '#e3c43a', wall: '#b1aca3'
  };
  const PAL = { day: DAY };
  function buildPalettes() {
    const mk = (r, g, b) => { const o = {}; for (const k in DAY) o[k] = Array.isArray(DAY[k]) ? DAY[k].map(h => tint(h, r, g, b)) : tint(DAY[k], r, g, b); return o; };
    PAL.golden = mk(1.04, 0.97, 0.88);
    PAL.dusk = mk(0.72, 0.6, 0.78);
    PAL.dusk.water = ['#4a3f86', '#5a4a96'];
    // night gets its darkness from the lightmap in the frame pass, so the base palette only cools a touch and
    // keeps the lane paint bright enough to survive the ambient multiply
    PAL.night = mk(0.9, 0.94, 1.1);
    PAL.night.water = ['#1c2a5c', '#233468']; PAL.night.lane = '#f6f4ec'; PAL.night.edge = '#eeebe2';
  }
  R.PAL = PAL;

  // ---------- background ----------
  const BG = {};
  R.bgFor = function (light) {
    if (BG[light]) return BG[light];
    const src = OB.IMG.bg, c = OB.makeCanvas(src.width, src.height), g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    if (light === 'golden') {
      g.globalCompositeOperation = 'multiply'; g.fillStyle = '#ffeacd'; g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'screen'; const gr = g.createLinearGradient(0, 0, 0, c.height); gr.addColorStop(0, 'rgba(255,120,40,0)'); gr.addColorStop(1, 'rgba(255,140,60,0.28)'); g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
    } else if (light === 'dusk') {
      g.globalCompositeOperation = 'multiply'; const gr = g.createLinearGradient(0, 0, 0, c.height); gr.addColorStop(0, '#5a3d9a'); gr.addColorStop(0.55, '#c86a8a'); gr.addColorStop(1, '#ffb070'); g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'screen'; const gr2 = g.createLinearGradient(0, 0, 0, c.height); gr2.addColorStop(0, 'rgba(40,10,80,0.2)'); gr2.addColorStop(0.7, 'rgba(255,90,40,0.25)'); gr2.addColorStop(1, 'rgba(255,170,90,0.45)'); g.fillStyle = gr2; g.fillRect(0, 0, c.width, c.height);
      // sun
      g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,190,90,0.55)'; g.beginPath(); g.arc(230, 178, 26, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,220,150,0.35)'; g.beginPath(); g.arc(230, 178, 44, 0, Math.PI * 2); g.fill();
    } else if (light === 'night') {
      // the frame is darkened again by the night lightmap, so this only cools the sky and leaves the last of the sunset low down
      g.globalCompositeOperation = 'multiply'; const gr = g.createLinearGradient(0, 0, 0, c.height); gr.addColorStop(0, '#3e4ca8'); gr.addColorStop(0.6, '#6a5cb0'); gr.addColorStop(1, '#d89068'); g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'screen'; const gr2 = g.createLinearGradient(0, 0, 0, c.height); gr2.addColorStop(0, 'rgba(10,10,40,0)'); gr2.addColorStop(0.75, 'rgba(255,90,60,0.1)'); gr2.addColorStop(1, 'rgba(255,150,80,0.3)'); g.fillStyle = gr2; g.fillRect(0, 0, c.width, c.height);
    }
    g.globalCompositeOperation = 'source-over';
    BG[light] = c; return c;
  };
  function drawBackground(G) {
    // The skyline is one continuous image, fixed horizontally like the reference frame (no tiling, no mirroring).
    const bg = R.bgFor(G.light);
    const y0 = HZ - bg.height + Math.round(G.bgShift || 0);
    ctx.fillStyle = PAL[G.light].ground; ctx.fillRect(0, 0, W, H);
    if (y0 > 0) { ctx.fillStyle = G.light === 'night' ? '#2040a0' : '#0558f0'; ctx.fillRect(0, 0, W, y0 + 1); }
    ctx.drawImage(bg, Math.round((W - bg.width) / 2), y0);
  }

  // ---------- projection ----------
  const roadW = () => OB.track.roadW;
  const WATER_DROP = 0, SIDEWALK = 0.13, FOLLOW = 0.8; // camera follows the bike only partially so the road stays centred
  function project(p, camX, camY, camZ, depth, rw) {
    p.camera.x = p.world.x - camX; p.camera.y = p.world.y - camY; p.camera.z = p.world.z - camZ;
    p.screen.scale = depth / p.camera.z;
    p.screen.x = Math.round(W / 2 + p.screen.scale * p.camera.x * K);
    p.screen.y = Math.round(HZ - p.screen.scale * p.camera.y * K);
    p.screen.w = Math.round(p.screen.scale * roadW() * rw * K);
  }
  function poly(x1, y1, x2, y2, x3, y3, x4, y4, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath(); ctx.fill();
  }

  function renderGround(seg, pal, th) {
    const p1 = seg.p1.screen, p2 = seg.p2.screen;
    const x1 = p1.x, y1 = p1.y, w1 = p1.w, x2 = p2.x, y2 = p2.y, w2 = p2.w;
    const swR = th.right === 'water' ? 0.22 : SIDEWALK;
    const sw1 = w1 * SIDEWALK, sw2 = w2 * SIDEWALK, swr1 = w1 * swR, swr2 = w2 * swR, alt = Math.floor(seg.index / 3) % 2;
    const envL = pal[th.left] || pal.shop, envR = pal[th.right] || pal.shop;
    poly(0, y1, x1 - w1 - sw1, y1, x2 - w2 - sw2, y2, 0, y2, envL[alt]);
    if (th.right === 'water') {
      // river surface sits below road level: embankment wall face + lowered water plane
      const d1 = seg.p1.screen.scale * WATER_DROP * K, d2 = seg.p2.screen.scale * WATER_DROP * K;
      const ox1 = x1 + w1 + swr1, ox2 = x2 + w2 + swr2;
      poly(ox1, y1, W, y1, W, y2, ox2, y2, envR[alt]);
      if (alt === 0 && seg.index % 12 === 0) poly(ox1 + sw1 * 1.5, y1, W, y1, W, y2, ox2 + sw2 * 1.5, y2, pal.water[1]);
    } else poly(x1 + w1 + sw1, y1, W, y1, W, y2, x2 + w2 + sw2, y2, envR[alt]);
    // sidewalks
    poly(x1 - w1 - sw1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - sw2, y2, pal.side[alt]);
    poly(x1 + w1, y1, x1 + w1 + swr1, y1, x2 + w2 + swr2, y2, x2 + w2, y2, th.right === 'water' ? (alt ? '#cbbc9c' : '#d3c4a4') : pal.side[alt]);
    // paving joints
    if (seg.index % 6 === 0 && (y1 - y2) > 2) { ctx.fillStyle = pal.curb; ctx.globalAlpha = 0.35; poly(x1 - w1 - sw1, y1, x1 - w1, y1, x1 - w1, y1 - 1, x1 - w1 - sw1, y1 - 1, pal.curb); poly(x1 + w1, y1, x1 + w1 + sw1, y1, x1 + w1 + sw1, y1 - 1, x1 + w1, y1 - 1, pal.curb); ctx.globalAlpha = 1; }
    // curbs
    const c1 = Math.max(1, w1 * 0.014), c2 = Math.max(1, w2 * 0.014);
    poly(x1 - w1 - c1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - c2, y2, pal.curb);
    poly(x1 + w1, y1, x1 + w1 + c1, y1, x2 + w2 + c2, y2, x2 + w2, y2, pal.curb);
    // embankment parapet edge (water side)
    if (th.right === 'water') poly(x1 + w1 + swr1 - c1, y1, x1 + w1 + swr1 + c1, y1, x2 + w2 + swr2 + c2, y2, x2 + w2 + swr2 - c2, y2, pal.curbTop);
    // road
    poly(x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, pal.road[alt]);
    // lane markings
    const lanes = OB.track.lanes;
    if (seg.index % 8 < 4) {
      const l1 = Math.max(1, w1 * 0.012), l2 = Math.max(1, w2 * 0.012);
      for (let i = 1; i < lanes; i++) {
        const lx1 = x1 - w1 + (2 * w1 / lanes) * i, lx2 = x2 - w2 + (2 * w2 / lanes) * i;
        poly(lx1 - l1, y1, lx1 + l1, y1, lx2 + l2, y2, lx2 - l2, y2, pal.lane);
      }
    }
    const e1 = Math.max(0.6, w1 * 0.008), e2 = Math.max(0.6, w2 * 0.008);
    poly(x1 - w1 * 0.955 - e1, y1, x1 - w1 * 0.955 + e1, y1, x2 - w2 * 0.955 + e2, y2, x2 - w2 * 0.955 - e2, y2, pal.edge);
    poly(x1 + w1 * 0.955 - e1, y1, x1 + w1 * 0.955 + e1, y1, x2 + w2 * 0.955 + e2, y2, x2 + w2 * 0.955 - e2, y2, pal.edge);
    // fork median
    if (seg.median > 0) {
      const m1 = w1 * seg.median, m2 = w2 * seg.median;
      poly(x1 - m1, y1, x1 + m1, y1, x2 + m2, y2, x2 - m2, y2, pal.median);
      poly(x1 - m1 - c1, y1, x1 - m1, y1, x2 - m2, y2, x2 - m2 - c2, y2, pal.medianEdge);
      poly(x1 + m1, y1, x1 + m1 + c1, y1, x2 + m2 + c2, y2, x2 + m2, y2, pal.medianEdge);
      if (seg.index % 6 < 3) poly(x1 - m1 * 0.3, y1, x1 + m1 * 0.3, y1, x2 + m2 * 0.3, y2, x2 - m2 * 0.3, y2, '#8a8580');
    }
  }

  function drawSprite(img, destX, destY, destW, destH, clipY, flip) {
    if (destW < 1 || destH < 1) return;
    const clipH = clipY ? Math.max(0, destY + destH - clipY) : 0;
    if (clipH >= destH) return;
    const sh = img.height - (img.height * clipH / destH);
    if (flip) { ctx.save(); ctx.translate(destX + destW, destY); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, img.width, sh, 0, 0, destW, destH - clipH); ctx.restore(); }
    else ctx.drawImage(img, 0, 0, img.width, sh, destX, destY, destW, destH - clipH);
  }

  function renderRail(seg, pal) {
    const p1 = seg.p1.screen, p2 = seg.p2.screen;
    const rx1 = p1.x + p1.w + p1.w * 0.22, rx2 = p2.x + p2.w + p2.w * 0.22;
    const h1 = p1.scale * 420 * K, h2 = p2.scale * 420 * K;
    if (h1 < 1) return;
    const t1 = Math.max(1, h1 * 0.07), t2 = Math.max(1, h2 * 0.07);
    const clip = seg.clip;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, clip); ctx.clip();
    poly(rx1, p1.y - h1, rx2, p2.y - h2, rx2, p2.y - h2 + t2, rx1, p1.y - h1 + t1, pal.rail);
    poly(rx1, p1.y - h1 * 0.55, rx2, p2.y - h2 * 0.55, rx2, p2.y - h2 * 0.55 + t2, rx1, p1.y - h1 * 0.55 + t1, pal.rail);
    if (seg.index % 3 === 0) { ctx.fillStyle = pal.railPost; ctx.fillRect(rx1 - t1, p1.y - h1, t1 * 2, h1); }
    ctx.restore();
  }

  function renderDeck(seg, pal) {
    const p1 = seg.p1.screen, p2 = seg.p2.screen;
    const hb = 7000, ht = 8000;
    const yb1 = p1.y - p1.scale * hb * K, yb2 = p2.y - p2.scale * hb * K;
    const yt1 = p1.y - p1.scale * ht * K, yt2 = p2.y - p2.scale * ht * K;
    if (yb2 < -20 && yb1 < -20) return;
    const wl1 = p1.w * 1.25, wl2 = p2.w * 1.25;
    poly(p1.x - wl1, yb1, p1.x + wl1, yb1, p2.x + wl2, yb2, p2.x - wl2, yb2, pal.deck[Math.floor(seg.index / 4) % 2]);
    if (seg.index % 6 === 0) poly(p1.x - wl1, yb1, p1.x + wl1, yb1, p2.x + wl2, yb2 + (yb1 - yb2) * 0.6, p2.x - wl2, yb2 + (yb1 - yb2) * 0.6, pal.deckEdge);
    // side faces
    poly(p1.x - wl1, yb1, p1.x - wl1, yt1, p2.x - wl2, yt2, p2.x - wl2, yb2, pal.deckEdge);
    poly(p1.x + wl1, yb1, p1.x + wl1, yt1, p2.x + wl2, yt2, p2.x + wl2, yb2, pal.deckEdge);
  }

  // ---------- main frame ----------
  R.frame = function (G) {
    const T = OB.track, segs = T.segments, segLen = T.segLen, RW = T.roadW;
    const pal = PAL[G.light] || PAL.day;
    const night = G.light === 'night'; lights.length = 0;
    const baseSeg = T.findSegment(G.position), basePct = (G.position % segLen) / segLen;
    const lim = baseSeg.index + G.drawDistance; // segments past this were not projected this frame
    const playerSeg = T.findSegment(G.position + G.playerZ), playerPct = ((G.position + G.playerZ) % segLen) / segLen;
    const playerY = OB.lerp(playerSeg.p1.world.y, playerSeg.p2.world.y, playerPct);
    G.bgShift = -(playerY) * 0.004;
    const camX = G.playerX * RW * FOLLOW, camY = G.cameraH + playerY, camZ = G.position;
    const cam = G.cam || { pitch: 0, lean: 0, squash: 0, zoom: 1 }, depth = G.cameraDepth * (cam.zoom || 1);
    G.playerDX = (G.playerX * RW - camX) * (depth / G.playerZ) * K;
    ctx.save();
    // camera cues: forward pitch on acceleration, lateral lean in corners, a squash on hard landings, shakes.
    // A hair of overscan hides the edges the shifts would otherwise expose.
    if (cam.pitch || cam.lean || cam.squash) { ctx.translate(W / 2, H / 2); ctx.scale(1.012, 1.012); ctx.translate(-W / 2, -H / 2); ctx.translate(Math.round(cam.lean), Math.round(cam.pitch)); }
    if (cam.squash > 0) { ctx.translate(0, H); ctx.scale(1, 1 - 0.02 * cam.squash); ctx.translate(0, -H); }
    if (G.shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * G.shake * 8), Math.round((Math.random() - 0.5) * G.shake * 6));
    drawBackground(G);
    const WD = OB.world, actorsBySeg = new Map(), debrisBySeg = new Map();
    WD.bucket(actorsBySeg, WD.actors.items, WD.actors.n, segLen); WD.bucket(debrisBySeg, WD.debris.items, WD.debris.n, segLen);
    // cars per segment
    const carsBySeg = new Map();
    for (const c of G.cars) { const i = Math.floor(c.z / segLen); if (!carsBySeg.has(i)) carsBySeg.set(i, []); carsBySeg.get(i).push(c); }
    // ---- ground pass (front to back) ----
    let maxy = H, x = 0, dx = -(baseSeg.curve * basePct);
    const projected = [];
    for (let n = 0; n < G.drawDistance; n++) {
      const idx = baseSeg.index + n; if (idx >= segs.length) break;
      const seg = segs[idx];
      project(seg.p1, camX - x, camY, camZ, depth, seg.rw);
      project(seg.p2, camX - x - dx, camY, camZ, depth, seg.rw);
      x += dx; dx += seg.curve;
      seg.clip = maxy;
      if (seg.p1.camera.z <= depth) { seg.hidden = true; seg.behind = true; continue; }
      seg.behind = false; projected.push(seg);
      if (seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) { seg.hidden = true; continue; }
      seg.hidden = false;
      renderGround(seg, pal, T.THEMES[seg.theme]);
      if (seg.decals && seg.decals.length) WD.drawDecals(ctx, seg, G);
      maxy = seg.p2.screen.y;
    }
    // ---- sprite pass (back to front): every projected slice, clipped by the crest line, so nothing pops ----
    const poles = { L: [], R: [] };
    let lastPole = null;
    for (let n = projected.length - 1; n >= 0; n--) {
      const seg = projected[n];
      const th = T.THEMES[seg.theme];
      if (seg.rail && !seg.hidden) renderRail(seg, pal);
      const scale = seg.p1.screen.scale, sx = seg.p1.screen.x, sy = seg.p1.screen.y;
      let newPole = null;
      for (const sp of seg.sprites) {
        const s = sp.spr, img = s.img;
        const destW = s.w * scale * K, destH = destW * img.height / img.width;
        let destX = sx + scale * sp.offset * RW * K;
        const anchor = sp.anchor || 'center';
        if (anchor === 'center') destX -= destW / 2; else if (anchor === 'left') destX -= destW;
        let destY = sy - destH;
        if (sp.water) destY += scale * WATER_DROP * K;
        // pole tops are kept even off screen, so in a corner the wires leave the frame toward the real next pole
        if (sp.pole && s.poleTop) { const top = { x: destX + destW * s.poleTop.x, y: destY + destH * s.poleTop.y, w: destW, seg: seg.index }; poles[sp.pole].push(top); if (sp.pole === 'L') newPole = top; }
        if (destX > W || destX + destW < 0) continue;
        let fa = 1;
        if (sp.flick) { const ph = (G.t * 6 + sp.flick * 1.7) % 4; if (ph < 0.07 || (ph > 0.5 && ph < 0.54)) fa = 0.45; } // a lit sign with a bad tube
        ctx.globalAlpha = fa;
        drawSprite(img, destX, destY, destW, destH, seg.clip, sp.flip);
        ctx.globalAlpha = 1;
        if (night) noteSpriteLight(s, destX, destY, destW, destH, sy, seg.clip, sp.flip, fa);
        if (sp.pillar) { /* pillars carry the deck */ }
      }
      // the wire span that ends at this segment's pole is drawn now, so nearer shophouses paint over it
      if (newPole) { if (lastPole) wireSpan(lastPole, newPole); lastPole = newPole; }
      if (seg.deck && !seg.hidden) renderDeck(seg, pal);
      const cars = carsBySeg.get(seg.index);
      if (cars) for (const c of cars) {
        const pct = (c.z % segLen) / segLen;
        const cs = OB.lerp(seg.p1.screen.scale, seg.p2.screen.scale, pct), cx = OB.lerp(seg.p1.screen.x, seg.p2.screen.x, pct), cy = OB.lerp(seg.p1.screen.y, seg.p2.screen.y, pct);
        const img = c.spr.img, destW = c.spr.w * cs * K, destH = destW * img.height / img.width;
        const dx0 = cx + cs * c.offset * RW * seg.rw * K - destW / 2;
        drawSprite(img, dx0, cy - destH, destW, destH, seg.clip, false);
        // brake lights and indicators (rear views only; the indicator sits on the side it announces)
        if (!c.oncoming && destW > 8 && cy <= seg.clip + destH) {
          if (c.brake > 0) { const f = WD.F('BRAKE_LIGHT'); if (f) WD.blitC(ctx, f, dx0 + destW / 2, cy - destH * 0.3, destW * 0.7, destW * 0.7 * f.h / f.w, 0, 0.95); }
          if (c.ind && ((G.t * 2.5) % 1) < 0.62) { const f = WD.F(c.ind < 0 ? 'INDICATOR_L' : 'INDICATOR_R'); if (f) WD.blitC(ctx, f, dx0 + destW * (c.ind < 0 ? 0.12 : 0.88), cy - destH * 0.32, destW * 0.22, destW * 0.22 * f.h / f.w, 0, 1); }
        }
        if (night && destW > 4 && cy <= seg.clip + destH) noteCarLight(c, dx0, cy, destW, destH, segs, segLen, RW, lim);
      }
      const al = actorsBySeg.get(seg.index); if (al) for (const a of al) WD.drawActor(ctx, a, seg);
      const dl = debrisBySeg.get(seg.index); if (dl) for (const d of dl) WD.drawDebris(ctx, d, seg);
    }
    // speed streaks radiate from the road's vanishing point (only near top speed)
    if (WD.streaks.n) WD.drawStreaks(ctx, G, W / 2 + (G.drawShift || 0) + (G.playerDX || 0), 457 - 95);
    // ---- wires: the last span carries on toward the pole beside the camera (left-hand lines only, as in the reference) ----
    wireTail(poles.L, G, -1, baseSeg, camX, camY, camZ);
    // ---- player ----
    drawPlayer(G);
    // ---- night: lightmap multiply, then the emissive bits, inside the camera transform so pools stay under their lamps ----
    if (night) nightPass(G, segs, segLen, RW, lim);
    ctx.restore();
    // ---- light grading ----
    if (G.light === 'golden') { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#fff1dc'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
    else if (G.light === 'dusk') { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#d9a8c8'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = 'rgba(120,40,90,0.18)'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
  };

  // ---------- night ----------
  // Night is a lightmap. The finished frame is multiplied by an ambient blue, but first every light source paints
  // its pool into that map, so under a lamp or inside a headlight beam the road and pavement show through at full
  // brightness and colour rather than being tinted. The lights themselves (lanterns, tail lights) go on top after.
  const lights = [];              // this frame's sources, in screen space: pools and cones go into the map, glows on top
  let LM = null, lg = null;       // the lightmap canvas, made once
  const AMBIENT = '#4a5488';      // what the scene is multiplied by where nothing is lit
  const LIT_SIGN = /sign|redsign|seven|thatien|ckrd/;   // the same set that flickers: neon and lightboxes stay lit after dark
  function noteSpriteLight(s, destX, destY, destW, destH, groundY, clip, flip, fa) {
    if (s.lampHead) {
      if (destH < 5 || groundY > clip + 2) return;
      const hx = destX + destW * (flip ? 1 - s.lampHead.x : s.lampHead.x), hy = destY + destH * s.lampHead.y;
      lights.push({ kind: 'pool', x: hx, y: groundY, rx: destH * 0.85, ry: destH * 0.3, r: 255, g: 186, b: 104, a: 0.95 });
      lights.push({ kind: 'cone', x: hx, y: hy, gy: groundY, rx: destH * 0.55 });
      lights.push({ kind: 'glow', x: hx, y: hy, rx: Math.max(1.5, destW * 0.55), r: 255, g: 216, b: 150, a: 0.9 });
    } else if (destW > 3 && s.name && LIT_SIGN.test(s.name)) {
      const h = Math.min(destH, clip - destY); if (h <= 0) return;
      lights.push({ kind: 'rect', x: destX, y: destY, w: destW, h, a: 0.72 * fa });
    }
  }
  function noteCarLight(c, dx0, cy, destW, destH, segs, segLen, RW, lim) {
    const moto = !!c.spr.moto, braking = c.brake > 0;
    // tail lights: a pair on a car, one on a bike, and brighter under braking
    const ty = cy - destH * (moto ? 0.36 : 0.3), tr = Math.max(1.2, destW * (moto ? 0.12 : 0.085)) * (braking ? 1.7 : 1);
    if (moto) lights.push({ kind: 'glow', x: dx0 + destW / 2, y: ty, rx: tr, r: 255, g: 40, b: 30, a: 0.9 });
    else { lights.push({ kind: 'glow', x: dx0 + destW * 0.2, y: ty, rx: tr, r: 255, g: 40, b: 30, a: 0.9 }); lights.push({ kind: 'glow', x: dx0 + destW * 0.8, y: ty, rx: tr, r: 255, g: 40, b: 30, a: 0.9 }); }
    // headlights: seen from behind, what shows is the beam landing on the road a little way ahead of the vehicle
    const az = c.z + (moto ? 520 : 820), ai = Math.floor(az / segLen);
    if (ai >= lim || ai >= segs.length) return;
    const as = segs[ai]; if (as.behind || as.hidden) return;
    const ap = (az % segLen) / segLen, acs = OB.lerp(as.p1.screen.scale, as.p2.screen.scale, ap);
    const ax = OB.lerp(as.p1.screen.x, as.p2.screen.x, ap) + acs * c.offset * RW * as.rw * K, ay = OB.lerp(as.p1.screen.y, as.p2.screen.y, ap);
    if (ay > as.clip) return;
    const rx = c.spr.w * acs * K * (moto ? 0.6 : 0.95); if (rx < 2) return;
    lights.push({ kind: 'pool', x: ax, y: ay, rx, ry: rx * 0.42, r: 205, g: 218, b: 255, a: 0.8 });
  }
  // the bike's own beam: a strip of road ahead that follows the curve, widening and fading with distance
  function playerBeam(g, G, segs, segLen, RW, lim) {
    const pz = G.position + G.playerZ, lat = G.playerX * RW;
    const bx = W / 2 + (G.drawShift || 0) + (G.playerDX || 0), by = 452;
    const L = [[bx - 26, by]], Rr = [[bx + 26, by]];
    let farY = by;
    for (const [dz, half] of [[380, 0.13], [900, 0.2], [1500, 0.27], [2300, 0.34]]) {
      const i = Math.floor((pz + dz) / segLen); if (i >= lim || i >= segs.length) break;
      const s = segs[i]; if (s.behind || s.hidden) break;
      const p = ((pz + dz) % segLen) / segLen, cs = OB.lerp(s.p1.screen.scale, s.p2.screen.scale, p);
      const x = OB.lerp(s.p1.screen.x, s.p2.screen.x, p) + cs * lat * K, y = OB.lerp(s.p1.screen.y, s.p2.screen.y, p), hw = cs * half * RW * K;
      if (y > s.clip || y >= farY) break;
      L.push([x - hw, y]); Rr.push([x + hw, y]); farY = y;
    }
    if (L.length < 2) return;
    const gr = g.createLinearGradient(0, by, 0, farY);
    gr.addColorStop(0, 'rgba(255,238,205,0.8)'); gr.addColorStop(0.35, 'rgba(255,238,205,0.55)'); gr.addColorStop(1, 'rgba(255,238,205,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < L.length; i++) g.lineTo(L[i][0], L[i][1]);
    for (let i = Rr.length - 1; i >= 0; i--) g.lineTo(Rr[i][0], Rr[i][1]);
    g.closePath(); g.fill();
    // spill around the bike itself, so the rider is never a silhouette on their own headlight
    ellipseLight(g, { x: bx, y: by + 6, rx: 150, ry: 60, r: 255, g: 226, b: 190, a: 0.5 });
  }
  function ellipseLight(g, l) {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, 'rgba(' + l.r + ',' + l.g + ',' + l.b + ',' + l.a + ')');
    gr.addColorStop(0.45, 'rgba(' + l.r + ',' + l.g + ',' + l.b + ',' + (l.a * 0.45).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(' + l.r + ',' + l.g + ',' + l.b + ',0)');
    g.save(); g.translate(l.x, l.y); g.scale(l.rx, l.ry); g.fillStyle = gr; g.fillRect(-1, -1, 2, 2); g.restore();
  }
  function coneLight(g, l) { // the haze under a lantern, apex at the lamp, spreading to the pool
    const gr = g.createLinearGradient(0, l.y, 0, l.gy);
    gr.addColorStop(0, 'rgba(255,200,120,0.3)'); gr.addColorStop(1, 'rgba(255,190,110,0.04)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(l.x - l.rx * 0.08, l.y); g.lineTo(l.x + l.rx * 0.08, l.y); g.lineTo(l.x + l.rx, l.gy); g.lineTo(l.x - l.rx, l.gy); g.closePath(); g.fill();
  }
  function nightPass(G, segs, segLen, RW, lim) {
    if (!LM) { LM = OB.makeCanvas(W, H); lg = LM.getContext('2d'); }
    lg.globalCompositeOperation = 'source-over'; lg.fillStyle = AMBIENT; lg.fillRect(0, 0, W, H);
    lg.globalCompositeOperation = 'lighter';
    playerBeam(lg, G, segs, segLen, RW, lim);
    for (const l of lights) {
      if (l.kind === 'pool') ellipseLight(lg, l);
      else if (l.kind === 'cone') coneLight(lg, l);
      else if (l.kind === 'rect') { lg.fillStyle = 'rgba(255,240,220,' + l.a.toFixed(2) + ')'; lg.fillRect(l.x, l.y, l.w, l.h); }
    }
    ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(LM, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) if (l.kind === 'glow') ellipseLight(ctx, { x: l.x, y: l.y, rx: l.rx, ry: l.rx, r: l.r, g: l.g, b: l.b, a: l.a });
    ctx.globalCompositeOperation = 'source-over';
  }

  // one bundle of five sagging lines between two pole tops (a farther, b nearer)
  function wireSpan(a, b) {
    if (b.w < a.w) return;
    ctx.save(); ctx.strokeStyle = 'rgba(18,18,22,0.85)';
    ctx.lineWidth = OB.clamp(b.w * 0.05, 0.8, 2.2);
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    for (let k = 0; k < 5; k++) {
      const oa = (k - 2) * a.w * 0.16, ob = (k - 2) * b.w * 0.16;
      const ya = a.y + (k % 2) * a.w * 0.12, yb = b.y + (k % 2) * b.w * 0.12;
      const sag = d * (0.08 + k * 0.012);
      ctx.beginPath(); ctx.moveTo(a.x + oa, ya); ctx.quadraticCurveTo((a.x + b.x) / 2 + (oa + ob) / 2, (ya + yb) / 2 + sag, b.x + ob, yb); ctx.stroke();
    }
    ctx.restore();
  }
  // Past the nearest pole the line keeps going where the poles were heading: the next pole sits one spacing closer,
  // so its screen step is the last step scaled by the perspective ratio r/(2-r) (r = size ratio of the last two).
  // That follows the kerb round a corner instead of always shooting to the top corner of the frame.
  function wireTail(list, G, side, baseSeg, camX, camY, camZ) {
    if (!list.length) return;
    if (list.length === 1) { // only one pole in view: a stand-in pole beside the camera
      const seg = baseSeg; const p = { world: { x: 0, y: seg.p1.world.y, z: (seg.index + 1) * OB.track.segLen }, camera: {}, screen: {} };
      project(p, camX, camY, camZ, G.cameraDepth, seg.rw);
      const nearScale = p.screen.scale, nearW = OB.SPR.pole.w * nearScale * K;
      wireSpan(list[0], { x: p.screen.x + nearScale * side * 1.2 * seg.rw * OB.track.roadW * K, y: p.screen.y - nearW * (300 / 40) * 0.96, w: nearW });
      return;
    }
    let a = list[list.length - 2], b = list[list.length - 1];
    for (let k = 0; k < 3; k++) {
      const r = Math.min(b.w / Math.max(a.w, 1e-6), 1.9), g = 1 / (2 - r);
      const c = { x: b.x + (b.x - a.x) * r * g, y: b.y + (b.y - a.y) * r * g, w: b.w * g };
      wireSpan(b, c);
      if (c.x < -40 || c.x > W + 40 || c.y < -40 || c.y > H + 40) break;
      a = b; b = c;
    }
  }
  function drawLanterns(poles) {
    const L = poles.L, Rr = poles.R; if (!L.length || !Rr.length) return;
    const lan = OB.SPR.lantern.img;
    ctx.save(); ctx.strokeStyle = 'rgba(30,20,20,0.8)';
    for (const a of L) {
      const b = Rr.find(r => r.seg === a.seg); if (!b) continue;
      ctx.lineWidth = OB.clamp(a.w * 0.04, 0.8, 1.6);
      const sag = Math.abs(b.x - a.x) * 0.06;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + sag, b.x, b.y); ctx.stroke();
      const n = 7, s = OB.clamp(a.w * 0.18, 3, 26);
      for (let i = 1; i < n; i++) { const t = i / n, x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * ((a.x + b.x) / 2) + t * t * b.x, y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * ((a.y + b.y) / 2 + sag) + t * t * b.y; ctx.drawImage(lan, Math.round(x - s / 2), Math.round(y), Math.round(s), Math.round(s * 1.3)); }
    }
    ctx.restore();
  }

  // smoke cluster shapes: [dx, dy, grey] in 2px cells; grey cells sit low for the shaded underside
  const PUFFS = [
    [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, -1, 0], [0, 1, 1]],
    [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, -1, 0], [1, -1, 0], [0, 1, 1], [1, 1, 1], [-1, 1, 1]],
    [[0, 0, 0], [1, 0, 0], [2, 0, 0], [-1, 0, 0], [0, -1, 0], [1, -1, 0], [0, 1, 1], [1, 1, 1], [2, 1, 1]],
    [[0, 0, 0], [1, 0, 0], [0, 1, 1]],
    [[0, 0, 0], [-1, 0, 0], [1, 0, 0], [-2, 0, 0], [2, 0, 1], [0, -1, 0], [-1, 1, 1], [1, 1, 1]],
    [[0, 0, 0], [1, 0, 0], [0, -1, 0], [1, -1, 0], [-1, 0, 1], [2, 0, 1], [0, 1, 1], [1, 1, 1]]
  ];
  // ---------- rider (sprite-sheet frames) ----------
  const RS = 178 / 137; // sheet rider frames drawn at the height the bike has always had on screen
  const ROWS = [0.30, 0.45, 0.60, 0.74]; // ice stack rows as fractions of a rider frame's height: top of row 3 ... bottom of row 1
  const ANCHOR = { BRAKE: 0.6, BUMP: 0.4 }; // where the bike sits inside the wider frames
  // The sheet's lean frames, measured by their licence-plate tilt: L2, R1 and R3 lean LEFT (small, medium, hard) and
  // L1 is the one hard RIGHT lean. Right turns below that use the ride frame rotated, so the plate is never mirrored.
  const LEAN_L = ['L2', 'R1', 'R3'], LEAN_R_HARD = 'L1';
  function leanOf(G) { return (G.lean || 0) + (G.driftK || 0) * (G.driftDir || 1) * 0.6; }
  function riderFrameName(G) {
    if (G.bumpT > 0) return 'BUMP';
    const lean = leanOf(G), al = Math.abs(lean);
    if (lean < -0.16) return LEAN_L[al > 0.72 ? 2 : al > 0.42 ? 1 : 0];
    if (lean > 0.8) return LEAN_R_HARD;
    if (G.braking) return 'BRAKE';
    if (G.crouch) return 'ACCEL';
    return 'D' + (Math.floor(G.riderT || 0) % 6);
  }
  function riderRotation(G, name) { const lean = leanOf(G); return (lean > 0 && name !== LEAN_R_HARD && name !== 'BUMP') ? lean * 0.27 : 0; }
  // A rider frame drawn in slices so the ice moves on its own: each bag row (and each half of it) vibrates at
  // speed, shifts outward in corners, lifts on knocks, squashes on hard landings, and shrinks as the ice goes.
  function drawRiderFrame(G, f, cx, by, scale, alpha) {
    const W0 = f.w * scale, H0 = f.h * scale, ax = ANCHOR[f.name] || 0.5;
    const x0 = Math.round(cx - W0 * ax);
    const pct = G.speed / G.maxSpeed, lean = G.lean || 0, t = G.t;
    const iceRows = G.ice / 100 * 3;
    const melt = [OB.clamp(iceRows, 0.3, 1), OB.clamp(iceRows - 1, 0.3, 1), OB.clamp(iceRows - 2, 0.3, 1)]; // bottom, middle, top row
    const squash = 1 - 0.18 * (G.stackC || 0);
    const rp = ROWS.map(r => Math.round(r * f.h));
    ctx.save(); if (alpha < 1) ctx.globalAlpha = alpha;
    // bike, tail light, wheel: fixed
    ctx.drawImage(f.img, f.x, f.y + rp[3], f.w, f.h - rp[3], x0, Math.round(by - (f.h - rp[3]) * scale), Math.round(W0), Math.round((f.h - rp[3]) * scale));
    let baseY = by - (f.h - rp[3]) * scale, lift = 0;
    for (let i = 0; i < 3; i++) { // rows from the bottom up
      const sTop = rp[2 - i], sBot = rp[3 - i], sh = sBot - sTop, dh = Math.max(1, sh * scale * melt[i] * squash);
      lift = (G.stackY || 0) * (0.5 + 0.35 * i);
      const dxRow = -lean * 2.2 * (i + 1) / 3;
      for (let h = 0; h < 2; h++) {
        const jit = pct > 0.25 ? Math.round(Math.sin(t * (37 + i * 5) + h * 3 + i) * pct * 1.3) : 0;
        const sw = Math.floor(f.w / 2), sx = f.x + h * sw;
        ctx.drawImage(f.img, sx, f.y + sTop, sw + (h ? f.w - 2 * sw : 0), sh, x0 + Math.round(h * W0 / 2 + dxRow + jit * 0.6), Math.round(baseY - dh + lift), Math.round(W0 / 2) + 1, Math.round(dh));
      }
      baseY -= dh;
    }
    // the rider's back and helmet: stretched down a little to meet the stack when the ice has shrunk
    const topH = rp[0] * scale;
    ctx.drawImage(f.img, f.x, f.y, f.w, rp[0], x0, Math.round(baseY + lift - topH), Math.round(W0), Math.round(topH) + 1);
    ctx.restore();
  }
  function drawCrash(G, cx, by) {
    const c = G.crash, dir = c.dir, k = RS, WD = OB.world;
    const blit = (name, x, y, flip, alpha) => { const f = WD.F(name); if (f) WD.blit(ctx, f, x, y, f.w * k, f.h * k, flip, 0, alpha); };
    if (c.phase === 'lose') { const f = WD.F(dir < 0 ? 'R3' : 'L1'); drawRiderFrame(G, f, cx + Math.round((Math.random() - 0.5) * 5), by, k, 1); return; }
    if (c.phase === 'eject') { blit('CL_EJECT', cx + c.rider.x * 0.4, by, false, 1); return; }
    const rx = cx + c.rider.x, ry = by + c.rider.y, bx = cx + c.bike.x;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(bx, by - 4, 70, 8, 0, 0, Math.PI * 2); ctx.fill();
    blit(dir < 0 ? 'CL_BIKE' : 'CR_BIKE2', bx, by, false, 1);
    if (c.phase === 'air') { const h = -c.rider.y; ctx.fillStyle = 'rgba(0,0,0,' + (0.3 * Math.max(0.3, 1 - h / 260)).toFixed(2) + ')'; ctx.beginPath(); ctx.ellipse(rx, by - 4, 34, 6, 0, 0, Math.PI * 2); ctx.fill(); blit(dir < 0 ? 'CL_AIR' : 'CR_AIR', rx, ry - 16, false, 1); }
    else if (c.phase === 'ground') blit('CR_GROUND', rx, by, dir < 0, 1);
    else if (c.phase === 'recover') { const i = Math.min(3, Math.floor(c.recT / 0.125)); blit('G' + (i + 1), rx, by, false, 1); }
  }
  function drawPlayer(G) {
    const WD = OB.world, cam = G.cam || { zoom: 1 }, zoom = cam.zoom || 1, bounce = G.bounce || 0;
    const groundY = Math.round(HZ + (457 - HZ) * zoom + bounce);
    const cx = Math.round(W / 2 + (G.drawShift || 0) + (G.playerDX || 0)), by = groundY - Math.round(G.hopY || 0);
    // shadow stays on the road under a hopping bike
    { const h = G.hopY || 0, k = Math.max(0.4, 1 - h / 200), sx = cx + (G.crash ? 0 : 2);
      if (!G.crash) { ctx.fillStyle = 'rgba(0,0,0,' + (0.35 * k).toFixed(2) + ')'; ctx.beginPath(); ctx.ellipse(sx, groundY - 6, 40 * k, 7 * k, 0, 0, Math.PI * 2); ctx.fill(); } }
    // rubber: a dark trail from the rear tyre that smears sideways with the road under the smoke
    if (G.marks && G.marks.length > 1) {
      ctx.save(); ctx.lineCap = 'butt';
      for (let i = 1; i < G.marks.length; i++) {
        const a = G.marks[i - 1], b = G.marks[i]; if (b.start) continue;
        const al = b.t < 0.2 ? 0.9 : 0.9 * (1 - (b.t - 0.2) / 0.3);
        ctx.strokeStyle = 'rgba(6,4,6,' + al.toFixed(2) + ')'; ctx.lineWidth = b.w;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.restore();
    }
    // tyre smoke: flat ragged band of 2px pixel clusters, white with grey speckle, dithering out (no soft fades)
    if (G.smoke && G.smoke.length) {
      const C = 2;
      for (const p of G.smoke) {
        const k = p.t / p.life, keep = k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35;
        const x = Math.round(p.x / C) * C, y = Math.round(p.y / C) * C, cells = PUFFS[p.seed % PUFFS.length];
        for (let i = 0; i < cells.length; i++) {
          if ((((i * 7 + p.seed) % 10) / 10) > keep) continue;
          const c = cells[i]; ctx.fillStyle = c[2] ? '#c8c9cc' : '#f4f4f5'; ctx.fillRect(x + c[0] * C, y + c[1] * C, C, C);
        }
      }
    }
    // puddle splash off the rear wheel
    if (G.splashT > 0) { const f = WD.F('WATER_SPLASH_L'); if (f) { const s = G.splashSide || 1, k = OB.clamp(G.splashT / 0.32, 0, 1); WD.blit(ctx, f, cx + s * 30, groundY + 2, f.w * 1.5 * (1.3 - k * 0.3), f.h * 1.5, s < 0, 0, Math.min(1, k * 2.5)); } }
    if (G.crash) { drawCrash(G, cx, by); }
    else {
      const name = riderFrameName(G), f = WD.F(name);
      if (f) {
        const dk = G.driftK || 0, dd = G.driftDir || 1;
        ctx.save(); ctx.translate(cx - dd * dk * 6, by); ctx.rotate(dk * dd * 0.22 + riderRotation(G, name)); ctx.translate(-(cx - dd * dk * 6), -by);
        drawRiderFrame(G, f, cx - dd * dk * 6, by, RS * zoom, (G.invuln > 0 && Math.floor(G.t * 8) % 2 === 0) ? 0.7 : 1);
        ctx.restore();
      }
    }
    // ice melt drips
    if (G.mode === 'play' && G.ice < 45 && Math.floor(G.t * 6) % 3 === 0) { ctx.fillStyle = 'rgba(200,235,255,0.9)'; ctx.fillRect(cx - 20 + (G.t * 50) % 40, by - 60 + (G.t * 90) % 50, 2, 3); }
  }

  // ---------- HUD ----------
  const TXT = OB.text;
  // chunky pixel arrow (dir -1 = left, 1 = right), centred on x,y
  function arrow(x, y, dir, s, fill, outline) {
    const d = dir < 0 ? -1 : 1;
    const pts = [[d * s, 0], [0, -s * 0.8], [0, -s * 0.35], [-d * s, -s * 0.35], [-d * s, s * 0.35], [0, s * 0.35], [0, s * 0.8]];
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
    if (outline) { ctx.lineJoin = 'miter'; ctx.strokeStyle = outline; ctx.lineWidth = 4; ctx.stroke(); }
    ctx.fillStyle = fill; ctx.fill(); ctx.restore();
  }
  R.arrow = arrow;
  function bar(x, y, segs, size, gap, h, filled, col, colTop, colOff) {
    const w = segs * (size + gap) + gap;
    ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#e9e9e9'; ctx.fillRect(x - 2, y - 2, w + 4, 1); ctx.fillRect(x - 2, y + h + 1, w + 4, 1); ctx.fillRect(x - 2, y - 2, 1, h + 4); ctx.fillRect(x + w + 1, y - 2, 1, h + 4);
    for (let i = 0; i < segs; i++) {
      const on = i < filled; ctx.fillStyle = on ? col : colOff; ctx.fillRect(x + gap + i * (size + gap), y + 1, size, h - 2);
      if (on) { ctx.fillStyle = colTop; ctx.fillRect(x + gap + i * (size + gap), y + 1, size, 2); }
    }
  }
  R.hud = function (G) {
    const IMG = OB.IMG;
    // portrait: unhurt, cracked helmet, then bleeding
    const faces = OB.PORTRAITS;
    ctx.drawImage(faces ? faces[G.health > 66 ? 0 : G.health > 33 ? 1 : 2] : IMG.portrait, 23, 14);
    TXT(ctx, 'HEALTH', 80, 34, { size: 7, sy: 1.8, fill: '#fff', outline: '#000', outlineW: 3 });
    bar(127, 22, 12, 4, 1, 13, Math.ceil(G.health / 100 * 12), '#ff0e00', '#ff6a5a', '#3a0806');
    TXT(ctx, 'ICE', 80, 52, { size: 7, sy: 1.8, fill: '#e9fbff', outline: '#000', outlineW: 3 });
    bar(105, 41, 14, 5, 1, 11, Math.ceil(G.ice / 100 * 14), '#dff6ff', '#ffffff', '#0e2438');
    if (G.ice < 25 && Math.floor(G.t * 4) % 2 === 0) TXT(ctx, 'MELTING!', 200, 52, { size: 7, sy: 1.4, fill: '#7fe0ff', outline: '#000', outlineW: 3 });
    // time
    TXT(ctx, 'TIME', 352, 34, { size: 12, sy: 1.7, fill: '#f90000', outline: '#000', outlineW: 6, outline2: '#fff', outline2W: 3 });
    const tcol = (G.time <= 10 && Math.floor(G.t * 4) % 2 === 0) ? '#ff3b3b' : '#ffd800';
    TXT(ctx, String(Math.max(0, Math.ceil(G.time))), 418, 38, { size: 19, sy: 1.4, fill: tcol, outline: '#000', outlineW: 5 });
    // score
    TXT(ctx, 'SCORE', 622, 34, { size: 12, sy: 1.7, fill: '#ff37a8', outline: '#000', outlineW: 6, outline2: '#fff', outline2W: 3 });
    TXT(ctx, OB.pad(G.score, 7), 704, 34, { size: 12, sy: 1.7, fill: '#fff', outline: '#000', outlineW: 5 });
    // live multiplier, under the score, with what is feeding it
    if (G.mode === 'play' || G.mode === 'countdown') {
      const m = G.mult || 1, hot = m >= 2, brk = (G.multBreak || 0) > 0, armed = !!G.multArmed;
      const col = brk ? '#ff6a5a' : m >= 4 ? '#ff37a8' : hot ? '#ffd800' : armed ? '#cfd3da' : '#6c727d';
      const sc = 1 + Math.min(0.35, Math.max(0, m - 1) * 0.05) + (brk ? 0.25 : 0);
      ctx.save(); ctx.translate(762, 56); ctx.scale(sc, sc);
      TXT(ctx, m.toFixed(2) + 'x', 0, 0, { size: 11, sy: 1.5, fill: col, outline: '#000', outlineW: 5, align: 'center' });
      ctx.restore();
      // while the combo is dormant the label is the instruction for waking it, not a bonus name
      if (G.multWhy && !brk && (!armed || m > 1.2)) TXT(ctx, G.multWhy, 762, 74, { size: 6, sy: 1.4, fill: armed ? col : '#7fe0ff', outline: '#000', outlineW: 3, align: 'center' });
    }
    // pause button (top-right corner)
    if (G.mode === 'play') {
      const bx = W - 40, by = 8, bw = 32, bh = 28;
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(bx, by, bw, bh); ctx.fillStyle = G.paused ? '#ffd800' : '#fff'; ctx.fillRect(bx + 10, by + 7, 4, 14); ctx.fillRect(bx + 18, by + 7, 4, 14);
      R.hit.pause = { x: bx - 6, y: by - 6, w: bw + 12, h: bh + 12 };
    } else R.hit.pause = null;
    // speed
    const kmh = Math.round(G.speed / G.maxSpeed * 296);
    TXT(ctx, String(kmh), 74, H - 16, { size: 15, sy: 1.3, fill: '#fff', outline: '#000', outlineW: 4, align: 'right' });
    TXT(ctx, 'km/h', 80, H - 16, { size: 7, sy: 1.3, fill: '#ffd800', outline: '#000', outlineW: 3 });
    // stage
    const st = OB.track.STAGES[G.stageKey];
    TXT(ctx, 'STAGE ' + G.stageNo, W - 14, H - 30, { size: 8, sy: 1.4, fill: '#ffd800', outline: '#000', outlineW: 3, align: 'right' });
    TXT(ctx, st.name.eng, W - 14, H - 16, { size: 7, sy: 1.4, fill: '#fff', outline: '#000', outlineW: 3, align: 'right' });
    TXT(ctx, st.name.thai, W - 14 - (st.name.eng.length * 7) - 8, H - 16, { size: 12, font: 'Kanit', weight: '700', fill: '#fff', outline: '#000', outlineW: 3, align: 'right' });
    // fork hint
    if (G.forkHint) {
      const a = 0.6 + 0.4 * Math.sin(G.t * 8);
      ctx.globalAlpha = a;
      const wl = TXT(ctx, G.forkHint[0].eng, W / 2 - 40, 120, { size: 9, sy: 1.5, fill: '#ffd800', outline: '#000', outlineW: 4, align: 'right' });
      const wr = TXT(ctx, G.forkHint[1].eng, W / 2 + 40, 120, { size: 9, sy: 1.5, fill: '#ffd800', outline: '#000', outlineW: 4, align: 'left' });
      arrow(W / 2 - 40 - wl - 16, 114, -1, 9, '#ffd800', '#000');
      arrow(W / 2 + 40 + wr + 16, 114, 1, 9, '#ffd800', '#000');
      ctx.globalAlpha = 1;
    }
    // message
    if (G.msg && G.msg.t > 0) {
      const m = G.msg, k = Math.min(1, (m.dur - m.t) * 6), sc = 0.6 + 0.4 * k;
      ctx.save(); ctx.translate(W / 2, 150); ctx.scale(sc, sc);
      TXT(ctx, m.text, 0, 0, { size: m.size || 22, sy: 1.3, fill: m.fill || '#ffd800', outline: '#000', outlineW: 6, align: 'center' });
      if (m.sub) TXT(ctx, m.sub, 0, 34, { size: 20, font: 'Kanit', weight: '700', fill: '#fff', outline: '#000', outlineW: 5, align: 'center' });
      ctx.restore();
    }
    // bonus tags: rise off the rider and fade, most recent lowest
    if (G.pops && G.pops.length) {
      const cx = Math.round(W / 2 + (G.drawShift || 0) + (G.playerDX || 0));
      for (let i = 0; i < G.pops.length; i++) {
        const p = G.pops[i], k = Math.min(1, p.t * 8), y = 296 - p.t * 46 - (G.pops.length - 1 - i) * 16;
        ctx.save(); ctx.globalAlpha = p.t < 0.65 ? 1 : Math.max(0, 1 - (p.t - 0.65) / 0.45);
        ctx.translate(cx, y); ctx.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k);
        TXT(ctx, p.text, 0, 0, { size: 10, sy: 1.4, fill: p.fill, outline: '#000', outlineW: 5, align: 'center' });
        ctx.restore();
      }
    }
  };

  // ---------- overlays ----------
  // tap targets published for the input layer (rows: radio stations, nodes: course map, cells: name entry, start: START button)
  R.hit = { rows: [], nodes: [], cells: [], start: null, pause: null, fs: null };
  // pause menu: resume / restart / music / full screen / quit
  R.pause = function (G) {
    dim(0.55); R.hit.rows = [];
    const items = OB.MENU, RH = 40, x = W / 2 - 150, w = 300, y = 96, h = 60 + items.length * RH + 16;
    ctx.fillStyle = '#1a1c22'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#3a3d46'; ctx.fillRect(x, y, w, 4); ctx.fillRect(x, y + h - 4, w, 4); ctx.fillRect(x, y, 4, h); ctx.fillRect(x + w - 4, y, 4, h);
    TXT(ctx, 'PAUSE', W / 2, y + 34, { size: 14, sy: 1.5, fill: '#ffd800', outline: '#000', outlineW: 5, align: 'center' });
    items.forEach((label, i) => {
      const ry = y + 56 + i * RH, sel = i === (G.menuSel || 0);
      let text = label; if (label === 'MUSIC') text = 'MUSIC ' + (G.muted ? 'OFF' : 'ON'); if (label === 'FULL SCREEN' && OB.isFullscreen && OB.isFullscreen()) text = 'EXIT FULL SCREEN';
      ctx.fillStyle = sel ? 'rgba(255,216,0,0.2)' : 'rgba(255,255,255,0.05)'; ctx.fillRect(x + 14, ry, w - 28, RH - 6);
      if (sel) arrow(x + 32, ry + RH / 2 - 3, 1, 6, '#ffd800', '#000');
      TXT(ctx, text, W / 2 + 8, ry + RH / 2 + 4, { size: 9, sy: 1.4, fill: sel ? '#ffd800' : '#e8ecf4', outline: '#000', outlineW: 3, align: 'center' });
      R.hit.rows.push({ x: x + 14, y: ry, w: w - 28, h: RH - 6, i });
    });
    TXT(ctx, G.touchMode ? 'TAP AN OPTION' : 'UP / DOWN   ENTER   ESC RESUMES', W / 2, y + h + 18, { size: 6, sy: 1.4, fill: '#fff', outline: '#000', outlineW: 3, align: 'center' });
  };
  function button(x, y, w, h, label, thai) {
    ctx.fillStyle = '#000'; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.fillStyle = '#ffd800'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#fff3a0'; ctx.fillRect(x, y, w, 3); ctx.fillStyle = '#b08a00'; ctx.fillRect(x, y + h - 3, w, 3);
    TXT(ctx, label, x + w / 2 - (thai ? 28 : 0), y + h / 2 + 7, { size: 13, sy: 1.4, fill: '#000', align: 'center' });
    if (thai) TXT(ctx, thai, x + w / 2 + 42, y + h / 2 + 8, { size: 18, font: 'Kanit', weight: '700', fill: '#000', align: 'center' });
    R.hit.start = { x, y, w, h };
  }
  function dim(a) { ctx.fillStyle = 'rgba(0,0,0,' + a + ')'; ctx.fillRect(0, 0, W, H); }
  function band(y, h, a) { ctx.fillStyle = 'rgba(0,0,0,' + (a || 0.55) + ')'; ctx.fillRect(0, y, W, h); ctx.fillStyle = '#fff'; ctx.fillRect(0, y, W, 2); ctx.fillRect(0, y + h - 2, W, 2); }
  R.logo = function (x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.transform(1, 0, -0.24, 1, 0, 0);
    ctx.font = '44px "Press Start 2P"'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    const txt = 'OUTRUN';
    ctx.lineWidth = 12; ctx.strokeStyle = '#1a0510'; ctx.strokeText(txt, 4, 5);
    ctx.lineWidth = 10; ctx.strokeStyle = '#000'; ctx.strokeText(txt, 0, 0);
    ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.strokeText(txt, 0, 0);
    const gr = ctx.createLinearGradient(0, -44, 0, 0); gr.addColorStop(0, '#fff6b0'); gr.addColorStop(0.35, '#ffc21a'); gr.addColorStop(0.62, '#ff5a1e'); gr.addColorStop(1, '#b0102e');
    ctx.fillStyle = gr; ctx.fillText(txt, 0, 0);
    ctx.restore();
    // BANGKOK
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.transform(1, 0, -0.24, 1, 0, 0);
    ctx.font = '22px "Press Start 2P"'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.lineWidth = 8; ctx.strokeStyle = '#000'; ctx.strokeText('BANGKOK', 8, 30);
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.strokeText('BANGKOK', 8, 30);
    const g2 = ctx.createLinearGradient(0, 8, 0, 30); g2.addColorStop(0, '#e8fbff'); g2.addColorStop(0.5, '#5fd0ff'); g2.addColorStop(1, '#1e6fd6');
    ctx.fillStyle = g2; ctx.fillText('BANGKOK', 8, 30);
    ctx.restore();
  };
  R.title = function (G) {
    // ICE MAN key art on black, fitted to the frame height; the art's own black ground fills the sides
    const art = OB.IMG.title;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const ah = H, aw = Math.round(art.width * ah / art.height), ax = Math.round((W - aw) / 2);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(art, ax, 0, aw, ah); ctx.imageSmoothingEnabled = false;
    // flashing start prompt between the wheel and the credit line
    if (Math.floor(G.t * 2.5) % 2 === 0) TXT(ctx, G.touchMode ? 'TAP TO START' : 'PRESS START', W / 2, 434, { size: 14, sy: 1.3, fill: '#fff', outline: '#000', outlineW: 6, align: 'center' });
    // world board on the left margin when the page has one, this phone's best on the right
    const net = OB.net || {}, wb = net.board || [];
    if (wb.length && ax > 150) {
      const wx = 12, wy = H - 132;
      TXT(ctx, 'WORLD BEST', wx, wy, { size: 7, sy: 1.4, fill: '#7fe0ff', outline: '#000', outlineW: 3 });
      for (let i = 0; i < 5; i++) { const r = wb[i]; if (!r) break;
        TXT(ctx, (i + 1) + ' ' + ((r.name || '???') + '   ').slice(0, 3) + ' ' + OB.pad(r.score, 7), wx, wy + 16 + i * 13,
          { size: 6, sy: 1.4, fill: i === 0 ? '#ffd800' : '#fff', outline: '#000', outlineW: 3 }); }
    }
    // best riders in the right margin
    const rk = G.ranking || [];
    if (rk.length) {
      const rx = ax + aw + 14, ry = H - 120;
      if (W - rx > 150) {
        TXT(ctx, net.state === 'on' ? 'THIS PHONE' : 'BEST RIDERS', rx, ry, { size: 7, sy: 1.4, fill: '#ff37a8', outline: '#000', outlineW: 3 });
        for (let i = 0; i < 3; i++) { const r = rk[i]; if (!r) break; TXT(ctx, (i + 1) + ['ST', 'ND', 'RD'][i] + ' ' + (r.name + '   ').slice(0, 3) + ' ' + OB.pad(r.score, 7), rx, ry + 16 + i * 14, { size: 6, sy: 1.4, fill: i === 0 ? '#ffd800' : '#fff', outline: '#000', outlineW: 3 }); }
      }
    }
    // full screen toggle, top-right (F on a keyboard); not needed when launched from the home screen
    R.hit.fs = null;
    if (!OB.standalone) { const bx = W - 44, by = 10, s = 30; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx, by, s, s); ctx.fillStyle = '#fff';
      for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const px = bx + 6 + cx * (s - 12 - 3), py = by + 6 + cy * (s - 12 - 3); ctx.fillRect(px, py + (cy ? 6 : 0), 9, 3); ctx.fillRect(px + (cx ? 6 : 0), py, 3, 9); }
      R.hit.fs = { x: bx - 8, y: by - 8, w: s + 16, h: s + 16 }; }
    // build stamp, so a stale cached copy can be told apart from the current one
    if (window.__BUILD__) TXT(ctx, 'BUILD ' + window.__BUILD__, 8, H - 12, { size: 6, sy: 1.4, fill: '#9fb2c0', outline: '#000', outlineW: 3 });
  };
  R.radio = function (G) {
    dim(0.35); R.hit.rows = []; R.hit.nodes = []; R.hit.cells = []; R.hit.start = null;
    const stations = OB.audio.stations, n = stations.length, RH = 44;
    const x = W / 2 - 270, y = 22, w = 540, h = 100 + n * RH + 66;
    ctx.fillStyle = '#1a1c22'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#3a3d46'; ctx.fillRect(x, y, w, 4); ctx.fillRect(x, y + h - 4, w, 4); ctx.fillRect(x, y, 4, h); ctx.fillRect(x + w - 4, y, 4, h);
    TXT(ctx, 'SELECT MUSIC', W / 2, y + 28, { size: 11, sy: 1.5, fill: '#ff37a8', outline: '#000', outlineW: 4, align: 'center' });
    // radio display: dial + live equaliser
    ctx.fillStyle = '#0b3b2e'; ctx.fillRect(x + 20, y + 40, w - 40, 46); ctx.fillStyle = '#39f2b0'; ctx.fillRect(x + 24, y + 44, w - 48, 1);
    for (let i = 0; i < 36; i++) { ctx.fillStyle = i % 5 ? '#1f7a5e' : '#39f2b0'; ctx.fillRect(x + 30 + i * 9, y + 50, 1, i % 5 ? 6 : 12); }
    const dial = x + 36 + G.station * ((w - 230) / Math.max(1, n - 1)); ctx.fillStyle = '#ff3b3b'; ctx.fillRect(dial, y + 46, 3, 36);
    const sp = OB.audio.spectrum(12);
    for (let i = 0; i < 12; i++) { const hh = 3 + sp[i] * 28; ctx.fillStyle = sp[i] > 0.8 ? '#ff5a5a' : '#39f2b0'; ctx.fillRect(x + w - 150 + i * 9, y + 82 - hh, 6, hh); }
    // big tappable rows
    stations.forEach((s, i) => {
      const sel = i === G.station, ry = y + 96 + i * RH;
      ctx.fillStyle = sel ? 'rgba(255,216,0,0.18)' : 'rgba(255,255,255,0.05)'; ctx.fillRect(x + 16, ry, w - 32, RH - 4);
      ctx.fillStyle = sel ? '#ffd800' : '#3a3d46'; ctx.fillRect(x + 16, ry, w - 32, 1); ctx.fillRect(x + 16, ry + RH - 5, w - 32, 1);
      if (sel) arrow(x + 38, ry + RH / 2 - 2, 1, 7, '#ffd800', '#000');
      TXT(ctx, s.name, x + 60, ry + RH / 2 + 5, { size: 11, sy: 1.4, fill: sel ? '#ffd800' : '#cfd3da', outline: '#000', outlineW: 3 });
      TXT(ctx, s.thai, x + w - 36, ry + RH / 2 + 6, { size: 16, font: 'Kanit', weight: '500', fill: sel ? '#fff' : '#8a8f99', align: 'right' });
      R.hit.rows.push({ x: x + 16, y: ry, w: w - 32, h: RH - 4, i });
    });
    button(W / 2 - 110, y + 100 + n * RH + 8, 220, 44, 'START', 'เริ่ม');
    TXT(ctx, G.touchMode ? 'TAP A STATION, THEN START' : 'LEFT / RIGHT : TUNE      ENTER : START', W / 2, H - 12, { size: 8, sy: 1.4, fill: '#fff', outline: '#000', outlineW: 3, align: 'center' });
  };
  R.name = function (G) {
    const ne = G.nameEntry; if (!ne) return;
    dim(0.6); R.hit.rows = []; R.hit.nodes = []; R.hit.cells = []; R.hit.start = null;
    TXT(ctx, 'NEW RECORD!  ENTER YOUR NAME', W / 2, 46, { size: 11, sy: 1.5, fill: '#ff37a8', outline: '#000', outlineW: 4, align: 'center' });
    TXT(ctx, 'ใส่ชื่อของคุณ', W / 2, 70, { size: 16, font: 'Kanit', weight: '700', fill: '#ffd23f', outline: '#000', outlineW: 4, align: 'center' });
    TXT(ctx, 'SCORE ' + OB.pad(ne.score, 7), W / 2 - 60, 100, { size: 10, sy: 1.4, fill: '#fff', outline: '#000', outlineW: 4, align: 'center' });
    TXT(ctx, 'TIME ' + Math.max(0, Math.ceil(ne.time)), W / 2 + 140, 100, { size: 10, sy: 1.4, fill: ne.time < 8 ? '#ff5a5a' : '#ffd800', outline: '#000', outlineW: 4, align: 'center' });
    for (let i = 0; i < 3; i++) {
      const bx = W / 2 - 66 + i * 46, by = 112; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, 38, 46);
      ctx.fillStyle = i === ne.pos ? '#ffd800' : '#4a5060'; ctx.fillRect(bx, by + 44, 38, 3);
      const ch = ne.chars[i] === '_' ? (i === ne.pos && Math.floor(G.t * 3) % 2 === 0 ? '_' : '') : ne.chars[i];
      TXT(ctx, ch, bx + 19, by + 36, { size: 24, sy: 1.2, fill: '#fff', outline: '#000', outlineW: 5, align: 'center' });
    }
    const chars = OB.NAME_CHARS, cols = 10, cw = 40, chh = 32, x0 = W / 2 - cols * cw / 2, y0 = 178;
    chars.forEach((c, i) => {
      const cx = x0 + (i % cols) * cw, cy = y0 + Math.floor(i / cols) * chh, sel = i === ne.cursor;
      ctx.fillStyle = sel ? '#ffd800' : 'rgba(0,0,0,0.55)'; ctx.fillRect(cx + 2, cy + 2, cw - 4, chh - 4);
      ctx.fillStyle = sel ? '#fff3a0' : '#3a3d46'; ctx.fillRect(cx + 2, cy + 2, cw - 4, 1);
      TXT(ctx, c, cx + cw / 2, cy + chh / 2 + 6, { size: c.length > 1 ? 7 : 11, sy: 1.3, fill: sel ? '#000' : (c === 'END' ? '#3cff6a' : '#fff'), align: 'center' });
      R.hit.cells.push({ x: cx, y: cy, w: cw, h: chh, i });
    });
    TXT(ctx, G.touchMode ? 'TAP LETTERS   -   END TO FINISH' : 'ARROWS / TYPE   -   ENTER TO PICK   -   END TO FINISH', W / 2, H - 12, { size: 7, sy: 1.4, fill: '#fff', outline: '#000', outlineW: 3, align: 'center' });
  };
  R.course = function (G) {
    dim(0.35); R.hit.rows = []; R.hit.nodes = []; R.hit.cells = []; R.hit.start = null;
    const T = OB.track, C = T.COURSES, sel = G.course, cur = C[sel], st = T.STAGES[cur.key];
    const x = W / 2 - 290, y = 30, w = 580, h = 320;
    ctx.fillStyle = '#1a1c22'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#3a3d46'; ctx.fillRect(x, y, w, 4); ctx.fillRect(x, y + h - 4, w, 4); ctx.fillRect(x, y, 4, h); ctx.fillRect(x + w - 4, y, 4, h);
    TXT(ctx, 'SELECT COURSE', W / 2, y + 28, { size: 11, sy: 1.5, fill: '#ff37a8', outline: '#000', outlineW: 4, align: 'center' });
    // route tree: big tappable nodes, lines to successors
    const rows = [['charoenkrung'], ['yaowarat', 'sathorn'], ['siam', 'rattanakosin'], ['sanamluang', 'thatien']];
    const pos = {}, NH = 34;
    rows.forEach((r, i) => r.forEach((k, j) => { pos[k] = { x: W / 2 + (r.length === 1 ? 0 : (j - 0.5) * 250), y: y + 66 + i * 52 }; }));
    ctx.strokeStyle = '#4a5060'; ctx.lineWidth = 2;
    for (const k in T.STAGES) { const nx = T.STAGES[k].next; if (!nx) continue; nx.forEach(n => { ctx.beginPath(); ctx.moveTo(pos[k].x, pos[k].y + NH / 2); ctx.lineTo(pos[n].x, pos[n].y - NH / 2); ctx.stroke(); }); }
    const gy = y + 66 + 4 * 52 - 10;
    ctx.strokeStyle = '#ffd800'; ctx.beginPath(); ctx.moveTo(pos.sanamluang.x, pos.sanamluang.y + NH / 2); ctx.lineTo(W / 2, gy - 6); ctx.moveTo(pos.thatien.x, pos.thatien.y + NH / 2); ctx.lineTo(W / 2, gy - 6); ctx.stroke();
    TXT(ctx, 'GOAL  WAT PHO', W / 2, gy + 6, { size: 8, sy: 1.4, fill: '#ffd800', outline: '#000', outlineW: 3, align: 'center' });
    for (const k in pos) {
      const p = pos[k], isSel = k === cur.key, nm = T.STAGES[k].name;
      const tw = Math.max(150, nm.eng.length * 9 + 30);
      ctx.fillStyle = isSel ? '#ffd800' : '#2b2f3a'; ctx.fillRect(p.x - tw / 2, p.y - NH / 2, tw, NH);
      ctx.fillStyle = isSel ? '#fff' : '#4a5060'; ctx.fillRect(p.x - tw / 2, p.y - NH / 2, tw, 2); ctx.fillRect(p.x - tw / 2, p.y + NH / 2 - 2, tw, 2);
      TXT(ctx, nm.eng, p.x, p.y + 5, { size: 9, sy: 1.4, fill: isSel ? '#000' : '#cfd3da', align: 'center' });
      R.hit.nodes.push({ x: p.x - tw / 2, y: p.y - NH / 2, w: tw, h: NH, key: k });
    }
    // caption + START
    const capY = y + h - 26;
    TXT(ctx, (cur.label ? cur.label + '  -  ' : 'STAGE ' + cur.stageNo + '  -  ') + st.name.eng, W / 2 - 100, capY, { size: 9, sy: 1.5, fill: '#fff', outline: '#000', outlineW: 4, align: 'center' });
    TXT(ctx, st.name.thai, W / 2 + 140, capY + 1, { size: 17, font: 'Kanit', weight: '700', fill: '#ffd23f', outline: '#000', outlineW: 4, align: 'center' });
    button(W / 2 - 110, y + h + 12, 220, 44, 'START', 'เริ่ม');
    TXT(ctx, G.touchMode ? 'TAP A COURSE, THEN START' : 'LEFT / RIGHT : COURSE      ENTER : START', W / 2, H - 10, { size: 7, sy: 1.4, fill: '#fff', outline: '#000', outlineW: 3, align: 'center' });
  };
  R.countdown = function (G) {
    const n = Math.max(1, Math.ceil(G.countdown));
    const k = 1 - (G.countdown % 1); const sc = 1 + (1 - k) * 0.4;
    ctx.save(); ctx.translate(W / 2, 200); ctx.scale(sc, sc);
    TXT(ctx, String(n), 0, 0, { size: 56, sy: 1.2, fill: '#ffffff', outline: '#000', outlineW: 10, align: 'center' });
    ctx.restore();
    // the controls live here now, not on the title screen
    const l1 = G.touchMode ? 'FINGER LEFT / RIGHT STEERS   -   AUTO GAS   -   HOLD THREE FINGERS TO BRAKE' : 'ARROWS STEER   -   UP GAS   -   DOWN BRAKE';
    const l2 = G.touchMode ? 'HOLD A SECOND FINGER WHILE TURNING HARD TO DRIFT' : 'SHIFT (OR DOUBLE TAP THE ARROW) WHILE TURNING HARD TO DRIFT';
    TXT(ctx, l1, W / 2, 292, { size: 7, sy: 1.4, fill: '#fff', outline: '#000', outlineW: 3, align: 'center' });
    TXT(ctx, l2, W / 2, 310, { size: 7, sy: 1.4, fill: '#ffd800', outline: '#000', outlineW: 3, align: 'center' });
  };
  R.go = function (G) {
    const k = OB.clamp(G.goT / 0.9, 0, 1), sc = 1.2 + (1 - k) * 0.5;
    ctx.save(); ctx.globalAlpha = Math.min(1, k * 3); ctx.translate(W / 2, 200); ctx.scale(sc, sc);
    TXT(ctx, 'GO!', 0, 0, { size: 56, sy: 1.2, fill: '#ffffff', outline: '#000', outlineW: 10, align: 'center' });
    ctx.restore();
  };
  R.gameover = function (G) {
    band(120, 200, 0.6);
    TXT(ctx, 'GAME OVER', W / 2, 176, { size: 30, sy: 1.3, fill: '#ff3b3b', outline: '#000', outlineW: 8, align: 'center' });
    const r = G.overReason;
    const reasons = { time: ['TIME UP', 'หมดเวลา'], ice: ['ICE MELTED', 'น้ำแข็งละลายหมด'], wreck: ['WRECKED', 'รถพัง'] };
    TXT(ctx, reasons[r][0], W / 2, 212, { size: 13, sy: 1.4, fill: '#fff', outline: '#000', outlineW: 5, align: 'center' });
    TXT(ctx, reasons[r][1], W / 2, 240, { size: 20, font: 'Kanit', weight: '700', fill: '#ffd23f', outline: '#000', outlineW: 5, align: 'center' });
    TXT(ctx, 'SCORE ' + OB.pad(G.score, 7) + '    STAGE ' + G.stageNo, W / 2, 276, { size: 9, sy: 1.4, fill: '#fff', outline: '#000', outlineW: 4, align: 'center' });
    R.hit.rows = [];
    if (G.pendingRecord) { if (Math.floor(G.t * 2) % 2 === 0) TXT(ctx, 'PRESS START', W / 2, 306, { size: 10, sy: 1.3, fill: '#ffd800', outline: '#000', outlineW: 4, align: 'center' }); return; }
    const labels = OB.MENU_OVER || ['RETRY', 'TITLE'];
    const bw = 150, gap = 20, total = labels.length * bw + (labels.length - 1) * gap, x0 = W / 2 - total / 2;
    labels.forEach((label, i) => {
      const bh = 34, bx = x0 + i * (bw + gap), by = 290, sel = i === (G.overSel || 0);
      ctx.fillStyle = sel ? '#ffd800' : '#2b2f3a'; ctx.fillRect(bx, by, bw, bh); ctx.fillStyle = sel ? '#fff' : '#4a5060'; ctx.fillRect(bx, by, bw, 2); ctx.fillRect(bx, by + bh - 2, bw, 2);
      TXT(ctx, label, bx + bw / 2, by + 22, { size: 10, sy: 1.3, fill: sel ? '#000' : '#cfd3da', align: 'center' });
      R.hit.rows.push({ x: bx, y: by, w: bw, h: bh, i });
    });
    if (OB.savedNameLabel) TXT(ctx, 'SAVED AS ' + OB.savedNameLabel, W / 2, 344, { size: 7, sy: 1.4, fill: '#9fb2c0', outline: '#000', outlineW: 3, align: 'center' });
  };
  R.goal = function (G) {
    const r = G.result; if (!r) return;
    band(84, 300, 0.62);
    TXT(ctx, 'GOAL!', W / 2, 130, { size: 34, sy: 1.3, fill: '#ffd800', outline: '#000', outlineW: 9, align: 'center' });
    TXT(ctx, 'ICE DELIVERED · น้ำแข็งถึงวัดโพธิ์แล้ว', W / 2, 162, { size: 18, font: 'Kanit', weight: '700', fill: '#bfefff', outline: '#000', outlineW: 5, align: 'center' });
    const rows = [['TIME BONUS', r.timeBonus], ['ICE BONUS', r.iceBonus], ['ROUTE', r.route], ['TOTAL', r.total]];
    rows.forEach((row, i) => {
      const yy = 200 + i * 26; if (r.reveal < i) return;
      TXT(ctx, row[0], W / 2 - 150, yy, { size: 9, sy: 1.4, fill: i === 3 ? '#ffd800' : '#fff', outline: '#000', outlineW: 4 });
      TXT(ctx, typeof row[1] === 'number' ? OB.pad(row[1], 7) : row[1], W / 2 + 150, yy, { size: i === 2 ? 7 : 9, sy: 1.4, fill: i === 3 ? '#ffd800' : '#fff', outline: '#000', outlineW: 4, align: 'right' });
    });
    if (r.reveal >= 4) {
      TXT(ctx, 'CONGRATULATIONS! MISSION COMPLETE', W / 2, 318, { size: 9, sy: 1.5, fill: '#3cff6a', outline: '#000', outlineW: 4, align: 'center' });
      TXT(ctx, r.newHi ? 'NEW HI-SCORE!' : 'THE ICE MAN ALWAYS DELIVERS', W / 2, 340, { size: 8, sy: 1.4, fill: r.newHi ? '#ff37a8' : '#fff', outline: '#000', outlineW: 4, align: 'center' });
      if (Math.floor(G.t * 2) % 2 === 0) TXT(ctx, 'PRESS START', W / 2, 368, { size: 10, sy: 1.3, fill: '#ffd800', outline: '#000', outlineW: 4, align: 'center' });
    }
  };
  R.loading = function (p) {
    ctx.fillStyle = '#0558f0'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.textAlign = 'center'; ctx.fillText('LOADING ' + Math.round(p * 100) + '%', W / 2, H / 2);
  };
})(window.OB);
