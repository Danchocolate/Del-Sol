import { useState } from 'react';
import { money, type RoomTypeView } from '@hotel/shared';
import { useApi, send } from '../lib/api';
import { Editor, type FieldSpec } from './Editor';
import { Empty, ErrorNotice, Loading } from '../components/ui';
interface Promotion {
  id: string;
  code: string;
  name: string;
  kind: string;
  value: number;
  active: boolean;
  startsAt: string;
  endsAt: string;
  stayStartsAt: string | null;
  stayEndsAt: string | null;
  minNights: number;
  usageLimit: number;
  perEmailLimit: number;
  allRooms: boolean;
  roomTypes: { roomTypeId: string }[];
  rooms: { roomId: string }[];
  _count: { redemptions: number };
}
const fields: FieldSpec[] = [
  { name: 'code', label: 'Promotion code' },
  { name: 'name', label: 'Public name' },
  {
    name: 'kind',
    label: 'Discount type',
    type: 'select',
    options: [
      { value: 'PERCENTAGE', label: 'Percentage' },
      { value: 'FIXED', label: 'Fixed amount (PHP)' },
    ],
  },
  { name: 'value', label: 'Discount value (% or PHP)', type: 'number', min: 1, step: '0.01' },
  { name: 'startsAt', label: 'Booking validity starts', type: 'datetime-local' },
  { name: 'endsAt', label: 'Booking validity ends', type: 'datetime-local' },
  { name: 'stayStartsAt', label: 'Earliest check-in (optional)', type: 'date', required: false },
  { name: 'stayEndsAt', label: 'Latest check-out (optional)', type: 'date', required: false },
  { name: 'minNights', label: 'Minimum nights', type: 'number', min: 1 },
  { name: 'usageLimit', label: 'Maximum redemptions', type: 'number', min: 1 },
  { name: 'perEmailLimit', label: 'Maximum per email', type: 'number', min: 1 },
  { name: 'active', label: 'Active promotion', type: 'checkbox' },
  { name: 'allRooms', label: 'Applies to all rooms', type: 'checkbox' },
];
const localDate = (value: string) =>
  new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
export default function Promotions() {
  const resource = useApi<Promotion[]>('/admin/promotions');
  const types = useApi<RoomTypeView[]>('/admin/room-types');
  const rooms = useApi<{ id: string; number: string }[]>('/admin/rooms');
  const [editing, setEditing] = useState<Promotion | 'new'>();
  const [typeIds, setTypeIds] = useState<string[]>([]);
  const [roomIds, setRoomIds] = useState<string[]>([]);
  function edit(p: Promotion | 'new') {
    setEditing(p);
    setTypeIds(p === 'new' ? [] : p.roomTypes.map((r) => r.roomTypeId));
    setRoomIds(p === 'new' ? [] : p.rooms.map((r) => r.roomId));
  }
  return (
    <>
      <div className="admin-heading">
        <div>
          <h1>Promotions</h1>
          <p>One promotion per stay. Limits are enforced at reservation creation.</p>
        </div>
        <button className="button" onClick={() => edit('new')}>
          Create promotion
        </button>
      </div>
      {editing ? (
        <section className="panel">
          <h2>{editing === 'new' ? 'New promotion' : editing.name}</h2>
          <fieldset>
            <legend>Eligible room types (when “all rooms” is off)</legend>
            <div className="actions">
              {types.data?.map((t) => (
                <label className="check-label" key={t.id}>
                  <input
                    type="checkbox"
                    checked={typeIds.includes(t.id)}
                    onChange={(e) =>
                      setTypeIds(
                        e.target.checked ? [...typeIds, t.id] : typeIds.filter((id) => id !== t.id),
                      )
                    }
                  />
                  {t.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Eligible individual rooms</legend>
            <div className="actions">
              {rooms.data?.map((r) => (
                <label className="check-label" key={r.id}>
                  <input
                    type="checkbox"
                    checked={roomIds.includes(r.id)}
                    onChange={(e) =>
                      setRoomIds(
                        e.target.checked ? [...roomIds, r.id] : roomIds.filter((id) => id !== r.id),
                      )
                    }
                  />
                  {r.number}
                </label>
              ))}
            </div>
          </fieldset>
          <Editor
            key={editing === 'new' ? 'new' : editing.id}
            fields={fields}
            initial={
              editing === 'new'
                ? {
                    kind: 'PERCENTAGE',
                    value: 10,
                    minNights: 1,
                    usageLimit: 100,
                    perEmailLimit: 1,
                    active: true,
                    allRooms: true,
                    startsAt: localDate(new Date().toISOString()),
                    endsAt: localDate(new Date(Date.now() + 30 * 86400000).toISOString()),
                  }
                : {
                    ...Object.fromEntries(
                      fields.map((f) => [
                        f.name,
                        editing[f.name as keyof Promotion] as string | number | boolean | null,
                      ]),
                    ),
                    value: editing.kind === 'FIXED' ? editing.value / 100 : editing.value,
                    startsAt: localDate(editing.startsAt),
                    endsAt: localDate(editing.endsAt),
                    stayStartsAt: editing.stayStartsAt?.slice(0, 10) ?? '',
                    stayEndsAt: editing.stayEndsAt?.slice(0, 10) ?? '',
                  }
            }
            onCancel={() => setEditing(undefined)}
            onSave={async (values) => {
              await send(
                `/admin/promotions${editing === 'new' ? '' : `/${editing.id}`}`,
                {
                  ...values,
                  value:
                    values.kind === 'FIXED'
                      ? Math.round(Number(values.value) * 100)
                      : Number(values.value),
                  startsAt: new Date(String(values.startsAt)).toISOString(),
                  endsAt: new Date(String(values.endsAt)).toISOString(),
                  stayStartsAt: values.stayStartsAt || null,
                  stayEndsAt: values.stayEndsAt || null,
                  roomTypeIds: typeIds,
                  roomIds,
                },
                editing === 'new' ? 'POST' : 'PUT',
              );
              setEditing(undefined);
              resource.reload();
            }}
          />
        </section>
      ) : null}
      <section className="panel">
        {resource.loading ? (
          <Loading />
        ) : resource.error ? (
          <ErrorNotice>{resource.error}</ErrorNotice>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Promotion</th>
                  <th>Discount</th>
                  <th>Usage</th>
                  <th>Validity</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {resource.data?.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.name}
                      <small>{p.code}</small>
                    </td>
                    <td>{p.kind === 'FIXED' ? money(p.value) : `${p.value}%`}</td>
                    <td>
                      {p._count.redemptions} / {p.usageLimit}
                    </td>
                    <td>
                      {p.startsAt.slice(0, 10)} → {p.endsAt.slice(0, 10)}
                    </td>
                    <td>{p.active ? 'Active' : 'Inactive'}</td>
                    <td>
                      <button className="text-link" onClick={() => edit(p)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!resource.data?.length ? <Empty>No promotions yet.</Empty> : null}
          </div>
        )}
      </section>
    </>
  );
}
