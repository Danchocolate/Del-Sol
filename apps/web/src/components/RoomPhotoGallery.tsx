import { useState } from 'react';
import type { RoomTypeView } from '@hotel/shared';

export function RoomPhotoGallery({ room }: { room: RoomTypeView }) {
  const [selected, setSelected] = useState(0);
  const photos = room.images;

  if (!photos.length)
    return (
      <figure className="room-photo-gallery room-photo-empty">
        <img src="/images/deluxe.webp" alt="Illustrative room concept" />
        <figcaption>Room photos are being prepared. This image is illustrative.</figcaption>
      </figure>
    );

  const photo = photos[selected] ?? photos[0]!;

  const show = (offset: number) =>
    setSelected((current) => (current + offset + photos.length) % photos.length);

  return (
    <section className="room-photo-gallery" aria-label={`${room.name} photos`}>
      <div className="room-photo-stage">
        <img key={photo.id} src={photo.url} alt={photo.alt} fetchPriority="high" />
        {photos.length > 1 ? (
          <>
            <button
              className="room-photo-arrow previous"
              type="button"
              onClick={() => show(-1)}
              aria-label="Previous room photo"
            >
              ‹
            </button>
            <button
              className="room-photo-arrow next"
              type="button"
              onClick={() => show(1)}
              aria-label="Next room photo"
            >
              ›
            </button>
            <span className="room-photo-count" aria-live="polite">
              {selected + 1} / {photos.length}
            </span>
          </>
        ) : null}
      </div>
      {photos.length > 1 ? (
        <div className="room-photo-thumbnails" aria-label="Choose a room photo">
          {photos.map((image, index) => (
            <button
              key={image.id}
              className={index === selected ? 'selected' : ''}
              type="button"
              onClick={() => setSelected(index)}
              aria-label={`Show photo ${index + 1}: ${image.alt}`}
              aria-pressed={index === selected}
            >
              <img src={image.url} alt="" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
