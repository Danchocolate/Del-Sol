import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import type { SearchInput } from '@hotel/shared';
import { Arrow } from './ui';
export function defaultDates(nights = 2) {
  const tomorrow = new Date(Date.now() + 86400000);
  return {
    checkIn: tomorrow.toISOString().slice(0, 10),
    checkOut: new Date(tomorrow.getTime() + nights * 86400000).toISOString().slice(0, 10),
  };
}
export function SearchForm({
  initial,
  compact = false,
}: {
  initial?: Partial<SearchInput>;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const defaults = defaultDates();
  const [checkIn, setCheckIn] = useState(initial?.checkIn ?? defaults.checkIn);
  const [checkOut, setCheckOut] = useState(initial?.checkOut ?? defaults.checkOut);
  return (
    <form
      className={`search-form ${compact ? 'compact' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        const values = new FormData(e.currentTarget);
        navigate(
          `/search?${new URLSearchParams([...values.entries()].map(([k, v]) => [k, String(v)])).toString()}`,
        );
      }}
    >
      <label>
        Check-in
        <input
          aria-label="Check-in"
          type="date"
          name="checkIn"
          required
          value={checkIn}
          min={new Date().toISOString().slice(0, 10)}
          onChange={(e) => {
            setCheckIn(e.target.value);
            if (e.target.value >= checkOut)
              setCheckOut(
                new Date(Date.parse(e.target.value) + 86400000).toISOString().slice(0, 10),
              );
          }}
        />
      </label>
      <label>
        Check-out
        <input
          aria-label="Check-out"
          type="date"
          name="checkOut"
          required
          value={checkOut}
          min={new Date(Date.parse(checkIn) + 86400000).toISOString().slice(0, 10)}
          onChange={(e) => setCheckOut(e.target.value)}
        />
      </label>
      <label>
        Guests
        <select name="guests" defaultValue={initial?.guests ?? 2}>
          {Array.from({ length: 16 }, (_, i) => (
            <option key={i + 1}>{i + 1}</option>
          ))}
        </select>
      </label>
      <label>
        Rooms
        <select name="rooms" defaultValue={initial?.rooms ?? 1}>
          {[1, 2, 3, 4].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      {compact ? (
        <label>
          Promotion code
          <input
            name="promotionCode"
            maxLength={40}
            placeholder="Optional"
            defaultValue={initial?.promotionCode}
          />
        </label>
      ) : null}
      <button className="button" type="submit">
        Find a room <Arrow />
      </button>
    </form>
  );
}
