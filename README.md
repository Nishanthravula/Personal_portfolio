# nishanthravula.netlify.app

Personal site of Nishanth Ravula: anomaly detection, ML systems and responsible AI.

The home page is a small 3D world you drive through (Three.js and cannon-es). Each landmark opens
the work behind it, and the arcade runs **Anomaly Hunter**. The same content is also available as
a plain page at `/classic/`.

## Layout

| Path | What it is |
|---|---|
| `index.html` | The 3D world. Generated: do not edit by hand |
| `classic/index.html` | The classic page. **Edit content here**; the world's panels are built from it |
| `src/world/` | Source for the world: `main.js`, `scenery.js` (terrain, landmarks, props), `player.js` (probe, input, particles), `arcade.js` (Anomaly Hunter), `ui.js`, `audio.js`, `index.template.html` |
| `assets/world.js` | Bundled world (built from `src/world`) |
| `assets/world.css` | World overlays: intro, panels, HUD, minimap |
| `assets/site.css` | Shared styles and the classic page |
| `assets/signal.js`, `assets/figures.js` | Interactive figures 1 to 5 |
| `assets/palette.js` | Command palette, theme switch, layout behavior |
| `scripts/build_world.py` | Builds `index.html` from the template plus the classic page's content |
| `scripts/stamp_assets.py` | Adds content hashes to asset URLs so browsers never use stale files |

## Building

After changing anything in `src/world/` or `classic/index.html`:

```sh
cd src/world
npm install
npm run build   # bundles assets/world.js, regenerates index.html, stamps asset URLs
```

After editing only CSS or the figure scripts, run `python3 scripts/stamp_assets.py`.

The site itself has no build step on Netlify: everything it serves is committed.
