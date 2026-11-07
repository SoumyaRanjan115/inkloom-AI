// Lightweight TF-IDF retrieval (no external vector DB needed). Swap for Atlas Vector Search later.
const STOP = new Set('a an the and or of to in on for with is are was be as at by it its this that from our your we you they their can will so all one'.split(' '));
export const tok = (s = '') => (s.toLowerCase().match(/[a-z0-9]+/g) || []).map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)).filter((w) => !STOP.has(w));

export function rank(query, docs, k = 3) {
  if (!docs.length) return [];
  const N = docs.length;
  const toks = docs.map((d) => tok(`${d.title || ''} ${d.text}`));
  const df = {};
  toks.forEach((t) => new Set(t).forEach((w) => (df[w] = (df[w] || 0) + 1)));
  const vec = (t) => { const v = {}; t.forEach((w) => (v[w] = (v[w] || 0) + 1)); Object.keys(v).forEach((w) => (v[w] *= Math.log(1 + N / (df[w] || 1)))); return v; };
  const norm = (a) => Math.sqrt(Object.values(a).reduce((s, x) => s + x * x, 0)) || 1;
  const q = vec(tok(query));
  return docs
    .map((d, i) => { const v = vec(toks[i]); const dot = Object.keys(q).reduce((s, w) => s + (v[w] ? q[w] * v[w] : 0), 0); return { ...d, score: dot / (norm(q) * norm(v)) }; })
    .filter((d) => d.score > 0.08).sort((a, b) => b.score - a.score).slice(0, k);
}
