// Optional Gemini calls straight from the browser. The key lives only in this browser's localStorage.
const key = () => localStorage.getItem('ik_gemini') || '';
export const llmEnabled = () => !!key();
export const models = () => { const m = localStorage.getItem('ik_model'); return { model: m || 'gemini-2.5-flash', fast: m || 'gemini-2.5-flash-lite' }; };

export function parseJSON(t) {
  const s = t.replace(/```json|```/g, '');
  const a = Math.min(...['{', '['].map((c) => (s.indexOf(c) < 0 ? Infinity : s.indexOf(c))));
  const b = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (!isFinite(a) || b < a) throw new Error('LLM returned no JSON');
  return JSON.parse(s.slice(a, b + 1));
}
async function generate(model, body) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key())}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error?.message || `Gemini error ${r.status}`);
  const text = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) throw new Error('Gemini returned no text');
  return text;
}
export async function askJSON({ system, user, model = models().model, max = 8192 }) {
  return parseJSON(await generate(model, { systemInstruction: { parts: [{ text: system + '\nRespond with a single JSON value only.' }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: max, temperature: 0.1 } }));
}
export async function describeImage({ url, mime }) {
  const text = await generate(models().fast, { contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data: url.split(',')[1] } }, { text: 'Write ONE concise alt text (max 125 characters) for this image for a screen-reader user. Describe what is shown; do not start with "Image of". Output only the alt text.' }] }], generationConfig: { maxOutputTokens: 2048, temperature: 0.2 } });
  return text.trim().replace(/^["']|["']$/g, '');
}
