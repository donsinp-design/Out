# OutRun Bangkok — Hidden Stage: Ice Run

A pseudo-3D arcade racer in the spirit of OutRun, set on the streets of Bangkok and built to match the
attached reference frame (`reference.png`): a motorbike rider hauling bags of ice along Charoen Krung,
Wat Arun on the skyline, tuk-tuks, pink taxis, tangled power lines, and the HEALTH / ICE / TIME / SCORE HUD.

**Mission:** deliver the ice to Wat Pho before it melts. Time runs out OutRun-style, checkpoints extend it,
and the route forks after every stage.

## Play

* `dist/index.html` — single self-contained file (fonts and sprites inlined). Open it in any browser.
* Or serve the repo root (`python3 -m http.server`) and open `index.html`.

Controls: `← →` steer, `↑` gas, `↓` brake, `Shift` (or a quick double tap of the steering arrow) while turning hard drifts, `Enter`/`Space` start, `M` mute music, `P`/`Esc` pause menu (resume, restart, music, full screen, quit), `F` full screen.
After the music select, a course select lets you start from any of the seven areas (Full Run starts at Charoen Krung). The countdown is three seconds; the controls are shown during it, not on the title screen.
On touch devices there are no buttons: the bike accelerates by itself, one finger left or right of centre steers (further out steers harder), a second finger held while turning hard drifts, three fingers brake, the small ▮▮ button top-right opens the pause menu, and menus are tapped. The title screen has a full-screen button (top-right); on iPhone the browser offers no full-screen API, so use landscape or add the page to the home screen.
A drift turns in sharper, resists the curve's push and scrubs speed, with tyre smoke and a rubber trail. Hitting oncoming traffic, a roadside object or the back of a car at speed throws the rider off (the sheet's fall-left / fall-right frames, then the get-up frames): lose control, eject, airborne, ground hit, slide, stop, recover in about two seconds; the ice becomes bags and cubes bouncing down the road.

## The living street (sprite sheet)

`assets/atlas.png` is packed from the ICE MAN sprite sheet (`src/atlas_frames.js` holds every frame's source rectangle; `scratchpad/extract_sheet.py` in the session did the cutting). `src/world.js` drives it:

* Rider: six-frame riding loop (faster at speed), three lean frames each way, accelerate / brake / bump poses. The ice stack is drawn as separate bag rows and halves: they vibrate at speed, shift outward in corners, lift on knocks, compress on hard landings and shrink as the ICE meter drops.
* Pedestrians are pooled state machines (idle → walk → notice → react → jump / run / step → recover → walk) with per-person notice distance, risk radius and delay. Nine characters, each using only its own frames. Monks step aside; the tourist takes photos; a pair may stand talking.
* Dogs sleep, idle and bark, wander, cross the road with a running cycle (and sprint for the nearest kerb when the bike is close), or briefly chase a slow bike. Cats stay roadside and bolt. Monitor lizards are rare, slow and freeze when you pass.
* Destructibles: fruit stalls (idle → hit → wrecked, fruit and crates as separate bouncing debris, the vendor comes out shaking a fist), food carts (pots everywhere), chairs cartwheel, cones spin, boxes burst, signs wobble and fall. Stalls and carts cost a little health and speed; the rest are spectacle.
* Traffic: brake lights when a car slows, indicators (on the side it will move to) with a small drift for 0.7 s before a lane change; trucks, pickups and songthaews join the pool; a bus or truck passing close gives a whoosh, a flinch and a tiny nudge.
* Road: puddles (splash when you drive through), manholes, cracks, leaves that scatter, speed bumps that hop the bike (a hard landing compresses the stack, at speed it spills a cube).
* Ambient: cooking smoke from stalls and carts, exhaust puffs, drips from the shophouse air-cons, a few lit signs that flicker on their own phase.
* Speed: radial streaks from the vanishing point near top speed, a subtle zoom-out, the rider crouches, wind rises; short camera cues for acceleration, corners, landings and crashes.

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
