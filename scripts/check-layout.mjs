// General invariants with positive/negative pairs. No screenshot goldens or example-specific dimensions.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const skill = resolve(process.argv[2] || 'plugins/visual-explainer');
const { layoutGuards } = await import(pathToFileURL(join(skill, 'kit/layout-guards.mjs')));
const { validateFile, acceptReview, verified } = await import(pathToFileURL(join(skill, 'kit/validation.mjs')));
const runtime = process.env.VE_BROWSER_RUNTIME ? resolve(process.env.VE_BROWSER_RUNTIME, 'package.json') : import.meta.url;
const { chromium } = createRequire(runtime)('playwright-core');
let browser;
try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ channel: 'chrome' }); }
const temp = mkdtempSync(join(tmpdir(), 've-layout-'));
const html = body => `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>body{margin:24px;color:#111;background:#fff;font:16px/1.5 sans-serif}p{margin:0 0 16px}svg text{font-size:14px;fill:#111}</style></head><body><main>${body}</main></body></html>`;
let checks = 0;
try {
  const page = await browser.newPage();
  for (const width of [390, 768, 1067, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const length of [32, 80, 160]) {
      const text = 'W'.repeat(length);
      const cases = [
        ['wrapped text', `<p style="width:180px;overflow-wrap:anywhere">${text}</p>`, null],
        ['scrolling code', `<pre style="width:180px;overflow:auto">${text}</pre>`, null],
        ['clipped text', `<p style="width:180px;overflow:hidden;white-space:nowrap">${text}</p>`, 'text-clipping'],
        ['flexible grid', `<section style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px"><article style="min-width:0"><pre style="overflow:auto">${text}</pre></article><article><p>Other column</p></article></section>`, null],
        ['separated header and figure', '<header>Introduction</header><figure style="height:80px;margin:20px 0;background:#eee"></figure>', null],
        ['figure covers header', '<header>Introduction</header><figure style="height:80px;margin:-12px 0 0;background:#eee"></figure>', 'block-overlap'],
        ['offscreen text beside counter', '<div style="display:flex;width:220px"><div style="width:160px;overflow:auto;white-space:nowrap">A very long navigation label outside the scrollport</div><span>1 / 6</span></div>', null],
        ['visible text covers counter', '<div style="position:relative;width:220px"><div style="width:160px;overflow:auto;white-space:nowrap">A very long navigation label outside the scrollport</div><span style="position:absolute;left:60px;top:0">1 / 6</span></div>', 'text-overlap'],
        ['normal blocks', '<p>First paragraph</p><p>Second paragraph</p>', null],
        ['overlapping blocks', '<p>First paragraph</p><p style="position:absolute;top:24px">Second paragraph</p>', 'text-overlap'],
        ['declared overlay', '<div data-ve-overlap-reason="Layered annotation demonstration"><p>First paragraph</p><p style="position:absolute;top:24px">Second paragraph</p></div>', null],
        ['inline emphasis', '<p>Readable <strong>inline emphasis</strong> in a sentence.</p>', null],
        ['fitting node', '<svg width="300" height="100"><g class="ve-n"><rect class="sh" width="140" height="64" fill="#eee"/><text x="8" y="30">Short label</text></g></svg>', null],
        ['escaped node', `<svg width="300" height="100"><g class="ve-n"><rect class="sh" width="140" height="64" fill="#eee"/><text x="8" y="30">${text}</text></g></svg>`, 'node-containment'],
        ['aligned rows', '<div data-ve-align="divider" style="display:flex;gap:20px"><div data-ve-align-cell><p>A</p><hr data-ve-align-anchor="divider"></div><div data-ve-align-cell><p>B</p><hr data-ve-align-anchor="divider"></div></div>', null],
        ['unequal divider heights', '<div data-ve-align="divider" style="display:flex;gap:20px"><div data-ve-align-cell><p>A</p><hr data-ve-align-anchor="divider"></div><div data-ve-align-cell><p>B<br>Extra line</p><hr data-ve-align-anchor="divider"></div></div>', 'alignment'],
        ['offset column', '<div data-ve-align="heading" style="display:flex;gap:20px"><div data-ve-align-cell style="height:100px"><p data-ve-align-anchor="heading">A</p></div><div data-ve-align-cell style="height:100px;margin-top:16px"><p data-ve-align-anchor="heading">B</p></div></div>', 'alignment'],
        ['intentional asymmetry', '<div style="display:flex;gap:20px"><div><p>A</p><hr></div><div><p>B<br>Extra line</p><hr></div></div>', null],
        ['stacked responsive cells', '<div data-ve-align="divider"><div data-ve-align-cell><p>A</p><hr data-ve-align-anchor="divider"></div><div data-ve-align-cell><p>B<br>Extra line</p><hr data-ve-align-anchor="divider"></div></div>', null],
        ['missing row anchor', '<div data-ve-align="divider" style="display:flex;gap:20px"><div data-ve-align-cell><p>A</p><hr data-ve-align-anchor="divider"></div><div data-ve-align-cell><p>B</p></div></div>', 'alignment'],
        ['hidden alternative', `<p hidden>${text}</p><p>Visible alternative</p>`, null],
      ];
      for (const [name, body, expected] of cases) {
        await page.setContent(html(body));
        const findings = await page.evaluate(layoutGuards);
        if (expected) assert(findings.some(f => f.startsWith(expected)), `${name} at ${width}: ${findings}`);
        else assert.deepEqual(findings, [], `${name} at ${width}`);
        checks++;
      }
    }
  }
  // Different font metrics and 200% text sizing must preserve wrapped layouts.
  for (const font of ['serif', 'monospace', 'MissingFixtureFont, sans-serif']) {
    await page.setContent(html(`<p style="font-family:${font};font-size:200%;overflow-wrap:anywhere">${'Wide word '.repeat(20)}</p>`));
    assert.deepEqual(await page.evaluate(layoutGuards), []); checks++;
  }
  // Real kit CSS, varied composition and enlarged text; no page-specific overrides.
  const kitCss = readFileSync(join(skill, 'kit/kit.css'), 'utf8').replace(/@import[^;]+;/g, '');
  for (const width of [390, 768, 1067, 1280]) for (const scale of [100, 200]) {
    await page.setViewportSize({ width, height: 900 });
    for (const nested of [false, true]) {
      const content = '<header><h1>A longer introduction that wraps</h1><p>Supporting metadata with several words</p></header><figure style="height:100px;background:#ddd"><figcaption>A figure</figcaption></figure>';
      await page.setContent(`<!doctype html><style>${kitCss}html{font-size:${17*scale/100}px}</style><main>${nested ? '<section>'+content+'</section>' : content}</main>`);
      assert.deepEqual(await page.evaluate(layoutGuards), [], `kit header ${width}/${scale}/${nested}`);
      assert(await page.evaluate(() => document.querySelector('figure').getBoundingClientRect().top > document.querySelector('header').getBoundingClientRect().bottom));
      checks++;
    }
    const labels = ['Overview', 'Astronomical calculations', 'Activations', 'Bodygraph', 'Fixing rules', 'Composites'];
    await page.setContent(`<!doctype html><style>${kitCss}html{font-size:${17*scale/100}px}</style><nav class="ve-toc"><div>${labels.map((x,i)=>`<a href="#s${i}">${x}</a>`).join('')}</div><span class="pos">6 / 6</span></nav><main>${labels.map((x,i)=>`<section id="s${i}" style="min-height:600px"><h2>${x}</h2></section>`).join('')}</main>`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.addScriptTag({ content: readFileSync(join(skill, 'kit/kit.js'), 'utf8') });
    await page.waitForFunction(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ve-toc-height')) > 0);
    assert.deepEqual(await page.evaluate(layoutGuards), [], `kit navigation ${width}/${scale}`);
    assert(await page.evaluate(() => {
      const counter = document.querySelector('.pos').getBoundingClientRect();
      return [...document.querySelectorAll('.ve-toc a')].every(a => a.getBoundingClientRect().right <= counter.left);
    }));
    await page.locator('.ve-toc a').nth(3).click();
    assert(await page.evaluate(() => document.querySelector('#s3').getBoundingClientRect().top >= document.querySelector('.ve-toc').getBoundingClientRect().bottom - 2), 'anchor clears wrapped sticky nav');
    checks++;
  }
  await browser.close(); browser = null;
  const file = join(temp, 'valid.html');
  writeFileSync(file, html('<h1>Readable explanation</h1><p>Clear supporting text.</p><section style="margin-top:1000px"><p>Below-fold content must have evidence too.</p></section>'));
  const valid = await validateFile(file);
  assert.equal(valid.validation.automated, 'passed', JSON.stringify(valid.problems));
  assert.equal(valid.validation.ready, false);
  assert(valid.sheets.length >= 12, 'Whole-page evidence at three widths and two themes');
  assert.equal(verified(file), false);
  assert.throws(() => acceptReview(file, { reviewer: 'test' }));
  const review = { reviewer: 'fixture-test-only', verdict: 'passed', inspected: valid.sheets,
    hierarchy: 'Synthetic receipt-contract test, not an actual design approval', spacing: 'test', readability: 'test', completePage: 'test', states: 'test' };
  acceptReview(file, review); assert.equal(verified(file), true);
  const image = valid.sheets[0], originalImage = readFileSync(image);
  writeFileSync(image, 'changed evidence'); assert.equal(verified(file), false);
  assert.throws(() => acceptReview(file, review), /changed/);
  writeFileSync(image, originalImage);
  writeFileSync(file, html('<p>Changed after review</p>')); assert.equal(verified(file), false);
  assert.throws(() => acceptReview(file, review), /changed/);
  const absent = await validateFile(file, { launcher: async () => ({ skipped: 'missing browser fixture' }) });
  assert.equal(absent.validation.automated, 'unverified'); assert.equal(verified(file), false);
  const crash = await validateFile(file, { launcher: async () => { throw new Error('browser crash fixture'); } });
  assert.equal(crash.validation.automated, 'unverified');
  writeFileSync(file, html('<p style="width:160px;overflow:hidden;white-space:nowrap">A long string that cannot fit inside this little container at any viewport width</p>'));
  const broken = await validateFile(file, { sheet: false });
  assert.equal(broken.validation.automated, 'failed');
  assert.throws(() => acceptReview(file, review), /Automated checks/);
  writeFileSync(file, html('<div style="width:2000px">Too wide</div>'));
  const overflow = await validateFile(file, { sheet: false });
  assert(overflow.problems.some(p => p.includes('page-overflow')));
  // A state that breaks only after interaction must fail even if its initial view is valid.
  writeFileSync(file, html('<div class="ve-steps"><input type="range" min="0" max="1" value="0"><ol class="ve-cap"><li>Start</li><li>End</li></ol><p id="state">This long state label will be clipped after moving the control</p></div><script>document.querySelector("input").oninput=e=>document.querySelector("#state").style.cssText=+e.target.value?"width:80px;white-space:nowrap;overflow:hidden":"";</script>'));
  const state = await validateFile(file, { sheet: false });
  assert(state.problems.some(p => p.includes('step 2') && p.includes('text-clipping')), JSON.stringify(state.problems));
  // Exercise the actual kit renderer, not only handcrafted SVG, under deterministic fallback fonts.
  const { renderPage, prepareRenderedHtml } = await import(pathToFileURL(join(skill, 'kit/render.mjs')));
  for (const [subtitle, expected] of [['Short', 'passed'], ['A subtitle far wider than its owning node can contain', 'failed']]) {
    const sourceHtml = '<!doctype html><html><head><link data-ve-kit rel="stylesheet" href="kit.css"></head><body><main><figure><ve-flow label="One node"><ve-node id="a" at="1 1" sub="' + subtitle + '">Node</ve-node></ve-flow><figcaption>Node label containment</figcaption></figure></main></body></html>';
    const rendered = renderPage(sourceHtml); assert.deepEqual(rendered.errors, []);
    writeFileSync(file, prepareRenderedHtml(rendered.html).replace(/<link[^>]*https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>/g, ''));
    const kit = await validateFile(file, { sheet: false });
    assert.equal(kit.validation.automated, expected, JSON.stringify(kit.problems));
    if (expected === 'failed') assert(kit.problems.some(p => p.includes('node-containment')));
  }
  // CLI parity: standalone HTML and --no-check may never report ready.
  const source = join(temp, 'draft.src.html'); writeFileSync(source, html('<p>Draft</p>'));
  const renderer = join(skill, 'kit/render.mjs');
  const draft = spawnSync(process.execPath, [renderer, source, '--no-check'], { encoding: 'utf8' });
  assert.equal(draft.status, 2, draft.stderr);
  const missing = spawnSync(process.execPath, [renderer, source], { encoding: 'utf8', env: { ...process.env, VE_BROWSER_RUNTIME: join(temp, 'missing-runtime') } });
  assert.equal(missing.status, 2, missing.stderr);
  assert.equal(JSON.parse(readFileSync(join(temp, 'draft.html.validation.json'))).automated, 'unverified');
  console.log(`Layout guards passed: ${checks} varied positive/negative cases plus browser, evidence and review-contract integration checks (${skill})`);
} finally { if (browser) await browser.close(); rmSync(temp, { recursive: true, force: true }); }
