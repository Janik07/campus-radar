// US-08: notification settings and Telegram connection
import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useSession, useToast } from '../session.jsx';
import { ErrorNote } from '../components.jsx';

export default function Settings() {
  const { user, meta, refresh, logout } = useSession();
  const toast = useToast();
  const nav = useNavigate();
  const [name, setName] = useState(user?.name || '');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');

  // While the user is connecting in Telegram, poll until the link is confirmed.
  useEffect(() => {
    if (!link || user?.telegramLinked) return;
    const t = setInterval(() => refresh(), 3000);
    return () => clearInterval(t);
  }, [link, user?.telegramLinked]); // eslint-disable-line

  useEffect(() => { if (user?.telegramLinked && link) { setLink(''); toast('Telegram connected'); } }, [user?.telegramLinked]); // eslint-disable-line

  if (!user) return <Navigate to="/login?next=/settings" replace />;

  const save = async patch => {
    setError('');
    try { await api('/me/settings', { method: 'PATCH', body: patch }); await refresh(); toast('Saved'); }
    catch (e) { setError(e.message); }
  };
  const connect = async () => {
    setError('');
    try {
      const r = await api('/me/telegram-link', { method: 'POST' });
      setLink(r.url);
      window.open(r.url, '_blank', 'noopener');
    } catch (e) { setError(e.message); }
  };
  const disconnect = async () => { await api('/me/telegram', { method: 'DELETE' }); await refresh(); toast('Telegram disconnected'); };
  const test = async () => {
    const r = await api('/me/telegram-test', { method: 'POST' });
    toast(r.ok ? 'Test message sent — check Telegram' : 'Could not send. Try reconnecting.', r.ok ? 'ok' : 'bad');
  };

  return (
    <>
      <h1 className="page-title">Settings</h1>
      <ErrorNote error={error} />
      <section className="card settings-block">
        <h2>Profile</h2>
        <p className="muted">{user.email} · {user.role === 'admin' ? 'Administrator' : user.role === 'organizer' ? 'Club organiser' : 'Student'}</p>
        <form className="row-form" onSubmit={e => { e.preventDefault(); save({ name: name.trim() }); }}>
          <label className="field grow"><span>Name shown to organisers</span>
            <input id="settings-name" value={name} onChange={e => setName(e.target.value)} required maxLength={80} /></label>
          <button className="btn">Save</button>
        </form>
      </section>

      <section className="card settings-block">
        <h2>Telegram reminders</h2>
        {!meta?.telegram.enabled && <p className="note warn">The Telegram bot is not configured on this server yet.</p>}
        {user.telegramLinked ? (
          <>
            <p className="note ok">Connected{user.telegramUsername ? ` as @${user.telegramUsername}` : ''}. Reminders arrive in your chat with @{meta?.telegram.username}.</p>
            <div className="toggles">
              <label className="toggle"><input id="n24" type="checkbox" checked={user.notify24h} onChange={e => save({ notify24h: e.target.checked })} /> 24 hours before</label>
              <label className="toggle"><input id="n1" type="checkbox" checked={user.notify1h} onChange={e => save({ notify1h: e.target.checked })} /> 1 hour before</label>
            </div>
            <div className="row-actions">
              <button className="btn btn-sm" onClick={test}>Send a test message</button>
              <button className="btn btn-ghost btn-sm" onClick={disconnect}>Disconnect</button>
            </div>
          </>
        ) : (
          <>
            <p>Press the button, then press <b>Start</b> in Telegram. This page updates by itself when you’re connected.</p>
            <button className="btn btn-primary" onClick={connect} disabled={!meta?.telegram.enabled}>Connect Telegram</button>
            {link && <p className="muted small">Telegram didn’t open? <a href={link} target="_blank" rel="noreferrer">Open the bot link</a>. Waiting for confirmation…</p>}
          </>
        )}
      </section>

      <button className="btn btn-ghost" onClick={async () => { await logout(); nav('/'); }}>Sign out</button>
    </>
  );
}
