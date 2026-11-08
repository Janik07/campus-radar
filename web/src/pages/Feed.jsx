// US-01 feed + US-02 filters + US-12 followed clubs first
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useSession } from '../session.jsx';
import { EventCard, Empty, Spinner, ErrorNote, thumb } from '../components.jsx';
import { dayKey, dayLabel, shortDate, timeOf } from '../format.js';

const WHEN = [['', 'Any time'], ['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This week'], ['weekend', 'Weekend'], ['month', 'Next 30 days']];

export default function Feed() {
  const { meta, user } = useSession();
  const [params, setParams] = useSearchParams();
  const category = params.get('category') || '';
  const when = params.get('when') || '';
  const following = params.get('following') === '1';
  const [search, setSearch] = useState(params.get('q') || '');
  const [events, setEvents] = useState(null);
  const [all, setAll] = useState(null);
  const [error, setError] = useState('');

  const set = (k, v) => {
    const p = new URLSearchParams(params);
    v ? p.set(k, v) : p.delete(k);
    setParams(p, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => { if ((params.get('q') || '') !== search) set('q', search.trim()); }, 300);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line

  // Unfiltered list for the hero, "coming up" and "from clubs you follow".
  useEffect(() => { api('/events').then(d => setAll(d.events)).catch(() => {}); }, [user?.id]);

  useEffect(() => {
    setError('');
    const qs = new URLSearchParams();
    if (category) qs.set('category', category);
    if (when) qs.set('when', when);
    if (following) qs.set('following', '1');
    if (params.get('q')) qs.set('q', params.get('q'));
    api(`/events?${qs}`).then(d => setEvents(d.events)).catch(e => setError(e.message));
  }, [params, user?.id]); // eslint-disable-line

  const groups = useMemo(() => {
    const m = new Map();
    for (const ev of events || []) {
      const k = dayKey(ev.startsAt);
      if (!m.has(k)) m.set(k, { label: dayLabel(ev.startsAt), items: [] });
      m.get(k).items.push(ev);
    }
    // Within a day, events from followed clubs come first.
    for (const g of m.values()) g.items.sort((a, b) => (b.followed - a.followed) || (new Date(a.startsAt) - new Date(b.startsAt)));
    return [...m.values()];
  }, [events]);

  const week = (all || []).filter(e => new Date(e.startsAt) < Date.now() + 7 * 864e5);
  const going = (all || []).reduce((s, e) => s + e.goingCount, 0);
  const clubsActive = new Set((all || []).map(e => e.club.id)).size;
  const mosaic = [...(all || [])].sort((a, b) => b.goingCount - a.goingCount).slice(0, 3);
  const soon = (all || []).slice(0, 8);
  const fromFollowed = (all || []).filter(e => e.followed).slice(0, 8);
  const filtered = category || when || following || params.get('q');

  return (
    <>
      <section className="hero">
        <div className="hero-text">
          <span className="eyebrow"><span className="dot" />Live from AITU clubs</span>
          <h1>Find your people. <em>Something fun</em> happens every day.</h1>
          <p className="lede">Every club event at Astana IT University in one feed. Register in one tap, get a Telegram reminder and show a QR ticket at the door.</p>
          <div className="hero-stats">
            <div className="hero-stat"><b>{all ? week.length : '…'}</b><span>events this week</span></div>
            <div className="hero-stat"><b>{all ? clubsActive : '…'}</b><span>clubs hosting</span></div>
            <div className="hero-stat"><b>{all ? going : '…'}</b><span>students going</span></div>
          </div>
        </div>
        <div className="mosaic" aria-label="Popular events">
          {mosaic.map(ev => (
            <Link key={ev.id} to={`/events/${ev.id}`}>
              <img src={thumb(ev.imageUrl, 800)} alt="" />
              <span>{ev.title}<small>{shortDate(ev.startsAt)}, {timeOf(ev.startsAt)} · {ev.goingCount} going</small></span>
            </Link>
          ))}
        </div>
      </section>

      {!filtered && fromFollowed.length > 0 && (
        <section className="day-group">
          <div className="section-head"><div><h2>From clubs you follow</h2><p>Upcoming events of your clubs</p></div>
            <button className="btn btn-sm" onClick={() => set('following', '1')}>Show only these</button></div>
          <div className="carousel">{fromFollowed.map(ev => <EventCard key={ev.id} ev={ev} />)}</div>
        </section>
      )}

      {!filtered && soon.length > 0 && (
        <section className="day-group">
          <div className="section-head"><div><h2>Coming up soon</h2><p>Don’t miss what starts in the next days</p></div></div>
          <div className="carousel">{soon.map(ev => <EventCard key={ev.id} ev={ev} />)}</div>
        </section>
      )}

      <div className="section-head"><div><h2>All events</h2><p>Filter by day, interest or club</p></div></div>
      <div className="filters" role="search">
        <label className="search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input id="feed-search" type="search" placeholder="Search events, clubs, places…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search events" />
        </label>
        <div className="chips chips-scroll" aria-label="Date">
          {WHEN.map(([v, label]) => (
            <button key={v} className="chip" aria-pressed={when === v} onClick={() => set('when', v)}>{label}</button>
          ))}
          {user && <button className="chip" aria-pressed={following} onClick={() => set('following', following ? '' : '1')}>★ Clubs I follow</button>}
        </div>
        <div className="chips chips-scroll" aria-label="Category">
          <button className="chip" aria-pressed={!category} onClick={() => set('category', '')}>All interests</button>
          {meta?.categories.map(c => (
            <button key={c} className="chip" aria-pressed={category === c} onClick={() => set('category', category === c ? '' : c)}>{c}</button>
          ))}
        </div>
      </div>

      <ErrorNote error={error} />
      {!events && !error && <div className="center"><Spinner /></div>}
      {events && events.length === 0 && (
        <Empty title={following ? 'No upcoming events from your clubs' : filtered ? 'No events match these filters' : 'No upcoming events yet'}>
          {following ? <Link className="btn btn-primary" to="/clubs">Find clubs to follow</Link>
            : filtered ? <button className="btn" onClick={() => { setSearch(''); setParams({}, { replace: true }); }}>Clear filters</button>
              : <p>Club organisers will publish events here soon.</p>}
        </Empty>
      )}
      {groups.map(g => (
        <section key={g.label} className="day-group">
          <h2 className="day-head">{g.label}<span>{g.items.length} {g.items.length === 1 ? 'event' : 'events'}</span></h2>
          <div className="event-grid">{g.items.map(ev => <EventCard key={ev.id} ev={ev} />)}</div>
        </section>
      ))}
    </>
  );
}
