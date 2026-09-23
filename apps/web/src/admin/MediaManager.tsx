import { useState } from 'react';
import { api, send, message } from '../lib/api';
import { ErrorNotice, Field } from '../components/ui';
interface Media {
  id: string;
  url: string;
  alt: string;
  caption?: string;
  position: number;
  archived: boolean;
}
export function MediaManager({
  roomTypeId,
  items,
  reload,
}: {
  roomTypeId?: string;
  items: Media[];
  reload: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <form
        className="upload-form form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          const file = data.get('file');
          if (!(file instanceof File)) return;
          setBusy(true);
          setError('');
          try {
            const body = new FormData();
            body.set('file', file);
            const query = new URLSearchParams({
              alt: String(data.get('alt')),
              caption: String(data.get('caption') ?? ''),
              ...(roomTypeId ? { roomTypeId } : {}),
            });
            await api(`/admin/media?${query}`, { method: 'POST', body });
            form.reset();
            reload();
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Image (JPEG, PNG or WebP, max 8 MB)">
          <input name="file" type="file" accept="image/jpeg,image/png,image/webp" required />
        </Field>
        <Field label="Alternative text">
          <input name="alt" required minLength={2} maxLength={200} />
        </Field>
        {!roomTypeId ? (
          <Field label="Caption">
            <input name="caption" maxLength={500} />
          </Field>
        ) : null}
        <button className="button" disabled={busy}>
          {busy ? 'Uploading…' : 'Upload image'}
        </button>
      </form>
      {error ? <ErrorNotice>{error}</ErrorNotice> : null}
      <div className="media-grid">
        {items.map((item) => (
          <form
            key={item.id}
            onSubmit={async (e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              setError('');
              try {
                await send(
                  `/admin/media/${roomTypeId ? 'room' : 'gallery'}/${item.id}`,
                  {
                    alt: data.get('alt'),
                    ...(!roomTypeId ? { caption: data.get('caption') } : {}),
                    position: Number(data.get('position')),
                    archived: data.get('archived') === 'on',
                  },
                  'PUT',
                );
                reload();
              } catch (e) {
                setError(message(e));
              }
            }}
          >
            <img src={item.url} alt={item.alt} />
            <Field label="Alt text">
              <input name="alt" defaultValue={item.alt} required />
            </Field>
            {!roomTypeId ? (
              <Field label="Caption">
                <input name="caption" defaultValue={item.caption} />
              </Field>
            ) : null}
            <Field label="Order">
              <input name="position" type="number" min={0} defaultValue={item.position} />
            </Field>
            <label className="check-label">
              <input type="checkbox" name="archived" defaultChecked={item.archived} />
              Archived
            </label>
            <button className="button button-outline small">Save image details</button>
          </form>
        ))}
      </div>
    </>
  );
}
