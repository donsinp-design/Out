# OutRun Bangkok — Hidden Stage: Ice Run

A pseudo-3D arcade racer in the spirit of OutRun, set on the streets of Bangkok and built to match the
attached reference frame (`reference.png`): a motorbike rider hauling bags of ice along Charoen Krung,
Wat Arun on the skyline, tuk-tuks, pink taxis, tangled power lines, and the HEALTH / ICE / TIME / SCORE HUD.

**Mission:** deliver the ice to Wat Pho before it melts. Time runs out OutRun-style, checkpoints extend it,
and the route forks after every stage.

## Play

* `dist/index.html` — single self-contained file (fonts and sprites inlined). Open it in any browser.
* Or serve the repo root (`python3 -m http.server`) and open `index.html`.

Controls: `← →` steer, `↑` gas, `↓` brake, `Shift` (or a quick double tap of the steering arrow) while turning hard drifts, `Enter`/`Space` start, `M` mute music, `P` pause.
After the music select, a course select lets you start from any of the seven areas (Full Run starts at Charoen Krung). The countdown is three seconds; the controls are shown during it, not on the title screen.
On touch devices there are no buttons: the bike accelerates by itself, a finger left or right of centre steers (further out steers harder), holding a second finger brakes, a quick double tap while steering hard drifts, and menus are tapped.
A drift turns in sharper, resists the curve's push and scrubs speed, with tyre smoke and a rubber trail. Hitting oncoming traffic, a roadside object or the back of a car at speed throws the bike into an OutRun-style barrel roll across the road while the rider is flung off; you lose a couple of seconds and some health, then ride on.

## Route map

```
1  CHAROEN KRUNG (riverside)
      ├─ 2  YAOWARAT (Chinatown, lanterns)      ├─ 2  SATHORN (towers)
      │        ├─ 3 SIAM (skytrain)             │        └─ 3 RATTANAKOSIN (temples)
      │        └─ 3 RATTANAKOSIN                │
      └────────── 4  SANAM LUANG  /  THA TIEN (sunset)  →  GOAL: WAT PHO
```

Three radio stations, all synthesised live in WebAudio in the Thai country-fair style (เพลงบ้านๆ): *Luk Thung Shower*
(sam-cha rhythm, keyboard brass, sung-style lead with เอื้อน slides), *Mor Lam Wave* (lam sing drive, khaen ostinato,
phin riff throughout) *Ramwong Breeze* (hand-drum groove, ching, ranat ek lead) *Soi Trap* (Thai hip hop: half-time trap beat,
sliding 808s, hat rolls, a flipped mor lam phin riff as the hook) and *Sarama Banger* (the Muay Thai ring music
flipped into a heavy boom-bap track: pi chawa oboe line, klong khaek drums, fast ching, ring-bell dings, 808s). Each song has a verse and a hook,
with phin answer-phrases in the gaps between vocal lines. A top-5 best-riders table with OutRun-style name entry is kept in the browser.

## Layout

| Path | What |
| --- | --- |
| `src/util.js` | math helpers, seeded RNG, outlined pixel text |
| `src/assets.js` | image loading + procedural pixel sprites (shophouses, poles, towers, temples, banners) |
| `src/audio.js` | chiptune sequencer, engine sound, sound effects |
| `src/track.js` | segment track builder, stage/route graph, roadside population |
| `src/render.js` | pseudo-3D road renderer, sprites, wires, river, HUD, overlays |
| `src/game.js` | state machine, physics, traffic AI, collisions, input, main loop |
| `assets/` | sprites cut from the reference frame (bike, taxi, tuk-tuk, bus, signs, spirit house…) and the skyline panorama |
| `fonts/` | Press Start 2P (HUD) and Kanit (Thai signage) |
| `build.py` | inlines everything into `dist/index.html` |

## Rebuild

```
python3 build.py
```
