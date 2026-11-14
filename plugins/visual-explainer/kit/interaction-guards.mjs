// Exercise real controls in an isolated validation page. Delivery is intercepted:
// validation never writes to the user's clipboard or sends a message to an agent.
export async function interactionChecks(page, { capture = async () => {} } = {}) {
  const problems = [], checks = [];
  page.setDefaultTimeout(2000);
  await page.evaluate(() => {
    window.__veValidationDeliveries = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async text => window.__veValidationDeliveries.push({ channel: 'copy', text })
    } });
    window.glimpse = { send: msg => window.__veValidationDeliveries.push({ channel: 'send', text: msg.markdown }) };
  });
  const figures = page.locator('figure');
  for (let i = 0; i < await figures.count(); i++) {
    const fig = figures.nth(i);
    const required = ((await fig.getAttribute('data-ve-requires')) || '').split(/\s+/);
    const run = async (name, task) => {
      try { await task(); checks.push(`figure ${i + 1}: ${name}`); }
      catch (e) { problems.push(`interaction: figure ${i + 1} ${name}: ${e.message.split('\n')[0]}`); }
    };
    if (required.includes('playback') || required.includes('animation') || await fig.locator('[data-play]').count()) await run('playback', async () => {
      const play = fig.locator('[data-play]'), range = fig.locator('input[type=range]');
      const caps = fig.locator('.ve-cap li');
      const n = await caps.count();
      if (n < 2 || await play.count() !== 1 || await range.count() !== 1) throw new Error('playback controls or multiple steps missing');
      const seek = async k => { await range.fill(String(k)); await range.dispatchEvent('input'); };
      const state = () => fig.evaluate(e => ({
        caption: [...e.querySelectorAll('.ve-cap li')].findIndex(x => !x.hidden),
        parts: [...e.querySelectorAll('[data-s]')].map(x => `${x.classList.contains('on')}/${x.classList.contains('now')}`).join(',')
      }));
      await seek(0); const first = await state();
      await seek(n - 1); const last = await state();
      if (first.caption !== 0 || last.caption !== n - 1 || first.parts === last.parts) throw new Error('scrubbing does not change both caption and drawing');
      await fig.locator('[data-go="-1"]').click({ timeout: 1500 });
      if ((await state()).caption !== n - 2) throw new Error('previous control is inert');
      await fig.locator('[data-go="1"]').click({ timeout: 1500 });
      if ((await state()).caption !== n - 1) throw new Error('next control is inert');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await play.click({ timeout: 1500 });
      if (await range.inputValue() !== '0' || (await play.textContent()).trim() !== 'Pause') throw new Error('Play does not restart the sequence');
      await page.waitForFunction(el => +el.value > 0, await range.elementHandle(), { timeout: 5000 });
      if ((await state()).caption < 1) throw new Error('playback advances without updating the caption');
      if (required.includes('animation') && !await fig.evaluate(e => e.getAnimations({ subtree: true }).some(a => a instanceof CSSAnimation && a.playState === 'running'))) throw new Error('no running animation during playback');
      await capture(`figure ${i + 1} playback`);
      await play.click();
      const paused = await range.inputValue();
      await page.waitForTimeout(3700);
      if (await range.inputValue() !== paused || (await play.textContent()).trim() !== 'Play') throw new Error('Pause does not stop playback');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await seek(n - 1);
    });
    if (required.includes('ask') || await fig.locator('.ve-n, [data-ref]').count()) await run('click-to-ask and reply handoff', async () => {
      const declared = ((await fig.getAttribute('data-ve-ask-targets')) || '').split(/\s+/).filter(Boolean);
      // Resolve by exact token, without interpolating user-authored selectors.
      const parts = await fig.locator('.ve-n, [data-ref]').evaluateAll(es => es.map((e, n) => ({ n, refs: (e.dataset.ref || '').split(/\s+/) })));
      const indexes = declared.length ? declared.map(key => {
        const p = parts.find(p => p.refs.includes(key));
        if (!p) throw new Error(`required ask target "${key}" missing`);
        return p.n;
      }) : parts.map(p => p.n);
      if (!indexes.length) throw new Error('no selectable diagram elements');
      for (const [j, index] of indexes.entries()) {
        const part = fig.locator('.ve-n, [data-ref]').nth(index);
        await part.click({ timeout: 2000 });
        const ask = page.getByRole('button', { name: /^Ask about / });
        await ask.waitFor({ timeout: 1500 });
        const label = (await ask.textContent()).match(/“(.+)”/)?.[1];
        if (!label || label === 'this part') throw new Error('selected element has no meaningful question context');
        await ask.click();
        const pop = page.getByRole('dialog', { name: 'Ask a question' });
        const question = `Validation question about ${label}`;
        await pop.getByRole('textbox', { name: 'Question' }).fill(question);
        const box = await pop.boundingBox(), viewport = page.viewportSize();
        if (!box || box.x < 0 || box.x + box.width > viewport.width + 2) throw new Error('question editor escapes the viewport');
        if (j === 0) await capture(`figure ${i + 1} question editor`);
        await pop.getByRole('button', { name: 'Save', exact: true }).click();
        await page.getByRole('button', { name: /^Reply \(/ }).click();
        const reply = page.getByRole('dialog', { name: 'Your reply' });
        const readable = await reply.locator('.r-row').evaluateAll(rows => rows.every(row => {
          const text = row.children[1];
          return innerWidth > 540 || text.getBoundingClientRect().width >= row.getBoundingClientRect().width / 2;
        }));
        if (!readable) throw new Error('reply note column is squeezed by its action controls');
        const payload = await reply.locator('.r-md').textContent();
        if (!payload.includes(question) || !payload.includes(`› ${label} — ask:`)) throw new Error('reply lost the selected element or question');
        if (j === 0) await capture(`figure ${i + 1} reply preview`);
        await reply.getByRole('button', { name: /^(Copy reply|Send to agent)$/ }).click();
        const delivered = await page.evaluate(() => window.__veValidationDeliveries.at(-1)?.text);
        if (delivered !== payload) throw new Error('handoff did not preserve the reply payload');
        if (await page.getByRole('button', { name: /^Reply \(/ }).count()) throw new Error('successful handoff did not clear submitted notes');
      }
    });
  }
  return { problems, checks };
}
