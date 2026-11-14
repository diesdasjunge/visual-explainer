#!/usr/bin/env python3
"""Check the shipped archive, then render with only its extracted files."""
import json
from html.parser import HTMLParser
from pathlib import Path
import stat
import subprocess
import tempfile
import zipfile

from importlib.util import module_from_spec, spec_from_file_location

ROOT = Path(__file__).resolve().parent.parent
spec = spec_from_file_location("builder", ROOT / "scripts/build-chatgpt-plugin.py")
builder = module_from_spec(spec)
spec.loader.exec_module(builder)

SOURCE = '''<!doctype html>
<html lang="en" data-register="blueprint"><head><title>One plugin, portable visuals</title>
<link rel="stylesheet" href="kit.css" data-ve-kit></head>
<body><main><header><p class="eyebrow">Visual Explainer</p>
<h1>One plugin, portable visuals</h1><p class="lead">The skill turns a conversation into a page you can keep.</p></header>
<figure><ve-flow label="Conversation becomes a visual HTML file">
<ve-node id="chat" at="1 1" key>Conversation</ve-node>
<ve-node id="skill" at="2 1">Visual Explainer</ve-node>
<ve-node id="html" at="3 1">HTML file</ve-node>
<ve-edge from="chat" to="skill" label="explains"/>
<ve-edge from="skill" to="html" label="renders"/>
</ve-flow><figcaption>The plugin carries its own renderer and design guides.</figcaption></figure>
<figure><ve-bars unit="ms" max="9" label="Example data: a cache hit takes 1 ms and a miss takes 9 ms">
<ve-bar value="1">hit</ve-bar><ve-bar value="9" hot>miss</ve-bar>
</ve-bars><figcaption>Illustrative values demonstrate the bundled chart renderer.</figcaption></figure>
<figure><pre class="mermaid" aria-label="A request proceeds from the client to the server">graph LR
A[Client] -- requests --> B[Server]
</pre><figcaption>Mermaid becomes inline SVG without a CDN.</figcaption></figure>
</main></body></html>'''


def run(*args, ok=True):
    result = subprocess.run(args, capture_output=True, text=True, timeout=60)
    if ok and result.returncode:
        raise AssertionError(result.stdout + result.stderr)
    return result


class Elements(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.elements = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        self.elements.append((tag, dict(attrs)))


with tempfile.TemporaryDirectory(prefix="visual-explainer-plugin-") as temp:
    temp = Path(temp)
    archive_path = temp / "plugin.zip"
    builder.build(archive_path)
    with zipfile.ZipFile(archive_path) as archive:
        names = archive.namelist()
        assert len(names) == len(set(names)), "Duplicate archive entries"
        for entry in archive.infolist():
            path = Path(entry.filename)
            assert not path.is_absolute() and ".." not in path.parts
            assert not stat.S_ISLNK(entry.external_attr >> 16), "Symlink in archive"
            assert not any(part in {"node_modules", ".git", ".env", ".claude-plugin"} for part in path.parts)
        manifest = json.loads(archive.read("plugin.json"))
        assert manifest["$schema"] == "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
        assert not any(key in manifest for key in ("skills", "mcpServers", "apps", "interface"))
        assert "mcp.json" not in names, "Skills-only package must not attach a local server"
        assert "skills/visual-explainer/agents/openai.yaml" in names
        archive.extractall(temp / "extracted")

    skill = temp / "extracted/skills/visual-explainer"
    source = temp / "demo.src.html"
    source.write_text(SOURCE)
    renderer = str(skill / "kit/render.mjs")
    rendered = run("node", renderer, str(source), "--no-check")
    page = source.with_name("demo.html")
    html = page.read_text()
    elements = Elements(html).elements
    assert not any(tag.startswith("ve-") for tag, _ in elements), "Unexpanded custom tags"
    assert "pele-svg" in html or "pele " in html, "Mermaid was not expanded"
    assert not any(tag == "link" and "data-ve-kit" in attrs for tag, attrs in elements), "Unresolved stylesheet marker"
    assert "<style" in html and "<script" in html and "<svg" in html
    assert "without a caption" not in rendered.stdout
    assert 'name="viewport"' in html
    assert source.read_text() == SOURCE, "Renderer changed source"

    bad = temp / "bad.src.html"
    bad.write_text(SOURCE.replace('value="1"', 'value="-1"'))
    rejected = run("node", renderer, str(bad), "--no-check", ok=False)
    assert rejected.returncode != 0, "Invalid data was accepted"
    assert not bad.with_name("bad.html").exists(), "Invalid page was written"

    # Rebuild from identical source to detect nondeterministic package output.
    second = temp / "second.zip"
    builder.build(second)
    assert archive_path.read_bytes() == second.read_bytes(), "Package is not reproducible"
    print("ChatGPT package check passed: portable archive, extracted renderer, flow, charts, Mermaid, invalid-source rejection, reproducible build")
