# Mandatory layout validation and visual review

A rendered file is a draft until automated browser checks **and** visual review pass. This applies to kit pages, standalone HTML, plans and slides. Never use missing dependencies, `--no-check`, or a successful source lint as permission to deliver unchecked output.

## Runtime

Use the checkout's Playwright installation, or install the pinned runtime in a writable host directory outside the installed plugin cache:

```sh
npm install --prefix /absolute/writable/ve-browser --no-save --ignore-scripts playwright-core@1.63.0
export VE_BROWSER_RUNTIME=/absolute/writable/ve-browser
"$VE_BROWSER_RUNTIME/node_modules/.bin/playwright-core" install chromium
```

Existing Google Chrome is also supported. Never modify the immutable plugin cache. If the host cannot execute a browser, report the blocker; the file remains an unverified draft.

## Workflow

1. Render with `node <skill-directory>/kit/render.mjs page.src.html`. This writes HTML and `page.html.validation.json`. Exit 1 means failed checks; exit 2 means unverified (including successful geometry awaiting visual review). `--no-check` is draft-only and also exits 2. `--lint` is source validation only.
2. For existing standalone HTML, run `node <skill-directory>/kit/validation.mjs inspect page.html`.
3. Fix automated findings in source and rerender. The checks cover page overflow, clipped text, block-text collisions, SVG node containment, existing diagram geometry and heading gaps. They run at 390, 1067 and 1280 pixels, light/dark, and kit stepper states. They are not full accessibility certification or proof of good composition.
4. Inspect **every** evidence image listed in the receipt using the host's image tools. Initial full-page viewport tiles include ordinary content below the fold; subsequent stepper crops retain the actual viewport layout without widening scroll frames; extra diagram crops supplement them. At the actual host pane width, verify that the main transformation is understandable without horizontal scrolling, that every replay step changes a meaningful part of the picture, and that labels remain readable at their displayed size. A page of named boxes is not sufficient evidence of explanation. Judge hierarchy, related-content grouping, spacing, readable labels, tree indentation, balanced columns and relevant states. Do not infer visual quality from the absence of automated findings. For non-kit controls or slide navigation, exercise and inspect their additional states using host browser tools before approving; built-in state traversal only covers kit steppers.
5. Write a review JSON containing `reviewer`, `verdict: "passed"`, the full `inspected` image-path array, and substantive string observations for `hierarchy`, `spacing`, `readability`, `completePage`, and `states`. Record actual observations, never boilerplate or fabricated review. If problems remain, fix them and return to step 1.
6. Run `node <skill-directory>/kit/validation.mjs review page.html review.json`, then `node <skill-directory>/kit/validation.mjs status page.html`. Only status exit 0 means ready. The receipt binds the review to SHA-256 hashes of the HTML and every evidence image. Editing either invalidates readiness; rerendering resets review.
7. Deliver the HTML only after that gate. Keep source and receipt for revisions.

The review record is an agent/reviewer attestation, not an automatic vision model or a security boundary. It prevents accidental omission and stale evidence; reviewers remain responsible for honest inspection. External resources can change independently of the HTML: use inline/bundled assets where practical and revalidate when they change.

## Authoring and exemptions

Use shrinkable grid tracks (`minmax(0, 1fr)`) and `min-width: 0` for items containing long code/URLs. Wrap prose; use intentional `overflow: auto` for code and wide diagrams. Keep prose margins off layout-container children. Labels must fit their owning diagram nodes at actual rendered font metrics; shorten, wrap or change the component rather than shrinking text below its readable minimum.

Intentional HTML text overlays may use `data-ve-overlap-reason="specific explanation"` on the smallest enclosing element. This exempts only text-overlap detection, not clipping, node containment, page overflow or visual review. Do not use it to hide ordinary layout defects. Intentional scroll regions are allowed without an exemption. There is no blanket ban on long headings, asymmetric grids or generous whitespace: evaluate them in context.


## Alignment and capability contracts

Use `data-ve-align="heading divider"` on repeated layouts, `data-ve-align-cell` on each cell, and `data-ve-align-anchor="heading"` / `"divider"` on the matching elements. Side-by-side visible cells with more than half their shorter height overlapping form a visual row (so modest accidental vertical offsets are still detected); each named anchor must exist and its top edges must agree within 2px. Different rows, stacked layouts and undeclared asymmetric layouts are not forced into alignment. This is an explicit structural contract, not a universal aesthetic rule.

Use `data-ve-requires="playback animation ask"` on animated figures and `data-ve-ask-targets="upstream fork installed"` to name required `data-ref` tokens. This preserves intent even if controls or targets are accidentally removed. Existing play controls and selectable nodes are also tested automatically. The browser checks scrubbing, previous/next, real timed play/pause, running animation when declared, selection, question entry, saved context, reply preview, and exact copy/send payload. Interaction screenshots cover the first question and reply per figure at each viewport/theme. All declared targets are exercised. Each target also exercises an intercepted native annotation request, checking its HTML target, node context and absence of duplicate local replies. Acceptance is not proof of submission. Tests intercept native annotations, clipboard and Glimpse delivery in isolated browser pages; they never submit a real question or alter the user's clipboard. This proves the page-side handoff, not receipt by an external agent.

Review both the static overview and interaction evidence. Do not remove capabilities to silence layout failures. For custom controls outside the kit, supply additional interaction tests and inspect their states before approval.

Composition guards reject a figure overlapping its preceding header, even without text-to-text collision. Text overlap checks compare visible portions inside scrollports; offscreen scrollable content is not a collision. Check nested sections and wrapped navigation at narrow widths and enlarged text. Passing these mechanical checks does not establish explanatory or visual quality.
