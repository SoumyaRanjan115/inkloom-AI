import test from 'node:test';
import assert from 'node:assert/strict';
import { KIT, ITEMS, analyse } from '../src/lib/seedData.js';

const k = KIT(); let n = 0;
const dated = (a) => a.map(({ days, ...r }) => ({ ...r, _id: 'id' + n++, expiresAt: new Date(Date.now() + days * 864e5) }));
const kb = { rules: k.rules.map((r) => ({ ...r, _id: 'r' + n++ })), terms: k.terms.map((t) => ({ ...t, _id: 't' + n++ })), facts: dated(k.facts), claims: dated(k.claims), settings: { maxExclamations: 1, minContrast: 4.5, approvedTextColors: ['#374151', '#111827'] } };

test('every checked demo item produces cited findings', () => {
  for (const it of ITEMS.filter((i) => !i.unchecked)) {
    const f = analyse(it.orig, it, kb);
    assert.ok(f.length > 0, it.key + ' should have findings');
    assert.ok(f.every((x) => x.citation && x.citation.title), it.key + ' findings need citations');
  }
});
test('launch post (live demo) triggers all seven check types', () => {
  const it = ITEMS.find((i) => i.key === 'launch');
  const t = analyse(it.orig, it, kb).map((f) => f.title).join(' | ');
  for (const re of [/clients/, /Dashboard/, /exclamation/i, /contrast/i, /alt text/i, /Outdated or conflicting fact/, /Unsupported claim/]) assert.match(t, re);
});
test('final texts of submitted items are clean (except deliberate disputes/placeholders)', () => {
  for (const it of ITEMS.filter((i) => i.final)) {
    const left = analyse(it.final, it, kb).filter((f) => !(it.disputed && it.disputed[f.category]));
    assert.equal(left.length, 0, it.key + ' leftover: ' + left.map((f) => f.title).join('; '));
  }
});
test('newsletter shows an expired-fact finding that needs human review', () => {
  const it = ITEMS.find((i) => i.key === 'news');
  assert.ok(analyse(it.orig, it, kb).some((f) => f.needsReview && /expired/i.test(f.title)));
});
test('claim-bearing items route to compliance, others do not', () => {
  const claimKeys = ITEMS.filter((i) => i.rev?.some((r) => r[0] === 'compliance') || i.stage === 'in_compliance_review').map((i) => i.key);
  for (const it of ITEMS.filter((i) => !i.unchecked && !i.openFindings)) {
    const hasClaim = analyse(it.orig, it, kb).some((f) => f.category === 'claim');
    if (['adcopy', 'press', 'blog', 'q3', 'security'].includes(it.key)) assert.ok(hasClaim && claimKeys.includes(it.key), it.key);
    if (['story', 'webinar'].includes(it.key)) assert.ok(!hasClaim, it.key + ' should be brand-only');
  }
});
