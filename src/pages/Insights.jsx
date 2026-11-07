import { useEffect, useState } from 'react';
import { api, fmt, fmtD, ROLE, ROLE_DESC } from '../api.js';
import { useApp } from '../App.jsx';

const Bars = ({ data }) => { const e = Object.entries(data || {}); const m = Math.max(1, ...e.map((x) => x[1])); return e.length ? e.map(([k, v]) => <div key={k} className="bar-row"><span>{k}</span><div><i style={{ width: (v / m) * 100 + '%' }} /></div><b>{v}</b></div>) : <div className="empty">No data yet.</div>; };

export function Insights() {
  const { user } = useApp(); const [d, setD] = useState(null); useEffect(() => { api('/insights').then(setD); }, []); if (!d) return null;
  const k = (n, l) => <div className="card kpi"><b>{n ?? '–'}</b><span>{l}</span></div>;
  return (<><header className="page"><div><h1>{user.role === 'creator' ? 'My insights' : 'Governance insights'}</h1><p className="mu" style={{ margin: '4px 0 0' }}>{user.role === 'creator' ? 'Numbers for your own content.' : user.role === 'brand' ? 'Where issues come from, so rules and coaching can improve.' : 'Claim and evidence health across the organisation.'}</p></div></header>
    <div className="kpis">{k(d.totalFindings, 'issues caught')}{k(d.contents, 'content items')}{k(d.sentBack, 'sent back by reviewers')}{k(d.avgHoursToPublish != null ? d.avgHoursToPublish + 'h' : '–', 'avg. submit → publish')}</div>
    <div className="split"><section className="card"><h2>Issues by category</h2><Bars data={d.byCategory} /></section><section className="card"><h2>Most recurring rules and sources</h2><Bars data={Object.fromEntries(d.topRules)} /></section></div>
    <div className="split"><section className="card"><h2>Content by status</h2><Bars data={d.byStatus} /></section><section className="card"><h2>How findings were resolved</h2><Bars data={d.resolution} /></section></div>
    {user.role === 'brand' && <section className="card"><h2>Issues by author</h2><Bars data={d.byAuthor} /></section>}
    {user.role === 'compliance' && <section className="card"><h2>Evidence expiring within 30 days</h2>{d.evidence.map((e, i) => <div className="log" key={i}><span className={'tag ' + (e.expired ? 'warn' : '')}>{e.expired ? 'EXPIRED' : fmtD(e.expiresAt)}</span> {e.kind}: {e.title} <span className="mu sm">· owner {e.owner || '–'}</span></div>)}{!d.evidence.length && <div className="empty">All evidence is current.</div>}</section>}</>);
}

export function AuditPage() {
  const [rows, setRows] = useState([]); useEffect(() => { api('/audit?limit=200').then(setRows); }, []);
  return (<><header className="page"><h1>Audit log</h1></header><section className="card scroll"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Content</th><th>Detail</th></tr></thead><tbody>
    {rows.map((a) => <tr key={a._id}><td className="nowrap">{fmt(a.createdAt)}</td><td>{a.actor}<div className="mu sm">{ROLE[a.role]}</div></td><td>{a.action}</td><td>{a.contentTitle}</td><td>{a.detail}</td></tr>)}</tbody></table></section></>);
}

export function Team() {
  const { user } = useApp(); const [o, setO] = useState(null); const load = () => api('/org').then(setO); useEffect(() => { load(); }, []); if (!o) return null;
  return (<><header className="page"><h1>Team</h1></header>
    <p className="mu">The people in the {o.name} demo workspace and what each role owns. Use “Switch role” in the sidebar to see the product as any of them.</p>
    <section className="card"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead><tbody>{o.members.map((m) => <tr key={m._id}><td>{m.name}</td><td>{m.email}</td>
      <td>{ROLE[m.role]}<div className="mu sm">{ROLE_DESC[m.role]}</div></td></tr>)}</tbody></table></section></>);
}
