import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { CategoryTag, EventCard, Empty, Spinner } from '../components.jsx';
import { initials, hue } from './Clubs.jsx';

export default function ClubPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api(`/clubs/${slug}`).then(setData).catch(e => setError(e.message)); }, [slug]);
  if (error) return <Empty title={error}><Link to="/clubs">All clubs</Link></Empty>;
  if (!data) return <div className="center"><Spinner /></div>;
  const { club, events } = data;
  return (
    <>
      <Link to="/clubs" className="back">← All clubs</Link>
      <div className="club-head">
        <span className="club-initial big" style={{ '--h': hue(club.name) }}>{initials(club.name)}</span>
        <div>
          <h1>{club.name}</h1>
          <div className="club-sub"><CategoryTag category={club.category} />{club.status === 'probation' && <span className="badge">Probation period</span>}</div>
        </div>
        {club.telegramUrl && <a className="btn" href={club.telegramUrl} target="_blank" rel="noreferrer">Telegram channel</a>}
      </div>
      {club.description && <p className="lede">{club.description}</p>}
      <h2 className="section-title">Upcoming events</h2>
      {events.length === 0
        ? <Empty title="No upcoming events">{club.telegramUrl ? <p>Follow the club’s Telegram channel for news.</p> : null}</Empty>
        : <div className="event-list">{events.map(ev => <EventCard key={ev.id} ev={ev} showDate />)}</div>}
    </>
  );
}
