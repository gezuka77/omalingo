"""Generate app.js and index.html from the checked-in frontend sources."""

import argparse
import json
from pathlib import Path
import re
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"

MODULES = (
    "parity-shell.js", "parity-vocabulary.js", "sidebar-controls.js",
    "reader-dictionaries.js", "openai-transcription.js", "library-discovery.js",
    "import-wizard.js", "reader-presentation.js", "reader-player.js", "reader-translation.js",
    "playlists-view.js", "adaptive-ui.js", "openrouter-settings.js",
    "connections-view.js", "anki-ui.js", "settings-view.js",
    "transcript-options.js", "video-layout.js", "import-progress.js",
    "focused-ui.js", "approved-layout.js",
)
STYLES = (
    "parity.css", "reader-dictionaries.css", "sidebar-fixes.css",
    "library-discovery.css", "import-wizard.css", "reader-presentation.css",
    "reader-player.css", "playlists-view.css", "adaptive-ui.css",
    "connections-view.css", "settings-view.css", "video-layout.css",
    "reader-responsive.css", "accounts-ui.css", "languages-ui.css",
    "focused-ui.css", "approved-layout.css",
)


def read(path):
    return path.read_text(encoding="utf-8")


def javascript(brand_svg):
    mark = re.sub(r"\s*<(style|title)>.*?</\1>", "", brand_svg, flags=re.DOTALL)
    mark = mark.replace('class="oma-lettermark"', 'class="oma-lettermark" aria-hidden="true" focusable="false"')
    constants = {
        "OMA_BRAND_NAME": "Oma Lingo",
        "OMA_RELEASE_VERSION": read(ROOT / "VERSION").strip(),
        "OMA_SHORT_NAME": "O/L",
        "omaBrandMark": mark,
        "olReadingFox": read(FRONTEND / "ol-reading-fox.svg").strip(),
    }
    brand = "".join(f"const {name}={json.dumps(value)};\n" for name, value in constants.items())
    retired = json.loads(read(ROOT / "retired-source-ids.json"))
    brand += f"const retiredSourceIds=new Set({json.dumps(retired)});\n"

    ui = read(FRONTEND / "ui.js")
    for name in ("render", "library", "openLesson", "reader", "termPanel", "progress",
                 "settings", "reviewCard", "reviewPage", "vocabulary", "backup"):
        ui = ui.replace(f"function {name}(", f"function legacy{name[0].upper()}{name[1:]}(", 1)
    modules = "\n".join(read(FRONTEND / name) for name in MODULES)
    ui = ui.replace("init().catch", modules + "\ninit().catch")
    ui = ui.replace("localStorage.", "accountStorage.")
    ui = ui.replace("fetch(base+", "languageFetch(base+")
    ui = ui.replace("base+r.url", "languageURL(r.url)")
    ui = ui.replace("base+'/media/'+l.media", "languageURL('/media/'+l.media)")
    bootstrap = "\n".join(read(FRONTEND / name) for name in ("languages-ui.js", "accounts-ui.js"))
    ui = ui.replace("init().catch", bootstrap + "\nstartAuthenticatedOma().catch")

    return "\n".join((
        read(ROOT / "core.js"),
        read(FRONTEND / "audio-playback.js"),
        read(FRONTEND / "dictionary-resources.js"),
        read(ROOT / "source-catalog.js"),
        read(FRONTEND / "seed-data.js").removesuffix("\n"),
        brand + ui,
    ))


def html(brand_svg):
    favicon = '<link id="oma-brand-favicon" rel="icon" type="image/svg+xml" href="data:image/svg+xml,'
    favicon += quote(brand_svg, safe="") + '">'
    styles = "\n".join(read(FRONTEND / name) for name in STYLES)
    template = read(FRONTEND / "index.template.html")
    return (template.replace("<!-- frontend favicon -->", favicon)
            .replace("/* frontend styles */", "/* Personal parity stylesheet */\n"
                     + styles + "\n/* End personal parity stylesheet */"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if the bundles need rebuilding.")
    args = parser.parse_args()
    brand_svg = read(FRONTEND / "oma-icon.svg").strip()
    outputs = {"app.js": javascript(brand_svg), "index.html": html(brand_svg)}
    for name, content in outputs.items():
        target = ROOT / name
        if args.check:
            if not target.exists() or read(target) != content:
                parser.exit(1, f"{name} is out of date. Run python scripts/build_frontend.py.\n")
        else:
            target.write_text(content, encoding="utf-8")


if __name__ == "__main__":
    main()
