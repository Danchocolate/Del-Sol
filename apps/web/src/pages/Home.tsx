import { Link } from 'react-router-dom';
import { Sun, ArrowDown, ArrowUpRight } from 'lucide-react';
import { usePublic } from '../components/PublicLayout';
import { SearchForm, defaultDates } from '../components/SearchForm';
import { RoomCard } from '../components/RoomCard';
export default function Home() {
  const { content, rooms, promotions } = usePublic();
  const promotion = promotions[0];
  const promotionSearch = promotion
    ? new URLSearchParams({
        ...defaultDates(Math.max(2, promotion.minNights)),
        promotionCode: promotion.code,
      }).toString()
    : '';
  return (
    <>
      <section className="hero">
        <img
          className="hero-image"
          src="/images/courtyard.webp"
          alt="Illustrative Hotel Del Sol courtyard, with a tranquil pool and sunlit limestone arches"
          fetchPriority="high"
        />
        <div className="hero-copy">
          <h1>{content.headline}</h1>
          <p>{content.introduction}</p>
          <a className="hero-explore" href="#rooms">
            Discover your stay <ArrowDown size={18} />
          </a>
        </div>
        <span className="hero-note">MAKE YOURSELF AT HOME</span>
      </section>
      <div className="search-dock">
        <SearchForm />
      </div>
      <section className="section-wrap rooms-preview" id="rooms">
        <div className="section-heading">
          <div>
            <p className="section-index">01 / STAY WITH US</p>
            <h2>Room to unwind.</h2>
          </div>
          <Link className="text-link" to="/rooms">
            View all rooms <ArrowUpRight size={19} />
          </Link>
        </div>
        <div className="room-grid">
          {rooms.slice(0, 2).map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
      </section>
      <section className="experience section-wrap" id="experience">
        <div className="experience-image">
          <img
            src="/images/suite.webp"
            alt="Illustrative quiet lounge with warm natural finishes"
            loading="lazy"
          />
          <span>A CALMER KIND OF LUXURY</span>
        </div>
        <div className="experience-copy">
          <Sun className="sun-mark" size={42} strokeWidth={1} />
          <p className="section-index">02 / THE EXPERIENCE</p>
          <h2>
            The art of <br />
            slowing down.
          </h2>
          <p>{content.about}</p>
          <ul>
            {content.amenities.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Link className="text-link" to="/gallery">
            A glimpse of life here <ArrowUpRight size={19} />
          </Link>
        </div>
      </section>
      {promotions.length ? (
        <section className="promotion-band">
          <div>
            <p className="section-index">A LITTLE SOMETHING FOR YOUR STAY</p>
            <h2>{promotions[0]!.name}.</h2>
            <p>
              {promotions[0]!.minNights} nights or more. Use code{' '}
              <strong>{promotions[0]!.code}</strong> when searching. Eligibility and availability
              apply.
            </p>
          </div>
          <Link className="button button-light" to={`/search?${promotionSearch}`}>
            Plan your escape <ArrowUpRight size={18} />
          </Link>
        </section>
      ) : null}
      <section className="closing section-wrap">
        <Sun size={36} strokeWidth={1} />
        <h2>
          Your next slow morning
          <br />
          starts here.
        </h2>
        <Link className="button" to="/search">
          Find your room <ArrowUpRight size={18} />
        </Link>
      </section>
    </>
  );
}
