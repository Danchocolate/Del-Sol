import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { money } from '@hotel/shared';
import { Mail, CheckCircle2 } from 'lucide-react';
import { send, useApi, message } from '../lib/api';
import { dateLabel } from '../lib/types';
import { Turnstile } from '../components/Turnstile';
import { ErrorNotice, Field, Loading, StatusBadge } from '../components/ui';
interface GuestBooking {
  reference: string;
  status: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  roomCount: number;
  total: number;
  paid: number;
  guest: { name: string; email: string };
  rooms: { roomName: string }[];
  policy: { cancellationCutoffHours: number };
  history: { status: string; createdAt: string }[];
}
export default function GuestReservation() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { reference } = useParams();
  const [token, setToken] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const {
    data,
    loading,
    error: loadError,
    reload,
  } = useApi<GuestBooking>(reference ? `/reservations/${reference}` : null);
  const [linkToken] = useState(
    () => new URLSearchParams(location.hash.slice(1)).get('token') ?? '',
  );
  async function exchange() {
    setBusy(true);
    setError('');
    try {
      const result = await send<{ reference: string }>('/reservations/verify', {
        token: linkToken,
      });
      window.history.replaceState(null, '', location.pathname);
      navigate(`/reservation/${result.reference}`, { replace: true });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function lookup(form: HTMLFormElement) {
    setBusy(true);
    setError('');
    try {
      const fields = new FormData(form);
      const result = await send<{ message: string }>('/reservations/access', {
        reference: String(fields.get('reference')).toUpperCase(),
        email: fields.get('email'),
        turnstileToken: token,
      });
      setNotice(result.message);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
      setResetKey((v) => v + 1);
    }
  }
  if (location.pathname.endsWith('/received'))
    return (
      <div className="page-wrap centered-message">
        <Mail size={44} strokeWidth={1} />
        <h1>
          {params.get('status') === 'PENDING_EMAIL_VERIFICATION'
            ? 'Check your inbox.'
            : 'Your request is received.'}
        </h1>
        <p>Your reservation reference</p>
        <strong className="reference">{params.get('reference')}</strong>
        <p>
          {params.get('status') === 'PENDING_EMAIL_VERIFICATION'
            ? 'Open the verification email to complete your request. Unverified holds expire, so please verify promptly.'
            : 'Use Your reservation to receive a secure link and review the latest status.'}
        </p>
        <Link className="button" to={`/reservation?reference=${params.get('reference') ?? ''}`}>
          Resend email or check status
        </Link>
      </div>
    );
  if (location.pathname.endsWith('/access'))
    return (
      <div className="page-wrap centered-message">
        <CheckCircle2 size={44} strokeWidth={1} />
        <h1>Your stay, securely.</h1>
        <p>Continue to verify your email and view the reservation linked to this email.</p>
        {error ? <ErrorNotice>{error}</ErrorNotice> : null}
        <button className="button" onClick={() => void exchange()} disabled={busy || !linkToken}>
          {busy ? 'Verifying…' : 'Continue to my reservation'}
        </button>
        <Link className="text-link" to="/reservation">
          Request a new link
        </Link>
      </div>
    );
  if (reference)
    return (
      <div className="page-wrap">
        {loading ? (
          <Loading />
        ) : loadError ? (
          <>
            <ErrorNotice>{loadError}</ErrorNotice>
            <Link to="/reservation">Request a secure access link</Link>
          </>
        ) : data ? (
          <>
            <div className="page-heading">
              <p className="section-index">{data.reference}</p>
              <h1>Your stay at Del Sol.</h1>
              <StatusBadge status={data.status} />
            </div>
            <div className="reservation-grid">
              <section>
                <h2>Welcome, {data.guest.name}.</h2>
                <p>
                  {dateLabel(data.checkIn)} — {dateLabel(data.checkOut)}
                </p>
                <p>
                  {data.roomCount} room(s) · {data.guestCount} guests
                </p>
                <p>{data.rooms.map((r) => r.roomName).join(', ')}</p>
                <h3>Reservation timeline</h3>
                <ol className="timeline">
                  {data.history.map((h, i) => (
                    <li key={i}>
                      <StatusBadge status={h.status} />
                      <small>{new Date(h.createdAt).toLocaleString()}</small>
                    </li>
                  ))}
                </ol>
              </section>
              <aside className="booking-aside">
                <h3>Stay total {money(data.total)}</h3>
                <p>Recorded payments: {money(data.paid)}</p>
                <p>Balance: {money(data.total - data.paid)}</p>
                <p>
                  Cancellation cutoff: {data.policy.cancellationCutoffHours} hours before check-in.
                </p>
                {['PENDING_CONFIRMATION', 'CONFIRMED', 'PENDING_EMAIL_VERIFICATION'].includes(
                  data.status,
                ) ? (
                  <button
                    className="button button-outline"
                    onClick={() => setCancelOpen(!cancelOpen)}
                  >
                    Cancel reservation
                  </button>
                ) : null}
                {cancelOpen ? (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setBusy(true);
                      setError('');
                      const form = new FormData(e.currentTarget);
                      try {
                        await send(`/reservations/${reference}/cancel`, {
                          reason: form.get('reason'),
                        });
                        setCancelOpen(false);
                        reload();
                      } catch (e) {
                        setError(message(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Field label="Reason (optional)">
                      <textarea name="reason" maxLength={500} />
                    </Field>
                    <p>
                      This releases your room allocation. Your reservation remains in hotel records.
                    </p>
                    <button className="button danger" disabled={busy}>
                      Confirm cancellation
                    </button>
                  </form>
                ) : null}
                {error ? <ErrorNotice>{error}</ErrorNotice> : null}
              </aside>
            </div>
          </>
        ) : null}
      </div>
    );
  return (
    <div className="page-wrap lookup-layout">
      <div>
        <p className="section-index">ALWAYS IN THE KNOW</p>
        <h1>Your reservation.</h1>
        <p>
          View your status, review your stay, or manage a cancellation. We’ll email a secure link so
          your details stay private.
        </p>
        <img src="/images/suite.webp" alt="Illustrative quiet hotel lounge" />
      </div>
      <form
        className="guest-form"
        onSubmit={(e) => {
          e.preventDefault();
          void lookup(e.currentTarget);
        }}
      >
        <h2>Let’s find your stay.</h2>
        <Field label="Reservation reference">
          <input
            name="reference"
            placeholder="HDS-…"
            defaultValue={params.get('reference') ?? ''}
            required
            pattern="HDS-[A-Fa-f0-9]{16}"
            maxLength={20}
          />
        </Field>
        <Field label="Reservation email">
          <input name="email" type="email" autoComplete="email" required />
        </Field>
        <Turnstile onToken={setToken} resetKey={resetKey} />
        {error ? <ErrorNotice>{error}</ErrorNotice> : null}
        {notice ? (
          <p className="success-notice" role="status">
            {notice}
          </p>
        ) : null}
        <button className="button" disabled={!token || busy}>
          {busy ? 'Requesting…' : 'Email me a secure link'}
        </button>
      </form>
    </div>
  );
}
