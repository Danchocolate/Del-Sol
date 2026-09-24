import { useState } from 'react';
import { hasPermission, money, type RoomTypeView } from '@hotel/shared';
import { useApi, send, message } from '../lib/api';
import { useStaff } from './AdminLayout';
import { Editor, type FieldSpec } from './Editor';
import { ErrorNotice, Field, Loading } from '../components/ui';
import { MediaManager } from './MediaManager';
interface Room {
  id: string;
  number: string;
  roomTypeId: string;
  capacity: number;
  basePrice: number | null;
  active: boolean;
  roomType: { name: string };
  blocks: { id: string; startDate: string; endDate: string; reason: string }[];
}
const typeFields: FieldSpec[] = [
  { name: 'name', label: 'Room type name' },
  { name: 'slug', label: 'URL slug' },
  { name: 'description', label: 'Description', type: 'textarea' },
  { name: 'capacity', label: 'Standard guest capacity', type: 'number', min: 1, max: 10 },
  { name: 'basePrice', label: 'Base nightly rate (PHP)', type: 'number', min: 1, step: '0.01' },
  { name: 'sizeSqm', label: 'Size (m²)', type: 'number', min: 1 },
  { name: 'bed', label: 'Bed description' },
  { name: 'amenities', label: 'Amenities (one per line)', type: 'textarea' },
  { name: 'active', label: 'Active room type', type: 'checkbox' },
];
export default function RoomsAdmin() {
  const user = useStaff();
  const canEdit = hasPermission(user.role, 'rooms:write');
  const types = useApi<RoomTypeView[]>('/admin/room-types');
  const rooms = useApi<Room[]>('/admin/rooms');
  const [editType, setEditType] = useState<RoomTypeView | 'new'>();
  const [editRoom, setEditRoom] = useState<Room | 'new'>();
  const [blockRoom, setBlockRoom] = useState<string>();
  const [error, setError] = useState('');
  const [mediaType, setMediaType] = useState<RoomTypeView>();
  const reload = () => {
    types.reload();
    rooms.reload();
  };
  return (
    <>
      <div className="admin-heading">
        <div>
          <h1>Rooms & inventory</h1>
          <p>Room types describe the stay. Physical rooms control availability.</p>
        </div>
        {canEdit ? (
          <div className="actions">
            <button className="button button-outline" onClick={() => setEditType('new')}>
              New room type
            </button>
            <button className="button" onClick={() => setEditRoom('new')}>
              New physical room
            </button>
          </div>
        ) : null}
      </div>
      {types.loading ? <Loading /> : types.error ? <ErrorNotice>{types.error}</ErrorNotice> : null}
      {editType ? (
        <section className="panel">
          <h2>{editType === 'new' ? 'Create room type' : `Edit ${editType.name}`}</h2>
          <Editor
            key={editType === 'new' ? 'new' : editType.id}
            fields={typeFields}
            initial={
              editType === 'new'
                ? { capacity: 2, basePrice: 4500, sizeSqm: 32, bed: '1 king bed', active: true }
                : {
                    name: editType.name,
                    slug: editType.slug,
                    description: editType.description,
                    capacity: editType.capacity,
                    basePrice: editType.basePrice / 100,
                    sizeSqm: editType.sizeSqm,
                    bed: editType.bed,
                    active: editType.active,
                    amenities: editType.amenities.map((a) => a.amenity.name).join('\n'),
                  }
            }
            onCancel={() => setEditType(undefined)}
            onSave={async (values) => {
              await send(
                `/admin/room-types${editType === 'new' ? '' : `/${editType.id}`}`,
                {
                  ...values,
                  basePrice: Math.round(Number(values.basePrice) * 100),
                  amenities: String(values.amenities)
                    .split('\n')
                    .map((v) => v.trim())
                    .filter(Boolean),
                },
                editType === 'new' ? 'POST' : 'PUT',
              );
              setEditType(undefined);
              reload();
            }}
          />
        </section>
      ) : null}
      <section className="panel">
        <h2>Room types</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Room type</th>
                <th>Capacity</th>
                <th>Base rate</th>
                <th>Status</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {types.data?.map((type) => (
                <tr key={type.id}>
                  <td>
                    {type.name}
                    <small>
                      {type.bed} · {type.sizeSqm} m²
                    </small>
                  </td>
                  <td>{type.capacity}</td>
                  <td>{money(type.basePrice)}</td>
                  <td>{type.active ? 'Active' : 'Inactive'}</td>
                  <td>
                    {canEdit ? (
                      <div className="actions">
                        <button className="text-link" onClick={() => setEditType(type)}>
                          Edit
                        </button>
                        <button className="text-link" onClick={() => setMediaType(type)}>
                          Photos ({type.images.length})
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {mediaType ? (
        <section className="panel">
          <div className="panel-heading">
            <h2>{mediaType.name} images</h2>
            <button onClick={() => setMediaType(undefined)}>Close images</button>
          </div>
          <MediaManager
            roomTypeId={mediaType.id}
            items={
              types.data
                ?.find((t) => t.id === mediaType.id)
                ?.images.map((i) => ({ ...i, archived: false })) ?? []
            }
            reload={types.reload}
          />
        </section>
      ) : null}
      {editRoom ? (
        <section className="panel">
          <h2>{editRoom === 'new' ? 'Create physical room' : `Room ${editRoom.number}`}</h2>
          <Editor
            key={editRoom === 'new' ? 'new' : editRoom.id}
            fields={[
              { name: 'number', label: 'Room number' },
              {
                name: 'roomTypeId',
                label: 'Room type',
                type: 'select',
                options: types.data?.map((t) => ({ value: t.id, label: t.name })),
              },
              { name: 'capacity', label: 'Guest capacity', type: 'number', min: 1, max: 10 },
              {
                name: 'basePrice',
                label: 'Nightly rate override (PHP)',
                type: 'number',
                required: false,
                min: 1,
                step: '0.01',
                hint: 'Leave blank to use the room type rate.',
              },
              { name: 'active', label: 'Active / available for booking', type: 'checkbox' },
            ]}
            initial={
              editRoom === 'new'
                ? { capacity: 2, active: true, roomTypeId: types.data?.[0]?.id ?? '' }
                : {
                    number: editRoom.number,
                    roomTypeId: editRoom.roomTypeId,
                    capacity: editRoom.capacity,
                    basePrice: editRoom.basePrice === null ? null : editRoom.basePrice / 100,
                    active: editRoom.active,
                  }
            }
            onCancel={() => setEditRoom(undefined)}
            onSave={async (values) => {
              await send(
                `/admin/rooms${editRoom === 'new' ? '' : `/${editRoom.id}`}`,
                {
                  ...values,
                  basePrice:
                    values.basePrice === null ? null : Math.round(Number(values.basePrice) * 100),
                },
                editRoom === 'new' ? 'POST' : 'PUT',
              );
              setEditRoom(undefined);
              reload();
            }}
          />
        </section>
      ) : null}
      <section className="panel">
        <h2>Physical inventory</h2>
        {error ? <ErrorNotice>{error}</ErrorNotice> : null}
        {rooms.error ? <ErrorNotice>{rooms.error}</ErrorNotice> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Room</th>
                <th>Type</th>
                <th>Capacity</th>
                <th>Rate override</th>
                <th>Status / blocks</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {rooms.data?.map((room) => (
                <tr key={room.id}>
                  <td>{room.number}</td>
                  <td>{room.roomType.name}</td>
                  <td>{room.capacity}</td>
                  <td>{room.basePrice ? money(room.basePrice) : 'Type rate'}</td>
                  <td>
                    {room.active ? 'Active' : 'Inactive'}
                    {room.blocks.map((b) => (
                      <small key={b.id}>
                        {b.startDate.slice(0, 10)} → {b.endDate.slice(0, 10)} · {b.reason}{' '}
                        {canEdit ? (
                          <button
                            className="text-link"
                            onClick={async () => {
                              try {
                                await send(`/admin/room-blocks/${b.id}`, {}, 'DELETE');
                                reload();
                              } catch (e) {
                                setError(message(e));
                              }
                            }}
                          >
                            Release block
                          </button>
                        ) : null}
                      </small>
                    ))}
                  </td>
                  <td>
                    {canEdit ? (
                      <div className="actions">
                        <button className="text-link" onClick={() => setEditRoom(room)}>
                          Edit
                        </button>
                        <button className="text-link" onClick={() => setBlockRoom(room.id)}>
                          Block dates
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {blockRoom ? (
          <form
            className="form-grid action-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              try {
                await send(`/admin/rooms/${blockRoom}/blocks`, Object.fromEntries(data));
                setBlockRoom(undefined);
                reload();
              } catch (e) {
                setError(message(e));
              }
            }}
          >
            <Field label="Unavailable from">
              <input name="startDate" type="date" required />
            </Field>
            <Field label="Available again">
              <input name="endDate" type="date" required />
            </Field>
            <Field label="Reason">
              <input name="reason" required minLength={2} />
            </Field>
            <button className="button">Block dates</button>
            <button type="button" onClick={() => setBlockRoom(undefined)}>
              Cancel
            </button>
          </form>
        ) : null}
      </section>
    </>
  );
}
