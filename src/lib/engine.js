// Pure, deterministic part of the checker. No DB, no network: fully unit-testable.
import { tok } from './retrieval.js';

export const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const sentences = (t) => (t.match(/[^.!?\n]+[.!?]*/g) || []).map((s) => s.trim()).filter(Boolean);

export const SUP = /\b(world['’]s [a-z]+|fastest|best|leading|#1|number one|unbeatable|guaranteed?|risk[- ]free|industry[- ]leading|market[- ]leading)\b/i;
const CMP = /\b(better|faster|cheaper|smarter|more [a-z]+|less [a-z]+) than\b/i;
export const isCandidate = (s) => SUP.test(s) || CMP.test(s) || /\d/.test(s);

export const BUILTIN = {
  claims: { id: 'builtin:claims', type: 'policy', title: 'Claims policy', text: 'Superlatives, comparative claims and numeric or percentage claims require an approved, unexpired evidence record in the claim library or fact base.' },
  contrast: { id: 'builtin:wcag143', type: 'wcag', title: 'WCAG 2.2 AA 1.4.3 Contrast (Minimum)', text: 'Normal text needs a contrast ratio of at least 4.5:1 against its background.' },
  alt: { id: 'builtin:wcag111', type: 'wcag', title: 'WCAG 2.2 AA 1.1.1 Non-text Content', text: 'Every informative image needs a text alternative.' },
};
const cite = (b) => ({ type: b.type, ref: b.id, title: b.title, text: b.text });

export function lum(hex) {
  let h = (hex || '').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const v = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
export function contrast(a, b) {
  const x = lum(a), y = lum(b);
  if (x == null || y == null) return null;
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function deterministic({ text, altText, hasImage, design }, { terms = [], settings = {} }, altSuggestion = null) {
  const out = [];
  const add = (o) => out.push({ source: 'rule', confidence: 1, needsReview: false, status: 'open', ...o });

  for (const t of terms) {
    if (!t.banned) continue;
    const re = new RegExp(`(?<![\\w])${esc(t.banned)}(?![\\w])`, t.caseSensitive ? 'g' : 'gi');
    const seen = new Set(); let m;
    while ((m = re.exec(text))) {
      if (seen.has(m[0])) continue; seen.add(m[0]);
      const to = t.preferred ? (!t.caseSensitive && /^[A-Z]/.test(m[0]) ? cap(t.preferred) : t.preferred) : null;
      add({
        category: 'terminology', severity: to ? 'fix' : 'block',
        title: `${to ? 'Non-approved term' : 'Restricted phrase'} “${m[0]}”`,
        reason: to ? `Use “${to}” instead.` : 'This phrase is restricted by the glossary.',
        quote: m[0],
        citation: { type: 'glossary', ref: String(t._id || t.banned), title: 'Glossary', text: (to ? `Use “${t.preferred}”, not “${t.banned}”. ` : `Restricted phrase “${t.banned}”. `) + (t.note || '') },
        fix: to ? { kind: 'replace', from: m[0], to } : { kind: 'none' },
      });
    }
  }

  const maxEx = settings.maxExclamations ?? 1;
  if ((text.match(/!/g) || []).length > maxEx) {
    add({ category: 'tone', severity: 'advise', title: 'Too many exclamation marks', reason: `Brand voice allows at most ${maxEx} per piece.`, quote: '!',
      citation: { type: 'setting', ref: 'maxExclamations', title: 'Brand voice setting', text: `Use at most ${maxEx} exclamation mark(s) per piece.` }, fix: { kind: 'excl', keep: maxEx } });
  }

  const min = settings.minContrast || 4.5;
  const r = contrast(design?.textColor, design?.bgColor);
  if (hasImage && r != null && r < min) {
    const cands = [...(settings.approvedTextColors || []), '#111827', '#000000', '#FFFFFF'];
    const pick = cands.find((c) => contrast(c, design.bgColor) >= min) || '#000000';
    add({ category: 'accessibility', severity: 'block', title: `Low-contrast banner text (${r.toFixed(1)}:1)`, reason: `Needs at least ${min}:1. ${pick} gives ${contrast(pick, design.bgColor).toFixed(1)}:1.`, quote: design.textColor,
      citation: cite(BUILTIN.contrast), fix: { kind: 'set_color', to: pick } });
  }

  if (hasImage && !(altText || '').trim()) {
    add({ category: 'accessibility', severity: 'block', title: 'Missing alt text on image', reason: altSuggestion ? 'Draft alt text suggested. Edit it so it truly describes the image.' : 'Write a short description of the image.', quote: '',
      citation: cite(BUILTIN.alt), fix: altSuggestion ? { kind: 'set_alt', to: altSuggestion } : { kind: 'none' } });
  }
  return out;
}

const nums = (s) => (s.match(/\d[\d,.]*\d|\d/g) || []).map((n) => n.replace(/,/g, ''));
const expired = (x) => x.expiresAt && new Date(x.expiresAt) < new Date();

// Used when no LLM key is configured (or the LLM call fails). Honest about being heuristic.
export function heuristicClaims(text, { claims = [], facts = [], rules = [] }) {
  const out = []; const done = new Set();
  const policyRule = rules.find((r) => r.category === 'claims');
  const policy = policyRule ? { type: 'rule', ref: String(policyRule._id), title: `${policyRule.code} ${policyRule.title}`.trim(), text: policyRule.text } : cite(BUILTIN.claims);
  const add = (o) => out.push({ source: 'heuristic', confidence: 0.6, needsReview: false, status: 'open', ...o });

  for (const s of sentences(text)) {
    if (!isCandidate(s)) continue;
    const st = new Set(tok(s)); const sn = nums(s);
    let handled = false;

    if (sn.length) {
      for (const f of facts) {
        const ov = tok(`${f.statement} ${f.topic || ''}`).filter((w) => !/^\d/.test(w) && st.has(w)).length;
        const fn = nums(f.statement);
        if (ov < 2 || !fn.length) continue;
        handled = true;
        const c = { type: 'fact', ref: String(f._id), title: `Fact: ${f.topic || 'record'}${f.source ? ' (' + f.source + ')' : ''}`, text: f.statement + (expired(f) ? ' [EXPIRED: owner must re-verify]' : '') };
        if (!sn.some((n) => fn.includes(n))) {
          const m = s.match(new RegExp(`\\b${esc(sn[0])}\\b(?:\\s+[A-Za-z]+){0,2}`));
          if (m) add({ category: 'fact', severity: 'fix', title: 'Outdated or conflicting fact', reason: `Content says ${sn[0]}; the approved record says ${fn[0]}.`, quote: m[0], citation: c, fix: { kind: 'replace', from: m[0], to: m[0].replace(/\d[\d,.]*/, fn[0]) } });
        } else if (expired(f)) {
          add({ category: 'fact', severity: 'advise', needsReview: true, title: 'Fact record has expired', reason: 'The matching fact passed its expiry date and needs owner re-verification.', quote: s, citation: c, fix: { kind: 'none' } });
        }
        break;
      }
    }
    if (handled) continue;

    const sup = SUP.exec(s) || CMP.exec(s); const pct = s.match(/\d[\d,.]*\s?%/);
    if (!sup && !pct) continue;
    const match = claims.find((c) => { const ct = tok(c.statement); return ct.length && ct.filter((w) => st.has(w)).length / ct.length >= 0.5; });
    if (match && match.status === 'approved' && !expired(match)) continue; // supported
    let from;
    if (sup) {
      const idx = s.toLowerCase().indexOf(sup[0].toLowerCase());
      const tail = s.slice(idx + sup[0].length).match(/^(?:\s+[A-Za-z]+){0,2}/)[0];
      from = s.slice(idx, idx + sup[0].length) + tail;
      if (s.slice(Math.max(0, idx - 4), idx).toLowerCase() === 'the ') from = 'the ' + from;
    } else from = pct[0];
    const key = from.toLowerCase(); if (done.has(key)) continue; done.add(key);
    const to = (sup ? from.replace(SUP, '').replace(CMP, '').replace(/\s+/g, ' ').trim() : from) + ' [needs evidence]';
    add({ category: 'claim', severity: 'block', title: match ? 'Claim evidence has expired' : 'Unsupported claim', reason: match ? 'The matching claim record is expired or not approved.' : 'No approved evidence record in the claim library.', quote: from,
      citation: match ? { type: 'claim', ref: String(match._id), title: 'Claim record', text: `${match.statement} — ${match.evidence || 'no evidence'}` } : policy, fix: { kind: 'replace', from, to } });
  }
  return out;
}
