import { useEffect, useState, type CSSProperties } from 'react';
import { FaClock, FaCreditCard, FaExternalLinkAlt, FaMapMarkerAlt, FaPhoneAlt } from 'react-icons/fa';
import * as api from './api';
import type { GarageDetail, SiteData } from './api';
import { BookingForm } from './Appointments';
import { Stars, iconFor, isHttpUrl } from './shared';

const FONTS: Record<string, string> = {
  modern: "'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif",
  classic: "Georgia, 'Times New Roman', serif",
  rounded: "'Trebuchet MS', 'Segoe UI', Verdana, sans-serif",
};

/** Readable text colour (black or white) for a given background hex. */
const onColor = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#111111' : '#ffffff';
};

export function themeVars(t: api.Theme): CSSProperties {
  const dark = t.mode === 'dark';
  return {
    '--s-accent': t.accent,
    '--s-on-accent': onColor(t.accent),
    '--s-bg': dark ? '#121418' : '#ffffff',
    '--s-bg2': dark ? '#1b1f26' : '#f3f4f6',
    '--s-line': dark ? '#2b3039' : '#e2e5ea',
    '--s-text': dark ? '#f3f4f6' : '#16181d',
    '--s-muted': dark ? '#9aa3af' : '#5b6472',
    '--s-font': FONTS[t.font] ?? FONTS.modern,
  } as CSSProperties;
}

const SITE_STEPS = [
  ['Book online', 'Pick your services and a time that suits you.'],
  ['Drop off your car', 'We confirm your booking and keep you updated by chat.'],
  ['We do the work', 'Follow each step: car at the garage, work in progress, completed.'],
  ['Collect and pay', 'Pick up your car and pay the way you prefer.'],
];

/** A garage's own page at /g/{id}. Owners can use it as their website; the look comes from their theme. */
export default function SitePage({ id }: { id: string }) {
  const [site, setSite] = useState<SiteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<GarageDetail | null>(null);

  useEffect(() => {
    api.fetchSite(id).then((r) => {
      setSite(r.garage);
      document.title = r.garage.name;
    }).catch((e: Error) => setError(e.message));
    // Prices and booking are for signed-in visitors only.
    if (api.getToken()) api.fetchGarage(id).then((r) => setDetail(r.garage)).catch(() => undefined);
  }, [id]);

  if (error) return <div className="site" style={themeVars(api.DEFAULT_THEME)}><div className="site-wrap"><h1>Garage not found</h1><p className="s-muted">{error}</p><a href="/">Browse all garages</a></div></div>;
  if (!site) return <div className="site" style={themeVars(api.DEFAULT_THEME)} aria-busy="true" />;

  const t = site.theme;
  const toWebsite = site.mode === 'website';
  const signedIn = !!detail;
  const priceOf = (sid: string) => detail?.services.find((x) => x.id === sid);
  const tel = `tel:${site.phone.replace(/[^\d+]/g, '')}`;
  const bookTarget = detail && !detail.mine && site.live ? '#book' : signedIn ? '#services' : `/?garage=${encodeURIComponent(site.id)}`;
  return (
    <div className="site" style={themeVars(t)}>
      {!site.live && <div className="site-banner">Preview: only you can see this page until it is approved and published.</div>}
      <header className="site-top">
        <div className="site-wrap site-top-in">
          <b className="site-name">{site.name}</b>
          <nav>
            <a href="#services">Services</a>
            <a href="#reviews">Reviews</a>
            <a href="#visit">Visit us</a>
            <a className="site-btn" href={bookTarget}>Book now</a>
          </nav>
        </div>
      </header>

      <section className="site-hero">
        <div className="site-wrap">
          <h1>{t.headline || site.name}</h1>
          <p className="s-lead">{t.about || site.tagline}</p>
          <div className="site-hero-actions">
            <a className="site-btn" href={bookTarget}>Book an appointment</a>
            <a className="site-btn ghost" href={tel}>Call {site.phone}</a>
          </div>
        </div>
      </section>

      <section className="site-trust site-wrap" aria-label="At a glance">
        <div><b><Stars rating={site.rating} reviews={site.reviews} /></b><span>Rated by drivers</span></div>
        <div><b><FaClock /> {site.hours}</b><span>Opening hours</span></div>
        <div><b><FaMapMarkerAlt /> {site.area || site.city}</b><span>{site.address}</span></div>
        <div><b><FaCreditCard /> {site.payMethods.map((m: api.PayMethod) => api.PAY_LABELS[m]).join(', ')}</b><span>Ways to pay</span></div>
      </section>

      <section id="services" className="site-wrap site-sec">
        <h2>Our services</h2>
        <ul className="site-services">
          {site.services.map((sv) => {
            const p = priceOf(sv.id);
            return (
              <li key={sv.id}>
                <div className="svc-head">
                  <span className="svc-title">{iconFor(sv.id)} {sv.name}</span>
                  {sv.discount > 0 && <span className="deal">{sv.discount}% off</span>}
                </div>
                {sv.description && <p className="s-muted">{sv.description}</p>}
                <div className="svc-foot">
                  {sv.duration && <span className="s-muted"><FaClock /> {sv.duration}</span>}
                  {!toWebsite && p && p.price > 0 && (
                    <b>
                      {sv.discount > 0 && <s className="s-muted">${p.price}</s>} from ${p.finalPrice}
                    </b>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {toWebsite && detail?.website && isHttpUrl(detail.website) && (
          <a className="site-btn" href={detail.website} target="_blank" rel="noopener noreferrer">
            See prices on our website <FaExternalLinkAlt />
          </a>
        )}
        {!signedIn && !toWebsite && (
          <p><a className="site-btn" href={`/?garage=${encodeURIComponent(site.id)}`}>Sign in to see prices and book</a></p>
        )}
        {!signedIn && toWebsite && (
          <p className="s-muted"><a href={`/?garage=${encodeURIComponent(site.id)}`}>Sign in to book an appointment</a></p>
        )}
      </section>

      {detail && !detail.mine && site.live && (
        <section id="book" className="site-wrap site-sec">
          <div className="site-book">
            <BookingForm garage={detail} onBooked={(apptId) => { window.location.href = `/?view=bookings&appt=${encodeURIComponent(apptId)}`; }} onSessionExpired={() => { api.setToken(null); window.location.reload(); }} />
          </div>
        </section>
      )}
      {detail?.mine && <p className="site-wrap s-muted">This is your page. Customers book from here once it is live.</p>}

      <section className="site-wrap site-sec">
        <h2>How it works</h2>
        <ol className="site-steps">
          {SITE_STEPS.map(([title, text], i) => (
            <li key={title}><span>{i + 1}</span><b>{title}</b><p className="s-muted">{text}</p></li>
          ))}
        </ol>
      </section>

      <section id="reviews" className="site-wrap site-sec">
        <h2>What drivers say</h2>
        {site.reviewList.length === 0 ? (
          <p className="s-muted">No reviews yet. Drivers can leave one after their car has been serviced.</p>
        ) : (
          <ul className="site-reviews">
            {site.reviewList.map((r, i) => (
              <li key={i}>
                <span className="review-stars" aria-label={`${r.rating} out of 5`}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                {r.comment && <p>&ldquo;{r.comment}&rdquo;</p>}
                <small className="s-muted">{r.name}</small>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="visit" className="site-wrap site-sec">
        <h2>Visit us</h2>
        <ul className="site-visit">
          <li><FaMapMarkerAlt /> {site.address}, {site.city} {site.zip}</li>
          <li><FaClock /> {site.hours}</li>
          <li><FaPhoneAlt /> <a href={tel}>{site.phone}</a></li>
        </ul>
      </section>

      <footer className="site-foot">
        <div className="site-wrap">&copy; {new Date().getFullYear()} {site.name} &middot; Bookings by <a href="/">Garage Hub</a></div>
      </footer>
    </div>
  );
}
