import { Link } from 'react-router-dom';
import { money, type RoomTypeView } from '@hotel/shared';
import { Arrow } from './ui';
export function RoomCard({ room }: { room: RoomTypeView }) {
  return (
    <article className="room-card">
      <Link to={`/rooms/${room.slug}`}>
        <img
          src={room.images[0]?.url ?? '/images/deluxe.webp'}
          alt={room.images[0]?.alt ?? room.name}
          loading="lazy"
        />
      </Link>
      <div className="room-card-heading">
        <h3>
          <Link to={`/rooms/${room.slug}`}>{room.name}</Link>
        </h3>
        <div className="price">
          {money(room.basePrice)}
          <small>from / night</small>
        </div>
      </div>
      <div className="room-card-foot">
        <p>
          {room.capacity} guests <span>·</span> {room.bed} <span>·</span> {room.sizeSqm} m²
        </p>
        <Link className="text-link" to={`/rooms/${room.slug}`}>
          Explore room <Arrow />
        </Link>
      </div>
    </article>
  );
}
