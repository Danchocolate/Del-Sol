import { usePublic } from '../components/PublicLayout';
export default function Gallery() {
  const { gallery } = usePublic();
  return (
    <div className="page-wrap">
      <div className="page-heading">
        <h1>A sense of place.</h1>
        <p>Little moments. Lasting impressions.</p>
      </div>
      <div className="gallery-grid">
        {gallery.map((item) => (
          <figure key={item.id}>
            <img src={item.url} alt={item.alt} loading="lazy" />
            <figcaption>{item.caption}</figcaption>
          </figure>
        ))}
      </div>
      <p className="muted">Images are illustrative concepts pending final hotel photography.</p>
    </div>
  );
}
