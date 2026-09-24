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
  const [files, setFiles] = useState<File[]>([]);
  const [altTexts, setAltTexts] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  return (
    <>
      <form
        className="upload-form form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          if (!files.length) return;
          setBusy(true);
          setError('');
          let uploaded = 0;
          try {
            for (const [index, file] of files.entries()) {
              if (file.size > 8 * 1024 * 1024)
                throw new Error(`${file.name} is larger than the 8 MB limit.`);
              if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
                throw new Error(`${file.name} must be a JPEG, PNG or WebP image.`);
              setUploading(index + 1);
              const body = new FormData();
              body.set('file', file);
              const query = new URLSearchParams({
                alt: altTexts[index]?.trim() ?? '',
                caption: String(data.get('caption') ?? ''),
                ...(roomTypeId ? { roomTypeId } : {}),
              });
              await api(`/admin/media?${query}`, { method: 'POST', body });
              uploaded++;
            }
            form.reset();
            setFiles([]);
            setAltTexts([]);
            reload();
          } catch (e) {
            if (uploaded) {
              reload();
              setFiles(files.slice(uploaded));
              setAltTexts(altTexts.slice(uploaded));
            }
            setError(
              `${uploaded ? `${uploaded} photo${uploaded === 1 ? '' : 's'} uploaded. ` : ''}${message(e)}`,
            );
          } finally {
            setBusy(false);
            setUploading(0);
          }
        }}
      >
        <Field
          label={
            roomTypeId
              ? 'Room photos (choose up to 10 JPEG, PNG or WebP images, max 8 MB each)'
              : 'Image (JPEG, PNG or WebP, max 8 MB)'
          }
        >
          <input
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple={Boolean(roomTypeId)}
            required={!files.length}
            onChange={(event) => {
              const selected = Array.from(event.currentTarget.files ?? []);
              if (selected.length > 10) {
                event.currentTarget.value = '';
                setFiles([]);
                setAltTexts([]);
                setError('Choose at most 10 photos per upload.');
                return;
              }
              setFiles(selected);
              setAltTexts(selected.map(() => ''));
              setError('');
            }}
          />
        </Field>
        {files.map((file, index) => (
          <Field key={`${file.name}-${index}`} label={`Describe photo ${index + 1}: ${file.name}`}>
            <input
              value={altTexts[index] ?? ''}
              onChange={(event) =>
                setAltTexts((current) =>
                  current.map((value, position) =>
                    position === index ? event.target.value : value,
                  ),
                )
              }
              placeholder="For example, king bed beside the window"
              required
              minLength={2}
              maxLength={200}
            />
          </Field>
        ))}
        {!roomTypeId ? (
          <Field label="Caption">
            <input name="caption" maxLength={500} />
          </Field>
        ) : null}
        <button className="button" disabled={busy}>
          {busy
            ? `Uploading ${uploading} of ${files.length}…`
            : `Upload ${files.length > 1 ? `${files.length} photos` : 'image'}`}
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
