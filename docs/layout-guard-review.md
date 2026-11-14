# Layout guard integration review

Reviewed 2026-11-14 against the marketplace plugin 0.15.2 and its canonical source in `plugins/visual-explainer/`.

## Required outcome

Visual validation is mandatory before delivery as a finished artifact. Rendering successfully is insufficient. Missing dependencies, an interrupted browser check, or absent visual review must produce an **unverified** result, never a pass. The user explicitly confirmed this requirement during review.

An unverified file can remain available for diagnosis, but must not be presented as the completed deliverable. Attempt supported browser setup or a host browser fallback; if neither works, report the concrete blocker. Do not silently downgrade to source-only validation.

## What failed in the test artifact

Artifact: `upstream-to-installed-plugin.html`, generated in this chat's visualization directory. The earlier visual review identified seven layout problems. This review connects those observations to source behavior; proposed new checks have not yet been implemented or validated.

| Observed problem | Prevention and detection | Gate |
| --- | --- | --- |
| Oversized four-line heading and unused upper-right space | Use a reading-oriented heading scale; inspect first-screen hierarchy and forced line breaks | Required visual review; no universal line-count ban |
| Subtitles escape flow nodes | Fit/wrap node labels; measure actual visible SVG text against its owning node after fonts load | Automated failure |
| Excessive gaps between related figure, caption, badges and section | Explicit figure-group spacing; inspect proximity and rhythm | Required visual review; spacing heuristic advisory |
| Directory tree has no visible nesting | Use a semantic nested list/tree component with depth styling | Component regression plus visual review |
| Adjacent articles start at different heights | Scope prose sibling margins away from grid children; check alignment where the component promises aligned starts | Automated component failure |
| Article labels, headings and body nearly touch | Extend intentional typography spacing to article content; measure adjacent text gaps | Automated collision failure, spacing review |
| Code block squeezes one column | Shrinkable grid tracks/items (`minmax(0, 1fr)`, `min-width: 0`); intentional code scrolling | Automated containment/component sizing checks |

The low-contrast secondary text was an additional design concern, not part of the seven-layout-problem count. Measure contrast before calling it a confirmed contrast violation.

## Existing coverage and holes

- `kit/look.mjs` already checks page overflow, minimum SVG label size, SVG text intersections, some edge crossings, and heading gaps. Extend this rather than replace it wholesale. Whether its existing geometry checks catch the exact overflowing subtitles remains unverified until the fixture runs with a browser.
- Missing Playwright/browser returns `skipped` with empty problems. A catch-all browser failure also discards partial results and returns the same shape. `kit/render.mjs` only fails for nonempty problems, so an unexecuted check exits successfully.
- The CLI permits `--no-check`, and its browser-check branch excludes plans and non-kit output. Every finished HTML output path needs a validation contract; format-specific checks can differ.
- Desktop geometry checks are more extensive than mobile checks. Current widths are 390 and 1280; the observed failure was at an intermediate desktop width. Step states and themes are not checked uniformly across sizes.
- Contact sheets include opening views and later figures, but omit ordinary below-fold article content. Expanded diagram crops are useful supplements, not evidence of actual viewport clipping behavior.
- `references/chatgpt.md` explicitly permits delivery when browser checking is unavailable. `SKILL.md` restricts verification to the renderer's sheet and forbids independent screenshot scripts. These instructions need a consistent mandatory check plus supported fallback policy.
- `kit/flow.mjs` uses fixed 140 × 64 nodes and inserts subtitles without fitting them to node width.
- `kit/kit.css` applies prose sibling margins to arbitrary section children, including a grid's second article. Heading spacing rules target section children and miss article children; shrinkability defaults also omit articles.
- `scripts/check-chatgpt-plugin.py` tests rendering with `--no-check`. It proves packaging/rendering, not layout quality. The archive does not include installed browser dependencies. Upstream-sync CI therefore does not currently establish browser validation readiness.

## What to borrow from Impeccable

Reviewed installed Impeccable 4.8.2 guidance: `SKILL.md`, `references/audit.md`, `references/critique.md`, `references/layout.md`, and `references/operate.md` under `/Users/kiryll/.agents/skills/impeccable/`.

1. Separate mechanical correctness from visual judgment. A detector cannot establish reading order, grouping, hierarchy or appropriate density.
2. Judge this output as a reading surface: prioritize explanatory structure, legible relationships and restrained hierarchy. Do not apply promotional landing-page aesthetics by default.
3. Review narrow, intermediate and wide layouts, long strings, zoom and relevant interaction states. Check the complete page, not just its hero or figures.
4. Give each finding a severity, element, viewport/state and evidence. Verify heuristic findings before requiring repairs; intentional scroll containers and annotation overlaps need explicit handling.
5. Include contrast, focus, keyboard behavior and reduced-motion handling where applicable. Automated checks do not prove full accessibility compliance.

Experiment: Impeccable's **static** `detect --json --scope layout,type` scan returned `[]` for the bad rendered HTML. This was not its browser scan, and it is not evidence that all Impeccable detectors would miss the page. It does establish that adding this static scan alone cannot prevent our observed failure.

Do not import Impeccable's entire workflow, stylistic preferences, updater or project-document prerequisites. Optional integration with its detector can supply extra findings; it must not be a required installation for this plugin. Check licensing before copying implementation. Keep essential guarantees in our own portable validation path.

## Proposed validation contract

Return structured stages: `render`, `browser`, `geometry`, `visualReview`, with `passed`, `failed`, or `unverified`, plus evidence paths and actionable findings. Only all required stages passing allows `ready: true`. Preserve partial findings on errors. Record artifact hash, viewport, theme and state so evidence cannot silently refer to an older file.

- **Hard failures:** rendering/runtime errors, unexpected page overflow, clipped or escaped required labels, unintended text collisions, broken required controls, and failed mandatory checks. Intentional scrolling/overlays need narrow documented exemptions.
- **Mandatory human/agent visual review:** complete rendered page for hierarchy, whitespace, grouping, tree structure and alignment. Passing geometry does not automatically pass this stage. Record the reviewer and inspected evidence; a screenshot's existence is not review.
- **Advisory checks:** heuristic line lengths, heading scale, spacing ratios and stylistic consistency. Require review and disposition, not arbitrary aesthetic bans.

Retain `--no-check` only as an explicit draft/developer operation if needed; it must never report a deliverable as verified. Hosts must consume the same validation result rather than infer readiness from file existence or render exit status alone. Exit codes distinguish failure/unverified from delivery-ready success.

Provide a supported browser runtime outside the immutable installed plugin cache, with pinned compatible dependencies and actionable setup diagnostics. Where a host offers browser inspection, document a fallback that supplies equivalent required geometry and visual evidence. Merely opening the file is insufficient.

## Integration order

### 1. Close the delivery loophole and reproduce this failure

- Update renderer result semantics and ChatGPT/skill instructions together.
- Add the actual failing page as a regression fixture, plus corrected counterpart. Run it with a real browser before deciding which existing detectors to extend.
- Fix node text fitting, grid/prose margin interaction, shrinkable columns and article typography spacing in canonical source.
- Add focused positive/negative fixtures for node subtitles, intentional code scrolling, aligned article grids and missing/crashing browser checks. Ensure intentional valid layouts remain accepted.
- Capture whole-page evidence, including all ordinary content below the fold, at actual viewport widths. Keep expanded figure crops separately labeled.

### 2. Broaden mandatory coverage

- Default widths: narrow 390, intermediate approximately 1067 (the observed failure), and wide 1280. Include breakpoint-adjacent cases for changed responsive components.
- Run geometry for visible step states at applicable sizes; include light/dark when supported. Exercise 200% zoom and reduced motion on affected templates. Use a documented risk-based matrix rather than an uncontrolled full Cartesian product.
- Wait for fonts and layout readiness; capture runtime/resource errors. Test long labels and unavailable fonts.
- Add contrast/keyboard/focus checks for supported interactive components. Distinguish automated results from manual accessibility review.

### 3. Enforce in packaging and upstream integration

- Install a pinned browser runtime in CI and execute meaningful browser fixture tests in packaging and upstream-sync validation.
- Test the extracted marketplace package with the supported runtime, not only the repository checkout. The installed cache must remain read-only.
- Rebuild `marketplace/visual-explainer` from canonical source; never patch generated packaging or installed caches directly.
- Consider an optional Impeccable detector adapter after the core regression suite works. Its output supplements, rather than replaces, mandatory geometry and visual review.

## Acceptance criteria

The known bad fixture is rejected with concrete findings; its corrected counterpart passes; missing or crashed browser validation cannot yield readiness; all content has viewport-accurate visual evidence; required visual review is recorded against the current artifact; and an extracted marketplace package can complete the same pipeline. CI tests guard the machinery, while each newly generated artifact still receives its own mandatory review.

Implementation update: version 0.15.3 now implements the mandatory receipt/review gate, general clipping/text-overlap/node-containment guards, complete-page evidence, multi-width/theme/kit-step checks, and positive/negative regression suites for source and packaged skills. See `plugins/visual-explainer/references/validation.md` for the shipped contract. The original page is not the acceptance fixture. Component redesign, comprehensive accessibility auditing, automatic traversal of non-kit controls, and the optional Impeccable adapter remain outside this implementation. Visual review remains an explicit reviewer attestation, not automated aesthetic judgment.
