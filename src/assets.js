// OutRun Bangkok — asset loading + procedural pixel sprites
(function (OB) {
  'use strict';
  const FILES = ['bg','bike','portrait','taxi','taxi_orange','taxi_blue','taxi_green','sedan','sedan_black','sedan_red',
    'green','green_yellow','green_purple','bus','tuktuk','seven','signs','ckrd','spirit','thatien','yen','vendor',
    'noodle','storepanel','sangchai','thongbai','redsign','chedi',
    'facade0','facade1','facade2','facade3','facade4','facade5','towers0','towers1','towers2','title','atlas'];
  const IMG = {};
  OB.IMG = IMG;

  OB.loadAssets = function () {
    const src = window.__ASSETS__ || null;
    const jobs = FILES.map(name => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => { IMG[name] = im; res(); };
      im.onerror = () => rej(new Error('asset ' + name));
      im.src = src ? src[name] : 'assets/' + name + '.png';
    }));
    const fonts = (document.fonts && document.fonts.load) ? Promise.all([
      document.fonts.load('12px "Press Start 2P"'),
      document.fonts.load('700 12px "Kanit"'), document.fonts.load('500 12px "Kanit"'),
      document.fonts.load('700 12px "Kanit"', 'สยาม'), document.fonts.load('500 12px "Kanit"', 'สยาม')
    ]).catch(() => {}) : Promise.resolve();
    return Promise.all(jobs.concat([fonts])).then(() => { OB.buildSprites(); });
  };

  // ---------- pixel drawing helpers ----------
  const mk = OB.makeCanvas;
  function px(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function shade(hex, f) { // multiply brightness
    const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = OB.clamp(Math.round(r * f), 0, 255); g = OB.clamp(Math.round(g * f), 0, 255); b = OB.clamp(Math.round(b * f), 0, 255);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  OB.shade = shade;

  // Pixel-texture pass: painterly value noise, a dark 1px outline at the silhouette and at strong
  // internal contrast edges, slight top-light, and a coarse quantisation. Makes flat procedural art
  // sit next to the sprites cut from the reference frame.
  function texturize(c, opt) {
    opt = opt || {};
    const w = c.width, h = c.height, g = c.getContext('2d');
    const id = g.getImageData(0, 0, w, h), d = id.data, out = new Uint8ClampedArray(d);
    const rnd = OB.rng(opt.seed || (w * 131 + h * 17));
    const gs = opt.grain || 6, gw = Math.ceil(w / gs) + 2, gh = Math.ceil(h / gs) + 2;
    const grid = new Float32Array(gw * gh); for (let i = 0; i < grid.length; i++) grid[i] = rnd() * 2 - 1;
    const noise = (x, y) => { const fx = x / gs, fy = y / gs, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
      const a = grid[iy * gw + ix], b = grid[iy * gw + ix + 1], cc = grid[(iy + 1) * gw + ix], dd = grid[(iy + 1) * gw + ix + 1];
      return (a * (1 - tx) + b * tx) * (1 - ty) + (cc * (1 - tx) + dd * tx) * ty; };
    const amp = opt.amp === undefined ? 0.09 : opt.amp, dither = opt.dither === undefined ? 0.04 : opt.dither;
    const edgeK = opt.outline === undefined ? 0.42 : opt.outline;
    const alpha = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : d[(y * w + x) * 4 + 3];
    const lum = (x, y) => { const i = (y * w + x) * 4; return d[i] + d[i + 1] + d[i + 2]; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; if (d[i + 3] < 8) continue;
      let f = 1 + amp * noise(x, y) + dither * ((((x * 7 + y * 13) % 5) / 2) - 1) + 0.05 - 0.10 * (y / h);
      if (alpha(x - 1, y) < 8 || alpha(x + 1, y) < 8 || alpha(x, y - 1) < 8 || alpha(x, y + 1) < 8) f *= edgeK;
      else {
        const l = lum(x, y);
        if ((alpha(x + 1, y) > 8 && lum(x + 1, y) - l > 130) || (alpha(x - 1, y) > 8 && lum(x - 1, y) - l > 130) ||
            (alpha(x, y + 1) > 8 && lum(x, y + 1) - l > 130) || (alpha(x, y - 1) > 8 && lum(x, y - 1) - l > 130)) f *= 0.72;
      }
      out[i] = Math.round(d[i] * f / 6) * 6; out[i + 1] = Math.round(d[i + 1] * f / 6) * 6; out[i + 2] = Math.round(d[i + 2] * f / 6) * 6;
    }
    id.data.set(out); g.putImageData(id, 0, 0); return c;
  }
  OB.texturize = texturize;

  // ---------- procedural sprites ----------
  function pole(h, opt) {
    opt = opt || {};
    const w = 40, c = mk(w, h), g = c.getContext('2d');
    const x = 13, pw = 11;
    px(g, x, 10, pw, h - 10, '#8f8f8b'); px(g, x + pw - 3, 10, 3, h - 10, '#5a5a58'); px(g, x, 10, 2, h - 10, '#bdbdb8');
    for (let yy = 40; yy < h; yy += 34) px(g, x, yy, pw, 1, '#6f6f6c');
    // cross arms
    px(g, 2, 14, 32, 3, '#6e6e6c'); px(g, 5, 28, 26, 3, '#6e6e6c');
    for (let i = 0; i < 4; i++) { px(g, 3 + i * 9, 10, 3, 5, '#d8d8d0'); px(g, 3 + i * 9, 8, 3, 2, '#3a5a8a'); }
    for (let i = 0; i < 3; i++) { px(g, 7 + i * 9, 24, 3, 5, '#d8d8d0'); }
    // transformer
    if (!opt.noTx) { px(g, x + pw, 40, 12, 20, '#4a4d4f'); px(g, x + pw + 2, 42, 8, 3, '#7a7d7f'); px(g, x + pw + 3, 47, 2, 10, '#2a2b2c'); px(g, x + pw + 7, 47, 2, 10, '#2a2b2c'); }
    // cable bundle loops
    px(g, x - 3, 60, 3, 30, '#1e1e1e'); px(g, x - 5, 70, 2, 14, '#1e1e1e');
    // number plate
    px(g, x + 1, h * 0.55, 6, 8, '#e8e0c0');
    return { c, topY: 10, topX: x + pw / 2 };
  }

  function lampPost() {
    const c = mk(44, 180), g = c.getContext('2d');
    px(g, 6, 20, 5, 160, '#7c7f82'); px(g, 10, 20, 1, 160, '#4a4c4e'); px(g, 6, 20, 1, 160, '#a5a8ab');
    px(g, 3, 172, 11, 8, '#5d6063');
    // arm
    px(g, 8, 14, 22, 3, '#7c7f82'); px(g, 28, 12, 10, 3, '#7c7f82'); px(g, 12, 17, 3, 6, '#7c7f82');
    // head
    px(g, 30, 8, 12, 6, '#d5d8dc'); px(g, 31, 14, 10, 2, '#fff7d6'); px(g, 33, 16, 6, 1, '#ffe89a');
    return c;
  }

  function pillar() { // skytrain viaduct pillar
    const c = mk(44, 440), g = c.getContext('2d');
    px(g, 8, 0, 28, 440, '#9a9a96'); px(g, 30, 0, 6, 440, '#6d6d69'); px(g, 8, 0, 4, 440, '#c3c3be');
    px(g, 0, 0, 44, 26, '#8c8c88'); px(g, 0, 22, 44, 4, '#5f5f5b');
    px(g, 4, 420, 36, 20, '#7d7d79');
    for (let y = 60; y < 420; y += 70) px(g, 12, y, 20, 2, '#7a7a76');
    return c;
  }

  const FACADES = ['#d9c9a4', '#e6dbb8', '#c8d0b0', '#b9c8d2', '#d8b7ac', '#bdb7ae', '#e2cfa0', '#c9c0b0', '#d0a889', '#aeb9a2'];
  const AWNINGS = [['#1f4fa3', '#e9f0ff'], ['#c8322b', '#f6e2c8'], ['#1f8a4c', '#e6f0d8'], ['#d99a1c', '#fff3d0'], ['#2b6fb0', '#2b6fb0'], ['#b3202f', '#b3202f']];
  const SIGNTXT = ['ร้านอาหาร', 'ข้าวมันไก่', 'ก๋วยเตี๋ยว', 'ร้านทอง', 'อู่ซ่อมรถ', 'ซักรีด', 'หมูกระทะ', 'ร้านยา', 'กาแฟโบราณ', 'ส้มตำ', 'ตัดผม', 'โรตี', 'ข้าวต้ม', 'มินิมาร์ท'];
  const SIGNCOL = [['#c8222a', '#ffe37a'], ['#1b3c8c', '#ffffff'], ['#f2c12e', '#8a1c1c'], ['#ffffff', '#1b3c8c'], ['#0f7a3d', '#ffffff'], ['#5a1c8c', '#ffd24a'], ['#1f4fa3', '#ffffff'], ['#e8e2d2', '#c8222a']];

  function shophouse(rng, opt) {
    opt = opt || {};
    const floors = opt.floors || (1 + rng.int(2) + (rng.chance(0.3) ? 1 : 0)); // 1-3 upper floors
    const fh = 40, gh = 58, W = 150, H = gh + floors * fh + 16;
    const c = mk(W, H), g = c.getContext('2d');
    const base = opt.color || rng.pick(FACADES), dark = shade(base, 0.72), light = shade(base, 1.12), grime = shade(base, 0.85);
    px(g, 0, 16, W, H - 16, base);
    px(g, W - 5, 16, 5, H - 16, dark); px(g, 0, 16, 2, H - 16, light);
    // vertical pilasters between units
    px(g, 48, 16, 3, H - 16, grime); px(g, 100, 16, 3, H - 16, grime);
    // parapet / roof
    px(g, 0, 10, W, 8, shade(base, 0.92)); px(g, 0, 10, W, 2, light); px(g, 0, 17, W, 1, dark);
    if (rng.chance(0.6)) { const tx = 20 + rng.int(80); px(g, tx, 0, 24, 11, '#6f7378'); px(g, tx + 2, 2, 20, 2, '#9a9ea3'); px(g, tx + 4, 11, 2, 6, '#333'); px(g, tx + 18, 11, 2, 6, '#333'); }
    if (rng.chance(0.6)) { const ax = 110 + rng.int(25); px(g, ax, 0, 2, 12, '#222'); px(g, ax - 6, 1, 14, 1, '#222'); px(g, ax - 4, 4, 10, 1, '#222'); px(g, ax - 2, 7, 6, 1, '#222'); }
    const winC = rng.pick(['#20304a', '#2a3b4e', '#1c2a3a', '#2c3e50']);
    const frame = rng.pick(['#f4f1e8', '#e8e2d2', '#d8dde2']);
    for (let f = 0; f < floors; f++) {
      const y = 18 + f * fh;
      px(g, 0, y + fh - 4, W, 4, shade(base, 0.8)); px(g, 0, y + fh - 4, W, 1, light); // slab
      for (let u = 0; u < 3; u++) {
        const x = 6 + u * 50; const style = rng.int(3);
        if (style === 0) { // window with frame + sill
          px(g, x + 6, y + 6, 30, 22, frame); px(g, x + 8, y + 8, 26, 18, winC); px(g, x + 9, y + 9, 10, 6, '#5c7797'); px(g, x + 20, y + 8, 1, 18, frame); px(g, x + 8, y + 16, 26, 1, frame);
          px(g, x + 4, y + 28, 34, 2, shade(base, 0.7));
          if (rng.chance(0.5)) { px(g, x + 26, y + 20, 12, 9, '#cfd2d5'); px(g, x + 27, y + 21, 10, 5, '#8d9296'); px(g, x + 29, y + 27, 6, 1, '#6e7276'); }
        } else if (style === 1) { // balcony with railing + door
          px(g, x + 10, y + 4, 22, 28, winC); px(g, x + 12, y + 6, 8, 8, '#5c7797'); px(g, x + 9, y + 3, 24, 1, frame);
          px(g, x + 2, y + 20, 38, 12, shade(base, 0.88)); px(g, x + 2, y + 19, 38, 1, light);
          for (let r = 0; r < 38; r += 3) px(g, x + 2 + r, y + 21, 1, 10, rng.chance(0.5) ? '#3a4a5a' : '#2d3a48');
          px(g, x + 2, y + 21, 38, 1, '#8aa0b4');
          if (rng.chance(0.4)) { px(g, x + 6 + rng.int(20), y + 10, 5, 8, rng.pick(['#e94e4e', '#4e8de9', '#f0d24e', '#ffffff'])); } // laundry
        } else { // shuttered / louvre window
          px(g, x + 8, y + 6, 26, 22, frame); px(g, x + 10, y + 8, 22, 18, shade(frame, 0.75)); for (let l = 0; l < 18; l += 3) px(g, x + 10, y + 8 + l, 22, 1, shade(frame, 0.55));
          px(g, x + 6, y + 28, 30, 2, shade(base, 0.7));
        }
      }
    }
    // drain pipe
    if (rng.chance(0.6)) { px(g, W - 12, 12, 3, H - 12, shade(base, 0.62)); px(g, W - 12, 12, 1, H - 12, shade(base, 0.5)); }
    // ground floor
    const gy = 18 + floors * fh;
    px(g, 0, gy, W, gh, shade(base, 0.95)); px(g, 0, H - 6, W, 6, shade(base, 0.6));
    const shopType = opt.shop !== undefined ? opt.shop : rng.int(4);
    const ay = gy + 8; // awning line
    if (shopType === 3) { // rolling shutter
      px(g, 8, ay + 12, W - 22, gh - 24, '#9aa0a8'); for (let yy = ay + 14; yy < gy + gh - 8; yy += 3) px(g, 8, yy, W - 22, 1, '#6f757d');
      px(g, 50, ay + 26, 40, 14, rng.pick(['#c9a227', '#c8322b', '#1f4fa3'])); px(g, 8, ay + 12, W - 22, 2, '#4a4f56');
    } else { // open shopfront
      px(g, 8, ay + 12, W - 22, gh - 20, '#26262c'); px(g, 8, ay + 12, W - 22, 3, '#3d3d46');
      const cols = ['#a8481a', '#b8902a', '#2f7d48', '#8e3348', '#2f5a90', '#c9c4b4', '#6a3a9a', '#7a5a3a'];
      for (let r = 0; r < 3; r++) { px(g, 14, ay + 21 + r * 10, W - 34, 1, '#4a4a52'); for (let i = 0; i < 14; i++) if (rng.chance(0.75)) px(g, 16 + i * 8, ay + 15 + r * 10, 5, 6, rng.pick(cols)); }
      px(g, 14, ay + 14, W - 34, 1, '#55555e');
      if (shopType === 1) { px(g, 20, gy + gh - 22, 50, 16, '#cfd2d5'); px(g, 22, gy + gh - 20, 46, 6, '#e94e4e'); px(g, 24, gy + gh - 14, 8, 8, '#ffd23f'); px(g, 36, gy + gh - 14, 8, 8, '#3aa35c'); } // food counter
      if (shopType === 2) { for (let i = 0; i < 3; i++) { px(g, 80 + i * 18, gy + gh - 16, 12, 10, '#2b6fb0'); px(g, 82 + i * 18, gy + gh - 6, 2, 6, '#2b6fb0'); px(g, 88 + i * 18, gy + gh - 6, 2, 6, '#2b6fb0'); } } // plastic stools
      px(g, 8, ay + 12, 3, gh - 20, '#8d8d8a'); px(g, W - 17, ay + 12, 3, gh - 20, '#8d8d8a');
    }
    // awning
    const aw = rng.pick(AWNINGS);
    px(g, 3, ay, W - 12, 10, aw[0]);
    if (aw[1] !== aw[0]) for (let x = 3; x < W - 12; x += 12) px(g, x + 6, ay, 6, 10, aw[1]);
    px(g, 3, ay + 10, W - 12, 2, shade(aw[0], 0.7)); for (let x = 3; x < W - 12; x += 6) px(g, x, ay + 12, 3, 2, shade(aw[0], 0.7));
    px(g, 3, ay - 1, W - 12, 1, shade(aw[0], 1.3));
    // sign board above awning
    const useImg = opt.sign !== undefined ? opt.sign : (rng.chance(0.4) ? rng.pick(['sangchai', 'thongbai', 'redsign']) : null);
    if (useImg && IMG[useImg]) {
      const im = IMG[useImg];
      let sw = Math.min(W - 30, im.width * 1.25), sh = sw * im.height / im.width;
      if (useImg === 'storepanel' || useImg === 'redsign') { sh = Math.min(fh * 1.5, sh); sw = sh * im.width / im.height; }
      g.imageSmoothingEnabled = false;
      const sx = useImg === 'redsign' ? W - 26 - sw : 8;
      g.drawImage(im, sx, gy + 2 - sh, sw, sh);
    } else if (opt.sign !== null) {
      const sc = rng.pick(SIGNCOL), txt = opt.text || rng.pick(SIGNTXT);
      px(g, 6, gy - 20, W - 18, 24, sc[0]); px(g, 6, gy - 20, W - 18, 2, shade(sc[0], 1.3)); px(g, 6, gy + 2, W - 18, 2, shade(sc[0], 0.6));
      px(g, 6, gy - 20, 2, 24, shade(sc[0], 0.6)); px(g, W - 14, gy - 20, 2, 24, shade(sc[0], 0.6));
      g.fillStyle = sc[1]; g.font = '700 18px "Kanit"'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(txt, (W - 6) / 2, gy - 8);
    }
    if (false) { px(g, 3, ay - 12, W - 12, 12, '#f5f5f2'); px(g, 3, ay - 12, W - 12, 4, '#f47a20'); px(g, 3, ay - 8, W - 12, 4, '#00843d'); px(g, 3, ay - 4, W - 12, 4, '#e4002b'); }
    // AC units on facade
    for (let i = 0; i < rng.int(3); i++) { const x = 20 + rng.int(W - 50), y = 30 + rng.int(Math.max(1, H - 110)); px(g, x, y, 12, 9, '#d0d3d6'); px(g, x + 1, y + 1, 10, 5, '#8d9296'); px(g, x + 3, y + 7, 6, 1, '#6e7276'); }
    return c;
  }

  function tower(rng) { // curtain-wall office tower in the reference's hazy blue-grey: setbacks, crown, lobby podium
    const W = 70 + rng.int(50), H = 240 + rng.int(180), P = 26;
    const c = mk(W + 20, H + 40), g = c.getContext('2d');
    const ox = 10, oy = 40;
    const base = rng.pick(['#9db1c6', '#8fa3b8', '#a9b9c9', '#7f95ab', '#b4bfc9', '#93a6ba']);
    const glass = rng.pick(['#4f6785', '#465d7a', '#5a7190', '#3f556f']);
    const mull = shade(base, 1.12);
    const setback = rng.chance(0.55), sbH = Math.round(H * 0.22), sbIn = 10 + rng.int(8);
    const bodyTop = setback ? oy + sbH : oy, bodyH = H - P - (bodyTop - oy);
    for (let y = 0; y < bodyH; y++) px(g, ox, bodyTop + y, W, 1, shade(base, 1.08 - 0.16 * (y / bodyH)));
    for (let x = ox + 4; x < ox + W - 6; x += 5) { px(g, x, bodyTop + 4, 3, bodyH - 8, glass); px(g, x + 3, bodyTop + 4, 1, bodyH - 8, mull); }
    for (let y = bodyTop + 4; y < bodyTop + bodyH - 4; y += 7) { px(g, ox + 4, y, W - 10, 1, shade(glass, 0.75)); if (rng.chance(0.5)) px(g, ox + 4 + rng.int(W - 14), y + 2, 2, 4, '#efe6c4'); }
    if (setback) {
      for (let y = 0; y < sbH + 2; y++) px(g, ox + sbIn, oy + y, W - sbIn * 2, 1, shade(base, 1.12 - 0.06 * (y / sbH)));
      for (let x = ox + sbIn + 3; x < ox + W - sbIn - 4; x += 5) { px(g, x, oy + 4, 3, sbH - 6, glass); px(g, x + 3, oy + 4, 1, sbH - 6, mull); }
      for (let y = oy + 4; y < bodyTop - 2; y += 7) px(g, ox + sbIn + 3, y, W - sbIn * 2 - 6, 1, shade(glass, 0.75));
      px(g, ox + sbIn, oy, W - sbIn * 2, 2, shade(base, 1.25)); px(g, ox + W - sbIn - 4, oy, 4, sbH, shade(base, 0.72));
    }
    px(g, ox + W - 5, bodyTop, 5, bodyH, shade(base, 0.7)); px(g, ox, bodyTop, 2, bodyH, shade(base, 1.2)); px(g, ox, bodyTop, W, 2, shade(base, 1.25));
    const cx = setback ? ox + sbIn : ox, cw = setback ? W - sbIn * 2 : W;
    px(g, cx + 2, oy - 6, cw - 4, 6, shade(base, 0.85)); px(g, cx + cw / 2 - 8, oy - 14, 16, 8, shade(base, 0.8)); px(g, cx + cw / 2 - 1, oy - 36, 2, 24, '#7d8894'); px(g, cx + cw / 2 - 2, oy - 39, 4, 3, '#ff3b3b');
    px(g, 0, oy + H - P, W + 20, P, shade(base, 0.92)); px(g, 0, oy + H - P, W + 20, 3, shade(base, 1.2)); px(g, W + 15, oy + H - P, 5, P, shade(base, 0.68));
    px(g, 8, oy + H - P + 8, W + 4, P - 8, '#2a3440'); for (let x = 12; x < W + 8; x += 10) px(g, x, oy + H - P + 8, 1, P - 8, '#c9c4b4');
    px(g, 4, oy + H - P + 4, W + 12, 4, '#d9d3c4');
    return c;
  }
  function haze(c, a) { const g = c.getContext('2d'); g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(120,170,235,' + a + ')'; g.fillRect(0, 0, c.width, c.height); g.restore(); return c; }

  function tree(rng, palm) {
    const c = mk(96, 140), g = c.getContext('2d');
    if (palm) {
      // curved trunk
      for (let t = 0; t < 100; t += 2) { const x = 48 + Math.sin(t / 100 * 1.2) * 10 - 10; px(g, x, 40 + t, 6, 3, t % 8 < 4 ? '#8a6a42' : '#75582f'); px(g, x + 4, 40 + t, 2, 3, '#5c4326'); }
      const greens = ['#2f7d32', '#3c9a3e', '#256b2a', '#48a84c'];
      for (let i = 0; i < 9; i++) { const a = -Math.PI + i * (Math.PI / 8.5); const col = greens[i % greens.length];
        for (let t = 0; t < 42; t += 2) { const x = 38 + Math.cos(a) * t, y = 34 + Math.sin(a) * t * 0.55 + t * t * 0.022; px(g, x, y, 4, 3, col); if (t % 6 === 0) px(g, x + (a < -Math.PI / 2 ? -2 : 4), y + 2, 2, 2, shade(col, 0.8)); } }
      px(g, 34, 30, 9, 8, '#8a5a2a'); px(g, 36, 28, 5, 4, '#c98a2a'); px(g, 40, 32, 3, 3, '#e0b040');
    } else {
      px(g, 44, 78, 9, 62, '#6b4a2e'); px(g, 51, 78, 2, 62, '#4a3320'); px(g, 44, 78, 2, 62, '#8a6a48');
      px(g, 38, 76, 6, 10, '#6b4a2e'); px(g, 53, 74, 6, 12, '#6b4a2e');
      const greens = ['#2f7d32', '#3d9a40', '#246b29', '#55b25a', '#1e5a22'];
      // canopy silhouette
      g.fillStyle = '#1e5a22'; g.beginPath(); g.ellipse(48, 46, 44, 34, 0, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 60; i++) { const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) ; const x = 48 + Math.cos(a) * r * 40, y = 46 + Math.sin(a) * r * 30; const sz = 5 + rng.int(6);
        px(g, x - sz / 2, y - sz / 2, sz, sz * 0.8, greens[1 + rng.int(3)]); }
      for (let i = 0; i < 24; i++) { const a = rng() * Math.PI * 2, r = Math.sqrt(rng()); const x = 48 + Math.cos(a) * r * 36, y = 40 + Math.sin(a) * r * 24; px(g, x, y, 4, 3, '#7ad07e'); }
      for (let i = 0; i < 14; i++) { const x = 10 + rng.int(76), y = 58 + rng.int(22); px(g, x, y, 5, 3, '#1e5a22'); }
    }
    return c;
  }

  function templeWall() {
    const c = mk(240, 70), g = c.getContext('2d');
    px(g, 0, 22, 240, 48, '#f1ece0'); px(g, 0, 60, 240, 10, '#c9c0ad');
    for (let x = 0; x < 240; x += 24) { px(g, x, 30, 2, 30, '#d9d2c2'); }
    px(g, 0, 14, 240, 10, '#c8411f'); px(g, 0, 10, 240, 5, '#e05a2a'); px(g, 0, 8, 240, 3, '#f1a25a');
    for (let x = 0; x < 240; x += 8) px(g, x, 14, 4, 10, '#a83218');
    for (let x = 6; x < 240; x += 48) { px(g, x, 0, 4, 10, '#e8c25a'); px(g, x + 1, -2, 2, 4, '#f7dc8a'); }
    return c;
  }

  function boat(rng) {
    const c = mk(80, 26), g = c.getContext('2d');
    px(g, 4, 14, 70, 8, rng.pick(['#5a3a1e', '#7a4a22', '#3a5a8a'])); px(g, 0, 12, 12, 4, '#7a4a22'); px(g, 70, 10, 10, 6, '#7a4a22');
    px(g, 20, 6, 30, 8, rng.pick(['#d9412f', '#2f7bd9', '#f0c030'])); px(g, 18, 4, 34, 3, '#f5f5f5');
    px(g, 30, 0, 2, 6, '#333'); px(g, 32, 0, 8, 4, rng.pick(['#e33', '#fc3', '#39f']));
    return c;
  }

  function signBoard(g, x, y, w, h, thai, eng, arrow) {
    px(g, x, y, w, h, '#0c7a45'); px(g, x + 3, y + 3, w - 6, h - 6, '#0f8d50');
    g.strokeStyle = '#f2ead6'; g.lineWidth = 2; g.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
    g.fillStyle = '#f2ead6'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = '700 ' + Math.round(h * 0.36) + 'px "Kanit"'; g.fillText(thai, x + 12, y + h * 0.5);
    g.font = '500 ' + Math.round(h * 0.24) + 'px "Kanit"'; g.fillText(eng, x + 12, y + h * 0.82);
    // arrow
    const ax = x + w - h * 0.6, ay = y + h * 0.5, s = h * 0.26;
    g.fillStyle = '#f2ead6'; g.beginPath();
    if (arrow === 'up') { g.moveTo(ax, ay - s); g.lineTo(ax + s * 0.8, ay); g.lineTo(ax + s * 0.3, ay); g.lineTo(ax + s * 0.3, ay + s); g.lineTo(ax - s * 0.3, ay + s); g.lineTo(ax - s * 0.3, ay); g.lineTo(ax - s * 0.8, ay); }
    else if (arrow === 'right') { g.moveTo(ax + s, ay); g.lineTo(ax, ay - s * 0.8); g.lineTo(ax, ay - s * 0.3); g.lineTo(ax - s, ay - s * 0.3); g.lineTo(ax - s, ay + s * 0.3); g.lineTo(ax, ay + s * 0.3); g.lineTo(ax, ay + s * 0.8); }
    else { g.moveTo(ax - s, ay); g.lineTo(ax, ay - s * 0.8); g.lineTo(ax, ay - s * 0.3); g.lineTo(ax + s, ay - s * 0.3); g.lineTo(ax + s, ay + s * 0.3); g.lineTo(ax, ay + s * 0.3); g.lineTo(ax, ay + s * 0.8); }
    g.closePath(); g.fill();
  }

  function gantry(left, right) { // overhead fork sign spanning the road
    const W = 560, H = 300, c = mk(W, H), g = c.getContext('2d');
    // posts
    px(g, 10, 60, 12, 240, '#7c7f82'); px(g, 20, 60, 2, 240, '#4a4c4e'); px(g, W - 22, 60, 12, 240, '#7c7f82'); px(g, W - 12, 60, 2, 240, '#4a4c4e');
    px(g, 0, 54, W, 8, '#7c7f82'); px(g, 0, 60, W, 2, '#4a4c4e');
    for (let x = 30; x < W - 30; x += 24) px(g, x, 48, 3, 8, '#5d6063');
    signBoard(g, 40, 0, 230, 70, left.thai, left.eng, 'left');
    signBoard(g, W - 270, 0, 230, 70, right.thai, right.eng, 'right');
    // lights
    for (let x = 60; x < W - 40; x += 90) px(g, x, -0, 6, 4, '#333');
    return c;
  }

  function banner(text, sub, col) {
    const W = 560, H = 300, c = mk(W, H), g = c.getContext('2d');
    px(g, 8, 40, 14, 260, '#d8d8d0'); px(g, 20, 40, 3, 260, '#8a8a80'); px(g, W - 22, 40, 14, 260, '#d8d8d0'); px(g, W - 10, 40, 3, 260, '#8a8a80');
    px(g, 0, 30, W, 60, col || '#d9262e'); px(g, 0, 30, W, 6, '#fff'); px(g, 0, 84, W, 6, '#fff');
    for (let x = 0; x < W; x += 40) { px(g, x, 36, 20, 6, col === '#1a56b8' ? '#ffd23f' : '#ffd23f'); px(g, x + 20, 78, 20, 6, '#ffd23f'); }
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '30px "Press Start 2P"'; g.lineWidth = 6; g.strokeStyle = '#000'; g.lineJoin = 'round';
    g.strokeText(text, W / 2, 60); g.fillText(text, W / 2, 60);
    if (sub) { g.font = '700 22px "Kanit"'; g.fillStyle = '#ffd23f'; g.strokeText(sub, W / 2, 104); g.fillText(sub, W / 2, 104); }
    return c;
  }

  function onPole(img, totalH, scale, poleW) {
    scale = scale || 1; poleW = poleW || 5;
    const iw = Math.round(img.width * scale), ih = Math.round(img.height * scale);
    const W = Math.max(iw, 12), c = mk(W, totalH), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    px(g, W / 2 - poleW / 2, ih - 4, poleW, totalH - ih + 4, '#8d8d8a'); px(g, W / 2 + poleW / 2 - 1, ih - 4, 1, totalH - ih + 4, '#4f4f4d');
    g.drawImage(img, (W - iw) / 2, 0, iw, ih);
    return c;
  }

  function lanternSprite() {
    const c = mk(20, 26), g = c.getContext('2d');
    px(g, 8, 0, 4, 4, '#c9a227'); px(g, 2, 4, 16, 16, '#d61f2c'); px(g, 4, 4, 12, 2, '#ff6a3d'); px(g, 2, 8, 16, 3, '#f23a45'); px(g, 6, 20, 8, 3, '#c9a227'); px(g, 8, 23, 4, 3, '#e8c25a');
    return c;
  }

  function goldenChedi() {
    const c = mk(90, 200), g = c.getContext('2d');
    px(g, 10, 150, 70, 50, '#e9e3d2'); px(g, 5, 190, 80, 10, '#c9c2b0');
    for (let i = 0; i < 6; i++) { const w = 60 - i * 8, y = 150 - i * 10; px(g, 45 - w / 2, y, w, 10, i % 2 ? '#e0b73b' : '#f3cf5a'); }
    px(g, 30, 60, 30, 30, '#f3cf5a'); px(g, 33, 56, 24, 6, '#e0b73b');
    for (let i = 0; i < 12; i++) { const w = 24 - i * 2; px(g, 45 - w / 2, 56 - i * 4.5, w, 5, i % 2 ? '#e0b73b' : '#f3cf5a'); }
    px(g, 44, 0, 3, 8, '#fff2b0');
    px(g, 55, 90, 6, 60, '#c99a2a');
    return c;
  }

  function wat() { // temple ordination hall with tiered roof, white walls, gold trim
    const W = 260, H = 210, c = mk(W, H), g = c.getContext('2d');
    // base platform
    px(g, 6, 196, 248, 14, '#d9d1bd'); px(g, 6, 196, 248, 3, '#f1ece0'); px(g, 12, 190, 236, 6, '#e9e3d2');
    // walls
    px(g, 22, 118, 216, 74, '#f4efe2'); px(g, 22, 186, 216, 6, '#d9d1bd'); px(g, 232, 118, 6, 74, '#d9d1bd');
    // columns with gold capitals
    for (let x = 30; x < 236; x += 26) { px(g, x, 118, 10, 74, '#efe8d6'); px(g, x + 8, 118, 2, 74, '#cfc6b0'); px(g, x - 1, 118, 12, 6, '#e8c25a'); px(g, x - 2, 112, 14, 6, '#c99a2a'); }
    // windows with gold frames
    for (let x = 44; x < 220; x += 52) { px(g, x, 136, 18, 34, '#c99a2a'); px(g, x + 2, 138, 14, 30, '#5a1c1c'); px(g, x + 4, 140, 10, 26, '#8a2a2a'); px(g, x + 6, 130, 6, 6, '#e8c25a'); }
    // door
    px(g, 112, 138, 36, 54, '#c99a2a'); px(g, 115, 141, 30, 51, '#3a1a1a'); px(g, 118, 144, 24, 48, '#7a2a2a'); px(g, 129, 144, 2, 48, '#e8c25a'); px(g, 122, 128, 16, 10, '#e8c25a');
    // roofs (three tiers, red tiles with green band and gold edges)
    const tiers = [[8, 244, 98, 22], [30, 200, 76, 22], [56, 148, 54, 22], [84, 92, 34, 18]];
    for (const t of tiers) {
      px(g, t[0], t[2], t[1], t[3], '#c8411f');
      for (let x = t[0]; x < t[0] + t[1]; x += 6) px(g, x, t[2], 3, t[3], '#b53518');
      px(g, t[0], t[2], t[1], 4, '#e8863a'); px(g, t[0] + 3, t[2] + 7, t[1] - 6, 3, '#2f8a3a'); px(g, t[0] + 3, t[2] + 10, t[1] - 6, 1, '#e8c25a');
      px(g, t[0], t[2] + t[3] - 3, t[1], 3, '#e8c25a');
      px(g, t[0] - 5, t[2] + t[3] - 10, 5, 12, '#e8c25a'); px(g, t[0] + t[1], t[2] + t[3] - 10, 5, 12, '#e8c25a');
      px(g, t[0] - 6, t[2] + t[3] - 16, 3, 8, '#f7dc8a'); px(g, t[0] + t[1] + 3, t[2] + t[3] - 16, 3, 8, '#f7dc8a');
    }
    // gable spire (chofa) + ridge finials
    px(g, 128, 52, 4, 42, '#e8c25a'); px(g, 126, 48, 8, 6, '#f7dc8a'); px(g, 129, 40, 2, 10, '#f7dc8a');
    px(g, 86, 88, 3, 8, '#f7dc8a'); px(g, 171, 88, 3, 8, '#f7dc8a');
    // boundary wall foreground
    px(g, 0, 176, 22, 22, '#f1ece0'); px(g, 238, 176, 22, 22, '#f1ece0'); px(g, 0, 172, 22, 5, '#c8411f'); px(g, 238, 172, 22, 5, '#c8411f');
    return c;
  }

  // ---------- shophouse composer: reference ground floor + drawn upper storeys + swappable shop modules ----------
  const FAC_WALLS = ['#d9cdb1', '#d9cdb1', '#e3d8c0', '#cfd6c4', '#d8c9c1', '#c9d2d8'];
  // 7-Eleven fascia: white board (goes through the painterly texture pass) + the real logo sprite (IMG.seven)
  // stamped on top afterwards, untouched, so the cut-out photo art stays crisp; used on shophouses and the pole sign.
  function store247Board(o, W, y0, h) {
    px(o, 0, y0, W, h, '#f6f6f2'); px(o, 0, y0, W, 2, '#ffffff'); px(o, 0, y0 + h - 3, W, 3, '#6b6b66'); px(o, W - 6, y0, 6, h, '#d9d9d3');
  }
  function store247Logos(g, W, y0, h) {
    const logo = IMG.seven, lh = Math.round(h * 0.8), lw = Math.round(lh * logo.width / logo.height);
    g.save(); g.imageSmoothingEnabled = false;
    g.drawImage(logo, (W - lw) / 2, y0 + (h - lh) / 2, lw, lh);
    g.restore();
  }
  function sign247() { const logo = IMG.seven, s = 2.2, w = Math.round(logo.width * s), h = Math.round(logo.height * s), c = mk(w, h), g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(logo, 0, 0, w, h); return c; }
  function composeFacade(rng, opt) {
    const base = IMG[opt.cart ? 'facade0' : 'facade1'];
    const W = 260, floors = opt.floors, FH = 64, PAR = 14, TOP = 22, upperH = PAR + floors * FH;
    const wall = opt.wall || rng.pick(FAC_WALLS), dark = shade(wall, 0.72), light = shade(wall, 1.12);
    const frame = rng.pick(['#f4f1e8', '#e8e2d2', '#d8dde2']), winC = rng.pick(['#20304a', '#2a3b4e', '#1c2a3a', '#2c3e50']);
    // upper storeys
    const U = mk(W, TOP + upperH + 44), u = U.getContext('2d');
    px(u, 0, TOP + PAR, W, upperH - PAR + 44, wall); px(u, W - 6, TOP + PAR, 6, upperH - PAR + 44, dark); px(u, 0, TOP + PAR, 3, upperH - PAR + 44, light);
    px(u, 0, TOP, W, PAR, shade(wall, 0.9)); px(u, 0, TOP, W, 3, light); px(u, 0, TOP + PAR - 2, W, 2, dark);
    if (rng.chance(0.65)) { const tx = 30 + rng.int(150); px(u, tx, TOP - 18, 34, 16, '#6f7378'); px(u, tx + 2, TOP - 16, 30, 3, '#9a9ea3'); px(u, tx + 4, TOP - 2, 3, 4, '#333'); px(u, tx + 27, TOP - 2, 3, 4, '#333'); }
    if (rng.chance(0.6)) { const ax = 190 + rng.int(40); px(u, ax, TOP - 22, 2, 22, '#222'); px(u, ax - 8, TOP - 20, 18, 1, '#222'); px(u, ax - 5, TOP - 15, 12, 1, '#222'); px(u, ax - 3, TOP - 10, 8, 1, '#222'); }
    if (rng.chance(0.4)) { const dx = 100 + rng.int(60); px(u, dx, TOP - 12, 12, 12, '#d0d0d0'); px(u, dx + 3, TOP - 9, 6, 6, '#a0a0a0'); px(u, dx + 5, TOP, 2, 6, '#777'); }
    for (let f = 0; f < floors; f++) {
      const y = TOP + PAR + f * FH;
      px(u, 0, y + FH - 5, W, 5, shade(wall, 0.8)); px(u, 0, y + FH - 5, W, 1, light);
      px(u, 64, y, 3, FH - 5, shade(wall, 0.9)); px(u, 128, y, 3, FH - 5, shade(wall, 0.9)); px(u, 192, y, 3, FH - 5, shade(wall, 0.9));
      for (let k = 0; k < 4; k++) {
        const x = 6 + k * 64, style = rng.int(4);
        if (style === 1) { // balcony with door + railing
          px(u, x + 12, y + 6, 36, 42, winC); px(u, x + 14, y + 8, 12, 12, '#5c7797'); px(u, x + 11, y + 5, 38, 1, frame);
          px(u, x + 2, y + 30, 58, 4, shade(wall, 0.85)); px(u, x + 2, y + 29, 58, 1, light);
          for (let r = 0; r < 58; r += 4) px(u, x + 2 + r, y + 17, 1, 13, rng.chance(0.5) ? '#3a4a5a' : '#2d3a48');
          px(u, x + 2, y + 16, 58, 2, '#8aa0b4');
          if (rng.chance(0.45)) px(u, x + 8 + rng.int(30), y + 19, 6, 10, rng.pick(['#e94e4e', '#4e8de9', '#f0d24e', '#ffffff']));
        } else if (style === 2) { // louvre shutters
          px(u, x + 8, y + 10, 44, 34, frame); px(u, x + 10, y + 12, 40, 30, shade(frame, 0.75)); for (let l = 0; l < 30; l += 3) px(u, x + 10, y + 12 + l, 40, 1, shade(frame, 0.55));
          px(u, x + 6, y + 44, 48, 3, shade(wall, 0.7));
        } else { // window (+ AC unit)
          px(u, x + 8, y + 10, 44, 34, frame); px(u, x + 10, y + 12, 40, 30, winC); px(u, x + 11, y + 13, 16, 8, '#5c7797'); px(u, x + 30, y + 12, 1, 30, frame); px(u, x + 10, y + 26, 40, 1, frame);
          px(u, x + 6, y + 44, 48, 3, shade(wall, 0.7));
          if (style === 3) { px(u, x + 36, y + 34, 16, 12, '#cfd2d5'); px(u, x + 37, y + 35, 14, 7, '#8d9296'); px(u, x + 39, y + 43, 10, 1, '#6e7276'); }
        }
      }
    }
    if (rng.chance(0.6)) { px(u, W - 14, TOP + 4, 3, upperH + 40, shade(wall, 0.62)); px(u, W - 14, TOP + 4, 1, upperH + 40, shade(wall, 0.5)); }
    // grime streaks under some windows, then the painterly pass
    for (let k = 0; k < 6; k++) if (rng.chance(0.5)) { const gx = 20 + rng.int(W - 40), gy = TOP + PAR + 40 + rng.int(Math.max(1, upperH - 50)); px(u, gx, gy, 2, 10 + rng.int(14), shade(wall, 0.86)); }
    texturize(U, { amp: 0.1 });
    // compose
    const H = TOP + upperH + 300, c = mk(W, H), g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    px(g, 0, TOP + upperH, W, 44, wall);
    g.drawImage(U, 0, 0); g.drawImage(base, 0, TOP + upperH);
    // ground-floor modules
    const O = mk(W, 300), o = O.getContext('2d'); let any = false; o.imageSmoothingEnabled = false;
    { const band = opt.band === 'store' ? 'store' : (opt.band === 'sign' || opt.band === 'wall' ? opt.band : (rng.chance(0.6) ? 'sign' : 'wall'));
      any = true;
      if (band === 'store') store247Board(o, W, 0, 150); // fascia board covers the band and the awning strip
      else { px(o, 0, 0, W, 98, wall); px(o, 0, 36, W, 2, light); px(o, W - 6, 0, 6, 98, dark); }
      if (band === 'sign') {
        const sc = opt.signCol || rng.pick(SIGNCOL), txt = opt.text || rng.pick(SIGNTXT);
        px(o, 14, 44, W - 34, 46, sc[0]); px(o, 14, 44, W - 34, 3, shade(sc[0], 1.3)); px(o, 14, 87, W - 34, 3, shade(sc[0], 0.6)); px(o, 14, 44, 3, 46, shade(sc[0], 0.6)); px(o, W - 23, 44, 3, 46, shade(sc[0], 0.6));
        o.fillStyle = sc[1]; o.font = '700 30px "Kanit"'; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillText(txt, W / 2 - 4, 67);
      } else { for (let k = 0; k < 3; k++) { px(o, 30 + k * 70, 48, 40, 34, frame); px(o, 32 + k * 70, 50, 36, 30, winC); px(o, 33 + k * 70, 51, 14, 8, '#5c7797'); } }
    }
    const it = opt.band === 'store' ? 'store' : opt.interior;
    if (it === 'store') { // lit glass shopfront: door in the middle, two fridges, low shelves; everything level
      px(o, 6, 150, W - 16, 150, '#dfe9e4'); px(o, 6, 150, W - 16, 4, '#9aa8a2');
      px(o, 12, 158, W - 28, 130, '#eef8f3'); px(o, 12, 158, W - 28, 2, '#ffffff');
      for (let k = 0; k < 2; k++) { const fx = k ? W - 96 : 24; px(o, fx, 170, 60, 110, '#bcd6e8'); px(o, fx + 3, 173, 54, 104, '#d9eaf5'); px(o, fx + 29, 173, 2, 104, '#8aa0b4'); for (let r = 0; r < 4; r++) px(o, fx + 5, 190 + r * 22, 50, 2, '#a9c1d3'); }
      px(o, W / 2 - 26, 176, 52, 110, '#8aa0b4'); px(o, W / 2 - 23, 179, 46, 104, '#cfe3ee'); px(o, W / 2 - 1, 179, 2, 104, '#8aa0b4'); px(o, W / 2 + 6, 232, 6, 3, '#333'); px(o, W / 2 - 12, 232, 6, 3, '#333');
      px(o, 6, 286, W - 16, 14, '#b8b4aa'); any = true;
    } else if (it === 'shutter') {
      px(o, 6, 150, W - 16, 150, '#9aa0a8'); for (let yy = 154; yy < 300; yy += 4) px(o, 6, yy, W - 16, 1, '#6f757d'); px(o, 6, 150, W - 16, 4, '#4a4f56'); px(o, 6, 294, W - 16, 6, '#5a5f66');
      px(o, W / 2 - 12, 262, 24, 10, '#4a4f56'); const pc = rng.pick(['#c8322b', '#1f4fa3', '#e0b030']); px(o, 30, 185, 56, 70, pc); px(o, 34, 189, 48, 62, shade(pc, 1.25)); any = true;
    } else if (it === 'gold') {
      px(o, 6, 150, W - 16, 150, '#5a1414'); px(o, 6, 150, W - 16, 5, '#c9a227');
      for (let i = 0; i < 5; i++) { px(o, 16 + i * 48, 172, 40, 62, '#7a1f1f'); px(o, 18 + i * 48, 174, 36, 58, '#8a2a2a'); for (let j = 0; j < 6; j++) px(o, 22 + i * 48 + (j % 3) * 10, 182 + Math.floor(j / 3) * 22, 6, 12, '#f3cf5a'); }
      px(o, 6, 248, W - 16, 52, '#3a0f0f'); px(o, 6, 248, W - 16, 3, '#c9a227'); for (let i = 0; i < 8; i++) px(o, 20 + i * 28, 262, 14, 18, '#f3cf5a'); any = true;
    } else if (it === 'pharmacy') {
      px(o, 6, 150, W - 16, 150, '#e9f2ee'); px(o, 6, 150, W - 16, 4, '#1f8a4c');
      for (let r = 0; r < 3; r++) { px(o, 14, 178 + r * 28, W - 32, 2, '#b9c8c0'); for (let i = 0; i < 16; i++) if (rng.chance(0.8)) px(o, 16 + i * 14, 166 + r * 28, 8, 12, rng.pick(['#ffffff', '#e94e4e', '#4e8de9', '#f0d24e', '#3aa35c'])); }
      px(o, W / 2 - 30, 226, 60, 74, '#bcd6e8'); px(o, W / 2 - 28, 228, 56, 70, '#d9eaf5'); px(o, W / 2 - 1, 226, 2, 74, '#8aa0b4');
      px(o, 18, 160, 28, 8, '#1f8a4c'); px(o, 28, 152, 8, 24, '#1f8a4c'); any = true;
    } else if (it === 'eatery') {
      px(o, 6, 150, W - 16, 150, '#2a2a30'); px(o, 6, 150, W - 16, 4, '#3d3d46');
      px(o, 16, 186, 120, 64, '#c9d2d5'); px(o, 18, 188, 116, 24, '#e6ecef'); for (let i = 0; i < 5; i++) px(o, 24 + i * 22, 192, 16, 16, rng.pick(['#8a8f94', '#b8902a', '#c8541c', '#6a3a2a']));
      px(o, 16, 250, 120, 50, '#3a3a44'); for (let i = 0; i < 3; i++) { px(o, 150 + i * 34, 236, 26, 20, '#d8d8d0'); px(o, 152 + i * 34, 256, 3, 40, '#8d8d8a'); px(o, 172 + i * 34, 256, 3, 40, '#8d8d8a'); px(o, 150 + i * 34, 276, 18, 14, '#2b6fb0'); px(o, 152 + i * 34, 290, 2, 8, '#2b6fb0'); px(o, 164 + i * 34, 290, 2, 8, '#2b6fb0'); }
      any = true;
    }
    if (any) { texturize(O, { amp: 0.08 }); g.drawImage(O, 0, TOP + upperH); }
    if (opt.band === 'store') store247Logos(g, W, TOP + upperH, 150); // stamp the real logo crisp, after the texture pass
    if (opt.awning) { g.save(); g.globalCompositeOperation = 'color'; g.fillStyle = opt.awning; g.fillRect(0, TOP + upperH + 96, W, 54); g.restore(); }
    return c;
  }
  OB.composeFacade = composeFacade;

  function median() { // striped crash barrier head for fork medians
    const c = mk(60, 90), g = c.getContext('2d');
    px(g, 0, 40, 60, 50, '#ffd23f'); for (let y = 40; y < 90; y += 12) px(g, 0, y, 60, 6, '#111');
    px(g, 24, 0, 12, 42, '#7c7f82'); px(g, 18, 0, 24, 14, '#e83030'); px(g, 22, 3, 16, 8, '#ff8080');
    return c;
  }

  // ---------- registry ----------
  // w = world width (road half width = 1800 units ≈ 3.4 m per 1000)
  OB.SPR = {};
  OB.buildSprites = function () {
    const S = OB.SPR;
    const rng = OB.rng(1986);
    const add = (name, img, w, extra) => { S[name] = Object.assign({ img, w, h: w * img.height / img.width, name }, extra || {}); return S[name]; };
    // a frame of the sprite atlas as its own canvas (for sprites that go through the static sprite path)
    const FC = (n) => { const r = OB.FRAMES[n], c = mk(r[2], r[3]); c.getContext('2d').drawImage(IMG.atlas, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]); return c; };
    OB.frameCanvas = FC;
    // vehicles
    add('bike', IMG.bike, 480);
    ['taxi', 'taxi_orange', 'taxi_blue', 'taxi_green'].forEach(n => add(n, IMG[n], 940, { car: true }));
    ['sedan', 'sedan_black', 'sedan_red'].forEach(n => add(n, IMG[n], 880, { car: true }));
    ['green', 'green_yellow', 'green_purple'].forEach(n => add(n, IMG[n], 800, { car: true }));
    add('bus', IMG.bus, 1240, { car: true, oncoming: true });
    add('tuktuk', IMG.tuktuk, 900, { car: true, oncoming: true });
    add('truck', FC('TRUCK'), 1150, { car: true }); add('pickup', FC('PICKUP'), 960, { car: true }); add('pickup_w', FC('PICKUP_W'), 960, { car: true });
    add('songthaew', FC('SONGTHAEW'), 1100, { car: true, oncoming: true });
    // roadside (from reference)
    add('tuktuk_parked', IMG.tuktuk, 900, { solid: true });
    add('spirit', IMG.spirit, 640, { solid: true });
    add('spirit_small', IMG.spirit, 300, { solid: true }); // fits on the river walkway
    add('vendor', IMG.vendor, 640, { solid: true });
    add('yen', IMG.yen, 330, { solid: true });
    add('seven_pole', onPole(sign247(), 240, 1, 6), 1000, { solid: true, thin: 0.25 });
    add('signs_pole', onPole(IMG.signs, 300, 1, 8), 1300, { solid: true, thin: 0.2 });
    add('ckrd_pole', onPole(IMG.ckrd, 190, 1, 5), 900, { solid: true, thin: 0.2 });
    add('thatien_pole', onPole(IMG.thatien, 150, 1, 5), 700, { solid: true, thin: 0.2 });
    add('chedi_far', IMG.chedi, 3200, {});
    // procedural
    const tx = texturize;
    const p = pole(300); add('pole', tx(p.c, { amp: 0.05 }), 520, { solid: true, thin: 0.35, poleTop: { x: p.topX / 40, y: p.topY / 300 } });
    const p2 = pole(300, { noTx: true }); add('pole2', tx(p2.c, { amp: 0.05 }), 520, { solid: true, thin: 0.35, poleTop: { x: p2.topX / 40, y: p2.topY / 300 } });
    add('lamp', tx(lampPost(), { amp: 0.04 }), 600, { solid: true, thin: 0.3 });
    add('pillar', tx(pillar(), { amp: 0.06 }), 640, { solid: true });
    // shophouses: the reference's own facade (rectified) with drawn upper storeys and swappable shop modules
    const AWN = [null, null, null, '#c8322b', '#1f8a4c', '#d99a1c', '#8a1c8c', '#2b6fb0'];
    const INT = ['shutter', 'gold', 'eatery', 'shutter', 'eatery', 'gold', 'shutter']; // the reference interior is only used behind the food cart
    const facades = [], cnFacades = [], backFacades = [];
    for (let i = 0; i < 14; i++) {
      const cart = i % 5 === 0;
      const opt = { cart, floors: rng.chance(0.55) ? 1 : 2, band: cart ? 'sign' : rng.pick(['store', 'sign', 'sign', 'wall', 'store']), interior: cart ? 'keep' : rng.pick(INT), awning: rng.pick(AWN) };
      facades.push({ c: composeFacade(rng, opt), cart });
    }
    const CNTXT = ['ร้านทอง', 'ฮั่วเซ่งเฮง', 'หูฉลาม', 'เป็ดย่าง', 'ตั้งโต๊ะกัง', 'บะหมี่เกี๊ยว', 'ร้านชาจีน', 'เยาวราช'];
    for (let i = 0; i < 8; i++) {
      const opt = { cart: i === 3, floors: rng.chance(0.4) ? 1 : 2, band: 'sign', text: CNTXT[i], signCol: rng.pick([['#c8222a', '#ffe37a'], ['#f2c12e', '#8a1c1c'], ['#c8222a', '#ffffff']]),
        interior: i === 3 ? 'keep' : rng.pick(['gold', 'gold', 'eatery', 'shutter']), awning: rng.pick(['#c8322b', '#c8322b', '#d99a1c', null]) };
      cnFacades.push({ c: composeFacade(rng, opt), cart: i === 3 });
    }
    for (let i = 0; i < 6; i++) {
      const opt = { cart: false, floors: 3, band: rng.pick(['sign', 'wall', 'store']), interior: rng.pick(INT), awning: rng.pick(AWN), wall: rng.pick(FAC_WALLS) };
      backFacades.push({ c: composeFacade(rng, opt), cart: false });
    }
    // Street blocks: three different shophouses side by side on one card. Blocks are much wider than their
    // spacing along the road, so consecutive cards always overlap on screen and the street reads as a solid wall.
    const blockOf = (pool, n, maxCarts) => {
      const chosen = []; let carts = 0, guard = 0;
      while (chosen.length < n && guard++ < 50) { const f = rng.pick(pool); if (chosen.indexOf(f) >= 0) continue; if (f.cart && carts >= maxCarts) continue; if (f.cart) carts++; chosen.push(f); }
      const Hh = Math.max(...chosen.map(f => f.c.height)), c = mk(260 * chosen.length, Hh), g = c.getContext('2d');
      chosen.forEach((f, i) => g.drawImage(f.c, i * 260, Hh - f.c.height));
      return c;
    };
    for (let i = 0; i < 10; i++) add('blk' + i, blockOf(facades, 3, 1), 7200, { solid: true, building: true });
    for (let i = 0; i < 6; i++) add('blkcn' + i, blockOf(cnFacades.concat(facades.slice(1, 6)), 3, 1), 7200, { solid: true, building: true });
    for (let i = 0; i < 4; i++) add('blkb' + i, blockOf(backFacades, 3, 0), 7800, { solid: true, building: true });
    for (let i = 0; i < 8; i++) add('tower' + i, haze(tx(tower(rng), { amp: 0.05, grain: 8 }), 0.16), 2800 + rng.int(1600), { solid: true, building: true });
    for (let i = 0; i < 3; i++) add('towers' + i, IMG['towers' + i], 5200, {}); // distant tower clusters from the reference skyline
    for (let i = 0; i < 4; i++) add('tree' + i, tx(tree(rng, false), { amp: 0.12, outline: 0.5 }), 1500, { solid: true, thin: 0.15 });
    for (let i = 0; i < 3; i++) add('palm' + i, tx(tree(rng, true), { amp: 0.1, outline: 0.5 }), 1300, { solid: true, thin: 0.12 });
    add('wall', tx(templeWall(), { amp: 0.06 }), 3600, { solid: true, building: true });
    for (let i = 0; i < 3; i++) add('boat' + i, tx(boat(rng), { amp: 0.05 }), 1400, {});
    add('chedi', tx(goldenChedi(), { amp: 0.07 }), 1800, { solid: true, building: true });
    add('wat', tx(wat(), { amp: 0.06 }), 3600, { solid: true, building: true });
    add('lantern', lanternSprite(), 80, {});
    add('median_head', median(), 500, {});
    const RWm = (OB.track && OB.track.roadW) || 2000; // banners and gantries span the road whatever its width
    add('banner_start', banner('START', 'OUTRUN BANGKOK · เอาท์รัน กรุงเทพฯ', '#d9262e'), RWm * 2.4, {});
    add('banner_check', banner('CHECK POINT', 'ต่อเวลา · EXTENDED TIME', '#1a56b8'), RWm * 2.4, {});
    add('banner_goal', banner('GOAL', 'ท่าเตียน · วัดโพธิ์ · WAT PHO', '#d9262e'), RWm * 2.4, {});
    OB.makeGantry = (l, r) => { const n = 'gantry_' + l.eng + '_' + r.eng; if (!S[n]) add(n, gantry(l, r), RWm * 2.5, {}); return n; };
  };
})(window.OB);
