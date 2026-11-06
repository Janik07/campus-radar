// US-10: participants list and CSV export
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Empty, Spinner } from '../components.jsx';
import { shortDate, timeOf } from '../format.js';

export default function Participants() {
  const { id } = useParams();
  const [ev, setEv] = useState(null);
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api(`/events/${id}`).then(d => setEv(d.event)).catch(e => setError(e.message));
    api(`/organizer/events/${id}/participants`).then(d => setList(d.participants)).catch(e => setError(e.message));
  }, [id]);
  if (error) return <Empty title={error}><Link to="/organizer">Organiser panel</Link></Empty>;
  if (!ev || !list) return <div className="center"><Spinner /></div>;
  const going = list.filter(p => p.status === 'going');
  const waiting = list.filter(p => p.status === 'waitlist');

  return (
    <>
      <Link to="/organizer" className="back">← Organiser panel</Link>
      <div className="title-row">
        <div>
          <h1 className="page-title">Participants</h1>
          <p className="muted"><Link to={`/events/${ev.id}`}>{ev.title}</Link> · {shortDate(ev.startsAt)}, {timeOf(ev.startsAt)}</p>
        </div>
        <a className="btn btn-primary" href={`/api/organizer/events/${id}/participants.csv`}>Export CSV</a>
      </div>
      <div className="stat-row">
        <div className="card stat"><b>{going.length}</b><span>registered{ev.capacity ? ` of ${ev.capacity}` : ''}</span></div>
        <div className="card stat"><b>{waiting.length}</b><span>on waitlist</span></div>
        <div className="card stat"><b>{list.filter(p => p.telegram).length}</b><span>get Telegram reminders</span></div>
      </div>
      {list.length === 0 ? <Empty title="Nobody has registered yet" /> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Status</th><th>Registered</th><th>Telegram</th></tr></thead>
            <tbody>
              {list.map((p, i) => (
                <tr key={p.email}>
                  <td className="mono">{i + 1}</td><td>{p.name}</td><td className="muted">{p.email}</td>
                  <td>{p.status === 'going' ? <span className="badge badge-ok">Going</span> : <span className="badge badge-warn">Waitlist</span>}</td>
                  <td className="muted small">{shortDate(p.created_at)}, {timeOf(p.created_at)}</td>
                  <td>{p.telegram ? 'Yes' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
