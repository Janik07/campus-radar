// US-04 create/edit an event, US-07 participant limit
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useSession, useToast } from '../session.jsx';
import { ErrorNote, Spinner } from '../components.jsx';
import { fromIso, toIso, dayKey } from '../format.js';

const today = () => dayKey(new Date()).split('/').reverse().join('-'); // en-GB dd/mm/yyyy → yyyy-mm-dd

export default function EventForm() {
  const { id } = useParams();
  const editing = !!id;
  const { user, clubs, meta } = useSession();
  const toast = useToast();
  const nav = useNavigate();
  const [clubList, setClubList] = useState(null);
  const [f, setF] = useState({ clubId: '', title: '', description: '', category: '', location: '', date: '', start: '18:00', end: '20:00', limited: false, capacity: 30, imageUrl: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(!editing);

  useEffect(() => {
    if (!user) return;
    // Admins can pick any club; organisers only their own.
    const load = user.role === 'admin' ? api('/clubs').then(d => d.clubs) : Promise.resolve(clubs);
    load.then(list => {
      setClubList(list);
      if (!editing && list.length) setF(s => ({ ...s, clubId: s.clubId || list[0].id, category: s.category || list[0].category || meta?.categories[0] }));
    });
  }, [user]); // eslint-disable-line

  useEffect(() => {
    if (!editing) return;
    api(`/events/${id}`).then(({ event: e }) => {
      const s = fromIso(e.startsAt), en = fromIso(e.endsAt);
      setF({ clubId: e.club.id, title: e.title, description: e.description, category: e.category, location: e.location,
        date: s.date, start: s.time, end: en.time || '', limited: e.capacity != null, capacity: e.capacity ?? 30, imageUrl: e.hasOwnImage ? e.imageUrl : '' });
      setLoaded(true);
    }).catch(err => setError(err.message));
  }, [id]); // eslint-disable-line

  if (!user) return <Navigate to="/login?next=/organizer/new" replace />;
  if (!loaded || !clubList) return <div className="center"><Spinner /></div>;
  if (clubList.length === 0) return <Navigate to="/organizer" replace />;

  const posterOptions = Object.values(meta?.categoryPhotos || {});
  const set = k => e => setF(s => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const onClub = e => {
    const c = clubList.find(x => String(x.id) === e.target.value);
    setF(s => ({ ...s, clubId: Number(e.target.value), category: editing ? s.category : (c?.category || s.category) }));
  };

  const submit = async e => {
    e.preventDefault();
    setError('');
    if (!f.date) return setError('Choose a date.');
    const startsAt = toIso(f.date, f.start);
    let endsAt = f.end ? toIso(f.date, f.end) : null;
    if (endsAt && new Date(endsAt) <= new Date(startsAt)) endsAt = new Date(new Date(endsAt).getTime() + 864e5).toISOString(); // ends after midnight
    const body = {
      clubId: Number(f.clubId), title: f.title, description: f.description, category: f.category, location: f.location,
      startsAt, endsAt, capacity: f.limited ? Number(f.capacity) : null, imageUrl: f.imageUrl.trim(),
    };
    setBusy(true);
    try {
      if (editing) {
        const r = await api(`/organizer/events/${id}`, { method: 'PUT', body });
        toast(r.promoted ? `Saved. ${r.promoted} people moved from the waitlist.` : 'Changes saved');
        nav(`/events/${id}`);
      } else {
        const r = await api('/organizer/events', { method: 'POST', body });
        toast('Event published');
        nav(`/events/${r.id}`);
      }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <>
      <Link to="/organizer" className="back">← Organiser panel</Link>
      <h1 className="page-title">{editing ? 'Edit event' : 'New event'}</h1>
      <form className="card form event-form" onSubmit={submit}>
        <label className="field"><span>Club</span>
          <select id="ef-club" value={f.clubId} onChange={onClub}>{clubList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
        <label className="field"><span>Title</span>
          <input id="ef-title" required minLength={3} maxLength={120} value={f.title} onChange={set('title')} placeholder="Weekly rapid tournament" />
        </label>
        <div className="grid-2">
          <label className="field"><span>Category</span>
            <select id="ef-cat" value={f.category} onChange={set('category')}>{meta?.categories.map(c => <option key={c}>{c}</option>)}</select>
          </label>
          <label className="field"><span>Location</span>
            <input id="ef-loc" required value={f.location} onChange={set('location')} placeholder="C1.3.240 or Assembly hall" />
          </label>
        </div>
        <div className="grid-3">
          <label className="field"><span>Date</span><input id="ef-date" type="date" required min={editing ? undefined : today()} value={f.date} onChange={set('date')} /></label>
          <label className="field"><span>Starts</span><input id="ef-start" type="time" required value={f.start} onChange={set('start')} /></label>
          <label className="field"><span>Ends <small className="muted">(optional)</small></span><input id="ef-end" type="time" value={f.end} onChange={set('end')} /></label>
        </div>
        <p className="muted small">Times are in Astana time (UTC+5).</p>
        <div className="limit-box">
          <label className="toggle"><input id="ef-limited" type="checkbox" checked={f.limited} onChange={set('limited')} /> Limit the number of participants</label>
          {f.limited && (
            <label className="field inline"><span>Places</span>
              <input id="ef-cap" type="number" min={1} max={100000} required value={f.capacity} onChange={set('capacity')} />
              <small className="muted">When places run out, students join a waitlist and move up automatically if someone cancels.</small>
            </label>
          )}
        </div>
        <div className="field"><span>Poster</span>
          <div className="poster-picker">
            {posterOptions.map(u => (
              <button type="button" key={u} aria-pressed={f.imageUrl === u} onClick={() => setF(s => ({ ...s, imageUrl: s.imageUrl === u ? '' : u }))}>
                <img src={u.replace(/w=\d+/, 'w=300')} alt="" />
              </button>
            ))}
          </div>
          <input id="ef-img" type="url" placeholder="…or paste a link to your poster (https://…)" value={f.imageUrl} onChange={set('imageUrl')} />
          <small className="muted">Without a poster the event uses a photo for its category.</small>
        </div>
        <label className="field"><span>Description</span>
          <textarea id="ef-desc" rows={6} maxLength={4000} value={f.description} onChange={set('description')} placeholder="What will happen, what to bring, who it is for." />
        </label>
        <ErrorNote error={error} />
        <div className="row-actions">
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Publish event'}</button>
          <Link className="btn btn-ghost" to="/organizer">Cancel</Link>
        </div>
      </form>
    </>
  );
}
