# nishanthravula.netlify.app

Personal site of Nishanth Ravula: anomaly detection, ML systems and responsible AI.

Static HTML, CSS and one small script. No build step and no runtime dependencies.

| Path | What it is |
|---|---|
| `index.html` | The whole site |
| `assets/site.css` | Styles, light and dark themes |
| `assets/signal.js` | Figure 1: a live seasonal robust z-score anomaly detector drawn on a canvas |
| `assets/figures.js` | Figures 2 to 5: RSTAD scoring explorer, fairness thresholds, secret redaction, request tracing |
| `assets/game.js` | Spot the anomaly: a 30-second game against the Figure 1 detector |
| `assets/palette.js` | Command palette (Ctrl/Cmd K or `/`) and the theme switch |
| `assets/theme.js` | Applies a saved theme before first paint |
| `assets/fonts/` | Self-hosted Literata and IBM Plex Sans Condensed |
| `thanks/`, `404.html` | Contact-form confirmation and not-found pages |
| `netlify.toml` | Security headers, caching and redirects from the old site |

The contact form uses Netlify Forms (`name="contact"`).

After editing anything in `assets/`, run `python3 scripts/stamp_assets.py` so browsers load the new version instead of a cached one.

Run locally with any static server, for example `python3 -m http.server`.
