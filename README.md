# nishanthravula.netlify.app

Personal site of Nishanth Ravula: anomaly detection, ML systems and responsible AI.

A single, hand-built page over an animated background (a slow aurora with drifting data signals
that occasionally spike and get flagged). It reads as numbered chapters: a hero with a live anomaly
detector, 01 About, 02 Experience (a timeline that fills as you scroll), 03 Selected work (cards
that open case studies with live demos), 04 Skills and 05 Contact. Dark by default, with a light theme.
Static HTML, CSS and a few small scripts: no frameworks, no build step.

Case studies have their own links: `/#rstad`, `/#audit`, `/#guard`, `/#serve`, `/#agents`.

| Path | What it is |
|---|---|
| `index.html` | The whole site |
| `resume/index.html`, `assets/resume.css` | Résumé page, printable to one Letter page |
| `resume.pdf` | The résumé as a PDF (regenerate by printing `/resume/` to PDF after edits) |
| `llms.txt` | Plain-text profile summary for AI tools |
| `assets/site.css` | Styles, light and dark themes, responsive layout (Geist and Geist Mono) |
| `assets/signal.js` | The hero's live seasonal robust z-score anomaly detector |
| `assets/figures.js` | Case-study demos: RSTAD scoring, fairness thresholds, secret redaction, request tracing |
| `assets/site.js` | Theme switch, case-study dialogs, mobile menu, section highlighting, slider fills |
| `assets/theme.js` | Applies the saved theme before first paint |
| `assets/fonts/` | Self-hosted Geist and Geist Mono |
| `assets/ambient.js` | The animated page background; pauses when hidden, still frame for reduced motion |
| `assets/icons/` | Technology logos from devicon (MIT) for the skills section |
| `thanks/`, `404.html` | Contact-form confirmation and not-found pages |
| `netlify.toml` | Security headers, caching and redirects from old URLs |
| `scripts/stamp_assets.py` | Adds content hashes to asset URLs so browsers never use stale files |

After editing anything in `assets/`, run `python3 scripts/stamp_assets.py`.

The contact form uses Netlify Forms (`name="contact"`). Run locally with any static server, for
example `python3 -m http.server`.
