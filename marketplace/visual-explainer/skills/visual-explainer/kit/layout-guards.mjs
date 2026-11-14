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
    for (const b of boxes) lines.push({ e, b });
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
