# nishanthravula.netlify.app

Personal site of Nishanth Ravula: anomaly detection, ML systems and responsible AI.

A single, hand-built page with live technical figures, a profile panel for recruiters and a
"30-second version" switch that collapses the page to outcomes only. Static HTML, CSS and a few
small scripts: no frameworks, no build step.

Share `https://nishanthravula.netlify.app/?view=skim` to open the 30-second version directly.

| Path | What it is |
|---|---|
| `index.html` | The whole site |
| `resume/index.html`, `assets/resume.css` | Résumé page, printable to one Letter page |
| `resume.pdf` | The résumé as a PDF (regenerate by printing `/resume/` to PDF after edits) |
| `llms.txt` | Plain-text profile summary for AI tools |
| `assets/site.css` | Styles, light and dark themes, responsive layout |
| `assets/signal.js` | Figure 1: a live seasonal robust z-score anomaly detector |
| `assets/figures.js` | Figures 2 to 5: RSTAD scoring, fairness thresholds, secret redaction, request tracing |
| `assets/site.js` | Theme and reading-depth switches, mobile menu, section highlighting, slider fills |
| `assets/theme.js` | Applies the saved theme and reading depth before first paint |
| `assets/fonts/` | Self-hosted Literata and IBM Plex Sans Condensed |
| `thanks/`, `404.html` | Contact-form confirmation and not-found pages |
| `netlify.toml` | Security headers, caching and redirects from old URLs |
| `scripts/stamp_assets.py` | Adds content hashes to asset URLs so browsers never use stale files |

After editing anything in `assets/`, run `python3 scripts/stamp_assets.py`.

The contact form uses Netlify Forms (`name="contact"`). Run locally with any static server, for
example `python3 -m http.server`.
