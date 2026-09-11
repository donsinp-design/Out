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
    }
    g.globalCompositeOperation = 'source-over';
    BG[light] = c; return c;
  };
  function drawBackground(G) {
    // The skyline is one continuous image, fixed horizontally like the reference frame (no tiling, no mirroring).
    const bg = R.bgFor(G.light);
    const y0 = HZ - bg.height + Math.round(G.bgShift || 0);
    ctx.fillStyle = PAL[G.light].ground; ctx.fillRect(0, 0, W, H);
    if (y0 > 0) { ctx.fillStyle = '#0558f0'; ctx.fillRect(0, 0, W, y0 + 1); }
    ctx.drawImage(bg, Math.round((W - bg.width) / 2), y0);
  }

  // ---------- projection ----------
  const roadW = () => OB.track.roadW;
  const WATER_DROP = 380, SIDEWALK = 0.13, FOLLOW = 0.8; // camera follows the bike only partially so the road stays centred
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
    const sw1 = w1 * SIDEWALK, sw2 = w2 * SIDEWALK, alt = Math.floor(seg.index / 3) % 2;
    const envL = pal[th.left] || pal.shop, envR = pal[th.right] || pal.shop;
    poly(0, y1, x1 - w1 - sw1, y1, x2 - w2 - sw2, y2, 0, y2, envL[alt]);
    if (th.right === 'water') {
      // river surface sits below road level: embankment wall face + lowered water plane
      const d1 = seg.p1.screen.scale * WATER_DROP * K, d2 = seg.p2.screen.scale * WATER_DROP * K;
      const ox1 = x1 + w1 + sw1, ox2 = x2 + w2 + sw2;
      poly(ox1, y1 + d1, W, y1 + d1, W, y2 + d2, ox2, y2 + d2, envR[alt]);
      if (alt === 0 && seg.index % 12 === 0) poly(ox1 + sw1 * 1.5, y1 + d1, W, y1 + d1, W, y2 + d2, ox2 + sw2 * 1.5, y2 + d2, pal.water[1]);
      poly(ox1, y1, ox1, y1 + d1, ox2, y2 + d2, ox2, y2, pal.wall);
      poly(ox1, y1 + d1 * 0.85, ox1, y1 + d1, ox2, y2 + d2, ox2, y2 + d2 * 0.85, '#3d4a3a');
    } else poly(x1 + w1 + sw1, y1, W, y1, W, y2, x2 + w2 + sw2, y2, envR[alt]);
    // sidewalks
    poly(x1 - w1 - sw1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - sw2, y2, pal.side[alt]);
    poly(x1 + w1, y1, x1 + w1 + sw1, y1, x2 + w2 + sw2, y2, x2 + w2, y2, pal.side[alt]);
    // paving joints
    if (seg.index % 6 === 0 && (y1 - y2) > 2) { ctx.fillStyle = pal.curb; ctx.globalAlpha = 0.35; poly(x1 - w1 - sw1, y1, x1 - w1, y1, x1 - w1, y1 - 1, x1 - w1 - sw1, y1 - 1, pal.curb); poly(x1 + w1, y1, x1 + w1 + sw1, y1, x1 + w1 + sw1, y1 - 1, x1 + w1, y1 - 1, pal.curb); ctx.globalAlpha = 1; }
    // curbs
    const c1 = Math.max(1, w1 * 0.014), c2 = Math.max(1, w2 * 0.014);
    poly(x1 - w1 - c1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - c2, y2, pal.curb);
    poly(x1 + w1, y1, x1 + w1 + c1, y1, x2 + w2 + c2, y2, x2 + w2, y2, pal.curb);
    // embankment parapet edge (water side)
    if (th.right === 'water') poly(x1 + w1 + sw1 - c1, y1, x1 + w1 + sw1 + c1, y1, x2 + w2 + sw2 + c2, y2, x2 + w2 + sw2 - c2, y2, pal.curbTop);
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
    const rx1 = p1.x + p1.w + p1.w * SIDEWALK, rx2 = p2.x + p2.w + p2.w * SIDEWALK;
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
    const baseSeg = T.findSegment(G.position), basePct = (G.position % segLen) / segLen;
    const playerSeg = T.findSegment(G.position + G.playerZ), playerPct = ((G.position + G.playerZ) % segLen) / segLen;
    const playerY = OB.lerp(playerSeg.p1.world.y, playerSeg.p2.world.y, playerPct);
    G.bgShift = -(playerY) * 0.004;
    const camX = G.playerX * RW * FOLLOW, camY = G.cameraH + playerY, camZ = G.position;
    G.playerDX = (G.playerX * RW - camX) * (G.cameraDepth / G.playerZ) * K;
    ctx.save();
    if (G.shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * G.shake * 8), Math.round((Math.random() - 0.5) * G.shake * 6));
    drawBackground(G);
    // cars per segment
    const carsBySeg = new Map();
    for (const c of G.cars) { const i = Math.floor(c.z / segLen); if (!carsBySeg.has(i)) carsBySeg.set(i, []); carsBySeg.get(i).push(c); }
    // ---- ground pass (front to back) ----
    let maxy = H, x = 0, dx = -(baseSeg.curve * basePct);
    const projected = [];
    for (let n = 0; n < G.drawDistance; n++) {
      const idx = baseSeg.index + n; if (idx >= segs.length) break;
      const seg = segs[idx];
      project(seg.p1, camX - x, camY, camZ, G.cameraDepth, seg.rw);
      project(seg.p2, camX - x - dx, camY, camZ, G.cameraDepth, seg.rw);
      x += dx; dx += seg.curve;
      seg.clip = maxy;
      if (seg.p1.camera.z <= G.cameraDepth) { seg.hidden = true; seg.behind = true; continue; }
      seg.behind = false; projected.push(seg);
      if (seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) { seg.hidden = true; continue; }
      seg.hidden = false;
      renderGround(seg, pal, T.THEMES[seg.theme]);
      maxy = seg.p2.screen.y;
    }
    // ---- sprite pass (back to front): every projected slice, clipped by the crest line, so nothing pops ----
    const poles = { L: [], R: [] };
    for (let n = projected.length - 1; n >= 0; n--) {
      const seg = projected[n];
      const th = T.THEMES[seg.theme];
      if (seg.rail && !seg.hidden) renderRail(seg, pal);
      const scale = seg.p1.screen.scale, sx = seg.p1.screen.x, sy = seg.p1.screen.y;
      for (const sp of seg.sprites) {
        const s = sp.spr, img = s.img;
        const destW = s.w * scale * K, destH = destW * img.height / img.width;
        let destX = sx + scale * sp.offset * RW * K;
        const anchor = sp.anchor || 'center';
        if (anchor === 'center') destX -= destW / 2; else if (anchor === 'left') destX -= destW;
        let destY = sy - destH;
        if (sp.water) destY += scale * WATER_DROP * K;
        if (destX > W || destX + destW < 0) continue;
        drawSprite(img, destX, destY, destW, destH, seg.clip, sp.flip);
        if (sp.pole && s.poleTop) poles[sp.pole].push({ x: destX + destW * s.poleTop.x, y: destY + destH * s.poleTop.y, w: destW, seg: seg.index });
        if (sp.pillar) { /* pillars carry the deck */ }
      }
      if (seg.deck && !seg.hidden) renderDeck(seg, pal);
      const cars = carsBySeg.get(seg.index);
      if (cars) for (const c of cars) {
        const pct = (c.z % segLen) / segLen;
        const cs = OB.lerp(seg.p1.screen.scale, seg.p2.screen.scale, pct), cx = OB.lerp(seg.p1.screen.x, seg.p2.screen.x, pct), cy = OB.lerp(seg.p1.screen.y, seg.p2.screen.y, pct);
        const img = c.spr.img, destW = c.spr.w * cs * K, destH = destW * img.height / img.width;
        drawSprite(img, cx + cs * c.offset * RW * seg.rw * K - destW / 2, cy - destH, destW, destH, seg.clip, false);
      }
    }
    // ---- wires (left-hand power lines only, as in the reference frame) ----
    drawWires(poles.L, G, -1, baseSeg, camX, camY, camZ, playerSeg);
    // ---- player ----
    drawPlayer(G);
    ctx.restore();
    // ---- light grading ----
    if (G.light === 'golden') { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#fff1dc'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
    else if (G.light === 'dusk') { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#d9a8c8'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = 'rgba(120,40,90,0.18)'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
  };

  function drawWires(list, G, side, baseSeg, camX, camY, camZ, playerSeg) {
    if (!list.length) return;
    // virtual pole near the camera so wires run off the top corner like the reference
    const seg = baseSeg; const p = { world: { x: 0, y: seg.p1.world.y, z: (seg.index + 1) * OB.track.segLen }, camera: {}, screen: {} };
    project(p, camX, camY, camZ, G.cameraDepth, seg.rw);
    const nearScale = p.screen.scale, nearW = OB.SPR.pole.w * nearScale * K;
    const near = { x: p.screen.x + nearScale * side * 1.2 * seg.rw * OB.track.roadW * K, y: p.screen.y - nearW * (300 / 40) * 0.96, w: nearW };
    const pts = list.slice(); pts.push(near);
    ctx.save(); ctx.strokeStyle = 'rgba(18,18,22,0.85)';
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (b.w < a.w) continue; // must be nearer
      const lw = OB.clamp(b.w * 0.05, 0.8, 2.2); ctx.lineWidth = lw;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      for (let k = 0; k < 5; k++) {
        const oa = (k - 2) * a.w * 0.16, ob = (k - 2) * b.w * 0.16;
        const ya = a.y + (k % 2) * a.w * 0.12, yb = b.y + (k % 2) * b.w * 0.12;
        const sag = d * (0.08 + k * 0.012);
        ctx.beginPath(); ctx.moveTo(a.x + oa, ya); ctx.quadraticCurveTo((a.x + b.x) / 2 + (oa + ob) / 2, (ya + yb) / 2 + sag, b.x + ob, yb); ctx.stroke();
      }
    }
    ctx.restore();
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

  function drawPlayer(G) {
    const img = OB.IMG.bike; const bw = img.width, bh = img.height;
    const bounce = G.bounce || 0;
    const cx = Math.round(W / 2 + (G.drawShift || 0) + (G.playerDX || 0)), by = 457 + bounce;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(cx + 2, by - 6, bw * 0.42, 7, 0, 0, Math.PI * 2); ctx.fill();
    // tyre smoke: a dense, low cloud bank behind the wheel (grey underside first, then the white mass on top)
    if (G.smoke && G.smoke.length) {
      const alphaOf = (p) => { const k = p.t / p.life; return k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4; };
      for (let pass = 0; pass < 2; pass++) {
        ctx.fillStyle = pass === 0 ? '#b9bcc4' : '#f7f8fa';
        for (const p of G.smoke) {
          ctx.globalAlpha = alphaOf(p) * (pass === 0 ? 0.95 : 1);
          const r = pass === 0 ? p.r : p.r * 0.9, x = Math.round(p.x), y = Math.round(p.y) + (pass === 0 ? 3 : -1);
          ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.72, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
    // wipeout: the bike kicks up and tilts hard for a moment
    const wp = G.wipe > 0 ? Math.sin((1 - G.wipe) * Math.PI) : 0;
    ctx.save(); ctx.translate(cx, by - wp * 34); ctx.rotate(G.lean * 0.16 + wp * 0.85 * (G.wipeDir || 1)); ctx.translate(-bw / 2 + G.lean * 6, -bh);
    if (G.invuln > 0 && Math.floor(G.t * 8) % 2 === 0) ctx.globalAlpha = 0.7;
    ctx.drawImage(img, 0, 0);
    ctx.restore();
    // flying ice bags
    if (G.parts) for (const p of G.parts) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = '#1a2a3a'; ctx.fillRect(-7, -6, 14, 12); ctx.fillStyle = '#eef8ff'; ctx.fillRect(-6, -5, 12, 10); ctx.fillStyle = '#9fd0ee'; ctx.fillRect(-6, 2, 12, 3); ctx.fillStyle = '#3b74c4'; ctx.fillRect(-3, -3, 6, 3);
      ctx.restore();
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
    // portrait
    ctx.drawImage(IMG.portrait, 23, 14);
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
  };

  // ---------- overlays ----------
  // tap targets published for the input layer (rows: radio stations, nodes: course map, cells: name entry, start: START button)
  R.hit = { rows: [], nodes: [], cells: [], start: null };
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
    R.logo(W / 2, 150, 1);
    TXT(ctx, 'กรุงเทพมหานคร', W / 2, 212, { size: 20, font: 'Kanit', weight: '700', fill: '#ffd23f', outline: '#000', outlineW: 5, align: 'center' });
    // ribbon
    ctx.fillStyle = '#c8102e'; ctx.fillRect(W / 2 - 170, 224, 340, 22); ctx.fillStyle = '#000'; ctx.fillRect(W / 2 - 170, 224, 340, 2); ctx.fillRect(W / 2 - 170, 244, 340, 2);
    TXT(ctx, 'HIDDEN STAGE - ICE RUN', W / 2 - 152, 240, { size: 8, sy: 1.4, fill: '#fff', align: 'left' });
    TXT(ctx, 'ภารกิจลับ', W / 2 + 152, 241, { size: 14, font: 'Kanit', weight: '500', fill: '#fff', align: 'right' });
    if (Math.floor(G.t * 2) % 2 === 0) TXT(ctx, G.touchMode ? 'TAP TO START' : 'PRESS START', W / 2, 300, { size: 14, sy: 1.3, fill: '#fff', outline: '#000', outlineW: 5, align: 'center' });
    // best riders table
    const rk = G.ranking || [];
    TXT(ctx, 'BEST RIDERS', W / 2, 332, { size: 8, sy: 1.4, fill: '#ff37a8', outline: '#000', outlineW: 3, align: 'center' });
    for (let i = 0; i < 3; i++) {
      const r = rk[i]; const line = (i + 1) + (['ST', 'ND', 'RD'][i]) + '  ' + (r ? (r.name + '   ').slice(0, 3) : '---') + '  ' + OB.pad(r ? r.score : 0, 7) + (r && r.route ? '  ' + r.route : '');
      TXT(ctx, line, W / 2, 350 + i * 15, { size: 7, sy: 1.4, fill: i === 0 ? '#ffd800' : '#fff', outline: '#000', outlineW: 3, align: 'center' });
    }
    TXT(ctx, 'DELIVER THE ICE TO WAT PHO BEFORE IT MELTS', W / 2, 408, { size: 7, sy: 1.4, fill: '#bfefff', outline: '#000', outlineW: 3, align: 'center' });
    TXT(ctx, 'ส่งน้ำแข็งให้ถึงวัดโพธิ์ก่อนละลาย', W / 2, 428, { size: 14, font: 'Kanit', weight: '500', fill: '#fff', outline: '#000', outlineW: 3, align: 'center' });
    TXT(ctx, G.touchMode ? 'FINGER LEFT / RIGHT STEERS   TWO FINGERS BRAKE   AUTO GAS' : 'LEFT/RIGHT STEER   UP GAS   DOWN BRAKE   M MUSIC   P PAUSE', W / 2, H - 12, { size: 7, sy: 1.3, fill: '#fff', outline: '#000', outlineW: 3, align: 'center' });
    if (G.touchMode && window.innerHeight > window.innerWidth) TXT(ctx, 'ROTATE YOUR PHONE FOR FULL SCREEN', W / 2, 30, { size: 8, sy: 1.4, fill: '#ffd800', outline: '#000', outlineW: 4, align: 'center' });
  };
  R.radio = function (G) {
    dim(0.35); R.hit.rows = []; R.hit.nodes = []; R.hit.cells = []; R.hit.start = null;
    const x = W / 2 - 270, y = 44, w = 540, h = 340;
    ctx.fillStyle = '#1a1c22'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#3a3d46'; ctx.fillRect(x, y, w, 4); ctx.fillRect(x, y + h - 4, w, 4); ctx.fillRect(x, y, 4, h); ctx.fillRect(x + w - 4, y, 4, h);
    TXT(ctx, 'SELECT MUSIC', W / 2, y + 30, { size: 11, sy: 1.5, fill: '#ff37a8', outline: '#000', outlineW: 4, align: 'center' });
    // radio display: dial + live equaliser
    ctx.fillStyle = '#0b3b2e'; ctx.fillRect(x + 20, y + 44, w - 40, 48); ctx.fillStyle = '#39f2b0'; ctx.fillRect(x + 24, y + 48, w - 48, 1);
    for (let i = 0; i < 36; i++) { ctx.fillStyle = i % 5 ? '#1f7a5e' : '#39f2b0'; ctx.fillRect(x + 30 + i * 9, y + 54, 1, i % 5 ? 6 : 12); }
    const dial = x + 36 + G.station * 150; ctx.fillStyle = '#ff3b3b'; ctx.fillRect(dial, y + 50, 3, 38);
    const sp = OB.audio.spectrum(12);
    for (let i = 0; i < 12; i++) { const hh = 3 + sp[i] * 30; ctx.fillStyle = sp[i] > 0.8 ? '#ff5a5a' : '#39f2b0'; ctx.fillRect(x + w - 150 + i * 9, y + 88 - hh, 6, hh); }
    // big tappable rows
    OB.audio.stations.forEach((s, i) => {
      const sel = i === G.station, ry = y + 104 + i * 52;
      ctx.fillStyle = sel ? 'rgba(255,216,0,0.18)' : 'rgba(255,255,255,0.05)'; ctx.fillRect(x + 16, ry, w - 32, 46);
      ctx.fillStyle = sel ? '#ffd800' : '#3a3d46'; ctx.fillRect(x + 16, ry, w - 32, 1); ctx.fillRect(x + 16, ry + 45, w - 32, 1);
      if (sel) arrow(x + 38, ry + 23, 1, 7, '#ffd800', '#000');
      TXT(ctx, s.name, x + 60, ry + 30, { size: 11, sy: 1.4, fill: sel ? '#ffd800' : '#cfd3da', outline: '#000', outlineW: 3 });
      TXT(ctx, s.thai, x + w - 36, ry + 31, { size: 17, font: 'Kanit', weight: '500', fill: sel ? '#fff' : '#8a8f99', align: 'right' });
      R.hit.rows.push({ x: x + 16, y: ry, w: w - 32, h: 46, i });
    });
    button(W / 2 - 110, y + 274, 220, 46, 'START', 'เริ่ม');
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
    const n = Math.ceil(G.countdown);
    const label = n > 0 ? String(n) : 'GO!';
    const k = 1 - (G.countdown % 1); const sc = n > 0 ? 1 + (1 - k) * 0.4 : 1.2;
    ctx.save(); ctx.translate(W / 2, 200); ctx.scale(sc, sc);
    TXT(ctx, label, 0, 0, { size: 56, sy: 1.2, fill: n > 0 ? '#ffd800' : '#3cff6a', outline: '#000', outlineW: 10, align: 'center' });
    ctx.restore();
    if (G.touchMode) TXT(ctx, 'HOLD A FINGER LEFT OR RIGHT TO STEER   TWO FINGERS TO BRAKE', W / 2, 300, { size: 7, sy: 1.4, fill: '#fff', outline: '#000', outlineW: 3, align: 'center' });
  };
  R.gameover = function (G) {
    band(120, 200, 0.6);
    TXT(ctx, 'GAME OVER', W / 2, 176, { size: 30, sy: 1.3, fill: '#ff3b3b', outline: '#000', outlineW: 8, align: 'center' });
    const r = G.overReason;
    const reasons = { time: ['TIME UP', 'หมดเวลา'], ice: ['ICE MELTED', 'น้ำแข็งละลายหมด'], wreck: ['WRECKED', 'รถพัง'] };
    TXT(ctx, reasons[r][0], W / 2, 212, { size: 13, sy: 1.4, fill: '#fff', outline: '#000', outlineW: 5, align: 'center' });
    TXT(ctx, reasons[r][1], W / 2, 240, { size: 20, font: 'Kanit', weight: '700', fill: '#ffd23f', outline: '#000', outlineW: 5, align: 'center' });
    TXT(ctx, 'SCORE ' + OB.pad(G.score, 7) + '    STAGE ' + G.stageNo, W / 2, 276, { size: 9, sy: 1.4, fill: '#fff', outline: '#000', outlineW: 4, align: 'center' });
    if (Math.floor(G.t * 2) % 2 === 0) TXT(ctx, 'PRESS START', W / 2, 306, { size: 10, sy: 1.3, fill: '#ffd800', outline: '#000', outlineW: 4, align: 'center' });
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
