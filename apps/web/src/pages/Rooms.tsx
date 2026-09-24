import { Link, useParams } from 'react-router-dom';
import { money } from '@hotel/shared';
import { usePublic } from '../components/PublicLayout';
import { RoomCard } from '../components/RoomCard';
import { RoomPhotoGallery } from '../components/RoomPhotoGallery';
import { Arrow, Empty } from '../components/ui';
export default function Rooms() {
  const { rooms } = usePublic();
  const { slug } = useParams();
  if (slug) {
    const room = rooms.find((r) => r.slug === slug);
    if (!room)
      return (
        <div className="page-wrap">
          <Empty>This room is not currently available.</Empty>
          <Link to="/rooms">Explore our rooms</Link>
        </div>
      );
    return (
      <div className="room-detail">
        <div className="page-wrap">
          <Link className="text-link" to="/rooms">
            ← Rooms & suites
          </Link>
          <div className="section-heading">
            <h1>{room.name}</h1>
            <p>
              {room.capacity} guests · {room.bed} · {room.sizeSqm} m²
            </p>
          </div>
        </div>
        <RoomPhotoGallery key={room.id} room={room} />
        <div className="page-wrap detail-grid">
          <div>
            <h2>Make yourself at home.</h2>
            <p>{room.description}</p>
            <h3>Considered comforts</h3>
            <ul className="amenity-grid">
              {room.amenities.map((a) => (
                <li key={a.amenity.name}>{a.amenity.name}</li>
              ))}
            </ul>
          </div>
          <aside className="booking-aside">
            <h3>
              {money(room.basePrice)} <small>from / night</small>
            </h3>
            <p>Reserve directly with the hotel. Payment is collected in person.</p>
            <Link className="button" to={`/search?roomTypeId=${room.id}`}>
              Check availability <Arrow />
            </Link>
            <small>Final pricing is calculated for your selected stay.</small>
          </aside>
        </div>
      </div>
    );
  }
  return (
    <div className="page-wrap">
      <div className="page-heading">
        <p className="section-index">YOUR OWN QUIET CORNER</p>
        <h1>Rooms & suites.</h1>
        <p>Thoughtful spaces for restful nights and unhurried mornings.</p>
      </div>
      <div className="room-grid">
        {rooms.map((room) => (
          <RoomCard key={room.id} room={room} />
        ))}
      </div>
    </div>
  );
}
