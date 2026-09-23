import { useState } from 'react';
import { roles } from '@hotel/shared';
import { useApi, send, message } from '../lib/api';
import type { StaffUser } from '../lib/types';
import { ErrorNotice, Loading, Empty } from '../components/ui';
import { Editor, type FieldSpec, type FormValue } from './Editor';
import { MediaManager } from './MediaManager';
export function ContentAdmin() {
  const content = useApi<Record<string, FormValue>>('/admin/content');
  const gallery = useApi<
    {
      id: string;
      url: string;
      alt: string;
      caption: string;
      position: number;
      archived: boolean;
    }[]
  >('/admin/gallery');
  const fields: FieldSpec[] = [
    { name: 'headline', label: 'Homepage headline' },
    { name: 'introduction', label: 'Short introduction' },
    { name: 'about', label: 'About the hotel', type: 'textarea' },
    { name: 'address', label: 'Address' },
    { name: 'email', label: 'Contact email', type: 'email' },
    { name: 'phone', label: 'Contact phone' },
    { name: 'mapUrl', label: 'HTTPS map link', required: false },
    { name: 'amenities', label: 'Hotel amenities (one per line)', type: 'textarea' },
  ];
  return (
    <>
      <div className="admin-heading">
        <div>
          <h1>Content & gallery</h1>
          <p>Keep property details accurate and images accessible.</p>
        </div>
      </div>
      <section className="panel">
        <h2>Hotel information</h2>
        {content.loading ? (
          <Loading />
        ) : content.error ? (
          <ErrorNotice>{content.error}</ErrorNotice>
        ) : content.data ? (
          <Editor
            fields={fields}
            initial={{
              ...content.data,
              amenities: Array.isArray(content.data.amenities)
                ? content.data.amenities.join('\n')
                : '',
            }}
            onSave={async (values) => {
              await send(
                '/admin/content',
                {
                  ...values,
                  mapUrl: values.mapUrl || null,
                  amenities: String(values.amenities)
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean),
                },
                'PUT',
              );
              content.reload();
            }}
          />
        ) : null}
      </section>
      <section className="panel">
        <h2>Gallery</h2>
        {gallery.error ? <ErrorNotice>{gallery.error}</ErrorNotice> : null}
        <MediaManager items={gallery.data ?? []} reload={gallery.reload} />
      </section>
    </>
  );
}
export function SettingsAdmin() {
  const settings = useApi<Record<string, FormValue>>('/admin/settings');
  const fields: FieldSpec[] = [
    {
      name: 'emailVerificationRequired',
      label: 'Require reservation email verification',
      type: 'checkbox',
    },
    { name: 'mobileRequired', label: 'Require mobile number', type: 'checkbox' },
    {
      name: 'cancellationCutoffHours',
      label: 'Cancellation cutoff (hours before check-in)',
      type: 'number',
      min: 0,
      max: 720,
    },
    {
      name: 'unverifiedExpiryMinutes',
      label: 'Unverified hold expiry (minutes)',
      type: 'number',
      min: 5,
      max: 120,
    },
    { name: 'maxRooms', label: 'Maximum rooms per reservation', type: 'number', min: 1, max: 10 },
    { name: 'maxStayNights', label: 'Maximum stay (nights)', type: 'number', min: 1, max: 365 },
    {
      name: 'confirmationMode',
      label: 'Confirmation mode',
      type: 'select',
      options: [
        { value: 'MANUAL', label: 'Manual staff confirmation' },
        { value: 'AUTOMATIC', label: 'Automatic after required verification' },
      ],
    },
    { name: 'timezone', label: 'Hotel timezone (IANA)' },
    {
      name: 'checkInHour',
      label: 'Local check-in hour (24-hour clock)',
      type: 'number',
      min: 0,
      max: 23,
    },
  ];
  return (
    <>
      <div className="admin-heading">
        <div>
          <h1>Reservation policies</h1>
          <p>Policy snapshots on existing reservations remain unchanged.</p>
        </div>
      </div>
      <section className="panel">
        {settings.loading ? (
          <Loading />
        ) : settings.error ? (
          <ErrorNotice>{settings.error}</ErrorNotice>
        ) : settings.data ? (
          <Editor
            fields={fields}
            initial={settings.data}
            onSave={(values) => send('/admin/settings', values, 'PUT')}
          />
        ) : null}
      </section>
    </>
  );
}
export function UsersAdmin() {
  const users = useApi<StaffUser[]>('/admin/users');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffUser>();
  const roleOptions = roles.map((role) => ({ value: role, label: role.replaceAll('_', ' ') }));
  return (
    <>
      <div className="admin-heading">
        <div>
          <h1>Hotel team</h1>
          <p>Employee access only. Guests never need an account.</p>
        </div>
        <button className="button" onClick={() => setCreating(!creating)}>
          Add employee
        </button>
      </div>
      {creating ? (
        <section className="panel">
          <h2>New employee</h2>
          <Editor
            fields={[
              { name: 'name', label: 'Full name' },
              { name: 'email', label: 'Work email', type: 'email' },
              { name: 'password', label: 'Initial password (12+ characters)', type: 'password' },
              { name: 'role', label: 'Role', type: 'select', options: roleOptions },
            ]}
            initial={{ role: 'FRONT_DESK' }}
            onCancel={() => setCreating(false)}
            onSave={async (values) => {
              await send('/admin/users', values);
              setCreating(false);
              users.reload();
            }}
          />
        </section>
      ) : null}
      {editing ? (
        <section className="panel">
          <h2>{editing.name}</h2>
          <Editor
            key={editing.id}
            fields={[
              { name: 'role', label: 'Role', type: 'select', options: roleOptions },
              { name: 'active', label: 'Active employee', type: 'checkbox' },
            ]}
            initial={{ role: editing.role, active: editing.active }}
            onCancel={() => setEditing(undefined)}
            onSave={async (values) => {
              await send(`/admin/users/${editing.id}`, values, 'PUT');
              setEditing(undefined);
              users.reload();
            }}
          />
        </section>
      ) : null}
      <section className="panel">
        {users.loading ? (
          <Loading />
        ) : users.error ? (
          <ErrorNotice>{users.error}</ErrorNotice>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Role</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.data?.map((user) => (
                <tr key={user.id}>
                  <td>
                    {user.name}
                    <small>{user.email}</small>
                  </td>
                  <td>{user.role.replaceAll('_', ' ')}</td>
                  <td>{user.active ? 'Active' : 'Disabled'}</td>
                  <td>
                    <button className="text-link" onClick={() => setEditing(user)}>
                      Manage access
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
export function AuditAdmin() {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useApi<
    {
      id: string;
      createdAt: string;
      actorId: string | null;
      action: string;
      entityType: string;
      entityId: string;
      metadata: Record<string, unknown>;
    }[]
  >(`/admin/audit?page=${page}`);
  return (
    <>
      <div className="admin-heading">
        <div>
          <h1>Audit trail</h1>
          <p>Append-only records of sensitive hotel operations.</p>
        </div>
      </div>
      <section className="panel">
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorNotice>{error}</ErrorNotice>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Actor</th>
                  <th>Context</th>
                </tr>
              </thead>
              <tbody>
                {data?.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.createdAt).toLocaleString()}</td>
                    <td>{row.action}</td>
                    <td>
                      {row.entityType}
                      <small>{row.entityId}</small>
                    </td>
                    <td>{row.actorId ?? 'System / guest'}</td>
                    <td>
                      <code>{JSON.stringify(row.metadata)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data?.length ? <Empty>No audit events yet.</Empty> : null}
          </div>
        )}
        <div className="pagination">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>Page {page}</span>
          <button disabled={(data?.length ?? 0) < 50} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      </section>
    </>
  );
}
export function DevInbox() {
  const inbox =
    useApi<{ id: string; to: string; subject: string; text: string; createdAt: string }[]>(
      '/admin/dev-inbox',
    );
  const [error, setError] = useState('');
  return (
    <>
      <div className="admin-heading">
        <div>
          <h1>Development inbox</h1>
          <p>Local email transport. This endpoint is unavailable in production.</p>
        </div>
        <button className="button" onClick={inbox.reload}>
          Refresh
        </button>
      </div>
      {error ? <ErrorNotice>{error}</ErrorNotice> : null}
      {inbox.error ? <ErrorNotice>{inbox.error}</ErrorNotice> : null}
      {inbox.data?.map((mail) => {
        const link = mail.text.match(/https?:\/\/\S+\/reservation\/access#token=[a-f0-9]+/)?.[0];
        return (
          <section className="panel" key={mail.id}>
            <h2>{mail.subject}</h2>
            <p>
              {mail.to} · {new Date(mail.createdAt).toLocaleString()}
            </p>
            <pre className="email-preview">{mail.text}</pre>
            {link ? (
              <button
                className="button button-outline"
                onClick={() => {
                  try {
                    const url = new URL(link);
                    if (url.origin !== window.location.origin)
                      throw new Error('Unexpected link origin');
                    window.open(url.href, '_blank', 'noopener,noreferrer');
                  } catch (e) {
                    setError(message(e));
                  }
                }}
              >
                Open verification link
              </button>
            ) : null}
          </section>
        );
      })}
    </>
  );
}
