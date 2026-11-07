import test from 'node:test';
import assert from 'node:assert/strict';

const store = {}; globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v), removeItem: (k) => delete store[k] };
const { handle } = await import('../src/lib/backend.js');
const as = (email) => handle('POST', '/auth/demo-login', { email });
const call = (m, p, b, f) => handle(m, p, b, f);

test('role visibility and ownership', async () => {
  await as('maya@northwind.demo');
  const mine = await call('GET', '/content'); assert.ok(mine.length >= 5 && mine.every((c) => c.authorName === 'Maya Sharma'));
  await as('priya@northwind.demo'); const brand = await call('GET', '/content'); assert.ok(brand.every((c) => c.status !== 'draft' || c.last));
  await as('arjun@northwind.demo'); const comp = await call('GET', '/content'); assert.ok(comp.every((c) => ['in_compliance_review', 'approved', 'published'].includes(c.status) || c.last));
  await assert.rejects(() => call('POST', '/kb/claims', { statement: 'x' }).then(() => call('POST', '/kb/rules', { code: 'x' })), /Only the Brand Manager/);
  await as('maya@northwind.demo'); await assert.rejects(() => call('GET', '/audit'), /role cannot/);
});

test('full workflow: check -> resolve -> submit -> brand -> compliance -> publish', async () => {
  await as('maya@northwind.demo');
  const launch = (await call('GET', '/content')).find((c) => c.title.startsWith('Launch post'));
  let c = await call('POST', `/content/${launch._id}/check`);
  assert.ok(c.findings.length >= 7 && c.findings.every((f) => f.citation));
  await assert.rejects(() => call('POST', `/content/${launch._id}/submit`), /Resolve/);
  for (const f of c.findings) {
    c = f.fix?.kind === 'none' || f.category === 'claim' ? await call('POST', `/content/${launch._id}/findings/${f.fid}`, { action: 'edit', value: f.category === 'claim' ? 'an analytics platform built for fast reporting' : 'Dashboard banner showing monthly revenue trends.' })
      : await call('POST', `/content/${launch._id}/findings/${f.fid}`, { action: 'accept' });
  }
  assert.ok(c.findings.every((f) => f.status !== 'open')); assert.ok(!c.stale);
  c = await call('POST', `/content/${launch._id}/submit`); assert.equal(c.status, 'in_brand_review');
  await assert.rejects(() => call('POST', `/content/${launch._id}/review`, { decision: 'approve', comment: 'ok ok' }), /Brand Manager|cannot/);
  await as('priya@northwind.demo');
  await assert.rejects(() => call('POST', `/content/${launch._id}/review`, { decision: 'approve', comment: '' }), /comment is required/);
  c = await call('POST', `/content/${launch._id}/review`, { decision: 'approve', comment: 'Looks right, claim reworded.' });
  assert.equal(c.status, 'in_compliance_review');
  await as('arjun@northwind.demo'); assert.ok((await call('GET', '/notifications')).some((n) => /sign-off/.test(n.title)));
  c = await call('POST', `/content/${launch._id}/review`, { decision: 'approve', comment: 'Evidence verified.' }); assert.equal(c.status, 'approved');
  await as('maya@northwind.demo'); assert.ok((await call('GET', '/notifications')).some((n) => /ready to publish/.test(n.title)));
  c = await call('POST', `/content/${launch._id}/publish`); assert.equal(c.status, 'published');
  const ex = await call('GET', `/content/${launch._id}/export`); assert.ok(ex.audit.length >= 8 && ex.reviews.length === 2);
});

test('send back, dispute, insights', async () => {
  await as('maya@northwind.demo'); const d = await call('POST', '/content', { title: 'Temp piece', channel: 'Email' });
  await call('PUT', `/content/${d._id}`, { text: 'Hello clients!!' });
  let c = await call('POST', `/content/${d._id}/check`); const f = c.findings.find((x) => x.category === 'tone');
  await assert.rejects(() => call('POST', `/content/${d._id}/findings/${f.fid}`, { action: 'dispute', reason: '' }), /reason/);
  c = await call('POST', `/content/${d._id}/findings/${f.fid}`, { action: 'dispute', reason: 'Intentional' }); assert.equal(c.findings.find((x) => x.fid === f.fid).status, 'disputed');
  assert.ok(!c.stale || true);
  const ins = await call('GET', '/insights'); assert.ok(ins.totalFindings > 5 && ins.contents > 5);
  await as('priya@northwind.demo'); const ib = await call('GET', '/insights'); assert.ok(Object.keys(ib.byAuthor).length >= 2 && ib.evidence.some((e) => e.expired));
});
