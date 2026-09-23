import { useState } from 'react';
import type { RoomTypeView } from '@hotel/shared';
import { send, useApi, message } from '../lib/api';
import { ErrorNotice, Field } from '../components/ui';
export function StaffBooking({ onDone }: { onDone: () => void }) {
  const { data } = useApi<RoomTypeView[]>('/admin/room-types');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="panel form-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setBusy(true);
        setError('');
        try {
          await send('/admin/reservations', {
            source: form.get('source'),
            roomTypeId: form.get('roomTypeId'),
            checkIn: form.get('checkIn'),
            checkOut: form.get('checkOut'),
            guests: Number(form.get('guests')),
            rooms: Number(form.get('rooms')),
            name: form.get('name'),
            email: form.get('email'),
            mobile: form.get('mobile') || undefined,
            promotionCode: form.get('promotionCode') || undefined,
            turnstileToken: 'staff-authorized',
            idempotencyKey: crypto.randomUUID(),
          });
          onDone();
        } catch (e) {
          setError(message(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Source">
        <select name="source">
          <option>WALK_IN</option>
          <option>PHONE</option>
        </select>
      </Field>
      <Field label="Room type">
        <select name="roomTypeId">
          {data
            ?.filter((r) => r.active)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Check-in">
        <input name="checkIn" type="date" required />
      </Field>
      <Field label="Check-out">
        <input name="checkOut" type="date" required />
      </Field>
      <Field label="Guests">
        <input name="guests" type="number" min={1} max={40} defaultValue={2} required />
      </Field>
      <Field label="Rooms">
        <input name="rooms" type="number" min={1} max={10} defaultValue={1} required />
      </Field>
      <Field label="Guest name">
        <input name="name" required minLength={2} />
      </Field>
      <Field label="Email">
        <input name="email" type="email" required />
      </Field>
      <Field label="Mobile">
        <input name="mobile" type="tel" />
      </Field>
      <Field label="Promotion code">
        <input name="promotionCode" />
      </Field>
      <p className="muted">
        The hotel’s email verification policy also applies to staff-created bookings.
      </p>
      {error ? <ErrorNotice>{error}</ErrorNotice> : null}
      <button className="button" disabled={busy}>
        {busy ? 'Creating…' : 'Create reservation'}
      </button>
    </form>
  );
}
