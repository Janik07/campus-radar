import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useSession } from '../session.jsx';
import { CategoryTag, EventCard, Empty, Spinner, FollowButton, thumb } from '../components.jsx';
import { initials, hue } from './Clubs.jsx';

export default function ClubPage() {
  const { slug } = useParams();
  const { user } = useSession();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = () => api(`/clubs/${slug}`).then(setData).catch(e => setError(e.message));
  useEffect(() => { load(); }, [slug, user?.id]); // eslint-disable-line
  if (error) return <Empty title={error}><Link to="/clubs">All clubs</Link></Empty>;
  if (!data) return <div className="center"><Spinner /></div>;
  const { club, events } = data;
  return (
    <>
      <Link to="/clubs" className="back">← All clubs</Link>
      <div className="club-banner"><img src={thumb(club.coverUrl, 1600)} alt="" /></div>
      <div className="club-head">
        <span className="club-initial big" style={{ '--h': hue(club.name) }}>{initials(club.name)}</span>
        <div>
          <h1>{club.name}</h1>
          <div className="club-sub"><CategoryTag category={club.category} />
            <span className="muted small">{club.followers} following · {club.upcoming} upcoming events</span></div>
        </div>
        <div className="actions">
          <FollowButton club={club} onChange={load} size="" />
          {club.telegramUrl && <a className="btn" href={club.telegramUrl} target="_blank" rel="noreferrer">Telegram channel</a>}
        </div>
      </div>
      {club.description && <p className="lede">{club.description}</p>}
      <div className="section-head"><h2>Upcoming events</h2></div>
      {events.length === 0
        ? <Empty title="No upcoming events">{club.telegramUrl ? <p>Follow the club to see its next event first.</p> : null}</Empty>
        : <div className="event-grid">{events.map(ev => <EventCard key={ev.id} ev={ev} />)}</div>}
    </>
  );
}
