import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministic, heuristicClaims, contrast } from '../src/lib/engine.js';

const terms = [{ banned: 'clients', preferred: 'customers' }, { banned: 'Dashboard', preferred: 'Insights Hub', caseSensitive: true }];
const facts = [{ _id: 'f1', topic: 'Connectors', statement: 'Northwind Insights connects to 12 data sources.' }];
const text = 'Meet Northwind Insights, the world’s fastest analytics platform. It connects to 5 data sources so our clients can see everything in one Dashboard. Start today!!';

test('contrast maths matches WCAG', () => {
  assert.ok(Math.abs(contrast('#000000', '#FFFFFF') - 21) < 0.01);
  assert.ok(contrast('#9CA3AF', '#FFFFFF') < 4.5);
});
test('deterministic checks: terms, tone, contrast, alt text', () => {
  const f = deterministic({ text, altText: '', hasImage: true, design: { textColor: '#9CA3AF', bgColor: '#FFFFFF' } }, { terms, settings: { maxExclamations: 1, approvedTextColors: ['#374151'] } }, 'Dashboard showing revenue.');
  const titles = f.map((x) => x.title).join(' | ');
  assert.match(titles, /clients/); assert.match(titles, /Dashboard/); assert.match(titles, /exclamation/i); assert.match(titles, /contrast/i); assert.match(titles, /alt text/i);
  assert.equal(f.find((x) => x.category === 'accessibility' && /contrast/i.test(x.title)).fix.to, '#374151');
  assert.ok(f.every((x) => x.citation));
});
test('heuristic: outdated fact and unsupported superlative, with citations', () => {
  const f = heuristicClaims(text, { claims: [], facts, rules: [] });
  const fact = f.find((x) => x.category === 'fact'); const claim = f.find((x) => x.category === 'claim');
  assert.equal(fact.fix.to, '12 data sources'); assert.match(fact.citation.text, /12 data sources/);
  assert.match(claim.quote, /fastest/); assert.ok(claim.citation.title);
});
test('heuristic: supported claim is not flagged', () => {
  const f = heuristicClaims('Dashboards load in under 2 seconds.', { claims: [{ _id: 'c', statement: 'Dashboards load in under 2 seconds', status: 'approved' }], facts: [], rules: [] });
  assert.equal(f.length, 0);
});
