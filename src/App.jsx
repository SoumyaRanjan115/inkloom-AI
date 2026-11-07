import { createContext, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, ROLE, ROLE_DESC, resetDemo } from './api.js';
import Landing from './pages/Landing.jsx';
import { Overview, ContentList } from './pages/Home.jsx';
import Editor from './pages/Editor.jsx';
import Knowledge from './pages/Knowledge.jsx';
import { Insights, AuditPage, Team } from './pages/Insights.jsx';

const Ctx = createContext(); export const useApp = () => useContext(Ctx);
export const Logo = ({ light }) => (
  <span className="logo" style={light ? { color: '#f6f1e6' } : null}>
    <svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 2C12 2 5 10 5 15a7 7 0 0014 0c0-5-7-13-7-13z" fill="#d64527" /><path d="M9 15l2.2 2.2L15.5 12" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>Inkloom
  </span>
);

function Shell() {
  const { user, setUser, ai, logout } = useApp(); const nav = useNavigate(); const [demo, setDemo] = useState([]); const [unread, setUnread] = useState(0);
  useEffect(() => { api('/auth/demo').then(setDemo).catch(() => {}); }, []);
  useEffect(() => {
    const f = () => api('/notifications').then((n) => setUnread(n.filter((x) => !x.read).length)).catch(() => {});
    f(); const t = setInterval(f, 5000); window.addEventListener('ik-read', f);
    return () => { clearInterval(t); window.removeEventListener('ik-read', f); };
  }, [user.id]);
  const swap = async (email) => { if (!email) return; const s = await api('/auth/demo-login', { method: 'POST', body: { email } }); localStorage.setItem('ik_email', email); setUser(s.user); nav('/'); };
  const links = {
    creator: [['/', 'Overview', '◎'], ['/content', 'My content', '✎'], ['/knowledge', 'Rules & facts', '▤'], ['/insights', 'My insights', '▥']],
    brand: [['/', 'Overview', '◎'], ['/content', 'Review queue', '✎'], ['/knowledge', 'Knowledge base', '▤'], ['/insights', 'Insights', '▥'], ['/audit', 'Audit log', '≡'], ['/team', 'Team', '☺']],
    compliance: [['/', 'Overview', '◎'], ['/content', 'Sign-off queue', '✎'], ['/knowledge', 'Claims & facts', '▤'], ['/insights', 'Insights', '▥'], ['/audit', 'Audit log', '≡']],
  }[user.role];
  return (
    <div className="shell">
      <aside>
        <Logo light />
        <nav>{links.map(([to, l, g]) => <NavLink key={to} to={to} end={to === '/'}><i>{g}</i>{l}{to === '/' && unread > 0 && <span className="tag warn" style={{ marginLeft: 'auto' }}>{unread}</span>}</NavLink>)}</nav>
        <div className="side-foot">
          <div className="who"><b>{user.name}</b><span>{ROLE[user.role]}</span><span>{user.org.name}</span><span style={{ fontSize: 12, marginTop: 4 }}>{ROLE_DESC[user.role]}</span></div>
          <select value="" onChange={(e) => swap(e.target.value)}><option value="">Switch role…</option>{demo.map((d) => <option key={d.email} value={d.email}>{d.name} · {ROLE[d.role]}</option>)}</select>
          <div className={'engine ' + (ai.llm ? 'on' : '')}>{ai.llm ? `● AI active · ${ai.model}` : '○ Rule-based engine (no API key)'}</div>
          <button className="ghost" onClick={logout}>Back to role picker</button>
          <button className="ghost" onClick={() => { if (confirm('Reset all demo data to the original state?')) resetDemo(); }}>Reset demo data</button>
        </div>
      </aside>
      <main><Outlet /></main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null); const [ai, setAi] = useState({}); const [ready, setReady] = useState(false);
  useEffect(() => {
    (async () => {
      const e = localStorage.getItem('ik_email');
      if (e) { try { await api('/auth/demo-login', { method: 'POST', body: { email: e } }); const d = await api('/auth/me'); setUser(d.user); setAi(d); } catch { localStorage.removeItem('ik_email'); } }
      setReady(true);
    })();
  }, []);
  useEffect(() => { const f = () => api('/auth/me').then(setAi).catch(() => {}); if (user) f(); window.addEventListener('ik-ai', f); return () => window.removeEventListener('ik-ai', f); }, [user?.id]);
  const logout = () => { localStorage.removeItem('ik_email'); setUser(null); };
  if (!ready) return <div className="boot">Loading…</div>;
  return (
    <Ctx.Provider value={{ user, setUser, ai, logout }}>
      <BrowserRouter>
        <Routes>
          {user ? (
            <Route element={<Shell />}>
              <Route index element={<Overview />} /><Route path="content" element={<ContentList />} /><Route path="content/:id" element={<Editor />} />
              <Route path="knowledge" element={<Knowledge />} /><Route path="insights" element={<Insights />} />
              <Route path="audit" element={user.role !== 'creator' ? <AuditPage /> : <Navigate to="/" />} />
              <Route path="team" element={user.role === 'brand' ? <Team /> : <Navigate to="/" />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Route>
          ) : <Route path="*" element={<Landing />} />}
        </Routes>
      </BrowserRouter>
    </Ctx.Provider>
  );
}
