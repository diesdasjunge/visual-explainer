import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lookAt, lookLines } from './look.mjs';

const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const receiptPath = file => `${resolve(file)}.validation.json`;
export function recordValidation(file, result) {
  const report = { schema: 1, file: resolve(file), sha256: hash(file), ready: false,
    automated: result.skipped ? 'unverified' : result.problems.length ? 'failed' : 'passed',
    interactions: result.interactions ?? [], reason: result.skipped, problems: result.problems, visualReview: { status: 'unverified' },
    evidence: result.sheets.map(path => ({ path: resolve(path), sha256: hash(path), ...result.evidenceDetails?.[path] })) };
  writeFileSync(receiptPath(file), JSON.stringify(report, null, 2) + '\n');
  return report;
}
export async function validateFile(file, options) {
  const before = hash(file);
  recordValidation(file, { skipped: 'Validation in progress', problems: [], sheets: [] });
  let result;
  try { result = await lookAt(file, options); }
  catch (e) { result = { skipped: e.message, problems: [], sheets: [] }; }
  if (hash(file) !== before) result.skipped = 'Artifact changed during validation; rerun';
  const validation = recordValidation(file, result);
  return { ...result, validation };
}

export function acceptReview(file, review) {
  const report = JSON.parse(readFileSync(receiptPath(file), 'utf8'));
  if (report.automated !== 'passed' || !report.evidence.length) throw new Error('Automated checks and screenshot evidence are required before review');
  if (report.sha256 !== hash(file) || report.evidence.some(e => hash(e.path) !== e.sha256)) throw new Error('Artifact or evidence changed; validate and inspect again');
  if (typeof review.reviewer !== 'string' || !review.reviewer.trim()) throw new Error('Name the reviewer');
  for (const key of ['hierarchy', 'spacing', 'readability', 'completePage', 'states']) {
    if (typeof review[key] !== 'string' || !review[key].trim()) throw new Error(`Record review observations for ${key}`);
  }
  if (review.verdict !== 'passed') throw new Error('Repair visual findings and validate again before accepting');
  if (!Array.isArray(review.inspected) || report.evidence.some(e => !review.inspected.includes(e.path))) throw new Error('Inspect and list every evidence image');
  report.visualReview = { status: 'passed', ...review, reviewedAt: new Date().toISOString() };
  report.ready = true;
  writeFileSync(receiptPath(file), JSON.stringify(report, null, 2) + '\n');
  return report;
}
export function verified(file) {
  const r = JSON.parse(readFileSync(receiptPath(file), 'utf8'));
  return r.ready === true && r.automated === 'passed' && r.visualReview.status === 'passed' &&
    r.evidence.length > 0 && r.sha256 === hash(file) && r.evidence.every(e => e.sha256 === hash(e.path));
}
let main = false;
try { main = import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; } catch {}
if (main) {
  try {
    const [command, file, reviewFile] = process.argv.slice(2);
    if (!file) throw new Error('Usage: validation.mjs inspect|review|status page.html [review.json]');
    if (command === 'inspect') {
      const r = await validateFile(file); console.log(lookLines(r).join('\n'));
      console.log(`Review receipt: ${receiptPath(file)}`); process.exitCode = r.validation.automated === 'failed' ? 1 : 2;
    } else if (command === 'review') { acceptReview(file, JSON.parse(readFileSync(reviewFile, 'utf8'))); console.log('Ready: automated checks and recorded visual review passed'); }
    else if (command === 'status') { const ready = verified(file); console.log(ready ? 'Ready' : 'UNVERIFIED'); process.exitCode = ready ? 0 : 2; }
    else throw new Error('Unknown validation command');
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
