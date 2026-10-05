"""Build the home page (the car game) from src/world/index.template.html.

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
        '<p class="panel-tip">Each billboard on the road opens a part of my work. Prefer reading? '
        '<a href="/classic/">Everything is on one page</a>.</p>',
        "html.parser",
    ),
)

research = entries("research")
work = entries("work")
experience = entries("experience")
education = entries("education")

zones = [
    welcome,
    section("rstad", research[0]),
    section("audit", research[1]),
    section("guard", work[0], work[2]),
    section("warehouse", work[1]),
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
