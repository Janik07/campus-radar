// US-01 feed + US-02 filters
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useSession } from '../session.jsx';
import { EventCard, Empty, Spinner, ErrorNote } from '../components.jsx';
import { dayKey, dayLabel } from '../format.js';

const WHEN = [['', 'Any time'], ['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This week'], ['weekend', 'Weekend'], ['month', '30 days']];

export default function Feed() {
  const { meta } = useSession();
  const [params, setParams] = useSearchParams();
  const category = params.get('category') || '';
  const when = params.get('when') || '';
  const [search, setSearch] = useState(params.get('q') || '');
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');

  const set = (k, v) => {
    const p = new URLSearchParams(params);
    v ? p.set(k, v) : p.delete(k);
    setParams(p, { replace: true });
  };

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => { if ((params.get('q') || '') !== search) set('q', search.trim()); }, 300);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line

  useEffect(() => {
    setError('');
    const qs = new URLSearchParams();
    if (category) qs.set('category', category);
    if (when) qs.set('when', when);
    if (params.get('q')) qs.set('q', params.get('q'));
    api(`/events?${qs}`).then(d => setEvents(d.events)).catch(e => setError(e.message));
  }, [params]); // eslint-disable-line

  const groups = useMemo(() => {
    const m = new Map();
    for (const ev of events || []) {
      const k = dayKey(ev.startsAt);
      if (!m.has(k)) m.set(k, { label: dayLabel(ev.startsAt), items: [] });
      m.get(k).items.push(ev);
    }
    return [...m.values()];
  }, [events]);

  const filtered = category || when || params.get('q');

  return (
    <>
      <section className="hero">
        <p className="eyebrow">AITU · all clubs, one feed</p>
        <h1>What’s happening on campus</h1>
        <p className="lede">Events from all AITU student clubs in one place. Register in one tap and get a Telegram reminder before it starts.</p>
      </section>

      <div className="filters" role="search">
        <label className="search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input id="feed-search" type="search" placeholder="Search events or clubs" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search events" />
        </label>
        <div className="chips" aria-label="Date">
          {WHEN.map(([v, label]) => (
            <button key={v} className="chip" aria-pressed={when === v} onClick={() => set('when', v)}>{label}</button>
          ))}
        </div>
        <div className="chips chips-scroll" aria-label="Category">
          <button className="chip" aria-pressed={!category} onClick={() => set('category', '')}>All categories</button>
          {meta?.categories.map(c => (
            <button key={c} className="chip" aria-pressed={category === c} onClick={() => set('category', category === c ? '' : c)}>{c}</button>
          ))}
        </div>
      </div>

      <ErrorNote error={error} />
      {!events && !error && <div className="center"><Spinner /></div>}
      {events && events.length === 0 && (
        <Empty title={filtered ? 'No events match these filters' : 'No upcoming events yet'}>
          {filtered ? <button className="btn" onClick={() => { setSearch(''); setParams({}, { replace: true }); }}>Clear filters</button>
            : <p>Club organisers will publish events here soon.</p>}
        </Empty>
      )}
      {groups.map(g => (
        <section key={g.label} className="day-group">
          <h2 className="day-head">{g.label}<span>{g.items.length} {g.items.length === 1 ? 'event' : 'events'}</span></h2>
          <div className="event-list">{g.items.map(ev => <EventCard key={ev.id} ev={ev} />)}</div>
        </section>
      ))}
    </>
  );
}
