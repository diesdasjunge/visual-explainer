#!/usr/bin/env python3
"""Build a self-contained Agent Plugins archive with no symlinks or dependencies."""
import argparse
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
SKILL = ROOT / "plugins" / "visual-explainer"
COMPONENTS = ("SKILL.md", "agents", "commands", "references", "templates", "kit", "plan", "pptx", "video")


def build(output):
    manifest = json.loads((ROOT / "plugin.json").read_text())
    interface = manifest["extensions"]["com.openai"]["interface"]
    if len(interface["shortDescription"]) > 30:
        raise ValueError("Plugin subtitle exceeds 30 characters")
    files = {"plugin.json": ROOT / "plugin.json", "LICENSE": ROOT / "LICENSE"}
    for component in COMPONENTS:
        source = SKILL / component
        for path in sorted(source.rglob("*")) if source.is_dir() else [source]:
            if path.is_symlink():
                raise ValueError(f"Unexpected symlink in skill: {path}")
            if path.is_file():
                files[f"skills/visual-explainer/{path.relative_to(SKILL).as_posix()}"] = path
    for path in sorted((ROOT / "assets").glob("*.svg")):
        files[f"assets/{path.name}"] = path
    for key in ("logo", "logoDark", "composerIcon", "composerIconDark"):
        if interface[key].removeprefix("./") not in files:
            raise ValueError(f"Missing icon: {interface[key]}")
    if output.resolve() in (path.resolve() for path in files.values()):
        raise ValueError("Archive must not overwrite a source file")
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, path in sorted(files.items()):
            entry = zipfile.ZipInfo(name, date_time=(2026, 11, 14, 0, 0, 0))
            entry.external_attr = 0o100644 << 16
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, path.read_bytes())
    with zipfile.ZipFile(output) as archive:
        if archive.testzip():
            raise ValueError("Archive integrity check failed")
        print(f"Built {output.resolve()} ({len(archive.namelist())} files)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", nargs="?", type=Path, default=ROOT / "dist" / "visual-explainer.zip")
    parser.add_argument("--marketplace", action="store_true", help="Also materialize the tracked marketplace package")
    args = parser.parse_args()
    build(args.output)
    if args.marketplace:
        import shutil
        target = ROOT / "marketplace" / "visual-explainer"
        if target.exists():
            shutil.rmtree(target)
        with zipfile.ZipFile(args.output) as archive:
            archive.extractall(target)
        print(f"Materialized {target}")
