// US-05: sign in with the university email
import { useState } from 'react';
import { useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useSession } from '../session.jsx';
import { ErrorNote, Logo } from '../components.jsx';

export default function Login() {
  const { user, meta, refresh } = useSession();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const next = params.get('next') || '/';
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [demoCode, setDemoCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user && step === 'email') return <Navigate to={next} replace />;
  const domain = meta?.emailDomain || 'astanait.edu.kz';

  const requestCode = async e => {
    e.preventDefault();
    setError(''); setBusy(true);
    const full = email.includes('@') ? email.trim() : `${email.trim()}@${domain}`;
    try {
      const r = await api('/auth/request-code', { method: 'POST', body: { email: full } });
      setEmail(full); setDemoCode(r.demoCode || ''); setStep('code');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const verify = async e => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await api('/auth/verify', { method: 'POST', body: { email, code: code.trim(), name: name.trim() || undefined } });
      await refresh();
      nav(next, { replace: true });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const art = Object.values(meta?.categoryPhotos || {}).slice(0, 4);
  return (
    <div className="auth-wrap">
    <div className="auth-art" aria-hidden="true">{art.map(u => <img key={u} src={u.replace(/w=\d+/, 'w=500')} alt="" />)}</div>
    <div className="auth card">
      <Logo size={40} />
      {step === 'email' ? (
        <form onSubmit={requestCode} className="form">
          <h1>Sign in</h1>
          <p className="muted">Join 40+ AITU clubs in one place. Campus Radar is only for AITU students and staff — we’ll send a 6-digit code to your university email.</p>
          <label className="field">
            <span>University email</span>
            <div className="input-suffix">
              <input id="login-email" autoFocus required inputMode="email" autoComplete="email" placeholder="231234"
                value={email} onChange={e => setEmail(e.target.value)} />
              {!email.includes('@') && <span className="suffix">@{domain}</span>}
            </div>
          </label>
          <ErrorNote error={error} />
          <button className="btn btn-primary btn-block" disabled={busy || !email.trim()}>{busy ? 'Sending…' : 'Send code'}</button>
        </form>
      ) : (
        <form onSubmit={verify} className="form">
          <h1>Check your email</h1>
          <p className="muted">We sent a code to <b>{email}</b>. It is valid for 10 minutes.</p>
          {demoCode && (
            <p className="note warn">Demo mode: no email service is connected, so the code is shown here: <b className="mono">{demoCode}</b></p>
          )}
          <label className="field">
            <span>6-digit code</span>
            <input id="login-code" autoFocus required inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}"
              className="code-input mono" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />
          </label>
          <label className="field">
            <span>Your name <small className="muted">(first sign-in only)</small></span>
            <input id="login-name" autoComplete="name" placeholder="Aruzhan Bekova" value={name} onChange={e => setName(e.target.value)} />
          </label>
          <ErrorNote error={error} />
          <button className="btn btn-primary btn-block" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Sign in'}</button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => { setStep('email'); setCode(''); setError(''); }}>Use another email</button>
        </form>
      )}
    </div>
    </div>
  );
}
