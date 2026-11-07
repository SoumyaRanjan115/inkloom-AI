import { useEffect, useRef, useState } from 'react';
import { api, fmtD } from '../api.js';
import { useApp } from '../App.jsx';

const CAT = ['voice', 'visual', 'claims', 'accessibility', 'legal', 'general'];
const T = {
  rules: { label: 'Guideline rules', hint: 'Numbered rules the checker cites.', cols: ['code', 'title', 'category', 'text'], form: [['code'], ['title'], ['category', CAT], ['text', 'area']] },
  facts: { label: 'Fact base', hint: 'Verified facts with an owner and expiry date.', cols: ['topic', 'statement', 'source', 'expiresAt'], form: [['topic'], ['statement', 'area'], ['owner'], ['source'], ['expiresAt', 'date']] },
  claims: { label: 'Claim library', hint: 'Approved claims and their evidence.', cols: ['statement', 'evidence', 'owner', 'expiresAt', 'status'], form: [['statement', 'area'], ['approvedWording', 'area'], ['evidence'], ['owner'], ['expiresAt', 'date'], ['status', ['approved', 'draft']]] },
  glossary: { label: 'Glossary', hint: 'Banned or restricted terms and their approved replacements.', cols: ['banned', 'preferred', 'note'], form: [['banned'], ['preferred'], ['note'], ['caseSensitive', 'check']] },
};
const OWN = { rules: 'brand', glossary: 'brand', facts: 'compliance', claims: 'compliance' };
const OWNER_LABEL = { brand: 'Brand Manager', compliance: 'Compliance Reviewer' };
const isExp = (r) => r.expiresAt && new Date(r.expiresAt) < new Date();

function Table({ type }) {
  const { user } = useApp(); const cfg = T[type]; const w = user.role === OWN[type];
  const [rows, setRows] = useState([]); const [f, setF] = useState(null); const [err, setErr] = useState(''); const [imp, setImp] = useState(null); const [busy, setBusy] = useState(false); const file = useRef();
  const load = () => api('/kb/' + type).then(setRows); useEffect(() => { setF(null); setImp(null); load(); }, [type]);
  const save = async (e) => { e.preventDefault(); setErr(''); try { f._id ? await api(`/kb/${type}/${f._id}`, { method: 'PUT', body: f }) : await api('/kb/' + type, { method: 'POST', body: f }); setF(null); load(); } catch (x) { setErr(x.message); } };
  const ingest = async (e) => { const fd = new FormData(); fd.append('file', e.target.files[0]); setBusy(true); setErr(''); try { setImp(await api('/kb/ingest', { method: 'POST', form: fd })); } catch (x) { setErr(x.message); } setBusy(false); e.target.value = ''; };
  const importAll = async () => { await api('/kb/rules-bulk', { method: 'POST', body: { rules: imp.rules } }); setImp(null); load(); };
  return (<>
    <p className="mu">{cfg.hint}</p>{!w && <div className="banner">Maintained by the {OWNER_LABEL[OWN[type]]}. You can read it, and every finding cites it.</div>}{err && <div className="banner err-b">{err}</div>}
    {w && <div className="actions" style={{ marginTop: 0 }}><button className="btn primary" onClick={() => setF({ category: 'general', status: 'approved' })}>+ Add</button>
      {type === 'rules' && <><input ref={file} type="file" hidden accept=".pdf,.docx,.txt,.md" onChange={ingest} /><button className="btn" disabled={busy} onClick={() => file.current.click()}>{busy ? 'Reading guideline…' : '⇪ Import guideline (PDF / DOCX / TXT)'}</button></>}</div>}
    {imp && <div className="card"><h2>Review {imp.rules.length} extracted rules <span className="tag">{imp.mode === 'llm' ? 'AI' : 'heuristic'}</span></h2>
      <div className="scroll" style={{ maxHeight: 260 }}>{imp.rules.map((r, i) => <div key={i} className="log"><b>{r.code}</b> {r.title} <span className="tag">{r.category}</span><div className="mu sm">{r.text}</div></div>)}</div>
      <div className="actions"><button className="btn good" onClick={importAll}>Add all to knowledge base</button><button className="btn" onClick={() => setImp(null)}>Discard</button></div></div>}
    {f && <form className="card" onSubmit={save}><div className="grid2">{cfg.form.map(([k, kind]) => (
      <div key={k} className={kind === 'area' ? 'span2' : ''}><label>{k}</label>
        {Array.isArray(kind) ? <select value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })}>{kind.map((o) => <option key={o}>{o}</option>)}</select>
          : kind === 'area' ? <textarea rows={2} value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          : kind === 'check' ? <input type="checkbox" checked={!!f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />
          : <input type={kind === 'date' ? 'date' : 'text'} value={kind === 'date' ? (f[k] || '').slice(0, 10) : f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}</div>))}</div>
      <div className="actions"><button className="btn primary">Save</button><button type="button" className="btn" onClick={() => setF(null)}>Cancel</button></div></form>}
    <section className="card scroll"><table><thead><tr>{cfg.cols.map((c) => <th key={c}>{c}</th>)}{w && <th />}</tr></thead><tbody>
      {rows.map((r) => <tr key={r._id}>{cfg.cols.map((c) => <td key={c}>{c === 'expiresAt' ? (r.expiresAt ? <span className={isExp(r) ? 'tag warn' : ''}>{isExp(r) ? 'EXPIRED ' : ''}{fmtD(r.expiresAt)}</span> : '–') : String(r[c] ?? '')}</td>)}
        {w && <td className="nowrap"><button className="link" onClick={() => setF(r)}>edit</button> <button className="link red" onClick={async () => { await api(`/kb/${type}/${r._id}`, { method: 'DELETE' }); load(); }}>delete</button></td>}</tr>)}</tbody></table>
      {!rows.length && <div className="empty">Empty. Add records{user.role === 'brand' ? ' or load the sample brand kit from Settings' : ''}.</div>}</section>
  </>);
}

function Settings() {
  const { user } = useApp(); const [s, setS] = useState(null); const [msg, setMsg] = useState('');
  useEffect(() => { api('/org').then((o) => setS({ ...o.settings, colors: o.settings.approvedTextColors.join(', ') })); }, []);
  if (!s) return null; const admin = user.role === 'brand';
  const save = async () => { try { await api('/org/settings', { method: 'PUT', body: { maxExclamations: +s.maxExclamations, minContrast: +s.minContrast, approvedTextColors: s.colors.split(',').map((x) => x.trim()).filter(Boolean) } }); setMsg('Saved'); } catch (e) { setMsg(e.message); } };
  return (<div className="card"><h2>Rule settings</h2><div className="grid2"><div><label>Max exclamation marks</label><input disabled={!admin} type="number" value={s.maxExclamations} onChange={(e) => setS({ ...s, maxExclamations: e.target.value })} /></div>
    <div><label>Minimum contrast ratio</label><input disabled={!admin} type="number" step="0.1" value={s.minContrast} onChange={(e) => setS({ ...s, minContrast: e.target.value })} /></div>
    <div className="span2"><label>Approved text colours (comma separated hex)</label><input disabled={!admin} value={s.colors} onChange={(e) => setS({ ...s, colors: e.target.value })} /></div></div>
    {admin && <div className="actions"><button className="btn primary" onClick={save}>Save settings</button><button className="btn" onClick={async () => { if (confirm('Replace all knowledge base records with the sample Northwind brand kit?')) { await api('/kb/sample', { method: 'POST' }); setMsg('Sample kit loaded'); } }}>Load sample brand kit</button></div>}<div className="mu">{msg}</div></div>);
}

function AiKey() {
  const [k, setK] = useState(localStorage.getItem('ik_gemini') || ''); const [m, setM] = useState(localStorage.getItem('ik_model') || ''); const [msg, setMsg] = useState('');
  const save = () => { k.trim() ? localStorage.setItem('ik_gemini', k.trim()) : localStorage.removeItem('ik_gemini'); m.trim() ? localStorage.setItem('ik_model', m.trim()) : localStorage.removeItem('ik_model'); setMsg(k.trim() ? 'Saved. Run a check to use the AI judge.' : 'Key removed. Using the rule-based engine.'); window.dispatchEvent(new Event('ik-ai')); };
  return (<div className="card"><h2>AI engine (optional)</h2><p className="mu">The demo works fully without this. Paste a free Gemini key (aistudio.google.com/apikey) to add the evidence-bound AI judge, verification pass, AI alt text and AI guideline extraction. The key is stored only in this browser.</p>
    <div className="grid2"><div><label>Gemini API key</label><input type="password" value={k} onChange={(e) => setK(e.target.value)} placeholder="AIza…" /></div><div><label>Model override (optional)</label><input value={m} onChange={(e) => setM(e.target.value)} placeholder="gemini-2.5-flash" /></div></div>
    <div className="actions"><button className="btn primary" onClick={save}>Save</button></div><div className="mu">{msg}</div></div>);
}

export default function Knowledge() {
  const [t, setT] = useState('rules');
  return (<><header className="page"><h1>Knowledge base</h1></header>
    <div className="tabs">{[...Object.keys(T), 'settings'].map((k) => <a key={k} className={t === k ? 'on' : ''} onClick={() => setT(k)}>{k === 'settings' ? 'Settings' : T[k].label}</a>)}</div>
    {t === 'settings' ? <><Settings /><AiKey /></> : <Table type={t} />}</>);
}
