# OutRun Bangkok — Hidden Stage: Ice Run

A pseudo-3D arcade racer in the spirit of OutRun, set on the streets of Bangkok and built to match the
attached reference frame (`reference.png`): a motorbike rider hauling bags of ice along Charoen Krung,
Wat Arun on the skyline, tuk-tuks, pink taxis, tangled power lines, and the HEALTH / ICE / TIME / SCORE HUD.

**Mission:** deliver the ice to Wat Pho before it melts. Time runs out OutRun-style, checkpoints extend it,
and the route forks after every stage.

## Play

* `dist/index.html` — single self-contained file (fonts and sprites inlined). Open it in any browser.
* Or serve the repo root (`python3 -m http.server`) and open `index.html`.

Controls: `← →` steer, `↑` gas, `↓` brake, `Enter`/`Space` start, `M` mute music, `P` pause.
Touch devices get on-screen buttons.

## Route map

```
1  CHAROEN KRUNG (riverside)
      ├─ 2  YAOWARAT (Chinatown, lanterns)      ├─ 2  SATHORN (towers)
      │        ├─ 3 SIAM (skytrain)             │        └─ 3 RATTANAKOSIN (temples)
      │        └─ 3 RATTANAKOSIN                │
      └────────── 4  SANAM LUANG  /  THA TIEN (sunset)  →  GOAL: WAT PHO
```

Three radio stations on the select screen: *Magical Soi Shower*, *Passing River Breeze*, *Splash Songkran*
(procedural chiptune, WebAudio).

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
