import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const skill = resolve(process.argv[2] || 'plugins/visual-explainer');
const { interactionChecks } = await import(pathToFileURL(join(skill, 'kit/interaction-guards.mjs')));
const { renderPage, prepareRenderedHtml } = await import(pathToFileURL(join(skill, 'kit/render.mjs')));
const { chromium } = createRequire(process.env.VE_BROWSER_RUNTIME ? resolve(process.env.VE_BROWSER_RUNTIME, 'package.json') : import.meta.url)('playwright-core');
let browser; try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ channel: 'chrome' }); }
const source = `<!doctype html><html><head><link rel="stylesheet" data-ve-kit href="kit.css"></head><body><main><h1>Interaction contract</h1><figure class="ve-steps" data-ve-requires="playback animation ask" data-ve-ask-targets="one two"><ve-flow label="A sends to B"><ve-node id="a" at="1 1" data-ref="one" data-s="0 1">Source</ve-node><ve-node id="b" at="2 1" data-ref="two" data-s="0 2">Target</ve-node><ve-edge from="a" to="b" data-s="2" label="sends"/></ve-flow><div class="ve-player"><ol class="ve-cap"><li>Source prepares</li><li>Target receives</li></ol><button data-go="-1">Previous</button><button data-play>Play</button><input type="range" value="1" min="0" max="1" aria-label="Step"><button data-go="1">Next</button></div><figcaption>Both parts accept questions.</figcaption></figure></main></body></html>`;
const make = (sendBack = false) => prepareRenderedHtml(renderPage(source, { sendBack }).html).replace(/<link[^>]*https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>/g, '');
let count = 0;
try {
  const cases = [
    ['working copy handoff', s => s, null],
    ['working direct handoff', s => s, null, true],
    ['missing play control', s => s.replace('data-play>', 'data-unused>'), 'playback'],
    ['missing target', s => s.replace('data-ref="two"', 'data-ref="other"'), 'required ask target'],
    ['inert play handler', s => s.replace("play?.addEventListener('click'", "play?.addEventListener('unused'"), 'Play does not restart'],
    ['inert timer', s => s.replace('timer = setInterval(', 'timer = (()=>0)('), 'playback'],
    ['missing animation', s => s.replace('</head>', '<style>*{animation:none!important}</style></head>'), 'no running animation'],
    ['missing question handler', s => s.replace('window.veReply?.page();', ''), 'click-to-ask'],
    ['lost context', s => s.replace('where, part: label, text', "where, part: 'wrong target', text"), 'reply lost'],
    ['squeezed mobile note', s => s.replace('playback animation ask', 'ask').replace('data-play>', 'data-unused>').replace('</head>', '<style>.r-row{grid-template-columns:1.5rem minmax(0,1fr) auto!important}.r-row .acts{grid-column:auto!important}</style></head>'), 'reply note column', false, 390],
    ['lost handoff', s => s.replace('await navigator.clipboard.writeText(msg.markdown)', 'await Promise.resolve()'), 'handoff did not preserve'],
  ];
  for (const [name, mutate, expected, sendBack, width = 1067] of cases) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.setContent(mutate(make(sendBack)));
    const result = await interactionChecks(page);
    if (expected) assert(result.problems.some(p => p.includes(expected)), `${name}: ${JSON.stringify(result)}`);
    else assert.deepEqual(result.problems, [], name);
    await page.close(); count++;
  }
  // Native API acceptance is not delivery. Rejections and exceptions keep a usable fallback.
  for (const mode of ['accepted', 'declined', 'throws', 'missing-method', 'truthy-object', 'html-target']) {
    const page = await browser.newPage();
    await page.setContent(make());
    await page.evaluate(mode => {
      window.nativeCalls = [];
      document.oai = { annotation: { request(target, options) {
        window.nativeCalls.push({ tag: target.tagName, options, active: navigator.userActivation.isActive });
        if (mode === 'throws') throw new Error('host unavailable');
        return mode === 'truthy-object' ? {} : { accepted: mode === 'accepted' || mode === 'html-target' };
      } } };
      if (mode === 'missing-method') document.oai.annotation = {};
      if (mode === 'html-target') {
        const card = document.createElement('article'); card.dataset.ref = 'card';
        card.innerHTML = '<h3>HTML card</h3>'; document.querySelector('figure').append(card);
      }
    }, mode);
    await page.locator(mode === 'html-target' ? 'article[data-ref]' : '.ve-n').first().click();
    await page.getByRole('button', { name: /^Ask about / }).click();
    const accepted = mode === 'accepted' || mode === 'html-target';
    assert.equal(await page.locator('.ve-pop').count(), accepted ? 0 : 1, mode);
    assert.equal(await page.locator('.ve-bar').count(), 0, 'opening native annotation must not create a saved reply');
    const calls = await page.evaluate(() => window.nativeCalls);
    if (mode !== 'missing-method') {
      assert.equal(calls.length, 1);
      assert.equal(calls[0].tag, mode === 'html-target' ? 'ARTICLE' : 'FIGURE');
      assert.equal(calls[0].options.metadata.element, mode === 'html-target' ? 'HTML card' : 'Source');
      assert.equal(calls[0].active, true, 'request must remain inside the user gesture');
      assert(calls[0].options.initialComment.length <= 240);
      assert(Object.values(calls[0].options.metadata).every(value => value.length <= 256));
      assert(Buffer.byteLength(JSON.stringify(calls[0].options.metadata)) <= 2048);
    }
    await page.close(); count++;
  }
  // These regressions must be caught by the shipped validator, not just this test runner.
  for (const [name, mutate] of [
    ['native context lost', s => s.replace('element: bound(label)', "element: 'wrong node'")],
    ['SVG passed to HTML-only API', s => s.replace('part instanceof HTMLElement ? part : part.closest("figure")', 'part')],
  ]) {
    const page = await browser.newPage();
    await page.setContent(mutate(make()).replace('playback animation ask', 'ask').replace('data-play>', 'data-unused>'));
    const result = await interactionChecks(page);
    assert(result.problems.some(p => p.includes('native annotation lost')), name);
    await page.close(); count++;
  }
  // Both narrow and wide layouts, plus reduced motion: selection and replies remain usable.
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await page.setContent(make().replace('playback animation ask', 'ask').replace('data-play>', 'data-unused>'));
    const result = await interactionChecks(page);
    assert.deepEqual(result.problems, [], `ask at ${width}px`);
    await page.close(); count++;
  }
  // A failed clipboard operation must retain the user's saved question for retry.
  const failedCopy = await browser.newPage();
  await failedCopy.setContent(make());
  await failedCopy.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('fixture denial'); } } });
    document.execCommand = () => false;
  });
  await failedCopy.locator('.ve-n').first().click();
  await failedCopy.getByRole('button', { name: /^Ask about / }).click();
  await failedCopy.getByRole('textbox', { name: 'Question' }).fill('Keep this question if copy fails');
  await failedCopy.getByRole('button', { name: 'Save', exact: true }).click();
  await failedCopy.getByRole('button', { name: /^Reply/ }).click();
  await failedCopy.getByRole('button', { name: 'Copy reply', exact: true }).click();
  assert(await failedCopy.getByRole('dialog', { name: 'Your reply' }).isVisible());
  assert((await failedCopy.locator('.r-md').textContent()).includes('Keep this question if copy fails'));
  await failedCopy.close(); count++;
  console.log(`Interaction guards passed: ${count} valid/broken cases including playback, animation, selection, context, copy/send handoff and reduced motion (${skill})`);
} finally { await browser.close(); }
