// In-browser "database": localStorage JSON, seeded with the Northwind demo workspace.
import { KIT, ITEMS, analyse, resolve, svg } from './seedData.js';

const KEY = 'inkloom-demo-v4';
const D = 864e5; let n = 0;
const uid = () => 'i' + (++n) + Math.random().toString(36).slice(2, 7);
const ago = (d) => new Date(Date.now() - d * D).toISOString();
export const contentHash = (c) => { const s = JSON.stringify([c.text, c.altText, c.design?.textColor, c.design?.bgColor, !!c.hasImage]); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h); };
export const DEFAULT_SETTINGS = { maxExclamations: 1, minContrast: 4.5, approvedTextColors: ['#374151', '#111827'] };

export function sampleKit() {
  const k = KIT(); const withId = (a) => a.map((r) => ({ ...r, _id: uid() }));
  const dated = (a) => a.map(({ days, ...r }) => ({ ...r, _id: uid(), expiresAt: new Date(Date.now() + days * D).toISOString() }));
  return { rules: withId(k.rules), glossary: withId(k.terms), facts: dated(k.facts), claims: dated(k.claims) };
}
export const kbForEngine = () => ({ rules: S.kb.rules, facts: S.kb.facts, claims: S.kb.claims, terms: S.kb.glossary, settings: S.settings });

function build() {
  const mk = (key, name, email, role) => ({ _id: uid(), key, name, email, role });
  const users = [mk('maya', 'Maya Sharma', 'maya@northwind.demo', 'creator'), mk('rohan', 'Rohan Mehta', 'rohan@northwind.demo', 'creator'), mk('priya', 'Priya Nair', 'priya@northwind.demo', 'brand'), mk('arjun', 'Arjun Rao', 'arjun@northwind.demo', 'compliance')];
  const U = Object.fromEntries(users.map((u) => [u.key, u]));
  const st = { v: 4, users, settings: { ...DEFAULT_SETTINGS }, kb: sampleKit(), contents: [], audit: [], notes: [], assets: {} };
  const kb = { rules: st.kb.rules, facts: st.kb.facts, claims: st.kb.claims, terms: st.kb.glossary, settings: st.settings };

  for (const it of ITEMS) {
    const author = U[it.by]; const submitted = !!it.sub;
    const raw = it.unchecked ? [] : analyse(it.orig, it, kb); const findings = resolve(it, raw);
    const text = (submitted || it.stage !== 'draft') && it.final ? it.final : it.orig;
    const design = it.design || { textColor: '#111827', bgColor: '#FFFFFF' };
    const c = { _id: uid(), author: author._id, authorName: author.name, title: it.title, channel: it.channel, text, altText: it.alt || '', design, hasImage: !!it.img, aiAssisted: !!it.ai, aiTool: it.tool,
      status: it.stage, findings, engine: it.unchecked ? undefined : { llm: false, mode: 'heuristic', verified: false, at: ago(it.age) }, checkedAt: it.unchecked ? undefined : ago(it.age - 0.02), reviews: [], versions: [] };
    c.checkedHash = it.unchecked ? undefined : contentHash(c);
    if (submitted) c.versions.push({ n: 1, text, altText: c.altText, design, aiAssisted: c.aiAssisted, findings, by: author.name, at: ago(it.sub) });
    for (const [role, decision, comment, d] of it.rev || []) { const w = role === 'brand' ? U.priya : U.arjun; c.reviews.push({ stage: role, version: 1, reviewer: w.name, role, decision, comment, at: ago(d) }); }
    if (it.pub) { c.publishedAt = ago(it.pub); c.publishedBy = author.name; }
    c.createdAt = ago(it.age); c.updatedAt = ago(Math.min(it.age, it.sub ?? it.age, ...(it.rev || []).map((r) => r[3]), it.pub ?? 99));
    st.contents.push(c);

    const log = (d, who, action, detail) => st.audit.push({ _id: uid(), content: c._id, contentTitle: it.title, actor: who.name, role: who.role, action, detail, createdAt: ago(d) });
    log(it.age, author, 'created', 'Draft created');
    if (!it.unchecked) log(it.age - 0.02, author, 'checked', `${raw.length} finding(s) · engine: rule-based`);
    if (!it.openFindings) findings.forEach((f, i) => log(it.age - 0.03 - i * 0.002, author, `finding ${f.status}`, f.title + (f.disputeReason ? ` — ${f.disputeReason}` : '')));
    if (submitted) log(it.sub, author, 'submitted', `Version 1 sent to brand review${it.ai ? ` (AI-assisted${it.tool ? ': ' + it.tool : ''})` : ''}`);
    for (const r of c.reviews) { const w = r.role === 'brand' ? U.priya : U.arjun; const d = (Date.now() - new Date(r.at)) / D;
      log(d, w, `${r.role} ${r.decision}`, `${r.decision === 'reject' ? 'Sent back to author' : r.role === 'brand' && findings.some((f) => f.category === 'claim') ? 'Routed to compliance: claim involved' : 'Approved'} — ${r.comment}`); }
    if (it.pub) log(it.pub, author, 'published', 'AI-use record attached');

    const nt = (user, title, body, d, read) => st.notes.push({ _id: uid(), user: user._id, title, body, content: c._id, read, createdAt: ago(d) });
    if (it.stage === 'in_brand_review') nt(U.priya, 'New submission', `“${it.title}” v1 by ${author.name} is waiting for brand review`, it.sub, false);
    if (it.stage === 'in_compliance_review') { nt(U.arjun, 'Claim needs your sign-off', `“${it.title}” passed brand review and contains a claim`, it.rev[0][3], false); nt(author, 'Brand approved', `“${it.title}” is now with compliance`, it.rev[0][3], true); }
    if (it.stage === 'approved') nt(author, 'Approved: ready to publish', `“${it.title}” is fully approved`, 3, false);
    if (it.key === 'notes') nt(author, 'Sent back to draft', `Priya Nair on “${it.title}”: ${it.rev[0][2]}`, 1, false);
    if (it.pub) nt(author, 'Approved: ready to publish', `“${it.title}” is fully approved`, it.pub + 0.2, true);
    if (it.img) st.assets[c._id] = { url: 'data:image/svg+xml;utf8,' + encodeURIComponent(svg(it.key === 'launch' ? 'Faster insights for every team' : 'Webinar: faster reporting', it.key === 'launch' ? '#9CA3AF' : '#2c4a86')), mime: 'image/svg+xml', name: it.img };
  }
  return st;
}

let S; let CUR = null;
try { const x = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null; S = x ? JSON.parse(x) : null; } catch { S = null; }
if (!S || S.v !== 4) S = build();
export const state = () => S;
export const uidgen = uid;
export function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { console.warn('Could not persist demo data:', e.message); } }
save();
export function reset() { S = build(); CUR = null; save(); }
export const current = () => (CUR ? S.users.find((u) => u._id === CUR._id) || null : null);
export const setCurrent = (u) => { CUR = u; };
export const resetKit = () => { S.kb = sampleKit(); S.settings = { ...DEFAULT_SETTINGS }; save(); };
