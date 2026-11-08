// Admin: platform numbers and assigning club organisers
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useSession, useToast } from '../session.jsx';
import { ErrorNote, Spinner } from '../components.jsx';

export default function Admin() {
  const { user, meta } = useSession();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [email, setEmail] = useState('');
  const [clubId, setClubId] = useState('');
  const [error, setError] = useState('');
  const load = () => api('/admin/organizers').then(setData).catch(e => setError(e.message));
  useEffect(() => { if (user?.role === 'admin') load(); }, [user]);

  if (!user) return <Navigate to="/login?next=/admin" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  if (!data) return <div className="center"><Spinner /></div>;

  const domain = meta?.emailDomain || 'astanait.edu.kz';
  const club = data.clubs.find(c => String(c.id) === String(clubId));

  const assign = async e => {
    e.preventDefault();
    setError('');
    const full = email.includes('@') ? email.trim() : `${email.trim()}@${domain}`;
    try {
      await api('/admin/organizers', { method: 'POST', body: { email: full, clubId: Number(clubId) } });
      toast(`${full} can now publish events for ${club?.name}`);
      setEmail('');
      load();
    } catch (err) { setError(err.message); }
  };
  const remove = async (o) => {
    await api('/admin/organizers', { method: 'DELETE', body: { clubId: o.club_id, userId: o.user_id } });
    toast('Organiser removed');
    load();
  };

  const s = data.stats;
  return (
    <>
      <div className="title-row"><h1 className="page-title">Administration</h1><a className="btn btn-primary" href="/admin/stats">Attendance dashboard</a></div>
      <div className="stat-row">
        <div className="card stat c1"><b>{s.users}</b><span>users</span></div>
        <div className="card stat c2"><b>{s.events}</b><span>published events</span></div>
        <div className="card stat c3"><b>{s.registrations}</b><span>registrations</span></div>
        <div className="card stat c4"><b>{s.telegram}</b><span>Telegram connected</span></div>
      </div>

      <section className="card settings-block">
        <h2>Add a club organiser</h2>
        <p className="muted">The organiser signs in with this email and can then publish events for the club.</p>
        <form className="row-form wrap-on-mobile" onSubmit={assign}>
          <label className="field grow"><span>Club</span>
            <select id="adm-club" required value={clubId} onChange={e => setClubId(e.target.value)}>
              <option value="">Choose a club…</option>
              {data.clubs.filter(c => c.status !== 'frozen').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field grow"><span>Organiser email</span>
            <input id="adm-email" required value={email} onChange={e => setEmail(e.target.value)} placeholder={`name@${domain}`} />
          </label>
          <button className="btn btn-primary">Add</button>
        </form>
        {club?.president && <p className="muted small">Club president: {club.president}{club.president_tg && <> · Telegram @{club.president_tg}</>}</p>}
        <ErrorNote error={error} />
      </section>

      <section className="card settings-block">
        <h2>Organisers · {data.organizers.length}</h2>
        {data.organizers.length === 0 ? <p className="muted">No organisers assigned yet.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Club</th><th>Name</th><th>Email</th><th></th></tr></thead>
              <tbody>{data.organizers.map(o => (
                <tr key={`${o.club_id}-${o.user_id}`}><td>{o.club_name}</td><td>{o.name}</td><td className="muted">{o.email}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => remove(o)}>Remove</button></td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
