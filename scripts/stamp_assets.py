"""Add a content hash to every /assets/*.css and /assets/*.js URL in the HTML pages.

Run after editing a stylesheet or script:  python3 scripts/stamp_assets.py
Browsers then fetch the new file instead of a cached copy of the old one.
"""
import hashlib
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = [ROOT / "index.html", ROOT / "classic" / "index.html", ROOT / "404.html", ROOT / "thanks" / "index.html"]
REF = re.compile(r'(/assets/[\w.-]+\.(?:css|js))(?:\?v=[0-9a-f]+)?"')


def digest(path: str) -> str:
    return hashlib.sha256((ROOT / path.lstrip("/")).read_bytes()).hexdigest()[:10]


for page in PAGES:
    html = page.read_text()
    stamped = REF.sub(lambda m: f'{m.group(1)}?v={digest(m.group(1))}"', html)
    if stamped != html:
        page.write_text(stamped)
        print(f"stamped {page.relative_to(ROOT)}")
