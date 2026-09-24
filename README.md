# Namma Ooru — ನಮ್ಮ ಊರು

A living 3D map of Bengaluru's startup ecosystem, built on the real city from OpenStreetMap.

## Run it

```bash
python3 tools/serve.py
```

Open http://localhost:8537 (add `?fps` for a frame-rate readout).

## How it's put together

| File | What it holds |
| --- | --- |
| `js/data.js` | Organisations, investors, landmarks, Kannada phrases, Easter eggs. Edit freely. |
| `js/logos.js` + `assets/logos.png` | Logo atlas (96 px cells). Missing logos fall back to brand-coloured monograms. |
| `js/world-data.js` | OSM extract: roads (incl. every residential lane), water, parks, land use, metro, building density & heights, neighbourhood names. |
| `assets/city.bin`, `assets/ground*.webp` | The prebuilt city: every house, tower and tree, plus the painted ground for far views. |
| `js/world.js` | Builds the scene. Houses are placed along the real streets, facing the road. |
| `js/life.js` | Traffic with signals, pedestrians, animals, metro, planes, weather, time of day. |
| `js/ui.js` | Views, search, filters, cards, network graph, ride-along cameras, Easter eggs, adaptive resolution. |

## Rebuilding the data

```bash
bash tools/fetch_osm.sh          # arterials, water, parks, rail, metro
python3 tools/fetch_tiles.py     # residential streets, land use, buildings, place names (tiled)
python3 tools/build_world.py     # → js/world-data.js
python3 tools/fetch_logos.py     # needs Pillow → tools/logos/, then repack assets/logos.png
```

After changing the data or the placement code, rebuild the prebuilt city: run `python3 tools/serve.py` and open
http://localhost:8537/?export once. The page posts `assets/city.bin` and the ground images back to the dev server.

## Performance

- Phones get a lean tier: houses, trees and road geometry are drawn in 3D only near the camera, and are painted into the ground image farther out.
- Traffic and pedestrians are simulated only in a bubble around where you are looking.
- Resolution adapts to hold about 60 fps.
- Real-time shadows are desktop-only.

Map data © OpenStreetMap contributors (ODbL). Logos belong to their owners and are shown for identification.
