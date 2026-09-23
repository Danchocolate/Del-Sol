import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  hasPermission,
  money,
  paymentMethods,
  statuses,
  transitions,
  type Status,
} from '@hotel/shared';
import { useApi, send, message } from '../lib/api';
import { dateLabel, statusLabel, type Reservation } from '../lib/types';
import { useStaff } from './AdminLayout';
import { Empty, ErrorNotice, Field, Loading, StatusBadge } from '../components/ui';
import { StaffBooking } from './StaffBooking';
export default function Reservations() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const user = useStaff();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<Status>();
  const [reversal, setReversal] = useState<string>();
  const list = useApi<{ items: Reservation[]; total: number; page: number }>(
    !id ? `/admin/reservations?${params}` : null,
  );
  const detail = useApi<Reservation>(id ? `/admin/reservations/${id}` : null);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      detail.reload();
      list.reload();
      setPaymentOpen(false);
      setPendingStatus(undefined);
      setReversal(undefined);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  if (id) {
    const r = detail.data;
    return (
      <>
        <Link className="text-link" to="/admin/reservations">
          ← All reservations
        </Link>
        {detail.loading ? (
          <Loading />
        ) : detail.error ? (
          <ErrorNotice>{detail.error}</ErrorNotice>
        ) : r ? (
          <>
            <div className="admin-heading">
              <div>
                <h1>{r.reference}</h1>
                <p>
                  {r.guest.name} · {r.source.replaceAll('_', ' ')}
                </p>
              </div>
              <StatusBadge status={r.status} />
            </div>
            {error ? <ErrorNotice>{error}</ErrorNotice> : null}
            <div className="admin-detail-grid">
              <section className="panel">
                <h2>Stay details</h2>
                <dl className="details-list">
                  <div>
                    <dt>Guest</dt>
                    <dd>
                      {r.guest.name}
                      <br />
                      {r.guest.email}
                      <br />
                      {r.guest.mobile}
                    </dd>
                  </div>
                  <div>
                    <dt>Dates</dt>
                    <dd>
                      {dateLabel(r.checkIn)} — {dateLabel(r.checkOut)}
                    </dd>
                  </div>
                  <div>
                    <dt>Rooms</dt>
                    <dd>
                      {r.rooms.map((room) => `${room.roomName} (${room.room?.number})`).join(', ')}
                    </dd>
                  </div>
                  <div>
                    <dt>Guests</dt>
                    <dd>{r.guestCount}</dd>
                  </div>
                  <div>
                    <dt>Subtotal</dt>
                    <dd>{money(r.subtotal)}</dd>
                  </div>
                  <div>
                    <dt>Discount</dt>
                    <dd>{money(r.discount)}</dd>
                  </div>
                  <div>
                    <dt>Total</dt>
                    <dd>{money(r.total)}</dd>
                  </div>
                </dl>
                {hasPermission(user.role, 'reservations:write') ? (
                  <div className="actions">
                    {transitions[r.status]
                      .filter(
                        (s) =>
                          !['EXPIRED', 'PENDING_CONFIRMATION'].includes(s) &&
                          !(r.status === 'PENDING_EMAIL_VERIFICATION' && s === 'CONFIRMED'),
                      )
                      .map((s) => (
                        <button
                          className={`button ${s === 'CANCELLED' ? 'button-outline' : ''}`}
                          key={s}
                          onClick={() => setPendingStatus(s)}
                        >
                          {s === 'CHECKED_IN'
                            ? 'Check in'
                            : s === 'CHECKED_OUT'
                              ? 'Check out'
                              : s === 'CONFIRMED'
                                ? 'Confirm reservation'
                                : statusLabel(s)}
                        </button>
                      ))}
                  </div>
                ) : null}
                {pendingStatus ? (
                  <form
                    className="action-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      void action(() =>
                        send(`/admin/reservations/${id}/status`, {
                          status: pendingStatus,
                          reason: data.get('reason') || undefined,
                        }),
                      );
                    }}
                  >
                    <h3>Change status to {statusLabel(pendingStatus)}?</h3>
                    <Field label="Reason / staff note">
                      <textarea name="reason" maxLength={500} />
                    </Field>
                    <div className="actions">
                      <button className="button" disabled={busy}>
                        Apply status
                      </button>
                      <button type="button" onClick={() => setPendingStatus(undefined)}>
                        Keep current status
                      </button>
                    </div>
                  </form>
                ) : null}
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Payment ledger</h2>
                  {hasPermission(user.role, 'payments:write') ? (
                    <button className="button small" onClick={() => setPaymentOpen(!paymentOpen)}>
                      Record payment
                    </button>
                  ) : null}
                </div>
                <p>
                  Recorded: <strong>{money(r.payments.reduce((s, p) => s + p.amount, 0))}</strong> ·
                  Balance:{' '}
                  <strong>{money(r.total - r.payments.reduce((s, p) => s + p.amount, 0))}</strong>
                </p>
                <p className="muted">
                  Only record payments already collected outside this application.
                </p>
                {paymentOpen ? (
                  <form
                    className="form-grid action-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      void action(() =>
                        send(`/admin/reservations/${id}/payments`, {
                          amount: Math.round(Number(data.get('amount')) * 100),
                          method: data.get('method'),
                          paidAt: new Date(String(data.get('paidAt'))).toISOString(),
                          receipt: data.get('receipt'),
                          notes: data.get('notes') || undefined,
                          idempotencyKey: crypto.randomUUID(),
                        }),
                      );
                    }}
                  >
                    <Field label="Amount (PHP)">
                      <input name="amount" type="number" min="0.01" step="0.01" required />
                    </Field>
                    <Field label="Payment method">
                      <select name="method">
                        {paymentMethods.map((method) => (
                          <option key={method}>{method}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Payment date">
                      <input
                        name="paidAt"
                        type="datetime-local"
                        defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
                          .toISOString()
                          .slice(0, 16)}
                        required
                      />
                    </Field>
                    <Field label="Receipt / reference">
                      <input name="receipt" required maxLength={100} />
                    </Field>
                    <Field label="Notes (no payment credentials)">
                      <textarea name="notes" maxLength={500} />
                    </Field>
                    <button className="button" disabled={busy}>
                      Save payment
                    </button>
                  </form>
                ) : null}
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date / receipt</th>
                        <th>Method</th>
                        <th>Amount</th>
                        <th>Correction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.payments.map((p) => (
                        <tr key={p.id}>
                          <td>
                            {dateLabel(p.paidAt)}
                            <small>{p.receipt}</small>
                          </td>
                          <td>{p.method}</td>
                          <td>{money(p.amount)}</td>
                          <td>
                            {!p.reversalOfId &&
                            !r.payments.some((x) => x.reversalOfId === p.id) &&
                            hasPermission(user.role, 'payments:write') ? (
                              <button className="text-link" onClick={() => setReversal(p.id)}>
                                Reverse
                              </button>
                            ) : p.reversalOfId ? (
                              'Reversal'
                            ) : (
                              'Reversed'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!r.payments.length ? <Empty>No payments recorded.</Empty> : null}
                {reversal ? (
                  <form
                    className="action-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      void action(() =>
                        send(`/admin/payments/${reversal}/reverse`, { reason: data.get('reason') }),
                      );
                    }}
                  >
                    <Field label="Correction reason">
                      <input name="reason" required minLength={3} maxLength={500} />
                    </Field>
                    <button className="button" disabled={busy}>
                      Record reversal
                    </button>
                    <button type="button" onClick={() => setReversal(undefined)}>
                      Cancel
                    </button>
                  </form>
                ) : null}
              </section>
              <section className="panel">
                <h2>Reservation timeline</h2>
                <ol className="timeline">
                  {r.history.map((h) => (
                    <li key={h.id}>
                      <StatusBadge status={h.toStatus} />
                      <small>{new Date(h.createdAt).toLocaleString()}</small>
                      {h.reason ? <p>{h.reason}</p> : null}
                    </li>
                  ))}
                  {r.events
                    .filter((e) => e.kind.startsWith('PAYMENT'))
                    .map((event) => (
                      <li key={event.id}>
                        <strong>{statusLabel(event.kind)}</strong>
                        <small>{new Date(event.createdAt).toLocaleString()}</small>
                      </li>
                    ))}
                </ol>
              </section>
            </div>
          </>
        ) : null}
      </>
    );
  }
  return (
    <>
      <div className="admin-heading">
        <div>
          <h1>Reservations</h1>
          <p>Every stay, from first request to farewell.</p>
        </div>
        <button className="button" onClick={() => setNewOpen(!newOpen)}>
          New phone / walk-in booking
        </button>
      </div>
      {newOpen ? (
        <StaffBooking
          onDone={() => {
            setNewOpen(false);
            list.reload();
          }}
        />
      ) : null}
      <form
        className="filter-bar"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setParams(
            new URLSearchParams(
              [...data.entries()].filter(([, v]) => v).map(([k, v]) => [k, String(v)]),
            ),
          );
        }}
      >
        <Field label="Search">
          <input
            name="q"
            placeholder="Reference, guest name or email"
            defaultValue={params.get('q') ?? ''}
          />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={params.get('status') ?? ''}>
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Arrival from">
          <input name="from" type="date" defaultValue={params.get('from') ?? ''} />
        </Field>
        <Field label="Arrival to">
          <input name="to" type="date" defaultValue={params.get('to') ?? ''} />
        </Field>
        <button className="button">Apply filters</button>
      </form>
      <section className="panel">
        {list.loading ? (
          <Loading />
        ) : list.error ? (
          <ErrorNotice>{list.error}</ErrorNotice>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Reservation / guest</th>
                    <th>Stay</th>
                    <th>Rooms</th>
                    <th>Status</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data?.items.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link to={`/admin/reservations/${r.id}`}>{r.reference}</Link>
                        <small>{r.guest.name}</small>
                      </td>
                      <td>
                        {dateLabel(r.checkIn)}
                        <small>to {dateLabel(r.checkOut)}</small>
                      </td>
                      <td>
                        {r.rooms.map((room) => room.room?.number).join(', ')}
                        <small>{r.guestCount} guests</small>
                      </td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td>{money(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!list.data?.items.length ? <Empty>No reservations match these filters.</Empty> : null}
            <div className="pagination">
              <span>{list.data?.total ?? 0} reservations</span>
              <button
                disabled={(list.data?.page ?? 1) <= 1}
                onClick={() => {
                  params.set('page', String((list.data?.page ?? 1) - 1));
                  setParams(params);
                }}
              >
                Previous
              </button>
              <button
                disabled={(list.data?.page ?? 1) * 30 >= (list.data?.total ?? 0)}
                onClick={() => {
                  params.set('page', String((list.data?.page ?? 1) + 1));
                  setParams(params);
                }}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
