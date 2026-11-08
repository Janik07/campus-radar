// US-15: attendance dashboard for the Department of Social and Educational Work
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useSession } from '../session.jsx';
import { Spinner, ErrorNote } from '../components.jsx';
import { CATEGORY_HUE, shortDate } from '../format.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const rateClass = r => (r >= 75 ? 'hi' : r >= 55 ? 'mid' : 'lo');

export default function Analytics() {
  const { user } = useSession();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { if (user?.role === 'admin') api('/admin/analytics').then(setD).catch(e => setError(e.message)); }, [user]);
  if (!user) return <Navigate to="/login?next=/admin/stats" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  if (error) return <ErrorNote error={error} />;
  if (!d) return <div className="center"><Spinner /></div>;

  const t = d.totals;
  const maxClub = Math.max(1, ...d.clubs.map(c => c.registrations));
  const maxCat = Math.max(1, ...d.categories.map(c => c.registrations));

  return (
    <>
      <div className="title-row">
        <div>
          <h1 className="page-title">Attendance dashboard</h1>
          <p className="muted">Department of Social and Educational Work · last 120 days · attendance is counted from QR check-ins</p>
        </div>
        <div className="row-actions">
          <Link className="btn" to="/admin">Organisers</Link>
          <a className="btn btn-primary" href="/api/admin/analytics.csv">Export to Excel (CSV)</a>
        </div>
      </div>

      <div className="stat-row">
        <div className="card stat c1"><b>{t.events_held}</b><span>events held by {t.active_clubs} clubs</span></div>
        <div className="card stat c2"><b>{t.attended}</b><span>check-ins · {pct(t.attended, t.registrations)}% of {t.registrations} registered</span></div>
        <div className="card stat c3"><b>{t.unique_students}</b><span>different students attended</span></div>
        <div className="card stat c4"><b>{d.upcoming.n}</b><span>upcoming events · {d.upcoming.regs} registered</span></div>
      </div>

      <div className="dash-grid">
        <section className="card panel">
          <h2>Attendance by club</h2>
          <div className="legend"><span><i style={{ background: '#d9dcea' }} />Light bar: registered</span><span><i style={{ background: '#646a86' }} />Bright bar: attended (QR check-in)</span></div>
          <div className="hbars">
            {d.clubs.map(c => (
              <div className="hbar" key={c.id} style={{ '--h': CATEGORY_HUE[c.category] ?? 14 }}>
                <span className="name" title={c.name}>{c.name}</span>
                <span className="track">
                  <i className="reg" style={{ width: `${(c.registrations / maxClub) * 100}%` }} />
                  <i className="att" style={{ width: `${(c.attended / maxClub) * 100}%` }} />
                </span>
                <span className="val">{c.attended}/{c.registrations}</span>
              </div>
            ))}
          </div>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <section className="card panel trend">
            <h2>Check-ins per week</h2>
            <WeekChart weeks={d.weeks} />
          </section>
          <section className="card panel">
            <h2>By interest</h2>
            <div className="hbars">
              {d.categories.map(c => (
                <div className="hbar" key={c.category} style={{ '--h': CATEGORY_HUE[c.category] ?? 14 }}>
                  <span className="name">{c.category}</span>
                  <span className="track">
                    <i className="reg" style={{ width: `${(c.registrations / maxCat) * 100}%` }} />
                    <i className="att" style={{ width: `${(c.attended / maxCat) * 100}%` }} />
                  </span>
                  <span className="val">{pct(c.attended, c.registrations)}%</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section className="card panel">
        <h2>Clubs</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Club</th><th>Events</th><th>Registered</th><th>Attended</th><th>Attendance</th><th>Followers</th></tr></thead>
            <tbody>{d.clubs.map(c => {
              const r = pct(c.attended, c.registrations);
              return <tr key={c.id}><td><b>{c.name}</b></td><td>{c.events}</td><td>{c.registrations}</td><td>{c.attended}</td>
                <td><span className={`rate ${rateClass(r)}`}>{r}%</span></td><td>{c.followers}</td></tr>;
            })}</tbody>
          </table>
        </div>
      </section>

      <section className="card panel">
        <h2>Recent events</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Event</th><th>Club</th><th>Registered</th><th>Attended</th><th>Attendance</th></tr></thead>
            <tbody>{d.events.map(e => {
              const r = pct(e.attended, e.registrations);
              return <tr key={e.id}><td className="muted">{shortDate(e.starts_at)}</td><td><Link to={`/events/${e.id}`}>{e.title}</Link></td>
                <td>{e.club_name}</td><td>{e.registrations}</td><td>{e.attended}</td><td><span className={`rate ${rateClass(r)}`}>{r}%</span></td></tr>;
            })}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// Simple bar chart of weekly check-ins (SVG, one scale for bars and labels).
function WeekChart({ weeks }) {
  if (!weeks.length) return <p className="muted">No events yet.</p>;
  const W = 420, H = 170, pad = 24, bw = (W - pad * 2) / weeks.length;
  const max = Math.max(1, ...weeks.map(w => w.registrations));
  const y = v => H - pad - (v / max) * (H - pad * 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Check-ins per week">
      {[0, 0.5, 1].map(f => <line key={f} x1={pad} x2={W - pad} y1={y(max * f)} y2={y(max * f)} stroke="#e6e8f2" />)}
      {weeks.map((w, i) => {
        const x = pad + i * bw + bw * 0.18, width = bw * 0.64;
        return (
          <g key={w.week}>
            <rect x={x} y={y(w.registrations)} width={width} height={H - pad - y(w.registrations)} rx="5" fill="#ffd9cf" />
            <rect x={x} y={y(w.attended)} width={width} height={H - pad - y(w.attended)} rx="5" fill="#ff5a3c" />
            <text x={x + width / 2} y={y(w.attended) - 5} textAnchor="middle" fontSize="11" fontWeight="700" fill="#1b1f3b">{w.attended}</text>
            <text x={x + width / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#646a86">{w.week.slice(5).replace('-', '.')}</text>
          </g>
        );
      })}
    </svg>
  );
}
