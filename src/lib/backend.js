// The "server", running in the browser. Same rules as the Express version: roles, visibility, workflow, notifications, audit.
import * as DB from './db.js';
import { runCheck } from './check.js';
import { llmEnabled, askJSON, describeImage, models } from './llm.js';

const err = (m) => new Error(m);
const S = () => DB.state();
const me = () => { const u = DB.current(); if (!u) throw err('Pick a demo role first'); return u; };
const need = (...roles) => { if (!roles.includes(me().role)) throw err('Your role cannot do this'); };
const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
const meUser = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, org: { id: 'northwind', name: 'Northwind Analytics' } });
const now = () => new Date().toISOString();
const visionOk = (m) => /^image\/(png|jpe?g|webp|gif)$/.test(m);
const altFromName = (n = '') => { const w = n.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim(); return w ? w.charAt(0).toUpperCase() + w.slice(1) + '.' : null; };
const readURL = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(err('Could not read the file')); r.readAsDataURL(f); });

function audit(c, action, detail = '') { const u = me(); S().audit.push({ _id: DB.uidgen(), content: c._id, contentTitle: c.title, actor: u.name, role: u.role, action, detail, createdAt: now() }); }
function notify({ roles = [], userIds = [] }, title, body, content) {
  S().users.filter((u) => roles.includes(u.role) || userIds.includes(u._id)).forEach((u) => S().notes.push({ _id: DB.uidgen(), user: u._id, title, body, content, read: false, createdAt: now() }));
}
const vis = (u) => (c) => {
  if (u.role === 'creator') return c.author === u._id;
  if (u.role === 'brand') return c.status !== 'draft' || c.reviews.some((r) => r.reviewer === u.name);
  return ['in_compliance_review', 'approved', 'published'].includes(c.status) || c.reviews.some((r) => r.reviewer === u.name);
};
const load = (id) => { const c = S().contents.find((x) => x._id === id && vis(me())(x)); if (!c) throw err('Content not found'); return c; };
const isOwner = (c) => c.author === me()._id;
const mustEdit = (c) => { if (c.status !== 'draft') throw err('Only drafts can be edited. Reviewers can send it back with a reason.'); if (!isOwner(c)) throw err('Only the author can edit this draft'); };
const pub = (c) => { const o = clone(c); o.stale = o.checkedHash !== DB.contentHash(o); return o; };
const save = () => DB.save();

function applyFix(c, f, val) {
  const fix = f.fix || {};
  if (fix.kind === 'replace' || (fix.kind === 'none' && val && f.quote)) {
    const from = fix.from || f.quote;
    if (!c.text.includes(from)) throw err('The text changed since the check. Re-run the check.');
    c.text = c.text.split(from).join(val);
  } else if (fix.kind === 'set_alt') c.altText = val;
  else if (fix.kind === 'set_color') c.design.textColor = val;
  else if (fix.kind === 'excl') { let k = 0; c.text = c.text.replace(/!/g, () => (++k <= fix.keep ? '!' : '.')); }
  else throw err('This finding has no automatic fix. Use Edit to supply wording, or Dispute it.');
}

// ---- guideline import ----
export async function extractText(file) {
  const n = file.name.toLowerCase();
  if (n.endsWith('.pdf')) {
    const pdfjs = await import('pdfjs-dist'); const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default; pdfjs.GlobalWorkerOptions.workerSrc = worker;
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise; let t = '';
    for (let i = 1; i <= doc.numPages; i++) { const p = await doc.getPage(i); const c = await p.getTextContent(); t += c.items.map((x) => x.str + (x.hasEOL ? '\n' : ' ')).join('') + '\n'; }
    return t;
  }
  if (n.endsWith('.docx')) { const m = await import('mammoth/mammoth.browser'); return (m.extractRawText || m.default.extractRawText)({ arrayBuffer: await file.arrayBuffer() }).then((r) => r.value); }
  return file.text();
}
function heuristicRules(text) {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 25);
  return lines.slice(0, 40).map((l, i) => { const m = l.match(/^(\d+(?:\.\d+)*)[.)]?\s+(.*)/); const body = m ? m[2] : l;
    return { code: m ? m[1] : `R-${i + 1}`, title: body.slice(0, 50).replace(/[.:;,]\s*$/, ''), text: body, category: /alt text|contrast|accessib/i.test(body) ? 'accessibility' : /colou?r|logo|font/i.test(body) ? 'visual' : /claim|superlative|evidence/i.test(body) ? 'claims' : /tone|voice|exclam/i.test(body) ? 'voice' : 'general' }; });
}

const OWNER = { rules: 'brand', glossary: 'brand', facts: 'compliance', claims: 'compliance' };
const FIELDS = { rules: ['code', 'title', 'text', 'category'], facts: ['topic', 'statement', 'owner', 'source', 'expiresAt'], claims: ['statement', 'approvedWording', 'evidence', 'owner', 'expiresAt', 'status'], glossary: ['banned', 'preferred', 'note', 'caseSensitive'] };
const pick = (type, b) => Object.fromEntries(FIELDS[type].filter((k) => b[k] !== undefined).map((k) => [k, k === 'expiresAt' ? (b[k] ? new Date(b[k]).toISOString() : null) : b[k]]));
const ownerOnly = (type) => { if (!OWNER[type]) throw err('Unknown collection'); if (me().role !== OWNER[type]) throw err(`Only the ${OWNER[type] === 'brand' ? 'Brand Manager' : 'Compliance Reviewer'} maintains this list`); };

const R = []; const on = (m, p, fn) => R.push([m, new RegExp('^' + p + '$'), fn]);

on('GET', '/auth/demo', () => S().users.map(({ name, email, role }) => ({ email, name, role })));
on('POST', '/auth/demo-login', (m, b) => { const u = S().users.find((x) => x.email === b.email); if (!u) throw err('Unknown demo user'); DB.setCurrent(u); return { user: meUser(u) }; });
on('GET', '/auth/me', () => ({ user: meUser(me()), llm: llmEnabled(), model: llmEnabled() ? models().model : null }));

on('GET', '/org', () => { me(); return { name: 'Northwind Analytics', settings: clone(S().settings), members: S().users.map(({ _id, name, email, role }) => ({ _id, name, email, role })) }; });
on('PUT', '/org/settings', (m, b) => { need('brand'); const s = { maxExclamations: Math.max(0, Math.min(10, parseInt(b.maxExclamations) || 0)), minContrast: Math.max(3, Math.min(7, +b.minContrast || 4.5)), approvedTextColors: (b.approvedTextColors || []).filter((x) => /^#[0-9a-fA-F]{3,6}$/.test(x)).slice(0, 10) }; S().settings = s; save(); return s; });

on('POST', '/kb/sample', () => { need('brand'); DB.resetKit(); return { ok: true }; });
on('POST', '/kb/rules-bulk', (m, b) => { need('brand'); const out = (b.rules || []).slice(0, 80).map((x) => ({ ...pick('rules', x), _id: DB.uidgen() })); S().kb.rules.push(...out); save(); return out; });
on('POST', '/kb/ingest', async (m, b, form) => {
  need('brand'); const file = form?.get('file'); if (!file) throw err('Attach a PDF, DOCX, TXT or MD file');
  const text = (await extractText(file)).trim(); if (text.length < 40) throw err('Could not read any text from that file');
  let rules = null, mode = 'heuristic';
  if (llmEnabled()) { try { rules = (await askJSON({ max: 8192, system: 'Extract brand, legal and accessibility guideline rules from the document as atomic, checkable rules. Keep original section numbers as "code". category is one of voice, visual, claims, accessibility, legal, general. Max 40 rules. Return {"rules":[{"code","title","text","category"}]}.', user: text.slice(0, 30000) })).rules; mode = 'llm'; } catch (e) { console.error(e.message); } }
  return { mode, rules: rules || heuristicRules(text) };
});
on('GET', '/kb/([a-z]+)', (m) => { me(); if (!OWNER[m[1]]) throw err('Unknown collection'); return clone(S().kb[m[1]]); });
on('POST', '/kb/([a-z]+)', (m, b) => { ownerOnly(m[1]); const d = { ...pick(m[1], b), _id: DB.uidgen() }; S().kb[m[1]].push(d); save(); return clone(d); });
on('PUT', '/kb/([a-z]+)/([^/]+)', (m, b) => { ownerOnly(m[1]); const d = S().kb[m[1]].find((x) => x._id === m[2]); if (!d) throw err('Not found'); Object.assign(d, pick(m[1], b)); save(); return clone(d); });
on('DELETE', '/kb/([a-z]+)/([^/]+)', (m) => { ownerOnly(m[1]); S().kb[m[1]] = S().kb[m[1]].filter((x) => x._id !== m[2]); save(); return { ok: true }; });

on('GET', '/content', (m, b, f, q) => {
  const u = me(); let list = S().contents.filter(vis(u));
  if (q.get('queue')) { const st = { brand: ['in_brand_review'], compliance: ['in_compliance_review'], creator: ['draft', 'approved'] }[u.role]; list = list.filter((c) => st.includes(c.status)); }
  return list.sort((a, b2) => new Date(b2.updatedAt) - new Date(a.updatedAt)).map((c) => ({ _id: c._id, title: c.title, channel: c.channel, status: c.status, authorName: c.authorName, author: c.author, updatedAt: c.updatedAt, aiAssisted: c.aiAssisted,
    open: c.findings.filter((x) => x.status === 'open').length, total: c.findings.length, last: c.reviews.length ? clone(c.reviews[c.reviews.length - 1]) : undefined }));
});
on('POST', '/content', (m, b) => {
  need('creator'); if (!b.title || b.title.trim().length < 2) throw err('Give it a title');
  const u = me(); const c = { _id: DB.uidgen(), author: u._id, authorName: u.name, title: b.title.trim(), channel: b.channel || 'LinkedIn post', text: '', altText: '', design: { textColor: '#111827', bgColor: '#FFFFFF' }, hasImage: false, aiAssisted: false, status: 'draft', findings: [], versions: [], reviews: [], createdAt: now(), updatedAt: now() };
  S().contents.push(c); audit(c, 'created', 'Draft created'); save(); return pub(c);
});
on('GET', '/content/([^/]+)', (m) => pub(load(m[1])));
on('DELETE', '/content/([^/]+)', (m) => { const c = load(m[1]); mustEdit(c); S().contents = S().contents.filter((x) => x !== c); delete S().assets[c._id]; save(); return { ok: true }; });
on('PUT', '/content/([^/]+)', (m, b) => {
  const c = load(m[1]); mustEdit(c);
  for (const k of ['title', 'channel', 'text', 'altText', 'aiAssisted', 'aiTool']) if (b[k] !== undefined) c[k] = b[k];
  if (b.design) c.design = { textColor: b.design.textColor, bgColor: b.design.bgColor };
  c.updatedAt = now(); save(); return pub(c);
});
on('POST', '/content/([^/]+)/image', async (m, b, form) => {
  const c = load(m[1]); mustEdit(c); const f = form?.get('image');
  if (!f || !/^image\//.test(f.type)) throw err('Upload a PNG, JPG, WEBP or GIF');
  if (f.size > 1.5e6) throw err('Image too large for the browser demo (max 1.5 MB)');
  S().assets[c._id] = { url: await readURL(f), mime: f.type, name: f.name }; c.hasImage = true; audit(c, 'image', f.name); save(); return pub(c);
});
on('POST', '/content/([^/]+)/suggest-alt', async (m) => {
  const c = load(m[1]); mustEdit(c); const a = S().assets[c._id]; if (!a) throw err('Upload an image first');
  if (llmEnabled() && visionOk(a.mime)) { try { return { alt: await describeImage(a), mode: 'llm' }; } catch (e) { console.error(e.message); } }
  return { alt: altFromName(a.name) || '', mode: 'filename', note: 'Drafted from the file name. Edit it so it describes what the image shows. Add a Gemini key in Knowledge base > Settings for AI-written alt text.' };
});
on('POST', '/content/([^/]+)/check', async (m) => {
  const c = load(m[1]); mustEdit(c); let alt = null;
  if (c.hasImage && !c.altText) { const a = S().assets[c._id]; if (a) { if (llmEnabled() && visionOk(a.mime)) { try { alt = await describeImage(a); } catch (e) { console.error(e.message); } } if (!alt) alt = altFromName(a.name); } }
  const { findings, engine } = await runCheck(c, DB.kbForEngine(), c.findings, alt);
  c.findings = findings; c.engine = engine; c.checkedHash = DB.contentHash(c); c.checkedAt = now(); c.updatedAt = now();
  audit(c, 'checked', `${findings.length} finding(s) · engine: ${engine.mode === 'llm' ? 'AI + verification pass' : 'rule-based'}`); save(); return pub(c);
});
on('POST', '/content/([^/]+)/findings/([^/]+)', (m, b) => {
  const c = load(m[1]); mustEdit(c); const f = c.findings.find((x) => x.fid === m[2]); if (!f) throw err('Finding not found'); if (f.status !== 'open') throw err('Already resolved');
  if (b.action === 'dispute') { if (!b.reason || b.reason.trim().length < 3) throw err('A reason is required to dispute a finding'); f.status = 'disputed'; f.disputeReason = b.reason.trim(); }
  else {
    const fresh = c.checkedHash === DB.contentHash(c); const val = b.action === 'edit' ? (b.value || '') : f.fix?.to;
    if (b.action === 'edit' && !val.trim()) throw err('Enter the replacement wording');
    applyFix(c, f, val); f.status = b.action === 'edit' ? 'edited' : 'accepted'; f.resolvedValue = val; if (fresh) c.checkedHash = DB.contentHash(c);
  }
  c.updatedAt = now(); audit(c, `finding ${f.status}`, f.title + (b.reason ? ' — ' + b.reason : '')); save(); return pub(c);
});
on('POST', '/content/([^/]+)/submit', (m) => {
  const c = load(m[1]); mustEdit(c);
  if (!c.text.trim()) throw err('Add some content first');
  if (!c.checkedAt || c.checkedHash !== DB.contentHash(c)) throw err('Run the policy check on the latest version first');
  const open = c.findings.filter((f) => f.status === 'open'); if (open.length) throw err(`Resolve ${open.length} open finding(s): accept, edit or dispute each one`);
  const n = c.versions.length + 1; c.versions.push({ n, text: c.text, altText: c.altText, design: clone(c.design), aiAssisted: c.aiAssisted, findings: clone(c.findings), by: me().name, at: now() });
  c.status = 'in_brand_review'; c.updatedAt = now();
  notify({ roles: ['brand'] }, 'New submission', `“${c.title}” v${n} by ${me().name} is waiting for brand review`, c._id);
  audit(c, 'submitted', `Version ${n} sent to brand review${c.aiAssisted ? ' (AI-assisted' + (c.aiTool ? ': ' + c.aiTool : '') + ')' : ''}`); save(); return pub(c);
});
on('POST', '/content/([^/]+)/review', (m, b) => {
  need('brand', 'compliance'); const c = load(m[1]); const u = me();
  if (!['approve', 'reject'].includes(b.decision)) throw err('Choose approve or send back');
  if (!b.comment || b.comment.trim().length < 3) throw err('A comment is required for every decision');
  const stage = { in_brand_review: 'brand', in_compliance_review: 'compliance' }[c.status]; if (!stage) throw err('This item is not waiting for review');
  if (u.role !== stage) throw err(`This step needs a ${stage === 'brand' ? 'Brand Manager' : 'Compliance Reviewer'}`);
  if (c.author === u._id) throw err('Authors cannot approve their own content');
  if (b.decision === 'approve' && /\[needs evidence\]/i.test(c.text)) throw err('Content still contains a “[needs evidence]” placeholder. Send it back so the author can fix it.');
  const comment = b.comment.trim(); c.reviews.push({ stage, version: c.versions.length, reviewer: u.name, role: u.role, decision: b.decision, comment, at: now() });
  let detail; if (b.decision === 'reject') { c.status = 'draft'; detail = 'Sent back to author'; }
  else if (stage === 'brand' && c.findings.some((f) => f.category === 'claim')) { c.status = 'in_compliance_review'; detail = 'Routed to compliance: claim involved'; }
  else { c.status = 'approved'; detail = 'Approved'; }
  c.updatedAt = now(); audit(c, `${stage} ${b.decision}`, `${detail} — ${comment}`);
  const mine = { userIds: [c.author] };
  if (b.decision === 'reject') notify(mine, 'Sent back to draft', `${u.name} on “${c.title}”: ${comment}`, c._id);
  else if (c.status === 'in_compliance_review') { notify({ roles: ['compliance'] }, 'Claim needs your sign-off', `“${c.title}” passed brand review and contains a claim`, c._id); notify(mine, 'Brand approved', `“${c.title}” is now with compliance`, c._id); }
  else notify(mine, 'Approved: ready to publish', `“${c.title}” is fully approved`, c._id);
  save(); return pub(c);
});
on('POST', '/content/([^/]+)/publish', (m) => {
  const c = load(m[1]); if (c.status !== 'approved') throw err('Only approved content can be published'); if (!isOwner(c)) throw err('Only the author can publish');
  c.status = 'published'; c.publishedAt = now(); c.publishedBy = me().name; c.updatedAt = now(); audit(c, 'published', 'AI-use record attached'); save(); return pub(c);
});
on('GET', '/content/([^/]+)/audit', (m) => { const c = load(m[1]); return clone(S().audit.filter((a) => a.content === c._id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))); });
on('GET', '/content/([^/]+)/export', (m) => {
  const c = clone(load(m[1])); const log = S().audit.filter((a) => a.content === c._id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return { title: c.title, status: c.status, author: c.authorName, aiUse: { assisted: c.aiAssisted, tool: c.aiTool || null }, finalText: c.text, altText: c.altText, versions: c.versions, reviews: c.reviews, publishedAt: c.publishedAt, publishedBy: c.publishedBy, audit: log.map((a) => ({ at: a.createdAt, actor: a.actor, role: a.role, action: a.action, detail: a.detail })) };
});

on('GET', '/insights', () => {
  const u = me(); let items = S().contents; if (u.role === 'creator') items = items.filter((c) => c.author === u._id);
  const byCat = {}, byRule = {}, byStatus = {}, byAuthor = {}, res = { accepted: 0, edited: 0, disputed: 0, open: 0 }; let total = 0, ai = 0, sentBack = 0; const hours = [];
  for (const c of items) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1; if (c.aiAssisted) ai++; sentBack += c.reviews.filter((x) => x.decision === 'reject').length;
    const fs = c.versions.length ? c.versions[0].findings : c.findings;
    for (const f of fs) { total++; byCat[f.category] = (byCat[f.category] || 0) + 1; const k = f.citation?.title || 'Uncited'; byRule[k] = (byRule[k] || 0) + 1; byAuthor[c.authorName] = (byAuthor[c.authorName] || 0) + 1; }
    for (const f of c.findings) res[f.status] = (res[f.status] || 0) + 1;
    if (c.publishedAt) hours.push((new Date(c.publishedAt) - new Date(c.versions[0]?.at || c.createdAt)) / 36e5);
  }
  const soon = Date.now() + 30 * 864e5;
  const evidence = [...S().kb.facts.map((f) => ({ kind: 'fact', title: f.topic || f.statement, owner: f.owner, expiresAt: f.expiresAt })), ...S().kb.claims.map((c) => ({ kind: 'claim', title: c.statement, owner: c.owner, expiresAt: c.expiresAt }))]
    .filter((e) => e.expiresAt && new Date(e.expiresAt).getTime() < soon).map((e) => ({ ...e, expired: new Date(e.expiresAt) < new Date() })).sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));
  return { contents: items.length, ai, sentBack, totalFindings: total, byCategory: byCat, byStatus, byAuthor, resolution: res, evidence, topRules: Object.entries(byRule).sort((a, b) => b[1] - a[1]).slice(0, 6), avgHoursToPublish: hours.length ? +(hours.reduce((a, b) => a + b, 0) / hours.length).toFixed(1) : null };
});
on('GET', '/audit', (m, b, f, q) => { need('brand', 'compliance'); return clone([...S().audit].sort((a, b2) => new Date(b2.createdAt) - new Date(a.createdAt)).slice(0, +q.get('limit') || 100)); });
on('GET', '/notifications', () => clone(S().notes.filter((n) => n.user === me()._id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 30)));
on('POST', '/notifications/read', () => { S().notes.forEach((n) => { if (n.user === me()._id) n.read = true; }); save(); return { ok: true }; });

export async function handle(method, path, body, form) {
  const [p, qs] = path.split('?'); const q = new URLSearchParams(qs || '');
  for (const [m, re, fn] of R) { if (m !== method) continue; const mt = re.exec(p); if (mt) return fn(mt, body || {}, form, q); }
  throw err('Not found');
}
