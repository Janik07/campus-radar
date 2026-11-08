// US-10 participants + CSV, US-14 QR check-in with 6-digit fallback code
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../session.jsx';
import { Empty, Spinner, Icon } from '../components.jsx';
import { shortDate, timeOf } from '../format.js';

export default function Participants() {
  const { id } = useParams();
  const toast = useToast();
  const [ev, setEv] = useState(null);
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const codeRef = useRef(null);

  const load = () => api(`/organizer/events/${id}/participants`).then(d => setList(d.participants)).catch(e => setError(e.message));
  useEffect(() => {
    api(`/events/${id}`).then(d => setEv(d.event)).catch(e => setError(e.message));
    load();
  }, [id]); // eslint-disable-line

  if (error) return <Empty title={error}><Link to="/organizer">Organiser panel</Link></Empty>;
  if (!ev || !list) return <div className="center"><Spinner /></div>;
  const going = list.filter(p => p.status === 'going');
  const waiting = list.filter(p => p.status === 'waitlist');
  const came = going.filter(p => p.checked_in_at);

  const checkCode = async e => {
    e.preventDefault();
    try {
      const r = await api(`/organizer/events/${id}/checkin`, { method: 'POST', body: { code } });
      setResult({ ok: true, text: r.already ? `${r.name} was already checked in` : `✓ ${r.name} checked in` });
      setCode('');
      load();
    } catch (err) { setResult({ ok: false, text: err.message }); }
    codeRef.current?.focus();
  };
  const toggle = async p => {
    try {
      await api(`/organizer/events/${id}/checkin`, { method: 'POST', body: { userId: p.user_id, undo: !!p.checked_in_at } });
      toast(p.checked_in_at ? `Check-in removed for ${p.name}` : `${p.name} checked in`);
      load();
    } catch (err) { toast(err.message, 'bad'); }
  };

  return (
    <>
      <Link to="/organizer" className="back">← Organiser panel</Link>
      <div className="title-row">
        <div>
          <h1 className="page-title">Check-in & participants</h1>
          <p className="muted"><Link to={`/events/${ev.id}`}>{ev.title}</Link> · {shortDate(ev.startsAt)}, {timeOf(ev.startsAt)} · {ev.location}</p>
        </div>
        <a className="btn" href={`/api/organizer/events/${id}/participants.csv`}>Export CSV</a>
      </div>
      <div className="stat-row">
        <div className="card stat c1"><b>{going.length}</b><span>registered{ev.capacity ? ` of ${ev.capacity}` : ''}</span></div>
        <div className="card stat c2"><b>{came.length}</b><span>checked in{going.length ? ` · ${Math.round(came.length / going.length * 100)}%` : ''}</span></div>
        <div className="card stat c3"><b>{waiting.length}</b><span>on the waitlist</span></div>
        <div className="card stat c4"><b>{list.filter(p => p.telegram).length}</b><span>get Telegram reminders</span></div>
      </div>

      <div className="card checkin-box">
        <div>
          <h2 style={{ fontSize: '1.1rem' }}><Icon name="qr" /> Check people in</h2>
          <p className="muted small">Scan the student’s QR ticket with your phone camera — it opens Campus Radar and checks them in. If the camera does not work, type the 6-digit code shown under the QR.</p>
          {result && <p className="checkin-result" style={{ color: result.ok ? 'var(--ok)' : 'var(--bad)', marginTop: 8 }}>{result.text}</p>}
        </div>
        <form onSubmit={checkCode}>
          <input ref={codeRef} id="checkin-code" inputMode="numeric" maxLength={6} placeholder="000000" aria-label="6-digit code"
            value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', background: '#fff' }} />
          <button className="btn btn-primary" disabled={code.length !== 6}>Check in</button>
        </form>
      </div>

      {list.length === 0 ? <Empty title="Nobody has registered yet" /> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>#</th><th>Name</th><th className="hide-narrow">Email</th><th>Status</th><th className="hide-narrow">Registered</th><th>Check-in</th></tr></thead>
            <tbody>
              {list.map((p, i) => (
                <tr key={p.email} className={p.checked_in_at ? 'checked' : ''}>
                  <td className="mono">{i + 1}</td><td><b>{p.name}</b></td><td className="muted hide-narrow">{p.email}</td>
                  <td>{p.status === 'going' ? <span className="badge badge-ok">Going</span> : <span className="badge badge-warn">Waitlist</span>}</td>
                  <td className="muted small hide-narrow">{shortDate(p.created_at)}, {timeOf(p.created_at)}</td>
                  <td>{p.status === 'going' && (p.checked_in_at
                    ? <button className="btn btn-sm btn-follow" aria-pressed="true" onClick={() => toggle(p)}><Icon name="check" size={14} />{timeOf(p.checked_in_at)}</button>
                    : <button className="btn btn-sm" onClick={() => toggle(p)}>Check in</button>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
