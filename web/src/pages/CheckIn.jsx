// Opened when an organiser scans a student's QR ticket with the phone camera.
import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useSession } from '../session.jsx';
import { Spinner } from '../components.jsx';

export default function CheckIn() {
  const { token } = useParams();
  const { user } = useSession();
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!user) return;
    api(`/checkin/${token}`, { method: 'POST' }).then(r => setState({ ok: true, ...r })).catch(e => setState({ ok: false, error: e.message }));
  }, [token, user]);
  if (!user) return <Navigate to={`/login?next=/checkin/${token}`} replace />;
  if (!state) return <div className="center"><Spinner /></div>;
  return (
    <div className="card checkin-page">
      <div className={`big ${state.ok ? 'ok' : 'bad'}`}>{state.ok ? '✓' : '!'}</div>
      {state.ok ? (
        <>
          <h1 className="page-title">{state.already ? 'Already checked in' : 'Checked in'}</h1>
          <p style={{ fontSize: '1.2rem', fontWeight: 700 }}>{state.name}</p>
          <p className="muted">{state.eventTitle}</p>
          <Link className="btn btn-primary" to={`/organizer/events/${state.eventId}/participants`}>Back to check-in list</Link>
        </>
      ) : (
        <>
          <h1 className="page-title">Not checked in</h1>
          <p className="muted">{state.error}</p>
          <Link className="btn" to="/organizer">Organiser panel</Link>
        </>
      )}
    </div>
  );
}
