import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LogIn, LogOut, BedDouble, ClipboardList, ArrowRight } from 'lucide-react';
import { hasPermission, money } from '@hotel/shared';
import { useApi, send } from '../lib/api';
import { useStaff } from './AdminLayout';
import { Empty, ErrorNotice, Loading, StatusBadge } from '../components/ui';
import type { Reservation } from '../lib/types';
import { TrendCharts, type ReportsData } from './Reports';
interface Operations {
  today: string;
  arrivals: Reservation[];
  departures: Reservation[];
  occupied: number;
  allocated: number;
  totalRooms: number;
  available: number;
  pending: number;
  confirmed: number;
  cancelled: number;
}
interface Notice {
  id: string;
  title: string;
  reservationId: string;
  readAt: string | null;
  createdAt: string;
}
export default function Dashboard() {
  const user = useStaff();
  const allowed = hasPermission(user.role, 'reservations:read');
  const operations = useApi<Operations>(allowed ? '/admin/operations' : null);
  const notices = useApi<Notice[]>(allowed ? '/admin/notifications' : null);
  const report = useApi<ReportsData>(
    hasPermission(user.role, 'reports:read') ? '/admin/reports?days=30' : null,
  );
  useEffect(() => {
    if (!allowed) return;
    const timer = setInterval(() => {
      notices.reload();
      operations.reload();
    }, 30000);
    return () => clearInterval(timer);
  }, [allowed, notices.reload, operations.reload]);
  if (!allowed)
    return (
      <>
        <h1>Welcome to Hotel Del Sol.</h1>
        <p>Manage the website content and gallery.</p>
        <Link className="button" to="/admin/content">
          Open content & gallery
        </Link>
      </>
    );
  if (operations.loading && !operations.data) return <Loading />;
  if (operations.error) return <ErrorNotice>{operations.error}</ErrorNotice>;
  const data = operations.data;
  if (!data) return null;
  return (
    <>
      <div className="admin-heading">
        <div>
          <h1>Today at Del Sol</h1>
          <p>
            {new Date(`${data.today}T12:00:00`).toLocaleDateString('en-PH', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
        </div>
        <Link className="button" to="/admin/reservations">
          View reservations <ArrowRight size={17} />
        </Link>
      </div>
      <div className="metrics-strip">
        {[
          { name: 'Arrivals', value: data.arrivals.length, icon: LogIn },
          { name: 'Departures', value: data.departures.length, icon: LogOut },
          { name: 'Rooms available', value: data.available, icon: BedDouble },
          { name: 'Pending requests', value: data.pending, icon: ClipboardList },
        ].map((metric) => (
          <div key={metric.name}>
            <metric.icon size={29} strokeWidth={1.3} />
            <div>
              <span>{metric.name}</span>
              <strong>{metric.value}</strong>
            </div>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <div>
          <section className="panel">
            <div className="panel-heading">
              <h2>Arrivals & departures</h2>
              <span>
                {data.occupied} rooms checked in · {data.allocated} allocated today ·{' '}
                {data.totalRooms} active rooms
              </span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Guest</th>
                    <th>Stay</th>
                    <th>Movement</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...data.arrivals.map((r) => ({ ...r, movement: 'Arrival' })),
                    ...data.departures.map((r) => ({ ...r, movement: 'Departure' })),
                  ].map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link to={`/admin/reservations/${r.id}`}>{r.guest.name}</Link>
                        <small>{r.reference}</small>
                      </td>
                      <td>
                        {r.checkIn.slice(0, 10)} → {r.checkOut.slice(0, 10)}
                      </td>
                      <td>{r.movement}</td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.arrivals.length && !data.departures.length ? (
              <Empty>No arrivals or departures scheduled for today.</Empty>
            ) : null}
          </section>
          {report.data ? (
            <>
              <div className="operational-summary">
                <span>
                  Confirmed <b>{data.confirmed}</b>
                </span>
                <span>
                  Cancellations <b>{data.cancelled}</b>
                </span>
                <span>
                  Recorded revenue · 30 days <b>{money(report.data.revenue)}</b>
                </span>
              </div>
              <TrendCharts data={report.data} compact />
            </>
          ) : null}
        </div>
        <aside className="panel activity">
          <h2>Activity</h2>
          {notices.data?.length ? (
            notices.data.map((n) => (
              <div className={`notice ${n.readAt ? 'read' : ''}`} key={n.id}>
                <Link to={`/admin/reservations/${n.reservationId}`}>{n.title}</Link>
                <small>{new Date(n.createdAt).toLocaleString()}</small>
                {!n.readAt ? (
                  <button
                    className="text-link"
                    onClick={async () => {
                      await send(`/admin/notifications/${n.id}/read`, {});
                      notices.reload();
                    }}
                  >
                    Mark read
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <Empty>You’re all caught up. New reservation notifications will appear here.</Empty>
          )}
        </aside>
      </div>
    </>
  );
}
