// OutRun Bangkok — asset loading + procedural pixel sprites
(function (OB) {
  'use strict';
  const FILES = ['bg','bike','portrait','taxi','taxi_orange','taxi_blue','taxi_green','sedan','sedan_black','sedan_red',
    'green','green_yellow','green_purple','bus','tuktuk','seven','signs','ckrd','spirit','thatien','yen','vendor',
    'noodle','storepanel','sangchai','thongbai','redsign','chedi'];
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
    const useImg = opt.sign !== undefined ? opt.sign : (rng.chance(0.4) ? rng.pick(['storepanel', 'sangchai', 'thongbai', 'redsign']) : null);
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
    if (opt.seven) { px(g, 3, ay - 12, W - 12, 12, '#f5f5f2'); px(g, 3, ay - 12, W - 12, 4, '#f47a20'); px(g, 3, ay - 8, W - 12, 4, '#00843d'); px(g, 3, ay - 4, W - 12, 4, '#e4002b'); }
    // AC units on facade
    for (let i = 0; i < rng.int(3); i++) { const x = 20 + rng.int(W - 50), y = 30 + rng.int(Math.max(1, H - 110)); px(g, x, y, 12, 9, '#d0d3d6'); px(g, x + 1, y + 1, 10, 5, '#8d9296'); px(g, x + 3, y + 7, 6, 1, '#6e7276'); }
    return c;
  }

  function tower(rng) {
    const W = 110 + rng.int(60), H = 300 + rng.int(200);
    const c = mk(W, H), g = c.getContext('2d');
    const base = rng.pick(['#6f8fb5', '#8ea7c2', '#5f7d9c', '#a9b7c6', '#7b8ea1', '#9fb5cf']);
    px(g, 0, 0, W, H, base); px(g, W - 8, 0, 8, H, shade(base, 0.7)); px(g, 0, 0, 4, H, shade(base, 1.15));
    const style = rng.int(3), glass = rng.pick(['#2d4a6a', '#1f3a52', '#334e6e']);
    for (let y = 8; y < H - 4; y += 12) {
      for (let x = 6; x < W - 12; x += 10) {
        const lit = rng.chance(0.18);
        px(g, x, y, 7, 8, lit ? '#f4efc2' : (style === 0 ? glass : shade(base, 0.55)));
        px(g, x, y, 7, 1, lit ? '#fff' : shade(glass, 1.6)); px(g, x, y + 8, 7, 1, shade(base, 0.8));
      }
      if (style === 2) px(g, 0, y - 2, W, 2, shade(base, 1.2));
      if (style === 1 && (y / 12) % 6 === 0) px(g, 0, y - 3, W, 3, shade(base, 0.7));
    }
    // crown
    if (rng.chance(0.6)) { px(g, W / 2 - 3, -0, 6, 0, base); }
    px(g, 0, 0, W, 6, shade(base, 1.25));
    if (rng.chance(0.5)) { px(g, W / 2 - 1, 0, 2, 0, '#aaa'); }
    // rooftop
    const c2 = mk(W, H + 30), g2 = c2.getContext('2d');
    g2.drawImage(c, 0, 30);
    if (rng.chance(0.6)) { px(g2, W / 2 - 2, 4, 4, 28, '#8b8f94'); px(g2, W / 2 - 2, 2, 4, 3, '#ff3b3b'); }
    if (rng.chance(0.5)) { px(g2, 12, 16, W * 0.4, 14, shade(base, 0.9)); }
    return c2;
  }

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
    signBoard(g, 40, 0, 230, 70, '← ' + left.thai, left.eng, 'left');
    signBoard(g, W - 270, 0, 230, 70, right.thai + ' →', right.eng, 'right');
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
    const add = (name, img, w, extra) => { S[name] = Object.assign({ img, w, h: w * img.height / img.width }, extra || {}); return S[name]; };
    // vehicles
    add('bike', IMG.bike, 480);
    ['taxi', 'taxi_orange', 'taxi_blue', 'taxi_green'].forEach(n => add(n, IMG[n], 940, { car: true }));
    ['sedan', 'sedan_black', 'sedan_red'].forEach(n => add(n, IMG[n], 880, { car: true }));
    ['green', 'green_yellow', 'green_purple'].forEach(n => add(n, IMG[n], 800, { car: true }));
    add('bus', IMG.bus, 1240, { car: true, oncoming: true });
    add('tuktuk', IMG.tuktuk, 900, { car: true, oncoming: true });
    // roadside (from reference)
    add('tuktuk_parked', IMG.tuktuk, 900, { solid: true });
    add('spirit', IMG.spirit, 640, { solid: true });
    add('vendor', IMG.vendor, 640, { solid: true });
    add('yen', IMG.yen, 330, { solid: true });
    add('seven_pole', onPole(IMG.seven, 240, 1, 6), 1000, { solid: true, thin: 0.25 });
    add('signs_pole', onPole(IMG.signs, 300, 1, 8), 1300, { solid: true, thin: 0.2 });
    add('ckrd_pole', onPole(IMG.ckrd, 190, 1, 5), 900, { solid: true, thin: 0.2 });
    add('thatien_pole', onPole(IMG.thatien, 150, 1, 5), 700, { solid: true, thin: 0.2 });
    add('chedi_far', IMG.chedi, 3200, {});
    // procedural
    const p = pole(300); add('pole', p.c, 520, { solid: true, thin: 0.35, poleTop: { x: p.topX / 40, y: p.topY / 300 } });
    const p2 = pole(300, { noTx: true }); add('pole2', p2.c, 520, { solid: true, thin: 0.35, poleTop: { x: p2.topX / 40, y: p2.topY / 300 } });
    add('lamp', lampPost(), 600, { solid: true, thin: 0.3 });
    add('pillar', pillar(), 640, { solid: true });
    for (let i = 0; i < 10; i++) add('shop' + i, shophouse(rng), 3400, { solid: true, building: true });
    add('shop_seven', shophouse(rng, { floors: 3, color: '#e9e2cf', sign: 'storepanel', seven: true, shop: 0 }), 3400, { solid: true, building: true });
    add('shop_noodle', shophouse(rng, { floors: 2, color: '#d9c9a4', text: 'ก๋วยเตี๋ยวเรือ', shop: 1 }), 3400, { solid: true, building: true });
    for (let i = 0; i < 4; i++) add('shopcn' + i, shophouse(rng, { text: ['ร้านทองเยาวราช', 'หูฉลาม', 'เป็ดย่าง', 'ร้านชาจีน'][i], color: ['#d8b7ac', '#e2cfa0', '#c9c0b0', '#d0a889'][i] }), 3400, { solid: true, building: true });
    for (let i = 0; i < 8; i++) add('tower' + i, tower(rng), 2600 + rng.int(1400), { solid: true, building: true });
    for (let i = 0; i < 4; i++) add('tree' + i, tree(rng, false), 1500, { solid: true, thin: 0.15 });
    for (let i = 0; i < 3; i++) add('palm' + i, tree(rng, true), 1300, { solid: true, thin: 0.12 });
    add('wall', templeWall(), 3600, { solid: true, building: true });
    for (let i = 0; i < 3; i++) add('boat' + i, boat(rng), 1400, {});
    add('chedi', goldenChedi(), 1800, { solid: true, building: true });
    add('wat', wat(), 3600, { solid: true, building: true });
    add('lantern', lanternSprite(), 80, {});
    add('median_head', median(), 500, {});
    add('banner_start', banner('START', 'ถนนเจริญกรุง · CHAROEN KRUNG', '#d9262e'), 4400, {});
    add('banner_check', banner('CHECK POINT', 'ต่อเวลา · EXTENDED TIME', '#1a56b8'), 4400, {});
    add('banner_goal', banner('GOAL', 'ท่าเตียน · วัดโพธิ์ · WAT PHO', '#d9262e'), 4400, {});
    OB.makeGantry = (l, r) => { const n = 'gantry_' + l.eng + '_' + r.eng; if (!S[n]) add(n, gantry(l, r), 4600, {}); return n; };
  };
})(window.OB);
