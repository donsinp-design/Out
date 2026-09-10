// OutRun Bangkok — WebAudio chiptune + engine + sfx
(function (OB) {
  'use strict';
  const A = {};
  OB.audio = A;
  let ctx = null, master = null, musicBus = null, sfxBus = null, engine = null;
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midi(tok) { // "C#5" -> midi
    const m = /^([A-G])(#|b)?(\d)$/.exec(tok); if (!m) return null;
    let n = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (parseInt(m[3]) + 1) * 12; return n;
  }
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function parse(bars) { // returns array of {step, midi, len}
    const out = []; let step = 0, cur = null;
    bars.forEach(bar => bar.trim().split(/\s+/).forEach(tok => {
      if (tok === '-') { if (cur) cur.len++; }
      else if (tok === '.') { cur = null; }
      else { cur = { step, midi: midi(tok), len: 1 }; out.push(cur); }
      step++;
    }));
    return { notes: out, steps: step };
  }
  const CH = (...t) => t.map(midi);
  A.stations = [
    { name: 'MAGICAL SOI SHOWER', thai: 'เมจิคัล ซอย ชาวเวอร์', bpm: 128, lead: 'square', chords: [CH('C4', 'E4', 'G4', 'B4'), CH('A3', 'C4', 'E4', 'G4'), CH('F3', 'A3', 'C4', 'E4'), CH('G3', 'B3', 'D4', 'F4'), CH('C4', 'E4', 'G4', 'B4'), CH('E3', 'G3', 'B3', 'D4'), CH('F3', 'A3', 'C4', 'E4'), CH('G3', 'B3', 'D4', 'F4')],
      bass: ['C2', 'A1', 'F1', 'G1', 'C2', 'E2', 'F1', 'G1'],
      melody: ['E5 - G5 - A5 - G5 - E5 - - - D5 - C5 -', 'A4 - C5 - D5 - E5 - - - - - G5 - E5 -', 'F5 - - - A5 - G5 - F5 - E5 - D5 - C5 -', 'D5 - - - - - E5 - D5 - B4 - G4 - - -',
        'E5 - G5 - A5 - G5 - E5 - - - G5 - A5 -', 'B5 - - - G5 - E5 - G5 - - - E5 - D5 -', 'C5 - D5 - E5 - F5 - A5 - - - G5 - F5 -', 'G5 - - - - - F5 - D5 - B4 - D5 - - -'],
      drums: 'x.h.s.h.x.h.s.hh', bassPat: [0, 3, 6, 8, 11, 14] },
    { name: 'PASSING RIVER BREEZE', thai: 'สายลมเจ้าพระยา', bpm: 106, lead: 'triangle', chords: [CH('F3', 'A3', 'C4', 'E4'), CH('E3', 'G3', 'B3', 'D4'), CH('D3', 'F3', 'A3', 'C4'), CH('C3', 'E3', 'G3', 'B3'), CH('F3', 'A3', 'C4', 'E4'), CH('E3', 'G3', 'B3', 'D4'), CH('D3', 'F3', 'A3', 'C4'), CH('C3', 'E3', 'G3', 'B3')],
      bass: ['F1', 'E1', 'D1', 'C1', 'F1', 'E1', 'D1', 'C2'],
      melody: ['A4 - - - C5 - - - E5 - - - D5 - C5 -', 'B4 - - - - - - - G4 - - - A4 - B4 -', 'A4 - - - F4 - - - A4 - - - C5 - D5 -', 'E5 - - - - - - - - - - - D5 - C5 -',
        'A4 - - - C5 - - - E5 - - - F5 - E5 -', 'D5 - - - B4 - - - G4 - - - - - - -', 'F4 - - - A4 - - - C5 - - - D5 - E5 -', 'C5 - - - - - - - - - - - - - - -'],
      drums: 'x..hs..hx.h.s..h', bassPat: [0, 6, 8, 14] },
    { name: 'SPLASH SONGKRAN', thai: 'สแปลช สงกรานต์', bpm: 144, lead: 'square', chords: [CH('A3', 'C4', 'E4'), CH('A3', 'C4', 'E4'), CH('F3', 'A3', 'C4'), CH('G3', 'B3', 'D4'), CH('A3', 'C4', 'E4'), CH('C4', 'E4', 'G4'), CH('F3', 'A3', 'C4'), CH('E3', 'G#3', 'B3')],
      bass: ['A1', 'A1', 'F1', 'G1', 'A1', 'C2', 'F1', 'E1'],
      melody: ['A4 - C5 - D5 - E5 - G5 - E5 - D5 - C5 -', 'A4 - - - E5 - - - D5 - C5 - A4 - - -', 'C5 - D5 - F5 - - - E5 - D5 - C5 - A4 -', 'G4 - - - B4 - D5 - G5 - - - D5 - B4 -',
        'A4 - C5 - D5 - E5 - G5 - A5 - G5 - E5 -', 'G5 - - - E5 - C5 - E5 - G5 - C6 - - -', 'A5 - G5 - F5 - E5 - D5 - C5 - D5 - E5 -', 'E5 - - - - - B4 - E5 - - - - - - -'],
      drums: 'x.hhs.h.x.hxs.hh', bassPat: [0, 2, 3, 6, 8, 10, 11, 14] }
  ];
  A.stations.forEach(s => { s.seq = parse(s.melody); });

  let noiseBuf = null;
  function noise() {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; return s;
  }
  A.ready = () => !!ctx;
  A.init = function () {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.8; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
    // engine
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; lp.type = 'lowpass'; lp.frequency.value = 500; g.gain.value = 0;
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(sfxBus); o1.start(); o2.start();
    const rn = noise(); rn.loop = true; const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 220; const rg = ctx.createGain(); rg.gain.value = 0;
    rn.connect(rf); rf.connect(rg); rg.connect(sfxBus); rn.start();
    engine = { o1, o2, lp, g, rg };
  };
  A.setEngine = function (pct, throttle, offroad, on) {
    if (!engine) return;
    const t = ctx.currentTime;
    const f = on ? (42 + 150 * pct + (throttle ? 12 : 0)) : 0.001;
    engine.o1.frequency.setTargetAtTime(f, t, 0.05); engine.o2.frequency.setTargetAtTime(f / 2, t, 0.05);
    engine.lp.frequency.setTargetAtTime(300 + 1400 * pct, t, 0.1);
    engine.g.gain.setTargetAtTime(on ? (0.018 + 0.05 * pct + (throttle ? 0.012 : 0)) : 0, t, 0.1);
    engine.rg.gain.setTargetAtTime(on && offroad ? 0.12 * Math.min(1, pct * 2) : 0, t, 0.05);
  };
  A.setMusicVolume = (v) => { if (musicBus) musicBus.gain.setTargetAtTime(v, ctx.currentTime, 0.2); };

  function tone(type, freq, t0, dur, vol, bus, opts) {
    opts = opts || {};
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(opts.slide, t0 + dur);
    if (opts.detune) o.detune.value = opts.detune;
    const a = opts.attack || 0.005, r = opts.release || 0.05;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + a);
    g.gain.setValueAtTime(vol, Math.max(t0 + a, t0 + dur - r)); g.gain.linearRampToValueAtTime(0, t0 + dur);
    let node = o; if (opts.filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.filter; o.connect(f); node = f; }
    node.connect(g); g.connect(bus || sfxBus); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function hit(t0, dur, vol, filt, freq, q) {
    const n = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = filt; f.frequency.value = freq; if (q) f.Q.value = q;
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    n.connect(f); f.connect(g); g.connect(musicBus); n.start(t0); n.stop(t0 + dur + 0.02);
  }
  A.sfx = function (name) {
    if (!ctx) return; const t = ctx.currentTime;
    switch (name) {
      case 'crash': { const n = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(200, t + 0.5);
        g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.55); n.connect(f); f.connect(g); g.connect(sfxBus); n.start(t); n.stop(t + 0.6);
        tone('sine', 110, t, 0.35, 0.5, sfxBus, { slide: 30 }); break; }
      case 'bump': { const n = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'lowpass'; f.frequency.value = 400; g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15); n.connect(f); f.connect(g); g.connect(sfxBus); n.start(t); n.stop(t + 0.2); break; }
      case 'horn': tone('square', 415, t, 0.35, 0.08, sfxBus); tone('square', 350, t, 0.35, 0.08, sfxBus); break;
      case 'beep': tone('square', 880, t, 0.12, 0.12, sfxBus); break;
      case 'go': tone('square', 1760, t, 0.5, 0.12, sfxBus); tone('square', 1320, t, 0.5, 0.06, sfxBus); break;
      case 'check': [0, 4, 7, 12, 16].forEach((n, i) => tone('square', hz(72 + n), t + i * 0.08, 0.18, 0.1, sfxBus)); break;
      case 'select': tone('square', 660, t, 0.06, 0.1, sfxBus); tone('square', 990, t + 0.06, 0.08, 0.1, sfxBus); break;
      case 'fork': tone('triangle', 523, t, 0.15, 0.15, sfxBus); tone('triangle', 784, t + 0.15, 0.3, 0.15, sfxBus); break;
      case 'melt': tone('sine', 300, t, 0.2, 0.15, sfxBus, { slide: 120 }); break;
      case 'over': [60, 56, 53, 48].forEach((n, i) => tone('square', hz(n), t + i * 0.28, 0.3, 0.12, sfxBus)); break;
      case 'goal': [67, 72, 76, 79, 84, 79, 84, 91].forEach((n, i) => tone('square', hz(n), t + i * 0.11, 0.22, 0.1, sfxBus)); break;
    }
  };

  // ---------- sequencer ----------
  const M = { playing: false, station: 0, step: 0, next: 0, timer: null, gain: 1 };
  A.music = M;
  function scheduleStep(s, step, t) {
    const st = A.stations[s], bar = Math.floor(step / 16) % 8, sub = step % 16, dur = 60 / st.bpm / 4;
    // drums
    const d = st.drums[sub];
    if (d === 'x') { tone('sine', 150, t, 0.13, 0.55, musicBus, { slide: 40, release: 0.08 }); hit(t, 0.05, 0.15, 'lowpass', 800); }
    if (d === 's') { hit(t, 0.16, 0.3, 'bandpass', 1900, 0.8); tone('triangle', 190, t, 0.08, 0.2, musicBus, { slide: 120 }); }
    if (d === 'h' || d === 's' || d === 'x') hit(t, d === 'h' ? 0.05 : 0.03, 0.09, 'highpass', 7500);
    if (sub % 2 === 1 && d !== 'h') hit(t, 0.03, 0.05, 'highpass', 9000);
    // bass
    if (st.bassPat.indexOf(sub) >= 0) {
      const root = midi(st.bass[bar]); const n = (sub === 6 || sub === 14) ? root + 7 : (sub === 11 ? root + 12 : root);
      tone('triangle', hz(n), t, dur * 1.8, 0.28, musicBus, { release: 0.06 }); tone('square', hz(n), t, dur * 1.2, 0.07, musicBus, { filter: 700, release: 0.05 });
    }
    // chord stabs
    if (sub === 0 || sub === 6 || sub === 10 || (sub === 13 && bar % 2 === 1)) {
      st.chords[bar].forEach((m, i) => tone('sawtooth', hz(m), t, dur * 1.6, 0.03, musicBus, { filter: 1500, detune: i * 4, attack: 0.01, release: 0.08 }));
    }
    // melody
    const total = st.seq.steps; const ms = step % total;
    st.seq.notes.forEach(n => { if (n.step === ms) {
      const len = n.len * dur * 0.92; const f = hz(n.midi);
      tone(st.lead, f, t, len, st.lead === 'square' ? 0.07 : 0.12, musicBus, { detune: -4, attack: 0.01, release: 0.06 });
      tone(st.lead === 'square' ? 'square' : 'sine', f * 2, t, len, 0.02, musicBus, { detune: 5, attack: 0.01, release: 0.06 });
    } });
  }
  function tick() {
    if (!M.playing || !ctx) return;
    const st = A.stations[M.station], dur = 60 / st.bpm / 4;
    while (M.next < ctx.currentTime + 0.15) { scheduleStep(M.station, M.step, M.next); M.step++; M.next += dur; }
  }
  A.playMusic = function (station) {
    if (!ctx) return; M.station = station; M.step = 0; M.next = ctx.currentTime + 0.05; M.playing = true;
    if (M.timer) clearInterval(M.timer); M.timer = setInterval(tick, 40);
  };
  A.stopMusic = function () { M.playing = false; if (M.timer) clearInterval(M.timer); M.timer = null; };
})(window.OB);
