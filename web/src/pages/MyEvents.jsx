import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useSession } from '../session.jsx';
import { EventCard, Empty, Spinner } from '../components.jsx';

export default function MyEvents() {
  const { user } = useSession();
  const [data, setData] = useState(null);
  useEffect(() => { if (user) api('/me/events').then(setData); }, [user]);
  if (!user) return <Navigate to="/login?next=/my" replace />;
  if (!data) return <div className="center"><Spinner /></div>;

  return (
    <>
      <h1 className="page-title">My events</h1>
      {!user.telegramLinked && (
        <div className="banner">
          <div><b>Get reminders in Telegram</b><p>24 hours and 1 hour before each event you register for.</p></div>
          <Link className="btn btn-primary btn-sm" to="/settings">Connect</Link>
        </div>
      )}
      <h2 className="section-title">Upcoming</h2>
      {data.upcoming.length === 0
        ? <Empty title="You haven’t registered for anything yet"><Link className="btn btn-primary" to="/">Find an event</Link></Empty>
        : <div className="event-list">{data.upcoming.map(ev => <EventCard key={ev.id} ev={ev} showDate />)}</div>}
      {data.past.length > 0 && (
        <>
          <h2 className="section-title">Past</h2>
          <div className="event-list past">{data.past.map(ev => <EventCard key={ev.id} ev={ev} showDate />)}</div>
        </>
      )}
    </>
  );
}
