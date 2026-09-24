import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { money, searchSchema, type AvailabilityView } from '@hotel/shared';
import { useApi, send, message } from '../lib/api';
import { usePublic } from '../components/PublicLayout';
import { SearchForm, defaultDates } from '../components/SearchForm';
import { Arrow, Empty, ErrorNotice, Field, Loading } from '../components/ui';
import { Turnstile } from '../components/Turnstile';
export default function Booking() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { settings } = usePublic();
  const input = searchSchema.safeParse({
    checkIn: params.get('checkIn') ?? defaultDates().checkIn,
    checkOut: params.get('checkOut') ?? defaultDates().checkOut,
    guests: params.get('guests') ?? 2,
    rooms: params.get('rooms') ?? 1,
    promotionCode: params.get('promotionCode') || undefined,
  });
  const query = input.success
    ? new URLSearchParams(
        Object.entries(input.data)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : null;
  const { data, loading, error, reload } = useApi<AvailabilityView[]>(
    query ? `/availability?${query}` : null,
  );
  const [selected, setSelected] = useState<AvailabilityView>();
  const [token, setToken] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  async function submit(form: HTMLFormElement) {
    if (!input.success || !selected) return;
    const formData = new FormData(form);
    setBusy(true);
    setSubmitError('');
    try {
      const result = await send<{ reference: string; status: string }>('/reservations', {
        ...input.data,
        roomTypeId: selected.roomType.id,
        name: formData.get('name'),
        email: formData.get('email'),
        mobile: formData.get('mobile') || undefined,
        turnstileToken: token,
        idempotencyKey: requestKey,
      });
      navigate(`/reservation/received?reference=${result.reference}&status=${result.status}`);
    } catch (e) {
      setSubmitError(message(e));
      setResetKey((v) => v + 1);
      reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-wrap booking-page">
      <div className="page-heading">
        <p className="section-index">YOUR STAY, DIRECT WITH US</p>
        <h1>{selected ? 'A few details. Then, unwind.' : 'Find your quiet corner.'}</h1>
        <p>
          {selected
            ? 'Your room is held only after you submit. Verify your email to continue.'
            : 'Choose your dates. We’ll take care of the rest.'}
        </p>
      </div>
      <SearchForm
        compact
        initial={input.success ? input.data : undefined}
        key={params.toString()}
      />
      {!input.success ? <ErrorNotice>{input.error.issues[0]?.message}</ErrorNotice> : null}
      {selected ? (
        <div className="reservation-grid">
          <form
            className="guest-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(e.currentTarget);
            }}
          >
            <button
              className="text-link"
              type="button"
              onClick={() => {
                setSelected(undefined);
                setRequestKey(crypto.randomUUID());
              }}
            >
              ← Back to available rooms
            </button>
            <h2>The guest details</h2>
            <div className="form-grid">
              <Field label="Full name">
                <input name="name" autoComplete="name" required minLength={2} maxLength={120} />
              </Field>
              <Field label="Email address" hint="We’ll send a secure verification link here.">
                <input name="email" type="email" autoComplete="email" required maxLength={254} />
              </Field>
              <Field label={`Mobile number${settings.mobileRequired ? '' : ' (optional)'}`}>
                <input
                  name="mobile"
                  type="tel"
                  autoComplete="tel"
                  required={settings.mobileRequired}
                  maxLength={30}
                />
              </Field>
            </div>
            <label className="check-label">
              <input type="checkbox" required />I have read the{' '}
              <Link to="/privacy" target="_blank">
                privacy and booking terms
              </Link>
              .
            </label>
            <p className="muted">
              Pay at the hotel. Please never include payment credentials in this form.
            </p>
            <Turnstile onToken={setToken} resetKey={resetKey} />
            {submitError ? <ErrorNotice>{submitError}</ErrorNotice> : null}
            <button className="button" disabled={!token || busy}>
              {busy ? 'Submitting your request…' : 'Request reservation'} <Arrow />
            </button>
          </form>
          <aside className="stay-summary">
            <img
              src={selected.roomType.images[0]?.url ?? '/images/deluxe.webp'}
              alt={selected.roomType.images[0]?.alt ?? 'Illustrative room concept'}
            />
            <div>
              <h3>{selected.roomType.name}</h3>
              {selected.roomType.images.length > 1 ? (
                <Link
                  className="text-link"
                  to={`/rooms/${selected.roomType.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Browse all {selected.roomType.images.length} room photos
                </Link>
              ) : null}
              <p>{input.success ? `${input.data.checkIn} → ${input.data.checkOut}` : ''}</p>
              <p>
                {input.success
                  ? `${input.data.rooms} room(s) · ${input.data.guests} guests · ${selected.nights} nights`
                  : ''}
              </p>
              <dl>
                <div>
                  <dt>Room subtotal</dt>
                  <dd>{money(selected.subtotal)}</dd>
                </div>
                {selected.discount > 0 ? (
                  <div>
                    <dt>Promotion</dt>
                    <dd>−{money(selected.discount)}</dd>
                  </div>
                ) : null}
                <div className="total">
                  <dt>Stay total</dt>
                  <dd>{money(selected.total)}</dd>
                </div>
              </dl>
              <p className="muted">
                Server-calculated quote. Price and availability are rechecked at submission.
                Cancellation is permitted up to {settings.cancellationCutoffHours} hours before
                check-in.
              </p>
            </div>
          </aside>
        </div>
      ) : (
        <>
          {loading ? (
            <Loading />
          ) : error ? (
            <ErrorNotice>{error}</ErrorNotice>
          ) : data?.length ? (
            <>
              <p className="results-count">
                {data.length} room types available for your entire stay
              </p>
              <div className="search-results">
                {data.map((item) => (
                  <article className="search-result" key={item.roomType.id}>
                    <img
                      src={item.roomType.images[0]?.url ?? '/images/deluxe.webp'}
                      alt={item.roomType.images[0]?.alt ?? 'Illustrative room concept'}
                    />
                    <div>
                      <h2>{item.roomType.name}</h2>
                      <p>{item.roomType.description}</p>
                      <p className="room-meta">
                        Up to {item.roomType.capacity} guests per room · {item.roomType.bed} ·{' '}
                        {item.roomType.sizeSqm} m²
                      </p>
                      <Link className="text-link" to={`/rooms/${item.roomType.slug}`}>
                        Room details
                        {item.roomType.images.length > 1
                          ? ` · ${item.roomType.images.length} photos`
                          : ''}{' '}
                        <Arrow />
                      </Link>
                    </div>
                    <div className="result-price">
                      <strong>{money(item.total)}</strong>
                      <small>
                        {item.nights} nights · {input.success ? input.data.rooms : 1} room(s)
                      </small>
                      {item.discount > 0 ? (
                        <small className="saving">Includes {money(item.discount)} discount</small>
                      ) : null}
                      <button
                        className="button"
                        onClick={() => {
                          setSelected(item);
                          setRequestKey(crypto.randomUUID());
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        Choose room <Arrow />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <Empty>
              No rooms fit this stay. Try different dates, fewer rooms, or a different guest count.
            </Empty>
          )}
        </>
      )}
    </div>
  );
}
