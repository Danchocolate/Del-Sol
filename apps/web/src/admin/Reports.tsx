import { useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { money } from '@hotel/shared';
import { useApi } from '../lib/api';
import { ErrorNotice, Loading } from '../components/ui';
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
);
export interface ReportsData {
  revenue: number;
  roomCount: number;
  trends: {
    date: string;
    revenue: number;
    bookings: number;
    cancellations: number;
    occupancy: number;
  }[];
  sources: { name: string; value: number }[];
  popularRooms: { name: string; value: number }[];
  promotions: { code: string; name: string; _count: { redemptions: number } }[];
  occupancyBasis: string;
}
const options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: { beginAtZero: true },
    x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } },
  },
};
export function TrendCharts({ data, compact = false }: { data: ReportsData; compact?: boolean }) {
  const labels = data.trends.map((t) => t.date.slice(5));
  return (
    <div className="chart-grid">
      <section className="panel">
        <h2>Recorded revenue</h2>
        <p className="muted">Confirmed external payments, net of corrections</p>
        <div className="chart">
          <Line
            options={options}
            data={{
              labels,
              datasets: [
                {
                  label: 'Revenue (PHP)',
                  data: data.trends.map((t) => t.revenue / 100),
                  borderColor: '#a04f35',
                  backgroundColor: '#a04f35',
                  pointRadius: 1,
                  tension: 0.2,
                },
              ],
            }}
          />
        </div>
      </section>
      <section className="panel">
        <h2>Room nights</h2>
        <p className="muted">Booked rooms by stay date</p>
        <div className="chart">
          <Line
            options={options}
            data={{
              labels,
              datasets: [
                {
                  label: 'Occupied rooms',
                  data: data.trends.map((t) => t.occupancy),
                  borderColor: '#3c5748',
                  backgroundColor: '#3c5748',
                  pointRadius: 1,
                },
              ],
            }}
          />
        </div>
      </section>
      {!compact ? (
        <section className="panel wide">
          <h2>Booking & cancellation trends</h2>
          <div className="chart">
            <Bar
              options={{ ...options, plugins: { legend: { display: true } } }}
              data={{
                labels,
                datasets: [
                  {
                    label: 'Bookings',
                    data: data.trends.map((t) => t.bookings),
                    backgroundColor: '#3c5748',
                  },
                  {
                    label: 'Cancellations',
                    data: data.trends.map((t) => t.cancellations),
                    backgroundColor: '#c59468',
                  },
                ],
              }}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
export default function Reports() {
  const [days, setDays] = useState(30);
  const { data, error, loading } = useApi<ReportsData>(`/admin/reports?days=${days}`);
  return (
    <>
      <div className="admin-heading">
        <div>
          <h1>Reports</h1>
          <p>Performance grounded in recorded hotel activity.</p>
        </div>
        <label>
          Period{' '}
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={365}>365 days</option>
          </select>
        </label>
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNotice>{error}</ErrorNotice>
      ) : data ? (
        <>
          <div className="report-total">
            <span>Net recorded revenue</span>
            <strong>{money(data.revenue)}</strong>
          </div>
          <TrendCharts data={data} />
          <div className="chart-grid">
            {[
              { title: 'Reservation sources', rows: data.sources },
              { title: 'Popular rooms', rows: data.popularRooms },
              {
                title: 'Promotion usage',
                rows: data.promotions.map((p) => ({
                  name: `${p.name} (${p.code})`,
                  value: p._count.redemptions,
                })),
              },
            ].map((group) => (
              <section className="panel" key={group.title}>
                <h2>{group.title}</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr key={row.name}>
                        <td>{row.name}</td>
                        <td>{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!group.rows.length ? <p className="muted">No activity for this period.</p> : null}
              </section>
            ))}
          </div>
          <p className="muted">{data.occupancyBasis}</p>
        </>
      ) : null}
    </>
  );
}
