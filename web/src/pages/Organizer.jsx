// US-04 organiser panel: list of the club's events
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useSession, useToast } from '../session.jsx';
import { CategoryTag, Empty, Spinner, thumb } from '../components.jsx';
import { shortDate, timeOf } from '../format.js';

export default function Organizer() {
  const { user, clubs } = useSession();
  const toast = useToast();
  const [events, setEvents] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const load = () => api('/organizer/events').then(d => setEvents(d.events));
  useEffect(() => { if (user) load(); }, [user]);

  if (!user) return <Navigate to="/login?next=/organizer" replace />;
  if (user.role !== 'admin' && clubs.length === 0) {
    return <Empty title="You are not a club organiser yet"><p>Ask the Campus Radar administrator to add your email to your club.</p></Empty>;
  }

  const cancelEvent = async id => {
    const r = await api(`/organizer/events/${id}/cancel`, { method: 'POST' });
    toast(`Event cancelled. ${r.notified} registered ${r.notified === 1 ? 'person was' : 'people were'} notified.`);
    setConfirmId(null);
    load();
  };

  const now = Date.now();
  const upcoming = (events || []).filter(e => new Date(e.startsAt) > now).reverse();
  const past = (events || []).filter(e => new Date(e.startsAt) <= now);

  const Row = ({ e }) => (
    <div className={`card org-row ${e.status === 'cancelled' ? 'is-cancelled' : ''}`}>
      <img src={thumb(e.imageUrl, 200)} alt="" loading="lazy" />
      <div className="org-when"><b>{shortDate(e.startsAt)}</b><span className="mono">{timeOf(e.startsAt)}</span></div>
      <div className="org-main">
        <Link to={`/events/${e.id}`} className="org-title">{e.title}</Link>
        <p className="muted small">{e.club.name} · {e.location} · <CategoryTag category={e.category} /></p>
      </div>
      <div className="org-stats">
        <b>{e.goingCount}{e.capacity != null && <span className="muted">/{e.capacity}</span>}</b>
        <span className="small muted">{new Date(e.startsAt) < now ? `${e.checkedInCount} came` : e.waitlistCount ? `${e.waitlistCount} waiting` : 'registered'}</span>
      </div>
      <div className="org-actions">
        {e.status === 'cancelled' ? <span className="badge badge-bad">Cancelled</span> : (
          confirmId === e.id ? (
            <>
              <span className="small">Cancel and notify everyone?</span>
              <button className="btn btn-danger btn-sm" onClick={() => cancelEvent(e.id)}>Yes, cancel</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>Keep</button>
            </>
          ) : (
            <>
              <Link className="btn btn-sm btn-soft" to={`/organizer/events/${e.id}/participants`}>Check-in</Link>
              <Link className="btn btn-ghost btn-sm" to={`/organizer/events/${e.id}/edit`}>Edit</Link>
              {new Date(e.startsAt) > now && <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(e.id)}>Cancel</button>}
            </>
          )
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="title-row">
        <div>
          <h1 className="page-title">Organiser panel</h1>
          <p className="muted">{user.role === 'admin' ? 'Administrator — you can manage every club.' : `Your clubs: ${clubs.map(c => c.name).join(', ')}`}</p>
        </div>
        <Link className="btn btn-primary" to="/organizer/new">+ New event</Link>
      </div>
      {!events ? <div className="center"><Spinner /></div> : events.length === 0 ? (
        <Empty title="No events yet"><Link className="btn btn-primary" to="/organizer/new">Create the first event</Link></Empty>
      ) : (
        <>
          <h2 className="section-title">Upcoming · {upcoming.length}</h2>
          <div className="org-list">{upcoming.map(e => <Row key={e.id} e={e} />)}</div>
          {past.length > 0 && <><h2 className="section-title">Past · {past.length}</h2><div className="org-list past">{past.map(e => <Row key={e.id} e={e} />)}</div></>}
        </>
      )}
    </>
  );
}
