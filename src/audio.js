// OutRun Bangkok — WebAudio arcade band (chiptune/FM-flavoured), engine sound and effects
(function (OB) {
  'use strict';
  const A = {};
  OB.audio = A;
  let ctx = null, master = null, musicBus = null, sfxBus = null, engine = null, leadDelay = null, silentEl = null, analyser = null;
  // output level / spectrum (drives the radio display and lets tests confirm sound is being produced)
  A.level = function () { if (!analyser) return 0; const d = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(d); let s = 0; for (let i = 0; i < d.length; i++) { const x = (d[i] - 128) / 128; s += x * x; } return Math.sqrt(s / d.length); };
  A.spectrum = function (n) { const out = new Array(n).fill(0); if (!analyser) return out; const d = new Uint8Array(analyser.frequencyBinCount); analyser.getByteFrequencyData(d); const per = Math.max(1, Math.floor(40 / n)); for (let i = 0; i < n; i++) { let m = 0; for (let j = 0; j < per; j++) m = Math.max(m, d[i * per + j] || 0); out[i] = m / 255; } return out; };
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midi(tok) { const m = /^([A-G])(#|b)?(\d)$/.exec(tok); if (!m) return null; return NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (parseInt(m[3]) + 1) * 12; }
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const CH = (...t) => t.map(midi);
  function parse(bars) { // melody bars of 16 tokens: note | '-' hold | '.' rest
    const out = []; let step = 0, cur = null;
    bars.forEach(bar => bar.trim().split(/\s+/).forEach(tok => {
      if (tok === '-') { if (cur) cur.len++; } else if (tok === '.') { cur = null; } else { cur = { step, midi: midi(tok), len: 1 }; out.push(cur); }
      step++;
    }));
    return { notes: out, steps: step };
  }

  // ---------- songs ----------
  // Retro OutRun feel (latin/city-pop arcade band) with Thai pentatonic melodies, a phin-style plucked riff and a khaen drone.
  A.stations = [
    { name: 'MAGICAL SOI SHOWER', thai: 'เมจิคัล ซอย ชาวเวอร์', bpm: 140, lead: 'square', delay: 3,
      chords: [CH('A3', 'C4', 'E4', 'G4'), CH('A3', 'C4', 'E4', 'G4'), CH('D4', 'F4', 'A4', 'C5'), CH('E4', 'G4', 'B4', 'D5'), CH('A3', 'C4', 'E4', 'G4'), CH('C4', 'E4', 'G4', 'B4'), CH('F3', 'A3', 'C4', 'E4'), CH('E3', 'G#3', 'B3', 'D4')],
      bass: ['A1', 'A1', 'D2', 'E2', 'A1', 'C2', 'F1', 'E1'], bassPat: 'x..x..5.x..x..o.',
      melody: ['E5 - - G5 A5 - G5 E5 - - D5 - E5 - - -', 'C5 - D5 - E5 - - - G5 - E5 - D5 - C5 -', 'A4 - C5 - D5 - E5 - - - D5 - C5 - A4 -', 'G4 - - - B4 - D5 - E5 - - - - - . .',
        'E5 - - G5 A5 - G5 E5 - - D5 - E5 - G5 -', 'A5 - - - G5 - E5 - G5 - A5 - C6 - - -', 'A5 - G5 - E5 - D5 - C5 - D5 - E5 - G5 -', 'E5 - - - - - D5 - B4 - - - . . . .'],
      kick: 'x...x...x...x..x', snare: '....x.......x...', rim: '..r...r...r...r.', hat: 'h.h.h.o.h.h.h.o.', shaker: 'sSsSsSsSsSsSsSsS', conga: '..c.C...c..cC...', bell: 'b...b.b...b...b.',
      stabs: [0, 6, 10], riff: [0, 1, 2, 3, 2, 1, 0, 1], drone: null },
    { name: 'MOR LAM WAVE', thai: 'หมอลำ เวฟ', bpm: 152, lead: 'sawtooth', delay: 2,
      chords: [CH('D4', 'F4', 'A4', 'C5'), CH('D4', 'F4', 'A4', 'C5'), CH('C4', 'E4', 'G4', 'A4'), CH('D4', 'F4', 'A4', 'C5'), CH('D4', 'F4', 'A4', 'C5'), CH('F3', 'A3', 'C4', 'D4'), CH('C4', 'E4', 'G4', 'A4'), CH('D4', 'F4', 'A4', 'C5')],
      bass: ['D2', 'D2', 'C2', 'D2', 'D2', 'F1', 'C2', 'D2'], bassPat: 'x.o.x.5.x.o.x.5.',
      melody: ['D5 - F5 G5 A5 - - - C6 - A5 - G5 - F5 -', 'D5 - - - F5 - D5 - C5 - D5 - - - . .', 'A4 - C5 D5 F5 - D5 - C5 - A4 - G4 - A4 -', 'C5 - - - D5 - - - - - - - . . . .',
        'D5 - F5 G5 A5 - - - C6 - D6 - C6 - A5 -', 'G5 - A5 - F5 - D5 - F5 - G5 - A5 - - -', 'C6 - A5 - G5 - F5 - D5 - F5 - G5 - A5 -', 'D5 - - - - - - - - - - - . . . .'],
      kick: 'x.x.x.x.x.x.x.x.', snare: '....x.......x..x', rim: '..r.....r.r.....', hat: 'hhhhhhhhhhhhhhhh', shaker: 'sSsSsSsSsSsSsSsS', conga: 'c.c...C.c.c...CC', bell: 'b.b.b.b.b.b.b.b.',
      stabs: [0, 3, 8, 11], riff: [0, 2, 1, 3, 0, 2, 1, 3], drone: CH('D3', 'A3', 'D4') },
    { name: 'PASSING RIVER BREEZE', thai: 'สายลมเจ้าพระยา', bpm: 128, lead: 'triangle', delay: 3,
      chords: [CH('C4', 'E4', 'G4', 'B4'), CH('A3', 'C4', 'E4', 'G4'), CH('F3', 'A3', 'C4', 'E4'), CH('G3', 'B3', 'D4', 'E4'), CH('C4', 'E4', 'G4', 'B4'), CH('E3', 'G3', 'B3', 'D4'), CH('F3', 'A3', 'C4', 'E4'), CH('G3', 'B3', 'D4', 'F4')],
      bass: ['C2', 'A1', 'F1', 'G1', 'C2', 'E2', 'F1', 'G1'], bassPat: 'x.....5.x.....5.',
      melody: ['E5 - G5 - A5 - - - G5 - E5 - D5 - - -', 'C5 - D5 - E5 - - - - - G5 - A5 - - -', 'A5 - G5 - E5 - D5 - C5 - - - D5 - E5 -', 'G5 - - - - - E5 - D5 - - - . . . .',
        'E5 - G5 - A5 - - - C6 - A5 - G5 - - -', 'E5 - - - G5 - E5 - D5 - C5 - A4 - - -', 'C5 - D5 - E5 - G5 - A5 - G5 - E5 - D5 -', 'C5 - - - - - - - - - - - . . . .'],
      kick: 'x..x....x..x....', snare: '....x.......x...', rim: '..r..r..r..r..r.', hat: 'h.h.h.h.h.h.h.h.', shaker: 'sSsSsSsSsSsSsSsS', conga: '..c...C...c.c.C.', bell: '',
      stabs: [0, 6, 10], riff: [0, 1, 2, 1, 3, 2, 1, 0], drone: null }
  ];
  A.stations.forEach(s => { s.seq = parse(s.melody); });

  // ---------- context / unlock ----------
  let noiseBuf = null;
  function noise() {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; return s;
  }
  function silentWav() { // 0.5 s of silence; playing it through an <audio> element moves iOS onto the media channel (ring switch no longer mutes WebAudio)
    const n = 4000, buf = new Uint8Array(44 + n), dv = new DataView(buf.buffer);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); };
    str(0, 'RIFF'); dv.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); str(36, 'data'); dv.setUint32(40, n, true);
    for (let i = 0; i < n; i++) buf[44 + i] = 128;
    let b = ''; for (let i = 0; i < buf.length; i++) b += String.fromCharCode(buf[i]);
    return 'data:audio/wav;base64,' + btoa(b);
  }
  A.ready = () => !!ctx;
  A.MUSIC_VOL = 0.58;
  A.init = function () {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);
    analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.6; comp.connect(analyser);
    musicBus = ctx.createGain(); musicBus.gain.value = A.MUSIC_VOL; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
    // tempo delay for the lead (set per song)
    leadDelay = { d: ctx.createDelay(1.0), fb: ctx.createGain(), wet: ctx.createGain() };
    leadDelay.d.delayTime.value = 0.32; leadDelay.fb.gain.value = 0.28; leadDelay.wet.gain.value = 0.22;
    leadDelay.d.connect(leadDelay.fb); leadDelay.fb.connect(leadDelay.d); leadDelay.d.connect(leadDelay.wet); leadDelay.wet.connect(musicBus);
    // engine
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; lp.type = 'lowpass'; lp.frequency.value = 500; g.gain.value = 0;
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(sfxBus); o1.start(); o2.start();
    const rn = noise(); rn.loop = true; const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 220; const rg = ctx.createGain(); rg.gain.value = 0;
    rn.connect(rf); rf.connect(rg); rg.connect(sfxBus); rn.start();
    engine = { o1, o2, lp, g, rg };
  };
  A.unlock = function () { // call from a real user gesture (touchend / click / keydown)
    A.init(); if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    try { const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch (e) { }
    try {
      if (!silentEl) { silentEl = document.createElement('audio'); silentEl.setAttribute('playsinline', ''); silentEl.loop = true; silentEl.volume = 0.01; silentEl.src = silentWav(); document.body.appendChild(silentEl); }
      const p = silentEl.play(); if (p && p.catch) p.catch(() => { });
    } catch (e) { }
  };
  ['touchend', 'pointerup', 'click', 'keydown'].forEach(ev => window.addEventListener(ev, () => A.unlock(), { passive: true }));

  A.setEngine = function (pct, throttle, offroad, on) {
    if (!engine) return;
    const t = ctx.currentTime;
    const f = on ? (42 + 150 * pct + (throttle ? 12 : 0)) : 0.001;
    engine.o1.frequency.setTargetAtTime(f, t, 0.05); engine.o2.frequency.setTargetAtTime(f / 2, t, 0.05);
    engine.lp.frequency.setTargetAtTime(300 + 1400 * pct, t, 0.1);
    engine.g.gain.setTargetAtTime(on ? (0.012 + 0.035 * pct + (throttle ? 0.008 : 0)) : 0, t, 0.1);
    engine.rg.gain.setTargetAtTime(on && offroad ? 0.1 * Math.min(1, pct * 2) : 0, t, 0.05);
  };
  A.setMusicVolume = (v) => { if (musicBus) musicBus.gain.setTargetAtTime(v, ctx.currentTime, 0.2); };

  // ---------- instruments ----------
  function env(g, t0, vol, a, d, s, r, dur) { // ADSR on a gain node
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + a);
    g.gain.linearRampToValueAtTime(vol * s, t0 + a + d);
    const end = Math.max(t0 + a + d, t0 + dur); g.gain.setValueAtTime(vol * s, end); g.gain.linearRampToValueAtTime(0, end + r);
    return end + r + 0.02;
  }
  function tone(type, freq, t0, dur, vol, bus, opts) {
    opts = opts || {};
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(opts.slide, t0 + dur);
    if (opts.detune) o.detune.value = opts.detune;
    const stop = env(g, t0, vol, opts.attack || 0.004, opts.decay || 0.01, opts.sustain === undefined ? 1 : opts.sustain, opts.release || 0.05, dur);
    let node = o;
    if (opts.filter) { const f = ctx.createBiquadFilter(); f.type = opts.ftype || 'lowpass'; f.frequency.setValueAtTime(opts.filter, t0); if (opts.filterTo) f.frequency.exponentialRampToValueAtTime(opts.filterTo, t0 + (opts.filterT || dur)); if (opts.q) f.Q.value = opts.q; o.connect(f); node = f; }
    node.connect(g); g.connect(bus || sfxBus); if (opts.send) g.connect(opts.send);
    o.start(t0); o.stop(stop);
    return o;
  }
  function hit(t0, dur, vol, filt, freq, q, bus) {
    const n = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = filt; f.frequency.value = freq; if (q) f.Q.value = q;
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    n.connect(f); f.connect(g); g.connect(bus || musicBus); n.start(t0); n.stop(t0 + dur + 0.02);
  }
  const drums = {
    kick: (t) => { tone('sine', 165, t, 0.14, 0.9, musicBus, { slide: 42, release: 0.06 }); hit(t, 0.02, 0.25, 'lowpass', 1200); },
    snare: (t, v) => { hit(t, 0.16, (v || 1) * 0.32, 'bandpass', 1900, 0.7); tone('triangle', 200, t, 0.08, (v || 1) * 0.25, musicBus, { slide: 120 }); },
    rim: (t) => { hit(t, 0.03, 0.14, 'highpass', 2800); tone('square', 820, t, 0.025, 0.08, musicBus, { filter: 3000 }); },
    hat: (t, open) => hit(t, open ? 0.14 : 0.035, open ? 0.11 : 0.09, 'highpass', 8000),
    shaker: (t, acc) => hit(t, 0.05, acc ? 0.06 : 0.035, 'bandpass', 6500, 1.2),
    conga: (t, hi) => tone('sine', hi ? 330 : 220, t, 0.13, 0.28, musicBus, { slide: hi ? 280 : 185, release: 0.04 }),
    bell: (t) => { tone('square', 562, t, 0.07, 0.07, musicBus, { filter: 2000, ftype: 'bandpass', q: 3 }); tone('square', 845, t, 0.07, 0.05, musicBus, { filter: 2200, ftype: 'bandpass', q: 3 }); }
  };
  function bass(t, m, dur) {
    tone('square', hz(m), t, dur, 0.16, musicBus, { filter: 1400, filterTo: 500, filterT: 0.12, release: 0.04 });
    tone('triangle', hz(m), t, dur, 0.26, musicBus, { release: 0.04 });
  }
  function stab(t, notes, dur) { // brass section: two detuned saws per voice with a snappy filter envelope
    notes.forEach((m, i) => { const f = hz(m + 12);
      tone('sawtooth', f, t, dur, 0.038, musicBus, { detune: 6, filter: 3200, filterTo: 900, filterT: dur, attack: 0.006, release: 0.06 });
      tone('sawtooth', f, t, dur, 0.038, musicBus, { detune: -6 - i, filter: 3000, filterTo: 900, filterT: dur, attack: 0.006, release: 0.06 }); });
  }
  function lead(t, m, dur, type) {
    const f = hz(m);
    const o = tone(type, f, t, dur, type === 'triangle' ? 0.16 : 0.085, musicBus, { detune: -5, attack: 0.012, release: 0.07, filter: 2600, send: leadDelay.d });
    tone(type === 'triangle' ? 'sine' : type, f, t, dur, type === 'triangle' ? 0.05 : 0.055, musicBus, { detune: 6, attack: 0.012, release: 0.07, filter: 2400, send: leadDelay.d });
    // vibrato after a short delay
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.6; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(7, t + 0.18);
    lfo.connect(lg); lg.connect(o.detune); lfo.start(t); lfo.stop(t + dur + 0.2);
  }
  function pluck(t, m) { tone('sawtooth', hz(m), t, 0.16, 0.06, musicBus, { filter: 3800, filterTo: 600, filterT: 0.14, attack: 0.002, decay: 0.12, sustain: 0.2, release: 0.04 }); }
  function drone(t, notes, dur) { notes.forEach((m, i) => tone('square', hz(m), t, dur, 0.022, musicBus, { detune: i * 4 - 4, attack: 0.08, release: 0.15, filter: 1100 })); }

  // ---------- sequencer ----------
  const M = { playing: false, station: 0, step: 0, next: 0, timer: null };
  A.music = M;
  function scheduleStep(st, step, t) {
    const dur = 60 / st.bpm / 4, bar = Math.floor(step / 16) % 16, sub = step % 16, cbar = bar % 8, second = bar >= 8, fill = (cbar === 7);
    const chord = st.chords[cbar];
    // drums
    if (st.kick[sub] === 'x') drums.kick(t);
    const sn = fill ? '....x...x.x.xxxx' : st.snare;
    if (sn[sub] === 'x') drums.snare(t, fill && sub > 11 ? 0.7 + (sub - 11) * 0.1 : 1);
    if (st.rim[sub] === 'r' && !fill) drums.rim(t);
    const h = st.hat[sub]; if (h === 'h') drums.hat(t, false); else if (h === 'o') drums.hat(t, true);
    const sh = st.shaker[sub]; if (sh === 's' || sh === 'S') drums.shaker(t, sh === 'S');
    const cg = st.conga[sub]; if (cg === 'c') drums.conga(t, false); else if (cg === 'C') drums.conga(t, true);
    if (st.bell && st.bell[sub] === 'b' && second) drums.bell(t);
    // bass
    const bp = st.bassPat[sub], root = midi(st.bass[cbar]);
    if (bp === 'x') bass(t, root, dur * 1.6); else if (bp === 'o') bass(t, root + 12, dur * 1.2); else if (bp === '5') bass(t, root + 7, dur * 1.2);
    // brass stabs + optional khaen drone
    if (st.stabs.indexOf(sub) >= 0) stab(t, chord, dur * 1.5);
    if (st.drone && sub === 0) drone(t, st.drone, dur * 16);
    // phin-style riff on the second pass, quiet, running 16ths
    if (second && sub % 2 === 0) { const idx = st.riff[(sub / 2) % st.riff.length]; const m = chord[idx % chord.length] + 12 * (idx >= chord.length ? 1 : 0) + 12; pluck(t, m); }
    // melody
    const ms = step % st.seq.steps;
    st.seq.notes.forEach(n => { if (n.step === ms) lead(t, n.midi, n.len * dur * 0.9, st.lead); });
  }
  function tick() {
    if (!M.playing || !ctx) return;
    const st = A.stations[M.station], dur = 60 / st.bpm / 4;
    while (M.next < ctx.currentTime + 0.18) { scheduleStep(st, M.step, M.next); M.step++; M.next += dur; }
  }
  A.playMusic = function (station) {
    if (!ctx) return; M.station = station; M.step = 0; M.next = ctx.currentTime + 0.06; M.playing = true;
    const st = A.stations[station]; if (leadDelay) leadDelay.d.delayTime.setValueAtTime(60 / st.bpm / 4 * st.delay, ctx.currentTime);
    if (M.timer) clearInterval(M.timer); M.timer = setInterval(tick, 40);
  };
  A.stopMusic = function () { M.playing = false; if (M.timer) clearInterval(M.timer); M.timer = null; };

  // ---------- sfx ----------
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
})(window.OB);
