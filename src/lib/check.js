import { contentHash } from './db.js';
import { llmEnabled, askJSON, models } from './llm.js';
import { rank } from './retrieval.js';
import { deterministic, heuristicClaims, sentences, isCandidate, BUILTIN } from './engine.js';
export { contentHash };

const isExp = (x) => x.expiresAt && new Date(x.expiresAt) < new Date();
const nums = (s) => (s.match(/\d[\d,.]*\d|\d/g) || []).map((n) => n.replace(/,/g, ''));
const JUDGE_SYS = `You are Inkloom's evidence-bound brand compliance checker.
Rules you must follow:
- You may raise a finding ONLY if an EVIDENCE item justifies it. Cite it by its id in "evidenceId". Never invent rules, facts or numbers.
- "quote" MUST be an exact substring of CONTENT (the shortest span that contains the problem).
- Categories: "claim" (superlative, comparative or numeric claim that no approved claim/fact supports, or that an EXPIRED record covers), "fact" (content contradicts or is outdated versus a fact record), "tone" (breaks a voice rule).
- Do NOT flag claims that an unexpired approved claim or fact already supports.
- "replacement" is a minimal edit that preserves the author's intent and uses ONLY numbers present in the evidence. If a safe replacement is impossible, set it to null.
- severity: claim=block, fact=fix, tone=advise. confidence is 0 to 1.
Return {"findings":[{"category","severity","quote","title","reason","evidenceId","verdict","replacement","confidence"}]}. Return {"findings":[]} if the content is clean.`;

async function llmClaims(text, kb) {
  const docs = [
    ...kb.claims.map((c) => ({ id: `claim:${c._id}`, type: 'claim', title: 'Claim record', text: `${c.statement}${c.approvedWording ? ' | Approved wording: ' + c.approvedWording : ''} | Evidence: ${c.evidence || 'none'} | status ${c.status}${isExp(c) ? ' EXPIRED' : ''}`, exp: isExp(c) })),
    ...kb.facts.map((f) => ({ id: `fact:${f._id}`, type: 'fact', title: `Fact: ${f.topic || 'record'}`, text: `${f.statement}${f.source ? ' | Source: ' + f.source : ''}${isExp(f) ? ' | EXPIRED' : ''}`, exp: isExp(f) })),
    ...kb.rules.map((r) => ({ id: `rule:${r._id}`, type: 'rule', title: `${r.code || ''} ${r.title || ''}`.trim(), text: r.text })),
  ];
  const cands = sentences(text).filter(isCandidate); const picked = new Map();
  [...cands, text].forEach((q, i) => rank(q, docs, i < cands.length ? 3 : 2).forEach((d) => picked.set(d.id, d)));
  for (const r of rank('tone voice style writing', docs.filter((d) => d.type === 'rule'), 2)) picked.set(r.id, r);
  const ev = [...picked.values()].slice(0, 14); ev.unshift({ ...BUILTIN.claims });
  const evMap = new Map(ev.map((e) => [e.id, e]));
  const user = `CONTENT:\n"""${text}"""\n\nSENTENCES TO EXAMINE (also note tone breaches):\n${cands.map((c, i) => `${i + 1}. ${c}`).join('\n') || '(none)'}\n\nEVIDENCE (the only allowed sources):\n${ev.map((e) => `[${e.id}] (${e.type}${e.exp ? ', EXPIRED' : ''}) ${e.title}: ${e.text}`).join('\n')}`;
  const res = await askJSON({ system: JUDGE_SYS, user });
  let found = (res.findings || []).filter((f) => f.quote && text.includes(f.quote));
  found = found.map((f) => { const e = evMap.get(f.evidenceId); const allowed = new Set([...nums(e?.text || ''), ...nums(f.quote)]); return { f, e, safe: f.replacement && nums(f.replacement).every((n) => allowed.has(n)) }; });
  let verdicts = {};
  if (found.length) {
    try {
      const v = await askJSON({ model: models().fast, max: 2048, system: 'You verify compliance findings. For each item decide whether the cited EVIDENCE genuinely supports raising the finding about the QUOTE. Return {"results":[{"i":number,"supports":boolean}]}.',
        user: found.map(({ f, e }, i) => `#${i}\nQUOTE: ${f.quote}\nFINDING: ${f.title} - ${f.reason}\nEVIDENCE: ${e ? e.text : '(none cited)'}`).join('\n\n') });
      (v.results || []).forEach((r) => (verdicts[r.i] = r.supports));
    } catch { verdicts = null; }
  }
  return found.map(({ f, e, safe }, i) => {
    if (verdicts && verdicts[i] === false) return null; const gated = !e;
    return { source: 'llm', category: ['claim', 'fact', 'tone'].includes(f.category) ? f.category : 'claim', severity: f.severity || 'fix', title: f.title || 'Issue', reason: f.reason || '', quote: f.quote,
      confidence: Math.min(1, Math.max(0, +f.confidence || 0.7)), needsReview: gated || verdicts === null, status: 'open',
      citation: e ? { type: e.type, ref: e.id.split(':')[1] || e.id, title: e.title, text: e.text } : null, fix: safe && !gated ? { kind: 'replace', from: f.quote, to: f.replacement } : { kind: 'none' } };
  }).filter(Boolean);
}

export async function runCheck(content, kb, previous = [], altSuggestion = null) {
  let findings = deterministic(content, { terms: kb.terms, settings: kb.settings || {} }, altSuggestion);
  const engine = { llm: llmEnabled(), model: llmEnabled() ? models().model : null, mode: 'heuristic', verified: false, at: new Date().toISOString() };
  let extra = null;
  if (llmEnabled() && content.text.trim()) {
    try { extra = await llmClaims(content.text, kb); engine.mode = 'llm'; engine.verified = true; }
    catch (e) { console.error('LLM check failed, using rule-based engine:', e.message); engine.error = 'AI unavailable (' + e.message.slice(0, 80) + '), rule-based engine used'; }
  }
  if (!extra) extra = heuristicClaims(content.text, kb);
  const seen = new Set(findings.map((f) => f.quote)); extra.forEach((f) => { if (!seen.has(f.quote)) { findings.push(f); seen.add(f.quote); } });
  const key = (f) => `${f.category}|${f.quote || f.title}`;
  const disputed = new Map(previous.filter((p) => p.status === 'disputed').map((p) => [key(p), p]));
  findings = findings.map((f, i) => { const d = disputed.get(key(f)); return { ...f, fid: `f${i + 1}`, ...(d ? { status: 'disputed', disputeReason: d.disputeReason } : {}) }; });
  const order = { block: 0, fix: 1, advise: 2 }; findings.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
  return { findings, engine };
}
