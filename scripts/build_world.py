"""Build the home page (the 3D world) from src/world/index.template.html.

The landmark panels reuse the content of classic/index.html, so the writing lives in one place:
edit the classic page, then run this script (npm run build in src/world runs it for you).
"""

import pathlib
import re

from bs4 import BeautifulSoup

ROOT = pathlib.Path(__file__).resolve().parent.parent
classic_html = (ROOT / "classic" / "index.html").read_text()
template = (ROOT / "src" / "world" / "index.template.html").read_text()
soup = BeautifulSoup(classic_html, "html.parser")


def section(zone, *nodes):
    body = "\n".join(str(n) for n in nodes if n is not None)
    return f'        <section data-zone="{zone}" hidden>\n{body}\n        </section>'


def entries(sec_id):
    return soup.select(f"#{sec_id} > article.entry")


def heading(text):
    return BeautifulSoup(f'<h3 class="panel-section">{text}</h3>', "html.parser")


intro = soup.select_one(".intro")
welcome = section(
    "welcome",
    intro.select_one(".deck"),
    intro.select_one(".role"),
    intro.select_one("figure.hero-fig"),
    BeautifulSoup(
        '<p class="panel-tip">Every landmark in this world opens a part of my work. Use <b>Places</b> to jump '
        'anywhere, or <a href="/classic/">read everything on one page</a>.</p>',
        "html.parser",
    ),
)

research = entries("research")
work = entries("work")
experience = entries("experience")
education = entries("education")

arcade = section(
    "arcade",
    BeautifulSoup(
        """
        <div class="arcade-intro">
          <p class="arcade-lede">Anomalies rise out of the arena floor and race for the data core. Stop them before
          the core's integrity hits zero.</p>
          <ul class="arcade-rules">
            <li><b>Ram</b> red anomalies with the probe, or fire a <b>shockwave pulse</b> to hit everything nearby.</li>
            <li><b>Blue points are normal data.</b> Pulse one and it's a false positive: you lose points and your combo.</li>
            <li>Quick kills build a <b>combo multiplier</b> up to five times.</li>
            <li>Every fourth wave brings <b>concept drift</b>, a big anomaly that splits when you hit it.</li>
          </ul>
          <dl class="arcade-controls">
            <div><dt>Keyboard</dt><dd>WASD or arrows to drive, Space to pulse, Shift to boost, Esc to pause</dd></div>
            <div><dt>Mouse</dt><dd>Hold the left button to drive toward the cursor, right-click to pulse</dd></div>
            <div><dt>Touch</dt><dd>Hold anywhere to drive, tap Pulse to fire</dd></div>
          </dl>
          <button type="button" class="primary arcade-start" data-start-arcade>Play Anomaly Hunter</button>
        </div>""",
        "html.parser",
    ),
)

zones = [
    welcome,
    section("rstad", research[0]),
    section("audit", research[1]),
    section("guard", work[0], work[2]),
    section("warehouse", work[1]),
    arcade,
    section(
        "career",
        *experience,
        heading("Education"),
        *education,
        heading("From colleagues"),
        soup.select_one("#said figure.quote"),
    ),
    section("shed", heading("Tools I work with"), soup.select_one("#skills dl"), heading("Earlier projects"), soup.select_one("#earlier ul")),
    section("radio", soup.select_one("#contact .contact")),
]

jsonld = soup.find("script", attrs={"type": "application/ld+json"})
html = template.replace("<!-- ZONES -->", "\n".join(zones)).replace("<!-- JSONLD -->", str(jsonld).strip())
# The classic page's contact heading becomes a sub-heading inside the panel.
html = html.replace('<h2 class="section-title" id="contact-title">Get in touch</h2>', '<h3 class="panel-section" id="contact-title">Get in touch</h3>')
(ROOT / "index.html").write_text(html)
print(f"wrote index.html ({len(html) // 1024} KB, {html.count('data-zone=')} panels)")
