import { createContext, useContext, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Menu, X, Sun, ArrowUpRight } from 'lucide-react';
import { useApi } from '../lib/api';
import type { PublicData } from '../lib/types';
import { ErrorNotice, Loading } from './ui';
const PublicContext = createContext<PublicData | null>(null);
export function usePublic() {
  const data = useContext(PublicContext);
  if (!data) throw new Error('Public data missing');
  return data;
}
export function PublicLayout() {
  const { data, error, loading, reload } = useApi<PublicData>('/public');
  const [open, setOpen] = useState(false);
  const location = useLocation();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="public-header">
        <Link className="wordmark" to="/" aria-label="Hotel Del Sol home">
          <Sun size={29} strokeWidth={1} />
          <span>HOTEL DEL SOL</span>
        </Link>
        <button
          className="menu-toggle"
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
        <nav
          className={open ? 'open' : ''}
          aria-label="Main navigation"
          onClick={() => setOpen(false)}
        >
          <Link to="/rooms">Rooms & suites</Link>
          <Link to="/#experience">The experience</Link>
          <Link to="/gallery">Gallery</Link>
          <Link to="/reservation">Your reservation</Link>
          <Link className="button" to="/search">
            Book your stay <ArrowUpRight size={16} />
          </Link>
        </nav>
      </header>
      <main id="main" key={location.pathname + location.search}>
        {loading ? (
          <Loading />
        ) : error ? (
          <div className="page-wrap">
            <ErrorNotice>{error}</ErrorNotice>
            <button onClick={reload}>Try again</button>
          </div>
        ) : data ? (
          <PublicContext.Provider value={data}>
            <Outlet />
          </PublicContext.Provider>
        ) : null}
      </main>
      <footer className="public-footer">
        <div>
          <Link className="wordmark" to="/">
            HOTEL DEL SOL
          </Link>
          <p>A slower day. A brighter tomorrow.</p>
        </div>
        <nav aria-label="Footer navigation">
          <Link to="/rooms">Our rooms</Link>
          <Link to="/contact">Find us</Link>
          <Link to="/reservation">Your reservation</Link>
          <Link to="/privacy">Privacy & booking terms</Link>
        </nav>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Hotel Del Sol</span>
          <span>Concept imagery · Property details awaiting hotel approval</span>
          <Link to="/admin">Staff access</Link>
        </div>
      </footer>
    </>
  );
}
