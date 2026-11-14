// Browser-side checks. Intentional scroll regions are allowed; clipped required text is not.
export function layoutGuards() {
  const found = new Set();
  const visible = (e) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && !e.closest('[aria-hidden="true"]');
  const name = (e) => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''} "${e.textContent.trim().slice(0, 60)}"`;
  const outside = (a, b) => a.left < b.left - 2 || a.right > b.right + 2 || a.top < b.top - 2 || a.bottom > b.bottom + 2;
  // Ownership is explicit for kit nodes; do not assume every SVG label belongs inside a nearby shape.
  for (const node of document.querySelectorAll('g.ve-n')) {
    const shape = node.querySelector(':scope > .sh');
    if (!shape || !visible(node)) continue;
    const box = shape.getBoundingClientRect();
    for (const t of node.querySelectorAll('text')) if (visible(t) && outside(t.getBoundingClientRect(), box))
      found.add(`node-containment: ${name(t)} escapes its node`);
  }
  // An explicit contract, scoped to a repeated layout. Compare only cells on the
  // same visual row so responsive stacks and deliberately asymmetric layouts remain valid.
  for (const group of document.querySelectorAll('[data-ve-align]')) {
    const cells = [...group.querySelectorAll('[data-ve-align-cell]')].filter(e =>
      e.closest('[data-ve-align]') === group && visible(e));
    const rows = [];
    for (const cell of cells) {
      const box = cell.getBoundingClientRect();
      let row = rows.find(r => {
        const a = r.box;
        const overlap = Math.min(a.bottom, box.bottom) - Math.max(a.top, box.top);
        return (box.left >= a.right - 2 || box.right <= a.left + 2) && overlap > Math.min(a.height, box.height) / 2;
      });
      if (!row) rows.push(row = { box, cells: [] });
      row.cells.push(cell);
    }
    for (const row of rows.filter(r => r.cells.length > 1)) {
      for (const key of group.dataset.veAlign.trim().split(/\s+/).filter(Boolean)) {
        const marks = row.cells.map(cell => [...cell.querySelectorAll('[data-ve-align-anchor]')]
          .find(e => e.dataset.veAlignAnchor === key && visible(e)));
        if (marks.some(e => !e)) { found.add(`alignment: missing "${key}" anchor in repeated row`); continue; }
        const tops = marks.map(e => e.getBoundingClientRect().top);
        if (Math.max(...tops) - Math.min(...tops) > 2)
          found.add(`alignment: "${key}" differs by ${Math.round(Math.max(...tops)-Math.min(...tops))}px across repeated row`);
      }
    }
  }
  // Catch a figure backing into its introduction even when their text does not intersect.
  for (const figure of document.querySelectorAll('header + figure')) {
    const header = figure.previousElementSibling;
    if (!visible(header) || !visible(figure)) continue;
    const a = header.getBoundingClientRect(), b = figure.getBoundingClientRect();
    if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2)
      found.add(`block-overlap: ${name(figure)} intersects its header`);
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const lines = [];
  while (walker.nextNode()) {
    const t = walker.currentNode, e = t.parentElement;
    if (!t.textContent.trim() || !e || e.closest('svg,script,style,textarea,select') || !visible(e)) continue;
    const range = document.createRange(); range.selectNodeContents(t);
    const boxes = [...range.getClientRects()].filter(r => r.width > 1 && r.height > 1);
    for (let p = e; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p), b = p.getBoundingClientRect();
      const clipX = /hidden|clip/.test(cs.overflowX), clipY = /hidden|clip/.test(cs.overflowY);
      if (boxes.some(r => clipX && (r.left < b.left - 2 || r.right > b.right + 2) || clipY && (r.top < b.top - 2 || r.bottom > b.bottom + 2))) {
        found.add(`text-clipping: ${name(e)} is clipped by ${p.tagName.toLowerCase()}`); break;
      }
      // Scrolling is an intentional alternative to wrapping. Do not compare offscreen text to outer clipping boundaries.
      if (/auto|scroll/.test(cs.overflowX + cs.overflowY)) break;
    }
    // Collision checks use painted text only. Scrollable text outside its scrollport
    // must not collide with siblings, but visible collisions still fail.
    for (const rect of boxes) {
      const b = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      for (let p = e; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p), r = p.getBoundingClientRect();
        if (/auto|scroll|hidden|clip/.test(cs.overflowX)) {
          b.left = Math.max(b.left, r.left + p.clientLeft);
          b.right = Math.min(b.right, r.left + p.clientLeft + p.clientWidth);
        }
        if (/auto|scroll|hidden|clip/.test(cs.overflowY)) {
          b.top = Math.max(b.top, r.top + p.clientTop);
          b.bottom = Math.min(b.bottom, r.top + p.clientTop + p.clientHeight);
        }
      }
      b.height = b.bottom - b.top;
      if (b.right - b.left > 1 && b.height > 1) lines.push({ e, b });
    }
  }
  // Detect overlapping text from distinct blocks, not inline emphasis, or declared visual overlays.
  lines.sort((a,b) => a.b.top - b.b.top);
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length && lines[j].b.top < lines[i].b.bottom; j++) {
    const a = lines[i], b = lines[j];
    if (a.e === b.e || a.e.contains(b.e) || b.e.contains(a.e)) continue;
    if ([a.e,b.e].some(e => e.closest('[data-ve-overlap-reason]')?.getAttribute('data-ve-overlap-reason').trim())) continue;
    const x = Math.min(a.b.right,b.b.right)-Math.max(a.b.left,b.b.left);
    const y = Math.min(a.b.bottom,b.b.bottom)-Math.max(a.b.top,b.b.top);
    if (x > 3 && y > Math.min(a.b.height,b.b.height)*0.5)
      found.add(`text-overlap: ${name(a.e)} intersects ${name(b.e)}`);
  }
  return [...found];
}
