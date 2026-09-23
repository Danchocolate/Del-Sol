import { useState, type FormEvent } from 'react';
import { Field, ErrorNotice } from '../components/ui';
import { message, send } from '../lib/api';
import { useStaff } from './AdminLayout';

export default function Account() {
  const user = useStaff();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get('currentPassword') ?? '');
    const newPassword = String(data.get('newPassword') ?? '');
    const confirmPassword = String(data.get('confirmPassword') ?? '');
    setError('');
    setSuccess('');
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 12) {
      setError('Use at least 12 characters for your new password.');
      return;
    }
    setBusy(true);
    try {
      await send('/auth/change-password', {
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      form.reset();
      setSuccess('Password changed. Other sessions have been signed out.');
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="admin-heading">
        <div>
          <h1>Your account</h1>
          <p>Manage the password for {user.email}.</p>
        </div>
      </div>
      <section className="panel" style={{ maxWidth: 560 }}>
        <h2>Change password</h2>
        <p className="muted">Choose a unique password with at least 12 characters.</p>
        <form className="action-form" onSubmit={changePassword}>
          <Field label="Current password">
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label="New password">
            <input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </Field>
          <Field label="Confirm new password">
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </Field>
          {error ? <ErrorNotice>{error}</ErrorNotice> : null}
          {success ? (
            <p className="success-notice" role="status">
              {success}
            </p>
          ) : null}
          <button className="button" disabled={busy}>
            {busy ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </section>
    </>
  );
}
