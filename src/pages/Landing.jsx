import { useEffect, useState } from 'react';
import { api, ROLE, ROLE_DESC } from '../api.js';
import { useApp, Logo } from '../App.jsx';

export default function Landing() {
  const { setUser } = useApp(); const [demo, setDemo] = useState([]); const [err, setErr] = useState('');
  useEffect(() => { api('/auth/demo').then(setDemo); }, []);
  const pick = async (email) => { try { const s = await api('/auth/demo-login', { method: 'POST', body: { email } }); localStorage.setItem('ik_email', email); setUser(s.user); } catch (x) { setErr(x.message); } };
  const order = { creator: 0, brand: 1, compliance: 2 };
  return (
    <div className="auth">
      <section className="hero">
        <Logo light />
        <h1>Nothing goes live until it can prove it.</h1>
        <p>Inkloom checks every post, page and asset against your organisation’s own approved facts, rules and claim evidence, shows the citation for every finding, and requires a named human to approve before publishing.</p>
        <div className="hstats"><div><b>Cited</b><span>every finding links to its source</span></div><div><b>Verified</b><span>optional AI second-pass check</span></div><div><b>Human</b><span>the AI never publishes</span></div></div>
        <ul><li>Claim, fact, terminology, tone and accessibility checks</li><li>Creator → Brand → Compliance approval with audit trail</li><li>Guideline PDFs become checkable rules</li></ul>
      </section>
      <div className="fm">
        <h2 style={{ fontSize: 24 }}>Explore the demo</h2>
        <p className="mu">No sign-up. Pick a role to see Northwind Analytics through their eyes, and switch roles any time from the sidebar. Everything runs in your browser.</p>
        <div className="demo" style={{ borderTop: 0, marginTop: 6 }}><div className="demo-row">
          {[...demo].sort((a, b) => order[a.role] - order[b.role]).map((d) => <button key={d.email} className="btn" onClick={() => pick(d.email)}>{d.name}<small>{ROLE[d.role]}</small><small>{ROLE_DESC[d.role]}</small></button>)}
        </div></div>
        <div className="err">{err}</div>
        <p className="mu sm">Tip: start as Maya, run the check on “Launch post”, submit, then switch to Priya and Arjun to approve.</p>
      </div>
    </div>
  );
}
