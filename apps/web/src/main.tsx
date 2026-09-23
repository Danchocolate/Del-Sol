import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { PublicLayout } from './components/PublicLayout';
import { Loading } from './components/ui';
import './styles.css';
const Home = lazy(() => import('./pages/Home'));
const Rooms = lazy(() => import('./pages/Rooms'));
const Gallery = lazy(() => import('./pages/Gallery'));
const Contact = lazy(() => import('./pages/Contact'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Booking = lazy(() => import('./pages/Booking'));
const GuestReservation = lazy(() => import('./pages/GuestReservation'));
const AdminLayout = lazy(() => import('./admin/AdminLayout'));
const Dashboard = lazy(() => import('./admin/Dashboard'));
const Reservations = lazy(() => import('./admin/Reservations'));
const RoomsAdmin = lazy(() => import('./admin/RoomsAdmin'));
const Promotions = lazy(() => import('./admin/Promotions'));
const Reports = lazy(() => import('./admin/Reports'));
const ContentAdmin = lazy(() =>
  import('./admin/Management').then((m) => ({ default: m.ContentAdmin })),
);
const SettingsAdmin = lazy(() =>
  import('./admin/Management').then((m) => ({ default: m.SettingsAdmin })),
);
const UsersAdmin = lazy(() =>
  import('./admin/Management').then((m) => ({ default: m.UsersAdmin })),
);
const AuditAdmin = lazy(() =>
  import('./admin/Management').then((m) => ({ default: m.AuditAdmin })),
);
const DevInbox = lazy(() => import('./admin/Management').then((m) => ({ default: m.DevInbox })));
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<Home />} />
            <Route path="rooms" element={<Rooms />} />
            <Route path="rooms/:slug" element={<Rooms />} />
            <Route path="gallery" element={<Gallery />} />
            <Route path="contact" element={<Contact />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="search" element={<Booking />} />
            <Route path="reservation" element={<GuestReservation />} />
            <Route path="reservation/received" element={<GuestReservation />} />
            <Route path="reservation/access" element={<GuestReservation />} />
            <Route path="reservation/:reference" element={<GuestReservation />} />
          </Route>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="reservations" element={<Reservations />} />
            <Route path="reservations/:id" element={<Reservations />} />
            <Route path="rooms" element={<RoomsAdmin />} />
            <Route path="promotions" element={<Promotions />} />
            <Route path="reports" element={<Reports />} />
            <Route path="content" element={<ContentAdmin />} />
            <Route path="settings" element={<SettingsAdmin />} />
            <Route path="users" element={<UsersAdmin />} />
            <Route path="audit" element={<AuditAdmin />} />
            <Route path="inbox" element={<DevInbox />} />
          </Route>
          <Route
            path="*"
            element={
              <div className="page-wrap">
                <h1>Page not found.</h1>
                <Link to="/">Return to Hotel Del Sol</Link>
              </div>
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
