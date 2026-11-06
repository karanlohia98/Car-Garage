import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FaClock,
  FaLocationArrow,
  FaExternalLinkAlt,
  FaLock,
  FaMapMarkerAlt,
  FaPhoneAlt,
  FaSearch,
  FaShieldAlt,
  FaStar,
  FaWrench,
} from 'react-icons/fa';
import * as api from './api';
import { cfg, postalExample, postalRe } from './config';
import type { GarageDetail, GarageSummary, Range, User, Where } from './api';
import { AppointmentsWorkspace, BookingForm } from './Appointments';
import GarageDashboard from './GarageDashboard';
import { Stars, formatPlace, fullAddress, iconFor, isHttpUrl, scrollToId } from './shared';

type AuthMode = 'login' | 'signup';
/** What the visitor was trying to do when they were asked to sign in. */
type Intent = 'driver' | 'garage';
/** Which part of the site a signed-in user is looking at. One account can use all of them. */
type View = 'driver' | 'bookings' | 'garage';

interface Unread {
  bookings: number;
  garage: number;
}

const WHERE_KEY = 'garage.where';

const loadWhere = (): Where | null => {
  try {
    const w = JSON.parse(localStorage.getItem(WHERE_KEY) ?? 'null') as Where | null;
    return w && postalRe().test(w.zip) && ['exact', 'near', 'wide'].includes(w.range) ? w : null;
  } catch {
    return null;
  }
};

const saveWhere = (w: Where | null): void => {
  try {
    if (w) localStorage.setItem(WHERE_KEY, JSON.stringify(w));
    else localStorage.removeItem(WHERE_KEY);
  } catch {
    /* storage unavailable: the choice lasts until reload */
  }
};

/** One site, two front doors: drivers use `/`, garage owners use `/owners`. Each shows only its own options. */
export default function App({ home }: { home: 'driver' | 'owner' }) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState<boolean>(!!api.getToken());
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [authIntent, setAuthIntent] = useState<Intent>('driver');
  const [view, setView] = useState<View>('driver');
  // Appointment to open when the bookings screen appears (set right after booking).
  const [focusApptId, setFocusApptId] = useState<string | null>(null);
  const [unread, setUnread] = useState<Unread>({ bookings: 0, garage: 0 });
  // Garage the visitor clicked before signing in; opened right after they authenticate.
  const [pendingId, setPendingId] = useState<string | null>(null);

  const roleRef = useRef<api.Role>('driver');
  const [garages, setGarages] = useState<GarageSummary[] | null>(null);
  const [garagesError, setGaragesError] = useState<string | null>(null);
  // Where the driver is looking. Remembered between visits; garages are only listed once this is set.
  const [where, setWhereState] = useState<Where | null>(loadWhere);

  const loadGarages = useCallback(() => {
    setGaragesError(null);
    if (!where) {
      setGarages(null);
      return;
    }
    api
      .fetchGarages(where)
      .then((r) => setGarages(r.garages))
      .catch((e: Error) => setGaragesError(e.message));
  }, [where]);

  useEffect(loadGarages, [loadGarages]);

  const changeWhere = (w: Where | null) => {
    saveWhere(w);
    setGarages(null);
    setWhereState(w);
  };

  // Restore an existing session on load. Links from a garage's own page: /?garage=ID opens that garage
  // (after sign-in if needed), /?view=bookings opens My bookings.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const gid = q.get('garage');
    const wantBookings = q.get('view') === 'bookings';
    const apptId = q.get('appt');
    if (gid || q.has('view')) window.history.replaceState(null, '', '/');
    if (!api.getToken()) {
      setChecking(false);
      if (gid) {
        setPendingId(gid);
        openAuth('login');
      }
      return;
    }
    api
      .me()
      .then((r) => {
        setUser(r.user);
        if (r.user.role === 'garage' && home === 'driver') return window.location.replace('/owners');
        if (r.user.role === 'driver' && home === 'owner') return window.location.replace('/');
        if (r.user.role === 'garage') setView('garage');
        else if (gid) window.location.replace(`/g/${encodeURIComponent(gid)}`);
        if (wantBookings && r.user.role === 'driver') {
          setFocusApptId(apptId);
          setView('bookings');
        }
      })
      .catch(() => api.setToken(null))
      .finally(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unread message/update counts for the header badges. Polled while signed in.
  const refreshUnread = useCallback(() => {
    if (!api.getToken()) return;
    const sum = (list: { unread: number }[]) => list.reduce((n, a) => n + a.unread, 0);
    if (roleRef.current === 'garage') {
      api.fetchGarageAppointments().then((r) => setUnread((u) => ({ ...u, garage: sum(r.appointments) }))).catch(() => undefined);
    } else {
      api.fetchMyBookings().then((r) => setUnread((u) => ({ ...u, bookings: sum(r.appointments) }))).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    roleRef.current = user?.role ?? 'driver';
    if (!user) {
      setUnread({ bookings: 0, garage: 0 });
      return;
    }
    refreshUnread();
    const t = setInterval(() => !document.hidden && refreshUnread(), 15000);
    return () => clearInterval(t);
  }, [user, refreshUnread]);

  const openAuth = (mode: AuthMode) => {
    setAuthIntent(home === 'owner' ? 'garage' : 'driver');
    setAuthMode(mode);
  };

  const switchView = (v: View) => {
    setView(v);
    if (v === 'bookings') setFocusApptId(null);
    if (v === 'driver') loadGarages(); // pick up a garage that was just published or changed
    window.scrollTo({ top: 0 });
  };

  const handleBooked = (appointmentId: string) => {
    setFocusApptId(appointmentId);
    setView('bookings');
    refreshUnread();
    window.scrollTo({ top: 0 });
  };

  const handleAuthed = (token: string, u: User) => {
    api.setToken(token);
    setUser(u);
    setAuthMode(null);
    loadGarages();
    if (u.role === 'garage' && home === 'driver') return void window.location.assign('/owners');
    if (u.role === 'driver' && home === 'owner') return void window.location.assign('/');
    if (u.role === 'garage') {
      setPendingId(null);
      setView('garage');
      window.scrollTo({ top: 0 });
    } else if (pendingId) {
      window.location.assign(`/g/${encodeURIComponent(pendingId)}`);
    } else {
      setView('driver');
      scrollToId('garages');
    }
  };

  const handleLogout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* ignore: token is dropped locally either way */
    }
    api.setToken(null);
    setUser(null);
    setView('driver');
    setFocusApptId(null);
  }, []);

  /** Choosing a garage opens its own page (its website). Prices and booking there need a driver login. */
  const handleSelect = (id: string) => {
    window.location.assign(`/g/${encodeURIComponent(id)}`);
  };

  const closeAuth = () => {
    setAuthMode(null);
    setPendingId(null);
  };

  const showGarageView = !!user && user.role === 'garage' && home === 'owner';
  const showBookings = !!user && user.role === 'driver' && home === 'driver' && view === 'bookings';
  const pending = garages?.find((g) => g.id === pendingId) ?? null;

  return (
    <>
      <Header
        user={user}
        checking={checking}
        home={home}
        view={view}
        unread={unread}
        onView={switchView}
        onAuth={openAuth}
        onLogout={handleLogout}
      />
      <main>
        {showGarageView && user ? (
          <GarageDashboard
            user={user}
            onSessionExpired={handleLogout}
            onGarageCreated={() => setUser((u) => (u ? { ...u, hasGarage: true } : u))}
            unread={unread.garage}
            onActivity={refreshUnread}
          />
        ) : showBookings ? (
          <section id="bookings" className="section">
            <div className="wrap">
              <div className="section-head">
                <p className="eyebrow">My bookings</p>
                <h2>Your appointments</h2>
                <p className="muted">Track each booking, chat with the garage and see updates as your car is worked on.</p>
              </div>
              <AppointmentsWorkspace
                role="customer"
                initialId={focusApptId}
                onActivity={refreshUnread}
                onSessionExpired={handleLogout}
              />
            </div>
          </section>
        ) : home === 'owner' ? (
          <OwnerHome onAuth={openAuth} />
        ) : (
          <>
            <Hero user={user} onAuth={openAuth} />
            <TrustStrip />
            <GaragesSection
              garages={garages}
              where={where}
              onWhere={changeWhere}
              error={garagesError}
              onRetry={loadGarages}
              user={user}
              onSelect={handleSelect}
            />
            <Process />
          </>
        )}
      </main>
      <footer className="footer">
        <div className="wrap">
          <span>&copy; {new Date().getFullYear()} Garage Hub. All rights reserved.</span>
          {home === 'driver' ? <a href="/owners">Own a garage? For garage owners</a> : <a href="/">Looking for a garage?</a>}
          <span>Demo site: sample garages, contact details and prices.</span>
        </div>
      </footer>
      {authMode && (
        <AuthModal
          mode={authMode}
          intent={authIntent}
          pendingName={pending?.name ?? null}
          onMode={setAuthMode}
          onClose={closeAuth}
          onAuthed={handleAuthed}
        />
      )}
    </>
  );
}

function Header(props: {
  user: User | null;
  checking: boolean;
  home: 'driver' | 'owner';
  view: View;
  unread: Unread;
  onView: (v: View) => void;
  onAuth: (m: AuthMode) => void;
  onLogout: () => void;
}) {
  const { user, checking, home, view, unread, onView, onAuth, onLogout } = props;
  const garageView = !!user && user.role === 'garage';
  return (
    <header className="header">
      <div className="wrap header-inner">
        <a href="#top" className="brand" aria-label="Garage Hub home">
          <svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true">
            <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="7" strokeDasharray="10 5" />
            <circle cx="32" cy="32" r="7" fill="currentColor" />
          </svg>
          <span>
            Garage <b>Hub</b>
          </span>
        </a>
        <nav className="nav" aria-label="Main">
          {!garageView && (
            <>
              {home === 'driver' ? <a href="#garages">Garages</a> : <a href="#benefits">Why Garage Hub</a>}
              <a href="#process">How it works</a>
              {home === 'driver' ? <a href="/owners">For garage owners</a> : <a href="/">Find a garage</a>}
            </>
          )}
        </nav>
        <div className="auth-actions">
          {checking ? null : user ? (
            <>
              {user.role === 'driver' ? (
                <div className="view-switch" role="group" aria-label="Switch view">
                  <button className={view === 'driver' ? 'on' : ''} aria-pressed={view === 'driver'} onClick={() => onView('driver')}>
                    <span className="full">Find a garage</span>
                    <span className="short">Find</span>
                  </button>
                  <button className={view === 'bookings' ? 'on' : ''} aria-pressed={view === 'bookings'} onClick={() => onView('bookings')}>
                    <span className="full">My bookings</span>
                    <span className="short">Bookings</span>
                    {unread.bookings > 0 && <span className="unread" aria-label={`${unread.bookings} unread`}>{unread.bookings}</span>}
                  </button>
                </div>
              ) : (
                <span className="role-tag">
                  Garage owner
                  {unread.garage > 0 && <span className="unread" aria-label={`${unread.garage} unread`}>{unread.garage}</span>}
                </span>
              )}
              <span className="hello">Hi, {user.name.split(' ')[0]}</span>
              <button className="btn btn-ghost" onClick={onLogout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => onAuth('login')}>
                {home === 'owner' ? 'Garage login' : 'Log in'}
              </button>
              <button className="btn btn-primary" onClick={() => onAuth('signup')}>
                {home === 'owner' ? 'Register my garage' : 'Sign up'}
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Hero({ user, onAuth }: { user: User | null; onAuth: (m: AuthMode) => void }) {
  return (
    <section id="top" className="hero">
      <div className="wrap hero-grid">
        <div>
          <p className="eyebrow">Local garages &middot; Honest pricing</p>
          <h1>
            Find the right garage.
            <br />
            <span className="accent">Know the price.</span>
          </h1>
          <p className="lead">
            Browse independent garages near you, see which services each one offers, then create a free account to
            unlock their pricing.
          </p>
          <div className="cta-row">
            {user ? (
              <a className="btn btn-primary btn-lg" href="#garages">
                Browse garages
              </a>
            ) : (
              <>
                <button className="btn btn-primary btn-lg" onClick={() => onAuth('signup')}>
                  Create free account
                </button>
                <a className="btn btn-outline btn-lg" href="#garages">
                  Browse garages
                </a>
              </>
            )}
          </div>
          <ul className="hero-points">
            <li>
              <FaShieldAlt /> Independent, locally owned garages
            </li>
            <li>
              <FaStar /> Customer ratings on every listing
            </li>
          </ul>
        </div>
        <HeroArt />
      </div>
    </section>
  );
}

/** Hand-drawn SVG scene: car on a lift with a rotating gear. No external assets needed. */
function HeroArt() {
  return (
    <div className="hero-art" aria-hidden="true">
      <svg viewBox="0 0 560 420" role="img">
        <defs>
          <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff7a2e" />
            <stop offset="1" stopColor="#d9480f" />
          </linearGradient>
          <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#bfe3ff" />
            <stop offset="1" stopColor="#5b86a8" />
          </linearGradient>
        </defs>
        <rect x="20" y="340" width="520" height="10" rx="5" fill="#2a2e35" />
        <rect x="90" y="300" width="14" height="42" fill="#3a3f48" />
        <rect x="456" y="300" width="14" height="42" fill="#3a3f48" />
        <rect x="70" y="292" width="420" height="12" rx="4" fill="#4a505b" />
        <path
          d="M70 272 C70 248 88 238 112 234 L170 226 C190 196 216 180 252 178 L330 178 C366 180 396 200 418 228 L458 236 C480 241 492 252 492 272 L492 282 L70 282 Z"
          fill="url(#body)"
        />
        <path d="M188 226 C204 202 224 192 252 190 L322 190 C350 192 372 206 392 228 Z" fill="url(#glass)" />
        <line x1="300" y1="190" x2="300" y2="228" stroke="#2a2e35" strokeWidth="4" />
        <rect x="452" y="248" width="30" height="12" rx="5" fill="#ffe08a" />
        <rect x="72" y="250" width="16" height="10" rx="4" fill="#ff4d4d" />
        <rect x="236" y="246" width="34" height="6" rx="3" fill="#a63a0a" />
        {[170, 396].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="282" r="34" fill="#16181c" />
            <circle cx={cx} cy="282" r="19" fill="#9aa3af" />
            <circle cx={cx} cy="282" r="7" fill="#16181c" />
          </g>
        ))}
        <g className="gear" transform="translate(470 96)">
          <circle r="42" fill="none" stroke="#ff6a1a" strokeWidth="14" strokeDasharray="14 9" />
          <circle r="26" fill="#1b1e23" stroke="#ff6a1a" strokeWidth="4" />
          <circle r="8" fill="#ff6a1a" />
        </g>
      </svg>
    </div>
  );
}

function TrustStrip() {
  const items = [
    { icon: <FaMapMarkerAlt />, title: 'Local garages', text: 'Independent shops in your neighbourhood.' },
    { icon: <FaWrench />, title: 'Compare services', text: 'See what each garage offers at a glance.' },
    { icon: <FaShieldAlt />, title: 'Upfront pricing', text: 'Starting prices before you visit.' },
    { icon: <FaStar />, title: 'Rated by drivers', text: 'Ratings and review counts on every garage.' },
  ];
  return (
    <section className="trust" aria-label="Why use Garage Hub">
      <div className="wrap trust-grid">
        {items.map((i) => (
          <div className="trust-item" key={i.title}>
            <span className="trust-icon">{i.icon}</span>
            <div>
              <h3>{i.title}</h3>
              <p>{i.text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** ZIP code and range picker. Drivers must choose a location before any garages are shown. */
/**
 * Asks the browser for the visitor's position (only if they allow it) and turns it into a ZIP code using
 * OpenStreetMap's Nominatim reverse geocoder, called straight from the browser. Rejects with a short message.
 */
function detectZip(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Your browser can\'t share its location.'));
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${latitude}&lon=${longitude}`,
            { headers: { Accept: 'application/json' } },
          );
          const data = (await r.json()) as { address?: { postcode?: string; country_code?: string } };
          const zip = new RegExp(`\\b\\d{${cfg.postalLength}}\\b`).exec((data.address?.postcode ?? '').replace(/\s/g, ' ').replace(/(\d{3}) (\d{3})/, '$1$2'))?.[0];
          if (!zip || (data.address?.country_code && data.address.country_code !== cfg.country.toLowerCase())) {
            return reject(new Error(`We could only find a ${cfg.postalLabel} for locations in ${cfg.country === 'US' ? 'the US' : 'India'}.`));
          }
          resolve(zip);
        } catch {
          reject(new Error(`Could not work out your ${cfg.postalLabel} from your location.`));
        }
      },
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Location access is blocked in your browser.'
              : 'Could not get your location.',
          ),
        ),
      { timeout: 10000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

function LocationBar(props: { where: Where | null; onWhere: (w: Where) => void }) {
  const { where, onWhere } = props;
  const [zip, setZip] = useState(where?.zip ?? '');
  const [range, setRange] = useState<Range>(where?.range ?? 'near');
  const [error, setError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const detect = useCallback(
    async (auto: boolean) => {
      setDetecting(true);
      setNote(null);
      setError(null);
      try {
        const found = await detectZip();
        setZip(found);
        onWhere({ zip: found, range });
      } catch (e) {
        // Automatic attempts fail quietly into manual entry; a button press explains what went wrong.
        setNote(`${e instanceof Error ? e.message : 'Could not detect your location.'} Please enter your ${cfg.postalLabel}.`);
        if (auto) document.getElementById('zip-input')?.focus();
      } finally {
        setDetecting(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onWhere, range],
  );

  // First visit with no saved location: ask the browser. If the visitor declines, they type their ZIP instead.
  useEffect(() => {
    if (!where) void detect(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!postalRe().test(zip)) return setError(`Enter a ${cfg.postalLength}-digit ${cfg.postalLabel}.`);
    setError(null);
    onWhere({ zip, range });
  };

  return (
    <form className="location-bar" onSubmit={submit} noValidate>
      <label>
        Your {cfg.postalLabel}
        <span className="loc-input">
          <FaMapMarkerAlt aria-hidden="true" />
          <input
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, cfg.postalLength))}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={cfg.postalLength}
            placeholder={`e.g. ${postalExample()}`}
            aria-label={`Your ${cfg.postalLabel}`}
            id="zip-input"
          />
        </span>
      </label>
      <label>
        How far?
        <select value={range} onChange={(e) => setRange(e.target.value as Range)} aria-label="How far to search">
          <option value="exact">Only my {cfg.postalLabel}</option>
          <option value="near">Around my {cfg.postalLabel}</option>
          <option value="wide">My wider area</option>
        </select>
      </label>
      <button type="submit" className="btn btn-primary">
        Find garages
      </button>
      <button type="button" className="btn btn-outline loc-btn" onClick={() => void detect(false)} disabled={detecting}>
        <FaLocationArrow aria-hidden="true" /> {detecting ? 'Finding you...' : 'Use my location'}
      </button>
      {note && <span className="loc-note" role="status">{note}</span>}
      {error && (
        <span className="loc-error" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}

function GaragesSection(props: {
  where: Where | null;
  onWhere: (w: Where | null) => void;
  garages: GarageSummary[] | null;
  error: string | null;
  onRetry: () => void;
  user: User | null;
  onSelect: (id: string) => void;
}) {
  const { where, onWhere, garages, error, onRetry, user, onSelect } = props;
  const [query, setQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState<string | null>(null);

  // Every service offered by at least one garage, for the filter chips (catalog services only).
  const serviceOptions = useMemo(() => {
    const map = new Map<string, string>();
    garages?.forEach((g) =>
      g.serviceIds.forEach((id, i) => {
        if (!id.startsWith('custom')) map.set(id, g.serviceNames[i]);
      }),
    );
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [garages]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (garages ?? []).filter(
      (g) =>
        (!serviceFilter || g.serviceIds.includes(serviceFilter)) &&
        (!q || g.name.toLowerCase().includes(q) || g.area.toLowerCase().includes(q) || g.city.toLowerCase().includes(q)),
    );
  }, [garages, query, serviceFilter]);

  return (
    <section id="garages" className="section">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow">Garages near you</p>
          <h2>Choose a garage</h2>
          <p className="muted">
            Enter your {cfg.postalLabel} to see garages in your area.{' '}
            {user ? 'Pick one to see its services and pricing.' : 'Sign in to see their services and pricing.'}
          </p>
        </div>

        <LocationBar where={where} onWhere={onWhere} />

        {!where && (
          <p className="muted empty">
            Type your {cfg.postalLabel} above and we&apos;ll show only the garages around you.
          </p>
        )}

        {where && (
        <>
        <div className="filters">
          <label className="search">
            <FaSearch aria-hidden="true" />
            <input
              type="search"
              placeholder="Search by garage, neighbourhood or city"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search garages"
            />
          </label>
          <div className="chips" role="group" aria-label="Filter by service">
            <button className={`chip ${serviceFilter === null ? 'on' : ''}`} onClick={() => setServiceFilter(null)}>
              All services
            </button>
            {serviceOptions.map((s) => (
              <button
                key={s.id}
                className={`chip ${serviceFilter === s.id ? 'on' : ''}`}
                aria-pressed={serviceFilter === s.id}
                onClick={() => setServiceFilter(serviceFilter === s.id ? null : s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="notice error" role="alert">
            {error}{' '}
            <button className="link" onClick={onRetry}>
              Try again
            </button>
          </div>
        )}

        {!garages && !error && (
          <div className="garage-grid" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div className="garage-card skeleton" key={i} />
            ))}
          </div>
        )}

        {garages && garages.length === 0 && where && (
          <p className="muted empty">
            No garages found {where.range === 'exact' ? 'in' : 'around'} {where.zip} yet.
            {where.range !== 'wide' ? ' Try a wider area above.' : ' Know a garage here? Ask them to list it on Garage Hub.'}
          </p>
        )}
        {garages && garages.length > 0 && visible.length === 0 && <p className="muted empty">No garages match your search. Try clearing a filter.</p>}

        {garages && visible.length > 0 && (
          <div className="garage-grid">
            {visible.map((g) => (
              <article className="garage-card" key={g.id}>
                <div className="garage-top">
                  <div>
                    <h3>{g.name}</h3>
                    <p className="area">
                      <FaMapMarkerAlt /> {formatPlace(g)} {g.zip}
                    </p>
                    {g.nearness && <p className="near">{g.nearness}</p>}
                  </div>
                  <Stars rating={g.rating} reviews={g.reviews} />
                </div>
                {g.tagline && <p className="tagline">{g.tagline}</p>}
                <p className="open-hours">
                  <FaClock /> {g.hours}
                </p>
                <ul className="tags" aria-label="Services offered">
                  {g.serviceIds.map((id, i) => (
                    <li key={id} className={id === serviceFilter ? 'match' : ''}>
                      {iconFor(id)} {g.serviceNames[i]}
                    </li>
                  ))}
                </ul>
                <button className="btn btn-primary btn-block" onClick={() => onSelect(g.id)}>
                  {!user && <FaLock />}{' '}
                  Visit garage page
                </button>
              </article>
            ))}
          </div>
        )}
        </>
        )}
      </div>
    </section>
  );
}

function Process() {
  const steps = [
    { n: '1', t: `Enter your ${cfg.postalLabel}`, d: `Share your location or type your ${cfg.postalLabel} to see garages near you.` },
    { n: '2', t: 'Choose a garage', d: 'Open its page, read its services and reviews, then sign in to see prices.' },
    { n: '3', t: 'Book and chat', d: 'Pick a time, then follow the job and message the garage as it goes.' },
    { n: '4', t: 'Collect, pay, review', d: 'Pick up your car, pay the garage, and rate your experience.' },
  ];
  return (
    <section id="process" className="section alt">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow">How it works</p>
          <h2>Four simple steps</h2>
        </div>
        <ol className="steps">
          {steps.map((s) => (
            <li key={s.n}>
              <span className="step-n">{s.n}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Front page for garage owners: only garage options, no driver directory. */
function OwnerHome({ onAuth }: { onAuth: (m: AuthMode) => void }) {
  const benefits = [
    ['Your own web page', 'A page you can use as your website, with your colours, headline, services and hours.'],
    ['Online bookings', 'Drivers book a time, you accept, and you chat with them about the job.'],
    ['Clear job tracking', 'Booked, car at the garage, work in progress, completed, picked up. Customers see every step.'],
    ['Offers and discounts', 'Put a percentage off on the services you want to promote.'],
    ['Get paid your way', 'Accept cash, card at the garage, transfer, or send customers to your own payment link.'],
    ['Reviews that build trust', 'Drivers rate you after the job, and your average shows on your page and in search.'],
  ];
  const steps = [
    ['Register', 'Create a garage owner account.'],
    ['Answer a few questions', `Name, ${cfg.postalLabel}, hours, services, prices and how you want your page to look.`],
    ['We approve it', 'Our team checks new garages, usually within a day.'],
    ['Go live', `Drivers near your ${cfg.postalLabel} can find you and book.`],
  ];
  return (
    <>
      <section id="top" className="hero">
        <div className="wrap hero-grid">
          <div>
            <p className="eyebrow">For garage owners</p>
            <h1>
              Your garage, online
              <br />
              <span className="accent">in minutes.</span>
            </h1>
            <p className="lead">
              Get listed for drivers in your area, take bookings, keep customers updated and get paid, all from one
              dashboard. Your garage also gets its own web page.
            </p>
            <div className="cta-row">
              <button className="btn btn-primary btn-lg" onClick={() => onAuth('signup')}>
                Register my garage
              </button>
              <button className="btn btn-outline btn-lg" onClick={() => onAuth('login')}>
                Garage login
              </button>
            </div>
          </div>
          <HeroArt />
        </div>
      </section>
      <section id="benefits" className="section">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Why Garage Hub</p>
            <h2>Everything a garage needs</h2>
          </div>
          <ul className="benefit-grid">
            {benefits.map(([t, d]) => (
              <li key={t}>
                <h3>{t}</h3>
                <p className="muted">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section id="process" className="section alt">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">How it works</p>
            <h2>Live in four steps</h2>
          </div>
          <ol className="steps">
            {steps.map(([t, d], i) => (
              <li key={t}>
                <span className="step-n">{i + 1}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}

function AuthModal(props: {
  mode: AuthMode;
  intent: Intent;
  pendingName: string | null;
  onMode: (m: AuthMode) => void;
  onClose: () => void;
  onAuthed: (token: string, user: User) => void;
}) {
  const { mode, intent, pendingName, onMode, onClose, onAuthed } = props;
  const role: api.Role = intent; // fixed by which front door the visitor used
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => setError(null), [mode]);

  const isSignup = mode === 'signup';
  const isGarage = role === 'garage';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = isSignup
        ? await api.signup(name.trim(), email.trim(), password, role)
        : await api.login(email.trim(), password, role);
      onAuthed(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const reason = isGarage
    ? 'to manage your garage'
    : pendingName
      ? `to see ${pendingName}'s services and pricing`
      : 'to see garage services and pricing';

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="close" onClick={onClose} aria-label="Close">
          &times;
        </button>
        <h2 id="auth-title">{isSignup ? (isGarage ? 'Register your garage' : 'Create your account') : 'Welcome back'}</h2>
        <p className="muted">{isSignup ? `Sign up ${reason}.` : `Log in ${reason}.`}</p>
        <p className="one-account">
          {isGarage ? 'This is the garage owner login. Looking for a garage? Use the driver site.' : 'This is the driver login. Own a garage? Use the garage owner site.'}
        </p>
        <form onSubmit={submit} noValidate>
          {isSignup && (
            <label>
              Full name
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required autoFocus />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              autoFocus={!isSignup}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              minLength={8}
              required
            />
            {isSignup && <small>At least 8 characters.</small>}
          </label>
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? 'Please wait...' : isSignup ? 'Create account' : 'Log in'}
          </button>
        </form>
        <p className="switch">
          {isSignup ? 'Already have an account?' : 'New here?'}{' '}
          <button className="link" onClick={() => onMode(isSignup ? 'login' : 'signup')}>
            {isSignup ? 'Log in' : 'Create an account'}
          </button>
        </p>
      </div>
    </div>
  );
}
