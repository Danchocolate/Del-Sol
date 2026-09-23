import React from 'react';
import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { StatusBadge, ErrorNotice, Field } from './ui';
import { SearchForm } from './SearchForm';
afterEach(cleanup);
function Location() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}
describe('guest interaction components', () => {
  it('renders understandable status text and accessible errors', () => {
    render(
      <>
        <StatusBadge status="PENDING_EMAIL_VERIFICATION" />
        <ErrorNotice>Availability changed.</ErrorNotice>
      </>,
    );
    expect(screen.getByText('pending email verification')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Availability changed.');
  });
  it('associates field labels with controls', () => {
    render(
      <Field label="Email">
        <input type="email" />
      </Field>,
    );
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });
  it('submits dates and quantities through the search route', () => {
    render(
      <MemoryRouter>
        <SearchForm
          initial={{ checkIn: '2027-05-01', checkOut: '2027-05-04', guests: 3, rooms: 2 }}
        />
        <Location />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Find a room/ }));
    expect(screen.getByTestId('location').textContent).toContain(
      '/search?checkIn=2027-05-01&checkOut=2027-05-04&guests=3&rooms=2',
    );
  });
});
