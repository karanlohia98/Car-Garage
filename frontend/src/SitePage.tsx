import { useEffect, useState, type CSSProperties } from 'react';
import { FaClock, FaExternalLinkAlt, FaMapMarkerAlt, FaPhoneAlt } from 'react-icons/fa';
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
  const siteUrl = detail?.website;
  const signedIn = !!detail;
  return (
    <div className="site" style={themeVars(t)}>
      {!site.live && <div className="site-banner">Preview: only you can see this page until it is approved and published.</div>}
      <header className="site-top">
        <div className="site-wrap site-top-in">
          <b className="site-name">{site.name}</b>
          <nav>
            <a href="#services">Services</a>
            <a href="#visit">Visit us</a>
            <a className="site-btn" href={`tel:${site.phone.replace(/[^\d+]/g, '')}`}>Call {site.phone}</a>
          </nav>
        </div>
      </header>

      <section className="site-hero">
        <div className="site-wrap">
          <h1>{t.headline || site.name}</h1>
          <p className="s-lead">{t.about || site.tagline}</p>
          <div className="site-hero-actions">
            <a className="site-btn" href="#services">See our services</a>
            <Stars rating={site.rating} reviews={site.reviews} />
          </div>
        </div>
      </section>

      <section id="services" className="site-wrap site-sec">
        <h2>Services</h2>
        <ul className="site-services">
          {site.serviceNames.map((n, i) => {
            const price = detail?.services.find((s) => s.id === site.serviceIds[i])?.price;
            return (
              <li key={site.serviceIds[i]}>
                <span>{iconFor(site.serviceIds[i])} {n}</span>
                {!toWebsite && price ? <b>from ${price}</b> : null}
              </li>
            );
          })}
        </ul>
        {toWebsite && siteUrl && isHttpUrl(siteUrl) && (
          <a className="site-btn" href={siteUrl} target="_blank" rel="noopener noreferrer">
            See prices on our website <FaExternalLinkAlt />
          </a>
        )}
        {!signedIn && (
          <p className="s-muted">
            <a className="site-btn" href={`/?garage=${encodeURIComponent(site.id)}`}>Sign in to see prices and book</a>
          </p>
        )}
        {detail && !detail.mine && site.live && (
          <div className="site-book">
            <BookingForm garage={detail} onBooked={(apptId) => { window.location.href = `/?view=bookings&appt=${encodeURIComponent(apptId)}`; }} onSessionExpired={() => { api.setToken(null); window.location.reload(); }} />
          </div>
        )}
        {detail?.mine && <p className="s-muted">This is your page. Customers book from here once it is live.</p>}
      </section>

      <section id="visit" className="site-wrap site-sec">
        <h2>Visit us</h2>
        <ul className="site-visit">
          <li><FaMapMarkerAlt /> {site.address}, {site.city} {site.zip}</li>
          <li><FaClock /> {site.hours}</li>
          <li><FaPhoneAlt /> {site.phone}</li>
        </ul>
      </section>

      <footer className="site-foot">
        <div className="site-wrap">&copy; {new Date().getFullYear()} {site.name} &middot; Bookings by <a href="/">Garage Hub</a></div>
      </footer>
    </div>
  );
}
