import { usePublic } from '../components/PublicLayout';
export default function Contact() {
  const { content } = usePublic();
  return (
    <div className="page-wrap">
      <div className="page-heading">
        <h1>
          We look forward
          <br />
          to welcoming you.
        </h1>
      </div>
      <div className="contact-layout">
        <img src="/images/courtyard.webp" alt="Illustrative Hotel Del Sol courtyard" />
        <div>
          <h2>Find your way to us.</h2>
          <h3>Location</h3>
          <p>{content.address}</p>
          {content.mapUrl ? (
            <a className="text-link" href={content.mapUrl} target="_blank" rel="noreferrer">
              Open map ↗
            </a>
          ) : null}
          <h3>Get in touch</h3>
          <p>{content.phone}</p>
          <a href={`mailto:${content.email}`}>{content.email}</a>
          <p className="muted">
            The hotel's final address and contact information must be supplied before launch.
          </p>
        </div>
      </div>
    </div>
  );
}
