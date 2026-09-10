// OutRun Bangkok — shared utilities
window.OB = window.OB || {};
(function (OB) {
  'use strict';
  OB.W = 840; OB.H = 472; OB.HORIZON = 272;
  OB.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  OB.lerp = (a, b, t) => a + (b - a) * t;
  OB.easeIn = (a, b, p) => a + (b - a) * Math.pow(p, 2);
  OB.easeOut = (a, b, p) => a + (b - a) * (1 - Math.pow(1 - p, 2));
  OB.easeInOut = (a, b, p) => a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5);
  OB.overlap = (x1, w1, x2, w2, pct) => {
    const half = (pct || 1) / 2;
    const min1 = x1 - w1 * half, max1 = x1 + w1 * half;
    const min2 = x2 - w2 * half, max2 = x2 + w2 * half;
    return !(max1 < min2 || min1 > max2);
  };
  // mulberry32 seeded RNG
  OB.rng = function (seed) {
    let a = seed >>> 0;
    const f = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = (n) => Math.floor(f() * n);
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.range = (a, b) => a + f() * (b - a);
    f.chance = (p) => f() < p;
    return f;
  };
  OB.pad = (n, len) => { let s = String(Math.floor(n)); while (s.length < len) s = '0' + s; return s; };
  OB.makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  // Pixel-font text with outline (used by HUD and titles)
  OB.text = function (ctx, str, x, y, opt) {
    opt = opt || {};
    const size = opt.size || 12, sy = opt.sy || 1, font = opt.font || 'Press Start 2P';
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, sy);
    ctx.font = (opt.weight || '') + ' ' + size + 'px "' + font + '"';
    ctx.textAlign = opt.align || 'left';
    ctx.textBaseline = opt.baseline || 'alphabetic';
    ctx.lineJoin = 'round'; ctx.miterLimit = 2;
    if (opt.outline) { ctx.strokeStyle = opt.outline; ctx.lineWidth = opt.outlineW || 4; ctx.strokeText(str, 0, 0); }
    if (opt.outline2) { ctx.strokeStyle = opt.outline2; ctx.lineWidth = opt.outline2W || 2; ctx.strokeText(str, 0, 0); }
    ctx.fillStyle = opt.fill || '#fff';
    ctx.fillText(str, 0, 0);
    let w = ctx.measureText(str).width;
    ctx.restore();
    return w;
  };
})(window.OB);
