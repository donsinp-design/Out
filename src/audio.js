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
    // gaps of 4+ steps after a phrase get a phin answer starting from the phrase's last note
    const answers = [];
    for (let i = 0; i < out.length; i++) { const end = out[i].step + out[i].len, next = i + 1 < out.length ? out[i + 1].step : step, gap = next - end; if (gap >= 4) answers.push({ step: end, len: Math.min(gap, 6), from: out[i].midi }); }
    return { notes: out, steps: step, answers };
  }

  // ---------- songs ----------
  // เพลงบ้านๆ: the Thai country-fair sound.
  //  1) LUK THUNG SHOWER  - luk thung in sam-cha rhythm (kick 1-2-3-4-4&, congas, cowbell), keyboard brass, sung-style lead
  //  2) MOR LAM WAVE      - mor lam sing: driving 2-beat, khaen ostinato, phin riff all the way through
  //  3) RAMWONG BREEZE    - ramwong: relaxed hand-drum groove, ching on the off-beat, ranat ek lead
  // Each station: chords per bar, bass root + pattern, melody A (verse) and B (hook), 16-step kit patterns,
  // ching pattern, brass stab steps, phin riff shape, optional khaen drone, and the pentatonic scale for phin answers.
  A.stations = [
    { name: 'LUK THUNG SHOWER', thai: 'ลูกทุ่ง สามช่า', bpm: 132, lead: 'square', delay: 3, ranatDouble: true, glide: true,
      scale: [7, 9, 11, 14, 16],
      chords: [CH('G3', 'B3', 'D4'), CH('G3', 'B3', 'D4'), CH('C4', 'E4', 'G4'), CH('D4', 'F#4', 'A4', 'C5'), CH('G3', 'B3', 'D4'), CH('E3', 'G3', 'B3'), CH('C4', 'E4', 'G4'), CH('D4', 'F#4', 'A4', 'C5')],
      bass: ['G1', 'G1', 'C2', 'D2', 'G1', 'E1', 'C2', 'D2'], bassPat: 'x..x..5.x...o.5.',
      melody: ['D5 - E5 - G5 - - - E5 - D5 - B4 - - -', 'A4 - B4 - D5 - - - - - B4 - A4 - G4 -', 'E5 - - - G5 - E5 - D5 - B4 - D5 - - -', 'A4 - - - - - - - . . . . . . . .',
        'D5 - E5 - G5 - - - A5 - G5 - E5 - - -', 'B4 - D5 - E5 - - - - - D5 - B4 - A4 -', 'G4 - A4 - B4 - D5 - E5 - D5 - B4 - A4 -', 'G4 - - - - - - - . . . . . . . .'],
      melodyB: ['G5 - - - E5 - G5 - A5 - - - G5 - E5 -', 'D5 - - - E5 - D5 - B4 - - - . . . .', 'E5 - G5 - A5 - - - B5 - A5 - G5 - E5 -', 'D5 - - - - - - - . . . . . . . .',
        'G5 - - - E5 - G5 - A5 - - - B5 - - -', 'A5 - G5 - E5 - D5 - E5 - - - . . . .', 'B4 - D5 - E5 - G5 - A5 - G5 - E5 - D5 -', 'G4 - - - - - - - - - - - . . . .'],
      kick: 'x...x...x...x.x.', snare: '....x.......x...', rim: '..r...r...r.rr..', hat: 'h.h.h.h.h.h.h.h.', shaker: 'sSsSsSsSsSsSsSsS', conga: 'c.C...c.C.c.C.CC', bell: 'b..b..b.b..b..b.', ching: '....o.......c...',
      stabs: [0, 6, 12, 14], riff: [0, 1, 2, 1, 0, 2, 1, 0], drone: null },
    { name: 'MOR LAM WAVE', thai: 'หมอลำซิ่ง', bpm: 160, lead: 'sawtooth', delay: 2, riffAlways: true, glide: true,
      scale: [2, 5, 7, 9, 12],
      chords: [CH('D4', 'F4', 'A4'), CH('D4', 'F4', 'A4'), CH('C4', 'G4', 'C5'), CH('D4', 'F4', 'A4'), CH('D4', 'F4', 'A4'), CH('F3', 'A3', 'C4'), CH('C4', 'G4', 'C5'), CH('D4', 'F4', 'A4')],
      bass: ['D2', 'D2', 'C2', 'D2', 'D2', 'F1', 'C2', 'D2'], bassPat: 'x.5.x.5.x.o.x.5.',
      melody: ['D5 D5 D5 - F5 - D5 - C5 - D5 - - - . .', 'A4 A4 C5 - D5 - C5 - A4 - G4 - A4 - - -', 'D5 - F5 - G5 - A5 - G5 - F5 - D5 - C5 -', 'D5 - - - - - - - . . . . . . . .',
        'A5 - - - G5 - F5 - G5 - A5 - C6 - - -', 'A5 - G5 - F5 - D5 - F5 - - - . . . .', 'C5 - D5 - F5 - G5 - A5 - G5 - F5 - D5 -', 'D5 - - - - - - - . . . . . . . .'],
      melodyB: ['A5 A5 A5 - G5 - A5 - C6 - - - A5 - G5 -', 'F5 - D5 - F5 - G5 - F5 - D5 - C5 - - -', 'D5 D5 F5 F5 G5 - A5 - G5 - F5 - D5 - - -', 'C5 - D5 - - - - - . . . . . . . .',
        'A5 - C6 - D6 - - - C6 - A5 - G5 - - -', 'F5 - G5 - A5 - - - G5 - F5 - D5 - - -', 'F5 - D5 - C5 - D5 - F5 - G5 - A5 - - -', 'D5 - - - - - - - . . . . . . . .'],
      kick: 'x.x.x.x.x.x.x.x.', snare: '..x...x...x...x.', rim: '', hat: 'hhhhhhhhhhhhhhhh', shaker: 'sSsSsSsSsSsSsSsS', conga: 'c...C.c.c...C.CC', bell: 'b...b...b...b...', ching: 'o.c.o.c.o.c.o.c.',
      stabs: [0, 8], riff: [0, 2, 1, 2, 0, 2, 1, 3], drone: CH('D3', 'A3', 'D4') },
    { name: 'RAMWONG BREEZE', thai: 'รำวง เจ้าพระยา', bpm: 116, lead: 'ranat', delay: 3,
      scale: [0, 2, 4, 7, 9],
      chords: [CH('C4', 'E4', 'G4'), CH('A3', 'C4', 'E4'), CH('F3', 'A3', 'C4'), CH('G3', 'B3', 'D4'), CH('C4', 'E4', 'G4'), CH('E3', 'G3', 'B3'), CH('F3', 'A3', 'C4'), CH('G3', 'B3', 'D4')],
      bass: ['C2', 'A1', 'F1', 'G1', 'C2', 'E2', 'F1', 'G1'], bassPat: 'x.....5.x.....5.',
      melody: ['E5 - G5 - A5 - - - G5 - E5 - D5 - C5 -', 'D5 - E5 - D5 - C5 - A4 - - - . . . .', 'C5 - D5 - E5 - G5 - A5 - - - G5 - E5 -', 'G5 - - - - - - - . . . . . . . .',
        'A5 - G5 - E5 - D5 - E5 - G5 - A5 - - -', 'C6 - A5 - G5 - E5 - G5 - - - . . . .', 'E5 - D5 - C5 - D5 - E5 - G5 - E5 - D5 -', 'C5 - - - - - - - . . . . . . . .'],
      melodyB: ['G5 - A5 - C6 - - - A5 - G5 - E5 - - -', 'D5 - E5 - G5 - - - E5 - D5 - C5 - - -', 'A4 - C5 - D5 - E5 - G5 - - - E5 - D5 -', 'E5 - - - - - - - . . . . . . . .',
        'G5 - E5 - D5 - C5 - D5 - E5 - G5 - - -', 'A5 - - - G5 - E5 - D5 - - - . . . .', 'C5 - D5 - E5 - G5 - A5 - G5 - E5 - D5 -', 'C5 - - - - - - - - - - - . . . .'],
      kick: 'x.......x.......', snare: '', rim: '....r.......r...', hat: 'h...h...h...h...', shaker: 's.s.s.s.s.s.s.s.', conga: 'c..C..c.c..C..c.', bell: '', ching: 'o...c...o...c...',
      stabs: [0, 10], riff: [0, 1, 2, 1, 0, 1, 2, 3], drone: null },
    //  4) SOI TRAP - Thai hip hop: half-time trap beat, sliding 808s, hat rolls, a flipped mor lam phin riff as the hook
    { name: 'SOI TRAP', thai: 'ซอยแทร็ป ฮิปฮอปไทย', bpm: 140, lead: 'phinlead', delay: 3, trap: true,
      scale: [4, 7, 9, 11, 14],
      chords: [CH('E3', 'G3', 'B3'), CH('E3', 'G3', 'B3'), CH('C3', 'E3', 'G3'), CH('D3', 'F#3', 'A3'), CH('E3', 'G3', 'B3'), CH('E3', 'G3', 'B3'), CH('C3', 'E3', 'G3'), CH('D3', 'F#3', 'A3')],
      bass: ['E1', 'E1', 'C1', 'D1', 'E1', 'E1', 'C1', 'D1'], bassPat: 'x.....x...x...5.',
      melody: ['E5 - - - G5 - E5 - D5 - - - B4 - - -', '. . . . E5 - G5 - A5 - - - G5 - E5 -', 'D5 - - - E5 - D5 - B4 - - - . . . .', 'A4 - B4 - D5 - - - - - - - . . . .',
        'E5 - - - G5 - E5 - D5 - - - B4 - - -', '. . . . E5 - G5 - A5 - - - B5 - - -', 'A5 - G5 - E5 - D5 - E5 - - - . . . .', 'B4 - - - - - - - . . . . . . . .'],
      melodyB: ['B5 - - - A5 - G5 - E5 - - - G5 - A5 -', 'B5 - A5 - G5 - E5 - D5 - - - . . . .', 'E5 - G5 - A5 - - - B5 - D6 - B5 - A5 -', 'G5 - - - E5 - - - . . . . . . . .',
        'B5 - - - A5 - G5 - E5 - - - G5 - A5 -', 'B5 - D6 - B5 - A5 - G5 - - - . . . .', 'E5 - D5 - B4 - D5 - E5 - G5 - E5 - D5 -', 'E5 - - - - - - - . . . . . . . .'],
      kick: 'x.....x...x...x.', snare: '', clap: '........x.......', rim: '', hat: 'h.h.h.h.h.h.RRh.', hatB: 'h.hhh.h.RRh.hRRR', shaker: '', conga: '', bell: '', ching: '....o.......o...',
      stabs: [], chop: [0, 10], riff: [0, 2, 1, 2, 0, 2, 1, 0], drone: null, droneB: CH('E3', 'B3', 'E4') },
    //  5) SARAMA BANGER - the Muay Thai ring music flipped into a heavy boom-bap banger: pi chawa oboe line with slides
    //     and deep vibrato, klong khaek drums, fast ching, three ring-bell dings at the top of each round, 808s, crowd stabs
    { name: 'SARAMA BANGER', thai: 'สะระหม่า มวยไทย ฮิปฮอป', bpm: 95, lead: 'pichawa', delay: 2, trap: true, glide: true, bell3: true,
      scale: [2, 5, 7, 9, 12],
      chords: [CH('D3', 'F3', 'A3'), CH('D3', 'F3', 'A3'), CH('C3', 'E3', 'G3'), CH('D3', 'F3', 'A3'), CH('D3', 'F3', 'A3'), CH('A#2', 'D3', 'F3'), CH('C3', 'E3', 'G3'), CH('D3', 'F3', 'A3')],
      bass: ['D2', 'D2', 'C2', 'D2', 'D2', 'A#1', 'C2', 'D2'], bassPat: 'x.....x..x....5.',
      melody: ['A4 - - - C5 - A4 - G4 - A4 - - - F4 -', 'G4 - A4 - - - - - F4 - G4 - E4 - D4 -', 'D4 - F4 - G4 - A4 - - - C5 - A4 - G4 -', 'A4 - - - - - - - . . . . . . . .',
        'C5 - - - D5 - C5 - A4 - G4 - A4 - - -', 'F4 - G4 - A4 - - - G4 - F4 - E4 - - -', 'D4 - E4 - F4 - G4 - A4 - G4 - F4 - E4 -', 'D4 - - - - - - - . . . . . . . .'],
      melodyB: ['D5 - - - C5 - D5 - F5 - - - D5 - C5 -', 'A4 - C5 - D5 - - - - - C5 - A4 - G4 -', 'A4 - - - C5 - D5 - F5 - G5 - F5 - D5 -', 'C5 - - - D5 - - - . . . . . . . .',
        'D5 - - - C5 - D5 - F5 - - - G5 - - -', 'F5 - D5 - C5 - A4 - C5 - - - . . . .', 'A4 - G4 - A4 - C5 - D5 - C5 - A4 - G4 -', 'D4 - - - - - - - . . . . . . . .'],
      kick: 'x.....x..x......', snare: '....x.......x...', clap: '....x.......x...', rim: '', hat: 'h.h.h.h.h.h.h.h.', hatB: 'h.hhh.h.h.hhh.RR', shaker: '', conga: 'c..C..c.c..C..C.', bell: '', ching: 'o.c.o.c.o.c.o.c.',
      stabs: [], chop: [4, 12], riff: [0, 1, 2, 1, 0, 2, 1, 0], drone: null, droneB: CH('D3', 'A3', 'D4') }
  ];
  A.stations.forEach(s => {
    s.seq = parse(s.melody); s.seqB = parse(s.melodyB || s.melody);
    s.tones = []; for (let o = 36; o <= 96; o += 12) s.scale.forEach(d => s.tones.push(d + o)); s.tones.sort((a, b) => a - b);
  });

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
    // wind: filtered noise that only really shows up near top speed
    const wn = noise(); wn.loop = true; const whp = ctx.createBiquadFilter(); whp.type = 'highpass'; whp.frequency.value = 400; const wlp = ctx.createBiquadFilter(); wlp.type = 'lowpass'; wlp.frequency.value = 900; const wg = ctx.createGain(); wg.gain.value = 0;
    wn.connect(whp); whp.connect(wlp); wlp.connect(wg); wg.connect(sfxBus); wn.start();
    engine = { o1, o2, lp, g, rg, wg, wlp };
    loadSamples();
  };

  // ---------- recorded samples: horn, dog, cat ----------
  // Real recordings beat anything a pair of square waves can do, so the build inlines them (window.__HORN__ and
  // friends) and each is decoded once into a buffer that every play takes a slice of. `in` skips the leading
  // silence so a play always starts on the attack; `dur` caps how much of the recording one play uses.
  const SAMPLES = {
    horn: { g: '__HORN__', in: 0.055 },   // a pass-by blast: holds ~1.7s then drops away
    bark: { g: '__BARK__', in: 0.02, dur: 0.85 },
    meow: { g: '__MEOW__', in: 0.03, dur: 1.5 },
  };
  function loadSamples() {
    if (!ctx) return;
    for (const key in SAMPLES) {
      const S = SAMPLES[key], uri = window[S.g];
      if (S.buf || S.loading || !uri) continue;
      S.loading = true;
      // Unpack the data URI by hand rather than fetch() it: the artifact host's CSP blocks fetch to anything but a
      // few CDNs, data: included, so a fetch here fails silently and every play falls back to the synth stand-in.
      let bytes;
      try { const bin = atob(uri.slice(uri.indexOf(',') + 1)); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); }
      catch (e) { S.loading = false; continue; }
      // callback form as well as the promise: older iOS Safari only has the former
      new Promise((res, rej) => { const p = ctx.decodeAudioData(bytes.buffer, res, rej); if (p && p.then) p.then(res, rej); })
        .then(buf => { S.buf = buf; }).catch(() => { S.loading = false; }); // a failed decode falls back to the synth
    }
  }
  A.sampleReady = (k) => !!(SAMPLES[k] && SAMPLES[k].buf);   // tests check the recordings really decoded
  A.hornReady = () => A.sampleReady('horn');
  // one play of a decoded sample, gated in and out so it never clicks
  function playSample(key, t, peak, rate, len) {
    const S = SAMPLES[key]; if (!S || !S.buf) return false;
    const room = S.buf.duration - S.in;
    len = Math.min(len === undefined ? (S.dur || room) : len, room / rate);
    const rel = Math.min(0.12, len * 0.35);
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = S.buf; s.playbackRate.value = rate;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.012);
    g.gain.setValueAtTime(Math.max(0.0002, peak), t + Math.max(0.02, len - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);   // fade out rather than cut
    s.connect(g); g.connect(sfxBus);
    s.start(t, S.in, len / rate + 0.02); s.stop(t + len + 0.02);
    return true;
  }
  function playHorn(t, urgency) {
    const u = Math.max(0, Math.min(1, urgency === undefined ? 0.5 : urgency));
    const rate = 0.94 + Math.random() * 0.12;               // no two honks land on exactly the same pitch
    // a warning toot is short, an angry one leans on it
    if (playSample('horn', t, 0.5 + 0.45 * u, rate, (0.2 + 0.55 * u) * rate)) return;
    const len = 0.2 + 0.3 * u;                              // no sample: the old two-tone stand-in
    tone('square', 415, t, len, 0.08, sfxBus); tone('square', 350, t, len, 0.08, sfxBus);
  }
  // A dog barking or a cat calling out as the bike goes past. `near` is 0..1 for how close the pass is, and it
  // drives the level; the pitch wanders a little so the same recording is not obviously the same animal twice.
  function playAnimal(key, t, near) {
    const n = Math.max(0, Math.min(1, near === undefined ? 0.7 : near));
    return playSample(key, t, 0.18 + 0.62 * n, 0.9 + Math.random() * 0.22);
  }
  A.unlock = function () { // call from a real user gesture (touchend / click / keydown)
    A.init(); if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    loadSamples(); // a decode that failed or never ran while the context was still locked gets another go on a real gesture
    try { const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch (e) { }
    try {
      if (!silentEl) { silentEl = document.createElement('audio'); silentEl.setAttribute('playsinline', ''); silentEl.loop = true; silentEl.volume = 0.01; silentEl.src = silentWav(); document.body.appendChild(silentEl); }
      const p = silentEl.play(); if (p && p.catch) p.catch(() => { });
    } catch (e) { }
    // a track whose play() was blocked before the first gesture gets picked up here
    if (TRK.want && TRK.el && TRK.el.paused) { const p = TRK.el.play(); if (p && p.catch) p.catch(() => { }); }
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
    engine.wg.gain.setTargetAtTime(on ? 0.11 * pct * pct * pct : 0, t, 0.15); engine.wlp.frequency.setTargetAtTime(500 + 2600 * pct, t, 0.2);
  };
  A.setMusicVolume = (v) => { if (TRK.el) TRK.el.volume = Math.max(0, Math.min(1, v)); if (musicBus) musicBus.gain.setTargetAtTime(v, ctx.currentTime, 0.2); };

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
  function bass808(t, m, dur) { // sliding sub with a knock and a saturated harmonic so it carries on phone speakers
    const f = hz(m), o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 2.2, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.55, t + 0.006); g.gain.setValueAtTime(0.55, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 0.05);
    tone('triangle', f * 2, t, dur * 0.6, 0.09, musicBus, { attack: 0.005, release: 0.1, filter: 900 });
    hit(t, 0.02, 0.2, 'lowpass', 900);
  }
  function clap(t) { for (let i = 0; i < 3; i++) hit(t + i * 0.011, 0.05, 0.22, 'bandpass', 1500, 0.9); hit(t + 0.03, 0.2, 0.25, 'bandpass', 1300, 0.6); }
  function chop(t, m) { // vocal-chop style stab
    tone('sawtooth', hz(m), t, 0.14, 0.12, musicBus, { filter: 1000, ftype: 'bandpass', q: 5, attack: 0.005, release: 0.05 });
    tone('sawtooth', hz(m) * 1.01, t, 0.14, 0.08, musicBus, { filter: 2400, ftype: 'bandpass', q: 6, attack: 0.005, release: 0.05 });
  }
  function stab(t, notes, dur) { // brass section: two detuned saws per voice with a snappy filter envelope
    notes.forEach((m, i) => { const f = hz(m + 12);
      tone('sawtooth', f, t, dur, 0.038, musicBus, { detune: 6, filter: 3200, filterTo: 900, filterT: dur, attack: 0.006, release: 0.06 });
      tone('sawtooth', f, t, dur, 0.038, musicBus, { detune: -6 - i, filter: 3000, filterTo: 900, filterT: dur, attack: 0.006, release: 0.06 }); });
  }
  function lead(t, m, dur, type, st, from) {
    const f = hz(m);
    if (type === 'ranat') { ranat(t, m, dur); if (dur > 0.3) ranat(t + dur * 0.5, m, dur * 0.5, 0.06); return; }
    if (type === 'phinlead') { phin(t, m); if (dur > 0.2) tone('triangle', f, t, dur, 0.07, musicBus, { attack: 0.02, release: 0.08, send: leadDelay.d }); return; }
    if (type === 'pichawa') { // Muay Thai oboe: nasal reed through a resonant band, always sliding, deep fast vibrato
      const a = tone('sawtooth', f, t, dur, 0.17, musicBus, { filter: 1500, ftype: 'bandpass', q: 2.2, attack: 0.02, release: 0.08, send: leadDelay.d });
      const b = tone('square', f, t, dur, 0.05, musicBus, { detune: 7, filter: 2600, attack: 0.02, release: 0.08 });
      const gt = from && from !== m ? Math.min(0.12, dur * 0.5) : 0.08, f0 = from && from !== m ? hz(from) : f * 0.94;
      [a, b].forEach(o => { o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f, t + gt); });
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 6.5; lg.gain.setValueAtTime(0, t + 0.08); lg.gain.linearRampToValueAtTime(22, t + 0.3);
      lfo.connect(lg); lg.connect(a.detune); lg.connect(b.detune); lfo.start(t); lfo.stop(t + dur + 0.2);
      return;
    }
    const o1 = tone(type, f, t, dur, 0.085, musicBus, { detune: -5, attack: 0.012, release: 0.07, filter: 2600, send: leadDelay.d });
    const o2 = tone(type, f, t, dur, 0.055, musicBus, { detune: 6, attack: 0.012, release: 0.07, filter: 2400, send: leadDelay.d });
    if (from && from !== m) { // เอื้อน: slide in from the previous note
      const gt = Math.min(0.09, dur * 0.4);
      [o1, o2].forEach(o => { o.frequency.setValueAtTime(hz(from), t); o.frequency.exponentialRampToValueAtTime(f, t + gt); });
    } else if (st && st.glide) { [o1, o2].forEach(o => { o.frequency.setValueAtTime(f * 0.965, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05); }); }
    else if (dur > 0.22 && t - 0.045 > ctx.currentTime) tone(type, hz(m - 2), t - 0.045, 0.04, 0.06, musicBus, { attack: 0.004, release: 0.01, filter: 2600 }); // grace note at a phrase start
    if (st && st.ranatDouble) ranat(t, m + 12, dur, 0.05);
    // late vibrato, deeper on held notes (the luk thung wobble)
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.8; lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + 0.12); lg.gain.linearRampToValueAtTime(dur > 0.35 ? 13 : 6, t + 0.32);
    lfo.connect(lg); lg.connect(o1.detune); lg.connect(o2.detune); lfo.start(t); lfo.stop(t + dur + 0.2);
  }
  // Thai band voices: phin (electric Isan lute, slightly overdriven), ranat ek (xylophone), ching (small cymbals), khaen drone
  let shaper = null;
  function phin(t, m) {
    if (!shaper) { shaper = ctx.createWaveShaper(); const n = 256, curve = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); } shaper.curve = curve; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; shaper.connect(lp); lp.connect(musicBus); }
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(hz(m) * 0.985, t); o.frequency.exponentialRampToValueAtTime(hz(m), t + 0.03);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.11, t + 0.003); g.gain.exponentialRampToValueAtTime(0.02, t + 0.18); g.gain.linearRampToValueAtTime(0, t + 0.26);
    o.connect(g); g.connect(shaper); o.start(t); o.stop(t + 0.3);
  }
  function ranat(t, m, dur, vol) {
    const f = hz(m); vol = vol || 0.2;
    tone('triangle', f, t, Math.min(dur, 0.45), vol, musicBus, { attack: 0.002, decay: 0.3, sustain: 0.15, release: 0.08, send: leadDelay.d });
    tone('sine', f * 3.01, t, 0.12, vol * 0.25, musicBus, { attack: 0.001, decay: 0.08, sustain: 0.1, release: 0.03 });
    hit(t, 0.015, vol * 0.5, 'highpass', 3000);
  }
  function ching(t, open) { const d = open ? 0.32 : 0.06; tone('sine', 3150, t, d, 0.05, musicBus, { attack: 0.001, decay: d, sustain: 0.05, release: 0.02 }); tone('sine', 4720, t, d, 0.03, musicBus, { attack: 0.001, decay: d, sustain: 0.05, release: 0.02 }); hit(t, 0.02, 0.05, 'highpass', 6000); }
  function drone(t, notes, dur) { notes.forEach((m, i) => { tone('square', hz(m), t, dur, 0.02, musicBus, { detune: i * 4 - 4, attack: 0.08, release: 0.15, filter: 1100 }); tone('sawtooth', hz(m), t, dur, 0.008, musicBus, { detune: 3, attack: 0.1, release: 0.15, filter: 900 }); }); }

  // ---------- sequencer ----------
  const M = { playing: false, station: 0, step: 0, next: 0, timer: null, last: null };
  A.music = M;
  function chaap(t) { hit(t, 0.45, 0.16, 'bandpass', 4200, 0.7); hit(t, 0.3, 0.08, 'highpass', 7000); }
  function ringBell(t) { tone('sine', 1760, t, 0.7, 0.14, musicBus, { attack: 0.002, decay: 0.6, sustain: 0.05, release: 0.1 }); tone('sine', 2640, t, 0.4, 0.05, musicBus, { attack: 0.002, decay: 0.35, sustain: 0.05, release: 0.05 }); hit(t, 0.02, 0.1, 'highpass', 5000); }
  function below(m, tones) { let b = tones[0]; for (const x of tones) { if (x < m) b = x; else break; } return b; }
  function scheduleStep(st, step, t) {
    const dur = 60 / st.bpm / 4, bar = Math.floor(step / 16) % 16, sub = step % 16, cbar = bar % 8, second = bar >= 8, fill = (cbar === 7);
    const chord = st.chords[cbar], seq = second ? st.seqB : st.seq, ms = step % 128;
    if (sub === 0 && cbar === 0) chaap(t);
    if (st.bell3 && bar === 0 && sub === 0) for (let i = 0; i < 3; i++) ringBell(t + i * 0.27); // ding ding ding: next round
    // kit
    if (st.kick[sub] === 'x') drums.kick(t);
    const sn = fill ? '....x...x.x.xxxx' : st.snare;
    if (sn[sub] === 'x') drums.snare(t, fill && sub > 11 ? 0.7 + (sub - 11) * 0.1 : 1);
    if (st.rim[sub] === 'r' && !fill) drums.rim(t);
    if (st.clap && st.clap[sub] === 'x') clap(t);
    const h = (second && st.hatB ? st.hatB : st.hat)[sub];
    if (h === 'h') drums.hat(t, false); else if (h === 'o') drums.hat(t, true); else if (h === 'R') { drums.hat(t, false); drums.hat(t + dur / 2, false); }
    const sh = st.shaker[sub]; if (sh === 's' || sh === 'S') drums.shaker(t, sh === 'S');
    const cg = st.conga[sub]; if (cg === 'c') drums.conga(t, false); else if (cg === 'C') drums.conga(t, true);
    if (st.bell && st.bell[sub] === 'b') drums.bell(t);
    if (st.ching) { const c = st.ching[sub]; if (c === 'o') ching(t, true); else if (c === 'c') ching(t, false); }
    // bass
    const bp = st.bassPat[sub], root = midi(st.bass[cbar]);
    if (st.trap) { if (bp === 'x') bass808(t, root, dur * 6); else if (bp === '5') bass808(t, root + 7, dur * 3); else if (bp === 'o') bass808(t, root + 12, dur * 3); }
    else { if (bp === 'x') bass(t, root, dur * 1.6); else if (bp === 'o') bass(t, root + 12, dur * 1.2); else if (bp === '5') bass(t, root + 7, dur * 1.2); }
    // keyboard brass + khaen (+ vocal chops and a khaen pad on the hook for the trap station)
    if (st.stabs.indexOf(sub) >= 0) stab(t, chord, dur * 1.5);
    if (st.drone && sub === 0) drone(t, st.drone, dur * 16);
    if (second && st.droneB && sub === 0) drone(t, st.droneB, dur * 16);
    if (second && st.chop && st.chop.indexOf(sub) >= 0) chop(t, chord[0] + 12);
    // phin riff: running 16ths over the chord (all the way through in mor lam, on the hook elsewhere)
    if ((second || st.riffAlways) && sub % 2 === 0) { const idx = st.riff[(sub / 2) % st.riff.length]; const m = chord[idx % chord.length] + 12 * (idx >= chord.length ? 1 : 0) + 12; phin(t, m); }
    // sung-style melody with เอื้อน slides between joined notes
    seq.notes.forEach(n => { if (n.step === ms) { const from = (M.last && n.step - M.last.end <= 1 && n.step - M.last.end >= 0) ? M.last.midi : null; lead(t, n.midi, n.len * dur * 0.92, st.lead, st, from); M.last = { midi: n.midi, end: n.step + n.len }; } });
    // phin answer-phrases in the gaps between vocal lines
    seq.answers.forEach(a => { if (a.step === ms) { const b1 = below(a.from, st.tones), b2 = below(b1, st.tones), b3 = below(b2, st.tones); const run = [a.from, b1, b2, b1, b2, b3];
      for (let i = 0; i < a.len; i++) phin(t + i * dur, run[i] + 12); } });
  }
  function tick() {
    if (!M.playing || !ctx) return;
    const st = A.stations[M.station], dur = 60 / st.bpm / 4;
    while (M.next < ctx.currentTime + 0.18) { scheduleStep(st, M.step, M.next); M.step++; M.next += dur; }
  }
  // ---------- bundled track ----------
  // When the build inlines a song (window.__TRACK__) it plays instead of the synth stations, through the same
  // transport calls and the same music volume. The synth stays as the fallback when no track is bundled.
  const TRK = { el: null, want: false };
  function trackEl() {
    if (TRK.el || !window.__TRACK__) return TRK.el;
    const el = new Audio(); el.src = window.__TRACK__; el.loop = true; el.preload = 'auto';
    el.setAttribute('playsinline', ''); el.volume = A.MUSIC_VOL;
    TRK.el = el; return el;
  }
  A.hasTrack = () => !!window.__TRACK__;
  function trackPlay() {
    const el = trackEl(); if (!el) return false;
    TRK.want = true; const p = el.play(); if (p && p.catch) p.catch(() => {}); // a blocked play retries on the next unlock
    return true;
  }
  A.playMusic = function (station) {
    // the bundled song replaces the stations; keep M.playing true so callers that poll it behave the same
    if (trackPlay()) { M.station = station; M.playing = true; if (M.timer) clearInterval(M.timer); M.timer = null; return; }
    if (!ctx) return; M.station = station; M.step = 0; M.next = ctx.currentTime + 0.06; M.playing = true; M.last = null;
    const st = A.stations[station]; if (leadDelay) leadDelay.d.delayTime.setValueAtTime(60 / st.bpm / 4 * st.delay, ctx.currentTime);
    if (M.timer) clearInterval(M.timer); M.timer = setInterval(tick, 40);
  };
  A.stopMusic = function () {
    TRK.want = false; if (TRK.el) { TRK.el.pause(); try { TRK.el.currentTime = 0; } catch (e) {} }
    M.playing = false; if (M.timer) clearInterval(M.timer); M.timer = null;
  };

  // ---------- sfx ----------
  A.sfx = function (name, arg) {
    if (!ctx) return; const t = ctx.currentTime;
    switch (name) {
      case 'crash': { const n = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(200, t + 0.5);
        g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.55); n.connect(f); f.connect(g); g.connect(sfxBus); n.start(t); n.stop(t + 0.6);
        tone('sine', 110, t, 0.35, 0.5, sfxBus, { slide: 30 }); break; }
      case 'bump': { const n = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'lowpass'; f.frequency.value = 400; g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15); n.connect(f); f.connect(g); g.connect(sfxBus); n.start(t); n.stop(t + 0.2); break; }
      case 'horn': playHorn(t, arg); break;   // arg is urgency 0..1: how long they hold it down
      case 'skid': hit(t, 0.35, 0.16, 'bandpass', 2600, 2.5, sfxBus); break;
      case 'drift': { const n = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'bandpass'; f.Q.value = 3; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(1500, t + 0.5);
        g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.04); g.gain.exponentialRampToValueAtTime(0.001, t + 0.55); n.connect(f); f.connect(g); g.connect(sfxBus); n.start(t); n.stop(t + 0.6); break; }
      case 'flip': { const n = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1800, t + 0.6);
        g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.1); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8); n.connect(f); f.connect(g); g.connect(sfxBus); n.start(t); n.stop(t + 0.85); break; }
      case 'wipe': { for (let i = 0; i < 4; i++) tone('square', 900 - i * 180, t + i * 0.07, 0.08, 0.08, sfxBus, { slide: 400 - i * 60 }); break; }
      case 'name': tone('square', 1200, t, 0.05, 0.08, sfxBus); break;
      case 'whoosh': { const n = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'bandpass'; f.Q.value = 0.9; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(180, t + 0.5);
        g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.06); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5); n.connect(f); f.connect(g); g.connect(sfxBus); n.start(t); n.stop(t + 0.55); break; }
      case 'splash': { const n = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'highpass'; f.frequency.value = 1400; g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28); n.connect(f); f.connect(g); g.connect(sfxBus); n.start(t); n.stop(t + 0.3);
        tone('sine', 320, t, 0.1, 0.12, sfxBus, { slide: 110 }); break; }
      case 'crunch': { const n = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'lowpass'; f.frequency.setValueAtTime(1600, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.3); g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35); n.connect(f); f.connect(g); g.connect(sfxBus); n.start(t); n.stop(t + 0.4);
        tone('square', 95, t, 0.14, 0.14, sfxBus, { slide: 50 }); break; }
      case 'plastic': hit(t, 0.09, 0.28, 'bandpass', 2300, 1.2, sfxBus); tone('square', 640, t, 0.05, 0.06, sfxBus, { slide: 300 }); break;
      case 'box': hit(t, 0.16, 0.3, 'lowpass', 650, 0.8, sfxBus); break;
      case 'clank': tone('square', 1900, t, 0.09, 0.08, sfxBus, { slide: 900 }); tone('triangle', 2500, t + 0.02, 0.12, 0.07, sfxBus); break;
      case 'clunk': hit(t, 0.12, 0.35, 'lowpass', 260, 0.8, sfxBus); tone('sine', 85, t, 0.12, 0.2, sfxBus, { slide: 50 }); break;
      case 'thud': hit(t, 0.2, 0.4, 'lowpass', 190, 0.8, sfxBus); tone('sine', 62, t, 0.2, 0.25, sfxBus, { slide: 35 }); break;
      // arg is 0..1 for how close the animal is; both fall back to the synth stand-in until the mp3 has decoded
      case 'bark': if (!playAnimal('bark', t, arg)) { tone('square', 340, t, 0.07, 0.11, sfxBus, { slide: 230, filter: 1300 }); tone('square', 360, t + 0.11, 0.07, 0.11, sfxBus, { slide: 220, filter: 1300 }); } break;
      case 'meow': if (!playAnimal('meow', t, arg)) { tone('triangle', 700, t, 0.18, 0.09, sfxBus, { slide: 520 }); tone('triangle', 560, t + 0.18, 0.22, 0.07, sfxBus, { slide: 430 }); } break;
      case 'clink': [2600, 3300, 4100].forEach((f, i) => tone('sine', f, t + i * 0.035, 0.06, 0.1, sfxBus)); break;
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
