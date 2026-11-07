import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, STATUS, fmt, fmtD } from '../api.js';
import { useApp } from '../App.jsx';

export const Stamp = ({ s }) => <span className={'stamp ' + s}>{STATUS[s] || s}</span>;
const Row = ({ c }) => (
  <Link to={'/content/' + c._id} className="row-link">
    <div><b>{c.title}</b><span className="mu"> · {c.channel} · {c.authorName}</span></div>
    <div className="row-r">{c.total > 0 && <span className="mu">{c.open} open / {c.total}</span>}{c.aiAssisted && <span className="tag">AI</span>}<Stamp s={c.status} /><span className="mu sm">{fmt(c.updatedAt)}</span></div>
    {c.status === 'draft' && c.last?.decision === 'reject' && <div className="mu sm" style={{ flexBasis: '100%' }}>Sent back by {c.last.reviewer}: “{c.last.comment}”</div>}
  </Link>
);

const STAGES = ['draft', 'in_brand_review', 'in_compliance_review', 'approved', 'published'];
const HOT = { creator: ['draft', 'approved'], brand: ['in_brand_review'], compliance: ['in_compliance_review'] };
const WORK = { creator: 'Needs your attention', brand: 'Waiting for your review', compliance: 'Waiting for your sign-off' };
const HOW = {
  creator: 'You write and check content, resolve every finding (accept, edit or dispute), submit, and publish once it is approved.',
  brand: 'You review every submission for tone, terminology and visuals, and you own the rules and glossary. Anything that contains a claim goes on to compliance.',
  compliance: 'You only see content that contains a claim. Check each citation against its evidence record, then approve or send it back. You own the claim library and fact base.',
};

export function Overview() {
  const { user } = useApp(); const [q, setQ] = useState([]); const [ins, setIns] = useState(null); const [nt, setNt] = useState([]);
  useEffect(() => {
    api('/content?queue=1').then(setQ); api('/insights').then(setIns);
    api('/notifications').then((n) => { setNt(n); if (n.some((x) => !x.read)) api('/notifications/read', { method: 'POST' }).then(() => window.dispatchEvent(new Event('ik-read'))); });
  }, []);
  const k = (n, l) => <div className="card kpi"><b>{n ?? '–'}</b><span>{l}</span></div>;
  const by = ins?.byStatus || {};
  return (<>
    <header className="page"><div><div className="eyebrow">{user.org.name}</div><h1>Welcome, {user.name.split(' ')[0]}.</h1></div></header>
    <div className="kpis">{k(ins?.contents, user.role === 'creator' ? 'your content items' : 'content items')}{k(ins?.totalFindings, 'issues caught before publishing')}{k(by.published || 0, 'published')}{k(ins?.avgHoursToPublish != null ? ins.avgHoursToPublish + 'h' : '–', 'avg. submit → publish')}</div>
    <section className="card"><h2>How work moves</h2>
      <div className="steps">{STAGES.map((s) => <span key={s} className={HOT[user.role].includes(s) ? 'now' : ''}>{STATUS[s]} · {by[s] || 0}</span>)}</div>
      <p className="mu" style={{ margin: 0 }}>Creator → Brand Manager → Compliance Reviewer (claims only) → publish. Highlighted stages are yours. {HOW[user.role]}</p></section>
    <section className="card"><h2>{WORK[user.role]}</h2>{q.length ? q.map((c) => <Row key={c._id} c={c} />) : <div className="empty">Nothing is waiting for you right now.</div>}</section>
    <div className="split">
      <section className="card"><h2>Activity</h2>{nt.slice(0, 8).map((n) => <Link key={n._id} to={'/content/' + n.content} className="row-link" style={{ display: 'block' }}><div><b>{n.title}</b> {!n.read && <span className="tag warn">new</span>}</div><div className="mu sm">{n.body} · {fmt(n.createdAt)}</div></Link>)}{!nt.length && <div className="empty">No activity yet.</div>}</section>
      {user.role === 'creator' && <section className="card"><h2>Your track record</h2><div className="log">Issues caught before publishing: <b>{ins?.totalFindings ?? '–'}</b></div><div className="log">Sent back by reviewers: <b>{ins?.sentBack ?? '–'}</b></div><div className="log">AI-assisted pieces: <b>{ins?.ai ?? '–'}</b></div><p className="mu sm">Fewer first-pass rejections means faster publishing.</p></section>}
      {user.role === 'brand' && <section className="card"><h2>Recurring issues</h2>{(ins?.topRules || []).map(([k2, v]) => <div className="log" key={k2}>{k2} <b style={{ float: 'right' }}>{v}</b></div>)}{!ins?.topRules?.length && <div className="empty">No data yet.</div>}<p className="mu sm">Repeated misses point to a rule worth rewording or a team worth coaching.</p></section>}
      {user.role === 'compliance' && <section className="card"><h2>Evidence watch</h2>{(ins?.evidence || []).slice(0, 7).map((e, i) => <div className="log" key={i}><span className={'tag ' + (e.expired ? 'warn' : '')}>{e.expired ? 'EXPIRED' : 'expires ' + fmtD(e.expiresAt)}</span> {e.kind}: {e.title}<div className="mu sm">Owner: {e.owner || '–'}</div></div>)}{!ins?.evidence?.length && <div className="empty">All evidence is current.</div>}</section>}
    </div>
  </>);
}

export function ContentList() {
  const { user } = useApp(); const nav = useNavigate(); const [list, setList] = useState([]); const [f, setF] = useState(''); const [open, setOpen] = useState(false); const [t, setT] = useState({ title: '', channel: 'LinkedIn post' }); const [err, setErr] = useState('');
  useEffect(() => { api('/content').then(setList); }, []);
  const create = async (e) => { e.preventDefault(); try { const c = await api('/content', { method: 'POST', body: t }); nav('/content/' + c._id); } catch (x) { setErr(x.message); } };
  const shown = list.filter((c) => !f || c.status === f);
  const title = { creator: 'My content', brand: 'Review queue', compliance: 'Sign-off queue' }[user.role];
  const sub = { creator: 'Only you can see your drafts.', brand: 'Submitted content from every creator. Drafts stay private to their authors.', compliance: 'Content that passed brand review and contains a claim, plus what you already decided.' }[user.role];
  return (<>
    <header className="page"><div><h1>{title}</h1><p className="mu" style={{ margin: '4px 0 0' }}>{sub}</p></div>{user.role === 'creator' && <button className="btn primary" onClick={() => setOpen(!open)}>+ New content</button>}</header>
    {open && <form className="card" onSubmit={create}><div className="grid2"><div><label>Title</label><input required value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} placeholder="e.g. Q4 launch post" /></div>
      <div><label>Channel</label><select value={t.channel} onChange={(e) => setT({ ...t, channel: e.target.value })}>{['LinkedIn post', 'Landing page', 'Email', 'Blog article', 'Ad copy', 'Press release'].map((x) => <option key={x}>{x}</option>)}</select></div></div>
      <div className="err">{err}</div><button className="btn primary">Create draft</button></form>}
    <div className="chips">{['', 'draft', 'in_brand_review', 'in_compliance_review', 'approved', 'published'].map((s) => <button key={s} className={'chip' + (f === s ? ' on' : '')} onClick={() => setF(s)}>{s ? STATUS[s] : 'All'}</button>)}</div>
    <section className="card">{shown.map((c) => <Row key={c._id} c={c} />)}{!shown.length && <div className="empty">Nothing here yet.</div>}</section>
  </>);
}
