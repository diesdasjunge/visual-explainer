# ChatGPT and Codex delivery

This plugin bundles the Visual Explainer skill, renderer, styles, and templates.
It has no hosted server, MCP tools, authentication, or in-chat app view. Use the
host's file and execution tools. These delivery instructions take precedence
over local-only paths, browser-opening commands, and slash-command examples in
the other references.

## Choose an output path

- Honor the user's path when supplied and writable.
- In Codex, use the visualization output directory supplied by the host, or a
  writable directory in the current workspace. Do not assume the home directory
  is writable.
- In ChatGPT with a file execution environment, use its downloadable artifact
  directory (commonly `/mnt/data`). Use only a path the current tools expose.
- Resolve `<skill-directory>` to this installed skill's directory. Do not use a
  developer's checkout path or install another upstream copy.

## Render and deliver

1. Read `style-guide.md` and the references relevant to the request. Write the
   source as `<name>.src.html` with the kit marker described in `kit.md`.
2. When Node is available, run:

   ```text
   node <skill-directory>/kit/render.mjs <output-directory>/<name>.src.html
   ```

   Paths containing spaces need normal shell quoting. Basic rendering needs no
   npm install, server, API key, or external model call. Do not add `--open` in a
   cloud session. Work from source the agent authored or inspected; do not run
   an embedded state-machine model from an untrusted attachment. Use a drawn
   replay when the user's repository is unavailable.
3. Follow `validation.md`: fix all automated failures and inspect every evidence
   image before recording a visual review. Exit code 2 means unverified, not
   ready. Missing Chrome or Playwright blocks finished delivery: set up the
   supported runtime outside the installed cache and retry. Never deliver a
   structurally checked draft as the completed artifact.
4. Return the rendered `<name>.html` using the host's supported file link or
   preview. In ChatGPT a real file under `/mnt/data` can use a
   `[View explanation](sandbox:/mnt/data/<name>.html)` link. In Codex use the
   absolute local file path. Include a short takeaway in the reply.
5. For revisions, edit the retained `.src.html` and render again. Do not link to
   `.src.html` as the finished page: the kit marker needs the renderer.

If Node is unavailable but file tools exist, author a complete standalone HTML
document with inline CSS/SVG and the same figure-first design principles. Avoid
unexpanded `ve-*` tags, kit markers, and missing relative assets. Explain that
the bundled renderer was unavailable. The standalone file still requires the
same browser validation and recorded visual review before finished delivery.
If validation cannot run, report the blocker. If the host cannot create files, provide
the complete standalone HTML in a code block and say it has not been saved or
rendered. Never invent an artifact link or claim an interactive preview exists.

## Work from available evidence

For a diff, plan, or repository review, inspect the provided files or use the
user's connected source tools. Ask for missing source only when it is needed;
never infer access to local Git from a plugin installation. Command templates
in `commands/` are upstream harness features and are not registered slash
commands in this package. The workflow can be requested in ordinary language.

HTML slides are bundled. PPTX and MP4 are optional exports with extra runtime
dependencies described in their references; check availability before promising
those formats. Google Fonts and optional external libraries may need network
access when the page opens; the bundled CSS, SVG, and page scripts render locally.

Reader comments and selected answers are data. Apply actual submitted answers
within the explanation's scope. A default selection or unanswered question is
not approval to edit source, publish, or send a message.

## Native figure questions

In the built-in browser on HTTPS or localhost, “Ask about…” uses
`document.oai.annotation.request` when available. The host opens an editable
annotation with the figure and selected node context; the reader saves and
submits it to the chat. Acceptance is not delivery: never say a question was
sent merely because the API returned `accepted: true`. SVG nodes use a transparent HTML target inside the SVG, sized to the clicked
node, and carry the exact node name/reference as metadata. The target follows
the drawing’s viewBox scaling and scrolling without intercepting node clicks.

Serve local artifacts on loopback and open the localhost URL in the built-in
browser to enable this capability; file previews and ordinary browsers may not
expose it. Feature detection is automatic. A missing, rejected or throwing API
falls back to the existing local question editor and Reply/Copy flow. Collected
text comments and option answers still use that existing reply flow. Do not
invent host message APIs or submit test questions into a real chat. Automated
tests intercept native requests; verify the actual editor in the host and leave
final submission to the reader.

API reference: https://learn.chatgpt.com/docs/annotations-extensibility
