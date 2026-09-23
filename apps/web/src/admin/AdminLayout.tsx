import { createContext, useContext, useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import {
  Sun,
  LayoutDashboard,
  CalendarDays,
  BedDouble,
  Tag,
  ChartNoAxesCombined,
  Images,
  Users,
  Settings,
  ScrollText,
  LogOut,
  Menu,
  Mail,
} from 'lucide-react';
import { hasPermission } from '@hotel/shared';
import { api, send, useApi, message } from '../lib/api';
import type { StaffUser } from '../lib/types';
import { ErrorNotice, Field, Loading } from '../components/ui';
const StaffContext = createContext<StaffUser | null>(null);
export function useStaff() {
  const user = useContext(StaffContext);
  if (!user) throw new Error('Staff session missing');
  return user;
}
export default function AdminLayout() {
  const session = useApi<StaffUser>('/admin/me');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  if (session.loading) return <Loading />;
  if (!session.data)
    return (
      <div className="login-page">
        <div className="login-visual">
          <Link className="wordmark" to="/">
            <Sun /> HOTEL DEL SOL
          </Link>
          <h1>
            Thoughtful stays
            <br />
            start with you.
          </h1>
          <img src="/images/courtyard.webp" alt="Hotel courtyard concept" />
        </div>
        <form
          className="login-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            const data = new FormData(e.currentTarget);
            try {
              await send('/auth/sign-in/email', {
                email: data.get('email'),
                password: data.get('password'),
              });
              session.reload();
            } catch (e) {
              setError(message(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="section-index">HOTEL OPERATIONS</p>
          <h1>Welcome back.</h1>
          <p>Sign in with your employee account.</p>
          <Field label="Work email">
            <input name="email" type="email" autoComplete="username" required />
          </Field>
          <Field label="Password">
            <input name="password" type="password" autoComplete="current-password" required />
          </Field>
          {error ? <ErrorNotice>{error}</ErrorNotice> : null}
          <button className="button" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="muted">
            Need access or a password reset? Contact your hotel administrator.
          </p>
          <Link className="text-link" to="/">
            ← Back to the hotel website
          </Link>
        </form>
      </div>
    );
  const user = session.data;
  const nav = [
    {
      to: '/admin',
      name: 'Overview',
      permission: 'reservations:read',
      icon: LayoutDashboard,
      end: true,
    },
    {
      to: '/admin/reservations',
      name: 'Reservations',
      permission: 'reservations:read',
      icon: CalendarDays,
    },
    { to: '/admin/rooms', name: 'Rooms', permission: 'rooms:read', icon: BedDouble },
    { to: '/admin/promotions', name: 'Promotions', permission: 'promotions:write', icon: Tag },
    {
      to: '/admin/reports',
      name: 'Reports',
      permission: 'reports:read',
      icon: ChartNoAxesCombined,
    },
    { to: '/admin/content', name: 'Content & gallery', permission: 'content:write', icon: Images },
    { to: '/admin/users', name: 'Team', permission: 'users:write', icon: Users },
    { to: '/admin/settings', name: 'Settings', permission: 'settings:write', icon: Settings },
    { to: '/admin/audit', name: 'Audit trail', permission: 'audit:read', icon: ScrollText },
    ...(import.meta.env.DEV
      ? [{ to: '/admin/inbox', name: 'Development inbox', permission: 'users:write', icon: Mail }]
      : []),
  ];
  return (
    <StaffContext.Provider value={user}>
      <div className="admin-shell">
        <aside className={`admin-sidebar ${open ? 'open' : ''}`}>
          <Link to="/" className="admin-brand">
            <Sun size={36} strokeWidth={1} />
            <span>
              HOTEL
              <br />
              DEL SOL
            </span>
          </Link>
          <span className="nav-caption">OPERATIONS</span>
          <nav aria-label="Staff navigation">
            {nav
              .filter((item) => hasPermission(user.role, item.permission))
              .map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setOpen(false)}>
                  <item.icon size={19} strokeWidth={1.5} />
                  {item.name}
                </NavLink>
              ))}
          </nav>
          <div className="sidebar-bottom">
            <p>
              Brighter stays.
              <br />
              Thoughtful hospitality.
            </p>
            <button
              onClick={async () => {
                await api('/auth/sign-out', { method: 'POST', body: '{}' });
                session.setData(undefined);
                session.reload();
                navigate('/admin');
              }}
            >
              <LogOut size={17} /> Sign out
            </button>
          </div>
        </aside>
        <div className="admin-main">
          <header className="admin-topbar">
            <button
              className="menu-toggle"
              aria-label="Toggle staff navigation"
              onClick={() => setOpen(!open)}
            >
              <Menu />
            </button>
            <span>Hotel operations</span>
            <div>
              <span className="avatar">{user.name.slice(0, 1)}</span>
              <span>
                {user.name}
                <small>{user.role.toLowerCase().replaceAll('_', ' ')}</small>
              </span>
            </div>
          </header>
          <div className="admin-content">
            <Outlet />
          </div>
        </div>
      </div>
    </StaffContext.Provider>
  );
}
