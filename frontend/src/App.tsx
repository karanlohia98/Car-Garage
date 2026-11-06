import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaClock,
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
import type { GarageDetail, GarageSummary, User } from './api';
import GarageDashboard from './GarageDashboard';
import { Stars, formatPlace, fullAddress, iconFor, isHttpUrl, scrollToId } from './shared';

type AuthMode = 'login' | 'signup';
/** What the visitor was trying to do when they were asked to sign in. */
type Intent = 'driver' | 'garage';
/** Which side of the site a signed-in user is looking at. One account can use both. */
type View = 'driver' | 'garage';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState<boolean>(!!api.getToken());
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [authIntent, setAuthIntent] = useState<Intent>('driver');
  const [view, setView] = useState<View>('driver');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Garage the visitor clicked before signing in; opened right after they authenticate.
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [garages, setGarages] = useState<GarageSummary[] | null>(null);
  const [garagesError, setGaragesError] = useState<string | null>(null);

  const loadGarages = useCallback(() => {
    setGaragesError(null);
    api
      .fetchGarages()
      .then((r) => setGarages(r.garages))
      .catch((e: Error) => setGaragesError(e.message));
  }, []);

  useEffect(loadGarages, [loadGarages]);

  // Restore an existing session on load.
  useEffect(() => {
    if (!api.getToken()) return;
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => api.setToken(null))
      .finally(() => setChecking(false));
  }, []);

  const openAuth = (mode: AuthMode, intent: Intent = 'driver') => {
    setAuthIntent(intent);
    setAuthMode(mode);
  };

  const switchView = (v: View) => {
    setView(v);
    if (v === 'driver') loadGarages(); // pick up a garage that was just published or changed
    window.scrollTo({ top: 0 });
  };

  /** "List my garage" buttons: signed-in users go straight to their garage screen. */
  const startGarage = () => {
    if (user) switchView('garage');
    else openAuth('signup', 'garage');
  };

  const handleAuthed = (token: string, u: User) => {
    api.setToken(token);
    setUser(u);
    setAuthMode(null);
    loadGarages(); // pick up any change (e.g. a garage just published)
    if (authIntent === 'garage') {
      setPendingId(null);
      setView('garage');
      window.scrollTo({ top: 0 });
    } else if (pendingId) {
      setView('driver');
      setSelectedId(pendingId);
      setPendingId(null);
      scrollToId('garage-detail');
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
    setSelectedId(null);
    setView('driver');
  }, []);

  const handleSelect = (id: string) => {
    if (!user) {
      setPendingId(id);
      openAuth('signup', 'driver');
      return;
    }
    setSelectedId(id);
    scrollToId('garage-detail');
  };

  const closeAuth = () => {
    setAuthMode(null);
    setPendingId(null);
  };

  const showGarageView = !!user && view === 'garage';
  const selected = garages?.find((g) => g.id === selectedId) ?? null;
  const pending = garages?.find((g) => g.id === pendingId) ?? null;

  return (
    <>
      <Header
        user={user}
        checking={checking}
        view={view}
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
          />
        ) : (
          <>
            <Hero user={user} onAuth={openAuth} />
            <TrustStrip />
            <GaragesSection
              garages={garages}
              error={garagesError}
              onRetry={loadGarages}
              user={user}
              selectedId={selectedId}
              onSelect={handleSelect}
            />
            {user && selectedId && (
              <GarageDetailSection
                key={selectedId}
                id={selectedId}
                summary={selected}
                onSessionExpired={handleLogout}
                onBack={() => {
                  setSelectedId(null);
                  scrollToId('garages');
                }}
              />
            )}
            <Process />
            {!user?.hasGarage && <ForGarages signedIn={!!user} onStart={startGarage} onLogin={() => openAuth('login', 'garage')} />}
          </>
        )}
      </main>
      <footer className="footer">
        <div className="wrap">
          <span>&copy; {new Date().getFullYear()} Garage Hub. All rights reserved.</span>
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
  view: View;
  onView: (v: View) => void;
  onAuth: (m: AuthMode, intent?: Intent) => void;
  onLogout: () => void;
}) {
  const { user, checking, view, onView, onAuth, onLogout } = props;
  const garageView = !!user && view === 'garage';
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
              <a href="#garages">Garages</a>
              <a href="#process">How it works</a>
              {!user?.hasGarage && <a href="#for-garages">For garages</a>}
            </>
          )}
        </nav>
        <div className="auth-actions">
          {checking ? null : user ? (
            <>
              <div className="view-switch" role="group" aria-label="Switch view">
                <button className={view === 'driver' ? 'on' : ''} aria-pressed={view === 'driver'} onClick={() => onView('driver')}>
                  Find a garage
                </button>
                <button className={view === 'garage' ? 'on' : ''} aria-pressed={view === 'garage'} onClick={() => onView('garage')}>
                  {user.hasGarage ? 'My garage' : 'List my garage'}
                </button>
              </div>
              <span className="hello">Hi, {user.name.split(' ')[0]}</span>
              <button className="btn btn-ghost" onClick={onLogout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => onAuth('login')}>
                Log in
              </button>
              <button className="btn btn-primary" onClick={() => onAuth('signup')}>
                Sign up
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Hero({ user, onAuth }: { user: User | null; onAuth: (m: AuthMode, intent?: Intent) => void }) {
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

function GaragesSection(props: {
  garages: GarageSummary[] | null;
  error: string | null;
  onRetry: () => void;
  user: User | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { garages, error, onRetry, user, selectedId, onSelect } = props;
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
            Compare what each garage offers.{' '}
            {user ? 'Pick one to see its services and pricing.' : 'Sign in to see their services and pricing.'}
          </p>
        </div>

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

        {garages && visible.length === 0 && <p className="muted empty">No garages match your search. Try clearing a filter.</p>}

        {garages && visible.length > 0 && (
          <div className="garage-grid">
            {visible.map((g) => (
              <article className={`garage-card ${g.id === selectedId ? 'selected' : ''}`} key={g.id}>
                <div className="garage-top">
                  <div>
                    <h3>{g.name}</h3>
                    <p className="area">
                      <FaMapMarkerAlt /> {formatPlace(g)}
                    </p>
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
                  {g.id === selectedId ? 'Viewing services & pricing' : g.mode === 'website' ? 'View services' : 'View services & pricing'}
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function GarageDetailSection(props: {
  id: string;
  summary: GarageSummary | null;
  onSessionExpired: () => void;
  onBack: () => void;
}) {
  const { id, summary, onSessionExpired, onBack } = props;
  const [garage, setGarage] = useState<GarageDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .fetchGarage(id)
      .then((r) => setGarage(r.garage))
      .catch((e: api.ApiError) => {
        if (e.status === 401) onSessionExpired();
        else setError(e.message);
      });
  }, [id, onSessionExpired]);

  useEffect(load, [load]);

  const name = garage?.name ?? summary?.name ?? 'Garage';
  const tel = garage ? `tel:${garage.phone.replace(/[^\d+]/g, '')}` : '';
  const toWebsite = garage?.mode === 'website' && isHttpUrl(garage.website);
  return (
    <section id="garage-detail" className="section alt">
      <div className="wrap">
        <button className="link back" onClick={onBack}>
          &larr; Back to all garages
        </button>
        <div className="detail-head">
          <div>
            <p className="eyebrow">{toWebsite ? 'Services' : 'Services & pricing'}</p>
            <h2>{name}</h2>
            <p className="muted">{garage?.tagline ?? summary?.tagline}</p>
          </div>
          {garage && (
            <ul className="detail-meta">
              <li>
                <Stars rating={garage.rating} reviews={garage.reviews} />
              </li>
              <li>
                <FaMapMarkerAlt /> {fullAddress(garage)}
              </li>
              <li>
                <FaClock /> {garage.hours}
              </li>
              <li>
                <FaPhoneAlt /> <a href={tel}>{garage.phone}</a>
              </li>
            </ul>
          )}
        </div>

        {error && (
          <div className="notice error" role="alert">
            {error}{' '}
            <button className="link" onClick={load}>
              Try again
            </button>
          </div>
        )}

        {!garage && !error && (
          <div className="cards" aria-busy="true">
            {Array.from({ length: Math.min(summary?.serviceIds.length ?? 4, 8) }).map((_, i) => (
              <div className="card skeleton" key={i} />
            ))}
          </div>
        )}

        {garage && toWebsite && (
          <>
            <div className="website-cta">
              <div>
                <h3>{name} publishes its own prices</h3>
                <p className="muted">Open their website for up-to-date pricing and booking.</p>
              </div>
              <a className="btn btn-primary btn-lg" href={garage.website} target="_blank" rel="noopener noreferrer">
                Visit their website <FaExternalLinkAlt />
              </a>
            </div>
            <ul className="tags big" aria-label="Services offered">
              {garage.services.map((s) => (
                <li key={s.id}>
                  {iconFor(s.id)} {s.name}
                  {s.duration && <small> &middot; {s.duration}</small>}
                </li>
              ))}
            </ul>
          </>
        )}

        {garage && !toWebsite && (
          <>
            <div className="cards">
              {garage.services.map((s) => (
                <article className="card" key={s.id}>
                  {s.badge && <span className="badge">{s.badge}</span>}
                  <span className="card-icon">{iconFor(s.id)}</span>
                  <h3>{s.name}</h3>
                  <p>{s.description}</p>
                  <div className="card-foot">
                    <div className="price">
                      <small>from</small> ${s.price}
                    </div>
                    {s.duration && (
                      <div className="duration">
                        <FaClock /> {s.duration}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <p className="booking-note">
              <FaPhoneAlt />
              <span>
                Ready to book? Call {garage.name} on <a href={tel}>{garage.phone}</a> or drop in during opening hours.
                Prices are starting prices for a standard passenger vehicle.
              </span>
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function Process() {
  const steps = [
    { n: '1', t: 'Create your account', d: 'Sign up free to unlock garage pricing.' },
    { n: '2', t: 'Choose a garage', d: 'Search by name or area, or filter by the service you need.' },
    { n: '3', t: 'Compare services & prices', d: 'See exactly what that garage offers and what it costs.' },
    { n: '4', t: 'Call or drop in', d: 'Book directly with the garage using the details on its page.' },
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

function ForGarages(props: { signedIn: boolean; onStart: () => void; onLogin: () => void }) {
  const { signedIn, onStart, onLogin } = props;
  return (
    <section id="for-garages" className="section">
      <div className="wrap for-garages">
        <div>
          <p className="eyebrow">Own a garage?</p>
          <h2>Get listed in minutes</h2>
          <p className="muted">
            Answer a few simple questions, tell us your services and prices (or point customers to your own website),
            and your garage appears in the directory. No technical setup, and no second account: use the same login you
            use to browse.
          </p>
        </div>
        <div className="cta-row">
          <button className="btn btn-primary btn-lg" onClick={onStart}>
            List my garage
          </button>
          {!signedIn && (
            <button className="btn btn-outline btn-lg" onClick={onLogin}>
              I already have an account
            </button>
          )}
        </div>
      </div>
    </section>
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
  const isGarage = intent === 'garage';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = isSignup
        ? await api.signup(name.trim(), email.trim(), password)
        : await api.login(email.trim(), password);
      onAuthed(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const reason = isGarage
    ? 'to list your garage'
    : pendingName
      ? `to see ${pendingName}'s services and pricing`
      : 'to see garage services and pricing';

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="close" onClick={onClose} aria-label="Close">
          &times;
        </button>
        <h2 id="auth-title">{isSignup ? 'Create your account' : 'Welcome back'}</h2>
        <p className="muted">{isSignup ? `Sign up ${reason}.` : `Log in ${reason}.`}</p>
        <p className="one-account">One account for everything: find garages as a driver and list your own garage.</p>
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
