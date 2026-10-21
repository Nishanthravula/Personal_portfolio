# nishanthravula.netlify.app

Personal site of Nishanth Ravula: anomaly detection, ML systems and responsible AI.

A single, hand-built page: a blue hero with a live anomaly detector, key results, a grid of
project tiles that open case studies with live demos, an experience timeline, and contact.
Static HTML, CSS and a few small scripts: no frameworks, no build step.

Case studies have their own links: `/#rstad`, `/#audit`, `/#guard`, `/#serve`, `/#agents`.

| Path | What it is |
|---|---|
| `index.html` | The whole site |
| `resume/index.html`, `assets/resume.css` | Résumé page, printable to one Letter page |
| `resume.pdf` | The résumé as a PDF (regenerate by printing `/resume/` to PDF after edits) |
| `llms.txt` | Plain-text profile summary for AI tools |
| `assets/site.css` | Styles, light and dark themes, responsive layout (Bricolage Grotesque and Instrument Sans) |
| `assets/signal.js` | The hero's live seasonal robust z-score anomaly detector |
| `assets/figures.js` | Case-study demos: RSTAD scoring, fairness thresholds, secret redaction, request tracing |
| `assets/site.js` | Theme switch, case-study dialogs, mobile menu, section highlighting, slider fills |
| `assets/theme.js` | Applies the saved theme before first paint |
| `assets/fonts/` | Self-hosted Bricolage Grotesque and Instrument Sans |
| `thanks/`, `404.html` | Contact-form confirmation and not-found pages |
| `netlify.toml` | Security headers, caching and redirects from old URLs |
| `scripts/stamp_assets.py` | Adds content hashes to asset URLs so browsers never use stale files |

After editing anything in `assets/`, run `python3 scripts/stamp_assets.py`.

The contact form uses Netlify Forms (`name="contact"`). Run locally with any static server, for
example `python3 -m http.server`.
