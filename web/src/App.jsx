import { NavLink, Route, Routes, Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { SessionProvider, ToastProvider, useSession } from './session.jsx';
import { Logo, Spinner } from './components.jsx';
import Feed from './pages/Feed.jsx';
import EventPage from './pages/EventPage.jsx';
import Login from './pages/Login.jsx';
import MyEvents from './pages/MyEvents.jsx';
import Settings from './pages/Settings.jsx';
import Clubs from './pages/Clubs.jsx';
import ClubPage from './pages/ClubPage.jsx';
import Organizer from './pages/Organizer.jsx';
import EventForm from './pages/EventForm.jsx';
import Participants from './pages/Participants.jsx';
import Admin from './pages/Admin.jsx';

function Shell() {
  const { loading, user, clubs } = useSession();
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  const isOrganizer = user && (user.role === 'admin' || clubs.length > 0);

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <Link to="/" className="brand"><Logo /><span>Campus Radar</span></Link>
          <nav className="topnav" aria-label="Main">
            <NavLink to="/" end>Events</NavLink>
            <NavLink to="/clubs">Clubs</NavLink>
            {user && <NavLink to="/my">My events</NavLink>}
            {isOrganizer && <NavLink to="/organizer">Organiser</NavLink>}
            {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
          </nav>
          <div className="topbar-right">
            {user
              ? <NavLink to="/settings" className="avatar" title="Settings">{(user.name || user.email)[0].toUpperCase()}</NavLink>
              : <Link to="/login" className="btn btn-primary btn-sm">Sign in</Link>}
          </div>
        </div>
      </header>

      <main className="wrap page">
        {loading ? <div className="center"><Spinner /></div> : (
          <Routes>
            <Route path="/" element={<Feed />} />
            <Route path="/events/:id" element={<EventPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/my" element={<MyEvents />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/clubs" element={<Clubs />} />
            <Route path="/clubs/:slug" element={<ClubPage />} />
            <Route path="/organizer" element={<Organizer />} />
            <Route path="/organizer/new" element={<EventForm />} />
            <Route path="/organizer/events/:id/edit" element={<EventForm />} />
            <Route path="/organizer/events/:id/participants" element={<Participants />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<div className="empty"><h3>Page not found</h3><Link to="/">Back to events</Link></div>} />
          </Routes>
        )}
      </main>

      <nav className="tabbar" aria-label="Main">
        <NavLink to="/" end><TabIcon d="M4 6h16M4 12h16M4 18h10" />Events</NavLink>
        <NavLink to="/clubs"><TabIcon d="M5 20v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" />Clubs</NavLink>
        {user && <NavLink to="/my"><TabIcon d="M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM9 14l2 2 4-4" />My events</NavLink>}
        {isOrganizer && <NavLink to="/organizer"><TabIcon d="M12 5v14M5 12h14" />Organiser</NavLink>}
        <NavLink to={user ? '/settings' : '/login'}><TabIcon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0" />{user ? 'Me' : 'Sign in'}</NavLink>
      </nav>

      <footer className="wrap footer">
        Campus Radar · a student project for AITU · Team project, Project Management course
      </footer>
    </>
  );
}

const TabIcon = ({ d }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

export default function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </SessionProvider>
  );
}
