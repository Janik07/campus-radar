// US-11 club catalogue + US-12 follow clubs
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useSession } from '../session.jsx';
import { CategoryTag, Spinner, Empty, FollowButton, thumb } from '../components.jsx';

export default function Clubs() {
  const { meta, user } = useSession();
  const [clubs, setClubs] = useState(null);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const load = () => api('/clubs').then(d => setClubs(d.clubs));
  useEffect(() => { load(); }, [user?.id]);

  const list = useMemo(() => (clubs || []).filter(c =>
    (!cat || c.category === cat) && (!q || c.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b.followed - a.followed) || (b.upcoming - a.upcoming) || a.name.localeCompare(b.name)), [clubs, cat, q]);

  return (
    <>
      <div>
        <h1 className="page-title">Clubs at AITU</h1>
        <p className="lede">{clubs ? clubs.length : '…'} student clubs — from chess to space. Follow the ones you like and their events show up first in your feed.</p>
      </div>
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
              <div className="club-cover">
                <img src={thumb(c.coverUrl, 600)} alt="" loading="lazy" />
                <span className="club-initial" style={{ '--h': hue(c.name) }}>{initials(c.name)}</span>
              </div>
              <div className="club-info">
                <h3>{c.name}</h3>
                <div className="club-sub"><CategoryTag category={c.category} />{c.status === 'probation' && <span className="badge">New club</span>}</div>
                <div className="club-foot">
                  <span>{c.upcoming ? <><b>{c.upcoming}</b> upcoming</> : 'No events yet'}{c.followers > 0 && <> · {c.followers} following</>}</span>
                  <FollowButton club={c} onChange={load} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export const initials = n => n.replace(/^AITU\s+/i, '').split(/[\s-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
export const hue = n => [...n].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 7);
