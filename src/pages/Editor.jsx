import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, download, imgUrl, STATUS, fmt } from '../api.js';
import { useApp } from '../App.jsx';
import { Stamp } from './Home.jsx';

const lum = (h) => { h = (h || '').replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); if (!/^[0-9a-f]{6}$/i.test(h)) return null; const v = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return x == null || y == null ? null : (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const GLYPH = { block: '■', fix: '▲', advise: '●' };
const STEPS = ['draft', 'in_brand_review', 'in_compliance_review', 'approved', 'published'];

function Highlight({ text, findings }) {
  const qs = [...new Set(findings.filter((f) => f.status === 'open' && f.quote && f.quote.length > 1).map((f) => f.quote))];
  if (!qs.length) return <>{text || <span className="mu">Nothing yet</span>}</>;
  const re = new RegExp('(' + qs.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g');
  const sev = (q) => findings.find((f) => f.quote === q)?.severity;
  return <>{text.split(re).map((p, i) => (i % 2 ? <mark key={i} className={sev(p)}>{p}</mark> : p))}</>;
}

function Diff({ f }) {
  const x = f.fix || {};
  if (x.kind === 'replace') return <div className="diff"><del>{x.from}</del> → <ins>{x.to}</ins>{/\[needs evidence\]/.test(x.to) && <div className="mu sm">Placeholder only: use Edit to write evidence-backed wording, or a reviewer will send it back.</div>}</div>;
  if (x.kind === 'set_color') return <div className="diff"><del>text colour</del> → <ins style={{ background: x.to, color: '#fff', padding: '0 6px' }}>{x.to}</ins></div>;
  if (x.kind === 'set_alt') return <div className="diff">Alt text → <ins>{x.to}</ins></div>;
  if (x.kind === 'excl') return <div className="diff">Keep {x.keep} “!”, end the others with a full stop</div>;
  return <div className="diff mu">No automatic fix. Edit with your own wording or dispute.</div>;
}

export default function Editor() {
  const { id } = useParams(); const { user } = useApp(); const nav = useNavigate(); const fileRef = useRef();
  const [c, setC] = useState(null); const [busy, setBusy] = useState(''); const [err, setErr] = useState(''); const [note, setNote] = useState('');
  const [tab, setTab] = useState('findings'); const [ui, setUi] = useState(null); const [val, setVal] = useState(''); const [cm, setCm] = useState(''); const [log, setLog] = useState([]); const [iv, setIv] = useState(0); const [showAll, setShowAll] = useState(false);
  const load = () => api('/content/' + id).then(setC).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [id]);
  useEffect(() => { if (tab === 'audit') api(`/content/${id}/audit`).then(setLog); }, [tab, c?.status, c?.findings]);
  if (!c) return <div className="empty">{err || 'Loading…'}</div>;

  const editable = c.status === 'draft' && c.author === user.id;
  const owner = c.author === user.id;
  const set = (k, v) => setC((x) => ({ ...x, [k]: v, dirty: true }));
  const run = async (label, fn) => { setBusy(label); setErr(''); setNote(''); try { const r = await fn(); if (r && r._id) setC(r); } catch (e) { setErr(e.message); } setBusy(''); };
  const save = () => api('/content/' + id, { method: 'PUT', body: { title: c.title, channel: c.channel, text: c.text, altText: c.altText, design: c.design, aiAssisted: c.aiAssisted, aiTool: c.aiTool || '' } });
  const post = (p, body) => api(`/content/${id}/${p}`, { method: 'POST', body });
  const act = (fid, body) => { if (c.dirty) return setErr('You have unsaved edits. Click “Run policy check” first.'); run('act', async () => { const r = await post('findings/' + fid, body); setUi(null); setVal(''); return r; }); };
  const upload = (e) => { const fd = new FormData(); fd.append('image', e.target.files[0]); run('Uploading', async () => { const r = await api(`/content/${id}/image`, { method: 'POST', form: fd }); setIv((v) => v + 1); return r; }); };
  const suggest = () => run('Drafting alt text', async () => { const r = await post('suggest-alt'); if (r.alt) set('altText', r.alt); else setNote(r.note || 'No suggestion available'); });
  const decide = (decision) => run('Reviewing', async () => { const r = await post('review', { decision, comment: cm }); setCm(''); return r; });
  const needStage = { in_brand_review: 'brand', in_compliance_review: 'compliance' }[c.status];
  const canReview = needStage && user.role === needStage && c.author !== user.id;
  const r = ratio(c.design.textColor, c.design.bgColor);
  const open = c.findings.filter((f) => f.status === 'open').length;
  const si = STEPS.indexOf(c.status);
  const shown = user.role === 'compliance' && !showAll ? c.findings.filter((f) => ['claim', 'fact'].includes(f.category)) : c.findings;

  return (<>
    <header className="page">
      <div><div className="eyebrow">{c.channel} · by {c.authorName}</div>
        <h1>{editable ? <input className="title-in" value={c.title} onChange={(e) => set('title', e.target.value)} /> : c.title}</h1></div>
      <div className="row-r"><button className="btn" onClick={() => download(`/content/${id}/export`, `inkloom-audit-${id}.json`)}>Export audit report</button>{editable && <button className="btn danger" onClick={async () => { if (confirm('Delete this draft?')) { await api('/content/' + id, { method: 'DELETE' }); nav('/content'); } }}>Delete</button>}</div>
    </header>
    <div className="steps">{STEPS.map((s, i) => <span key={s} className={i < si ? 'past' : i === si ? 'now' : ''}>{i < si ? '✓ ' : ''}{STATUS[s]}</span>)}</div>
    {err && <div className="banner err-b">{err}</div>}{note && <div className="banner">{note}</div>}
    {c.stale && c.checkedAt && editable && <div className="banner warn">The content changed since the last check. Run the policy check again.</div>}

    <div className="split">
      <section>
        <div className="card">
          <h2>Draft</h2>
          <textarea rows={8} disabled={!editable} value={c.text} onChange={(e) => set('text', e.target.value)} placeholder="Paste or write the content to check…" />
          <div className="lbl">Flagged text</div><div className="ann"><Highlight text={c.text} findings={c.findings} /></div>
          <div className="grid2">
            <div><label>Channel</label><select disabled={!editable} value={c.channel} onChange={(e) => set('channel', e.target.value)}>{['LinkedIn post', 'Landing page', 'Email', 'Blog article', 'Ad copy', 'Press release'].map((x) => <option key={x}>{x}</option>)}</select></div>
            <div><label>AI-use record</label><div className="inline"><input type="checkbox" disabled={!editable} checked={c.aiAssisted} onChange={(e) => set('aiAssisted', e.target.checked)} /> AI-assisted <input disabled={!editable || !c.aiAssisted} placeholder="tool, e.g. ChatGPT" value={c.aiTool || ''} onChange={(e) => set('aiTool', e.target.value)} /></div></div>
          </div>
        </div>
        <div className="card">
          <h2>Image &amp; accessibility</h2>
          <div className="img-row">
            <div className="banner-prev" style={{ background: c.design.bgColor, color: c.design.textColor }}>{c.hasImage ? <img src={imgUrl(id, iv)} alt={c.altText} /> : <span>No image</span>}<div className="cap">Faster insights for every team</div></div>
            <div style={{ flex: 1 }}>
              <input ref={fileRef} type="file" hidden accept="image/*" onChange={upload} />
              <button className="btn" disabled={!editable} onClick={() => fileRef.current.click()}>{c.hasImage ? 'Replace image' : 'Upload banner image'}</button>
              <label>Alt text</label><input disabled={!editable} value={c.altText} onChange={(e) => set('altText', e.target.value)} placeholder="Describe the image for screen readers" />
              {editable && c.hasImage && <button className="btn sm" onClick={suggest}>✦ Suggest with AI</button>}
              <div className="grid2"><div><label>Banner text colour</label><input type="color" disabled={!editable} value={c.design.textColor} onChange={(e) => set('design', { ...c.design, textColor: e.target.value })} /></div>
                <div><label>Background</label><input type="color" disabled={!editable} value={c.design.bgColor} onChange={(e) => set('design', { ...c.design, bgColor: e.target.value })} /></div></div>
              {r && <div className={'ratio ' + (r >= 4.5 ? 'ok' : 'bad')}>Contrast {r.toFixed(1)}:1 {r >= 4.5 ? '✓ passes AA' : '✕ fails AA (4.5:1)'}</div>}
            </div>
          </div>
        </div>
        {editable && <div className="actions"><button className="btn" disabled={!!busy} onClick={() => run('Saving', save)}>Save draft</button>
          <button className="btn primary" disabled={!!busy || !c.text.trim()} onClick={() => run('Checking', async () => { await save(); return post('check'); })}>{busy === 'Checking' ? 'Checking against your sources…' : 'Run policy check'}</button>
          <button className="btn good" disabled={!!busy || !c.checkedAt || c.stale || c.dirty || open > 0} title={open ? 'Resolve all findings first' : ''} onClick={() => run('Submitting', () => post('submit'))}>Submit for review →</button></div>}
        {c.status === 'approved' && owner && <div className="actions"><button className="btn good" onClick={() => run('Publishing', () => post('publish'))}>Publish</button></div>}
        {c.status === 'published' && <div className="card seal"><Stamp s="published" /> Published {fmt(c.publishedAt)} by {c.publishedBy}. AI-use record attached{c.aiAssisted ? ` (${c.aiTool || 'AI-assisted'})` : ' (no AI used)'}.</div>}
      </section>

      <section>
        {needStage && <div className="card review"><h2>{needStage === 'brand' ? 'Brand review' : 'Compliance review'}</h2>
          {canReview ? <><p className="mu">Review the findings and their citations, then decide. A written reason is required.</p>
            <textarea rows={3} value={cm} onChange={(e) => setCm(e.target.value)} placeholder="Reason / comment (required)" />
            <div className="actions"><button className="btn good" disabled={!!busy} onClick={() => decide('approve')}>Approve</button><button className="btn danger" disabled={!!busy} onClick={() => decide('reject')}>Send back</button></div></>
            : <p className="mu">{c.author === user.id ? 'You are the author, so a different person must approve.' : `Waiting for a ${needStage === 'brand' ? 'Brand Manager' : 'Compliance Reviewer'}.`}</p>}</div>}
        <div className="tabs">{['findings', 'history', 'audit'].map((t) => <a key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'findings' ? `Findings${c.findings.length ? ` (${open} open)` : ''}` : t[0].toUpperCase() + t.slice(1)}</a>)}</div>

        {tab === 'findings' && <>
          {c.engine && <div className="engine-note">{c.engine.mode === 'llm' ? `Checked with AI (${c.engine.model})${c.engine.verified ? ' + verification pass' : ''}` : 'Checked with the rule-based engine'} · {fmt(c.checkedAt)}{c.engine.error ? ' · ' + c.engine.error : ''}</div>}
          {!c.checkedAt && <div className="card empty">Run the policy check to see findings with citations and suggested fixes.</div>}
          {c.checkedAt && !c.findings.length && <div className="card empty">Clean. Nothing conflicts with your approved sources.</div>}
          {user.role === 'compliance' && c.findings.length > 0 && <div className="engine-note">Showing claim and fact findings only (your scope). <button className="link" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show my scope only' : `Show all ${c.findings.length}`}</button></div>}
          {shown.map((f) => { const o = f.status === 'open'; const mode = ui?.id === f.fid ? ui.mode : '';
            return (<div key={f.fid} className={'finding ' + f.severity + (o ? '' : ' done')}>
              <div className="f-head"><span className={'sev ' + f.severity}>{GLYPH[f.severity]} {f.severity}</span><span className="tag">{f.category}</span>{f.needsReview && <span className="tag warn">needs human review</span>}{!o && <span className="tag ok">{f.status}</span>}<span className="mu sm right">{f.source}{f.source !== 'rule' ? ` · ${Math.round((f.confidence || 0) * 100)}%` : ''}</span></div>
              <h3>{f.title}</h3><p>{f.reason}</p>
              {f.citation ? <blockquote className="cite"><b>{f.citation.title}</b>{f.citation.text}</blockquote> : <blockquote className="cite warn"><b>No evidence cited</b>Shown for human review rather than asserted.</blockquote>}
              <Diff f={f} />{f.disputeReason && <div className="mu sm">Dispute reason: {f.disputeReason}</div>}
              {o && editable && <div className="f-act">
                <button className="btn sm good" disabled={f.fix?.kind === 'none' || !!busy} onClick={() => act(f.fid, { action: 'accept' })}>Accept fix</button>
                <button className="btn sm" onClick={() => { setUi(mode === 'e' ? null : { id: f.fid, mode: 'e' }); setVal(f.fix?.to || ''); }}>Edit</button>
                <button className="btn sm danger" onClick={() => { setUi(mode === 'd' ? null : { id: f.fid, mode: 'd' }); setVal(''); }}>Dispute</button></div>}
              {mode === 'e' && <div className="f-form"><input autoFocus value={val} onChange={(e) => setVal(e.target.value)} placeholder="Your replacement wording" /><button className="btn sm primary" onClick={() => act(f.fid, { action: 'edit', value: val })}>Apply</button></div>}
              {mode === 'd' && <div className="f-form"><input autoFocus value={val} onChange={(e) => setVal(e.target.value)} placeholder="Why is this finding wrong?" /><button className="btn sm primary" onClick={() => act(f.fid, { action: 'dispute', reason: val })}>Submit dispute</button></div>}
            </div>); })}
        </>}

        {tab === 'history' && <div className="card"><h2>Versions</h2>{c.versions.map((v) => <div className="log" key={v.n}><b>v{v.n}</b> · {v.by} · {fmt(v.at)} · {v.findings.length} finding(s){v.aiAssisted ? ' · AI-assisted' : ''}<div className="ann sm">{v.text}</div></div>)}{!c.versions.length && <div className="empty">Not submitted yet.</div>}
          <h2 style={{ marginTop: 18 }}>Review decisions</h2>{c.reviews.map((x, i) => <div className="log" key={i}><span className={'tag ' + (x.decision === 'approve' ? 'ok' : 'warn')}>{x.decision}</span> <b>{x.reviewer}</b> ({x.stage}, v{x.version}) · {fmt(x.at)}<div>“{x.comment}”</div></div>)}{!c.reviews.length && <div className="empty">No decisions yet.</div>}</div>}
        {tab === 'audit' && <div className="card"><h2>Audit trail</h2>{log.map((a) => <div className="log" key={a._id}><b>{a.actor}</b> · {a.action}<div className="mu sm">{a.detail} · {fmt(a.createdAt)}</div></div>)}</div>}
      </section>
    </div>
  </>);
}
