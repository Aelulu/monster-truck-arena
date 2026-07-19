# Monster Truck Arena

A Three.js driving sandbox: drive monster trucks around a dirt arena, hit ramps, boost with fire, and throw flips.

## Run it

```sh
cd monster-truck-game
node tools/server.js
```

Then open http://localhost:8123

## Controls

| Keyboard | Xbox controller | Action |
|---|---|---|
| `W`/`S` or `↑`/`↓` | Left stick up/down | Drive / reverse (pitch in air) |
| `A`/`D` or `←`/`→` | Left stick left/right | Steer |
| `Space` | `A` | Jump — press again in the air for a front flip |
| `Shift` | `LT` or `RT` | Boost (fire out the back, works mid-air) |
| `L` | `RB` (or d-pad ←/→) | Switch truck |
| `R` | `Y` | Reset to center |

Controllers connect automatically — press any button after pairing and a
"🎮 controller connected" note appears in the HUD.

## Adding truck models

Drop any `.glb` into `assets/trucks/` and reload — it shows up in the switch
rotation automatically, auto-scaled, grounded, and with wheels auto-detected
so they roll and steer. The model itself is never modified.

For raw Sketchfab downloads (zip/7z/OBJ/glTF), run the converter:

```sh
./tools/ingest.sh ~/Downloads/bigfoot          # → assets/trucks/bigfoot.glb
./tools/ingest.sh ~/Downloads/truck.zip mytruck
```

If a truck faces the wrong way, floats, or its wheels don't animate, add an
override for it in `assets/trucks/trucks.json`:

```json
"bigfoot": {
  "label": "Bigfoot",
  "rotationYDeg": 90,
  "targetLength": 5.5,
  "lift": 0,
  "wheelNodes": ["exact", "node", "names", "here"]
}
```

All fields are optional — unlisted trucks rely on auto-detection.

## Where things live

- `src/main.js` — scene, lights, chase camera, game loop, truck switching
- `src/truck.js` — model loading/normalizing, wheel auto-detect + rigging, arcade physics (tuning in `TUNING`)
- `src/garage.js` — discovers and caches trucks from `assets/trucks/`
- `src/effects.js` — boost flames
- `src/world.js` — arena: ground, ramps, mounds, props (add obstacles here)
- `src/input.js` — keyboard + gamepad handling
- `tools/server.js` — static server + `/api/trucks` listing
- `tools/ingest.sh` — Sketchfab download → game-ready `.glb`
