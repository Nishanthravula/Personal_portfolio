# nishanthravula.netlify.app

Personal site of Nishanth Ravula: anomaly detection, ML systems and responsible AI.

Static HTML, CSS and one small script. No build step and no runtime dependencies.

| Path | What it is |
|---|---|
| `index.html` | The whole site |
| `assets/site.css` | Styles, light and dark themes |
| `assets/signal.js` | Figure 1: a live seasonal robust z-score anomaly detector drawn on a canvas |
| `assets/fonts/` | Self-hosted Literata and IBM Plex Sans Condensed |
| `thanks/`, `404.html` | Contact-form confirmation and not-found pages |
| `netlify.toml` | Security headers, caching and redirects from the old site |

The contact form uses Netlify Forms (`name="contact"`).

Run locally with any static server, for example `python3 -m http.server`.
