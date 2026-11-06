// US-11: club catalogue by interest
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useSession } from '../session.jsx';
import { CategoryTag, Spinner, Empty } from '../components.jsx';

export default function Clubs() {
  const { meta } = useSession();
  const [clubs, setClubs] = useState(null);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { api('/clubs').then(d => setClubs(d.clubs)); }, []);

  const list = useMemo(() => (clubs || []).filter(c =>
    (!cat || c.category === cat) && (!q || c.name.toLowerCase().includes(q.toLowerCase()))), [clubs, cat, q]);

  return (
    <>
      <h1 className="page-title">Clubs</h1>
      <p className="lede">{clubs ? clubs.length : '…'} student clubs at AITU. Open a club to see its upcoming events and Telegram channel.</p>
      <div className="filters">
        <label className="search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input id="club-search" type="search" placeholder="Search clubs" value={q} onChange={e => setQ(e.target.value)} aria-label="Search clubs" />
        </label>
        <div className="chips chips-scroll">
          <button className="chip" aria-pressed={!cat} onClick={() => setCat('')}>All</button>
          {meta?.categories.map(c => <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(cat === c ? '' : c)}>{c}</button>)}
        </div>
      </div>
      {!clubs ? <div className="center"><Spinner /></div> : list.length === 0 ? <Empty title="No clubs match" /> : (
        <div className="club-grid">
          {list.map(c => (
            <Link key={c.id} to={`/clubs/${c.slug}`} className="card club-card">
              <span className="club-initial" style={{ '--h': hue(c.name) }}>{initials(c.name)}</span>
              <div className="club-info">
                <h3>{c.name}</h3>
                <div className="club-sub"><CategoryTag category={c.category} />{c.status === 'probation' && <span className="badge">Probation</span>}</div>
              </div>
              <span className={`club-count ${c.upcoming ? 'on' : ''}`}>{c.upcoming ? `${c.upcoming} upcoming` : 'No events yet'}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export const initials = n => n.replace(/^AITU\s+/i, '').split(/[\s-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
export const hue = n => [...n].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 7);
