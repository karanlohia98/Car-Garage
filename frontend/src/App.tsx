import { FormEvent, ReactElement, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaBolt,
  FaCarBattery,
  FaCarSide,
  FaClipboardCheck,
  FaClock,
  FaCogs,
  FaLock,
  FaMapMarkerAlt,
  FaOilCan,
  FaPhoneAlt,
  FaRegCircle,
  FaSearch,
  FaShieldAlt,
  FaSnowflake,
  FaStar,
  FaTachometerAlt,
  FaTools,
  FaWrench,
} from 'react-icons/fa';
import * as api from './api';
import type { GarageDetail, GarageSummary, User } from './api';

type AuthMode = 'login' | 'signup';

const ICONS: Record<string, ReactElement> = {
  oil: <FaOilCan />,
  brakes: <FaCogs />,
  tires: <FaRegCircle />,
  battery: <FaCarBattery />,
  ac: <FaSnowflake />,
  engine: <FaTachometerAlt />,
  align: <FaCarSide />,
  inspection: <FaClipboardCheck />,
  ev: <FaBolt />,
  full: <FaTools />,
};

const scrollToId = (id: string) =>
  setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 80);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState<boolean>(!!api.getToken());
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
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

  const handleAuthed = (token: string, u: User) => {
    api.setToken(token);
    setUser(u);
    setAuthMode(null);
    if (pendingId) {
      setSelectedId(pendingId);
      setPendingId(null);
      scrollToId('garage-detail');
    } else {
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
  }, []);

  const handleSelect = (id: string) => {
    if (!user) {
      setPendingId(id);
      setAuthMode('signup');
      return;
    }
    setSelectedId(id);
    scrollToId('garage-detail');
  };

  const closeAuth = () => {
    setAuthMode(null);
    setPendingId(null);
  };

  const selected = garages?.find((g) => g.id === selectedId) ?? null;
  const pending = garages?.find((g) => g.id === pendingId) ?? null;

  return (
    <>
      <Header user={user} checking={checking} onAuth={setAuthMode} onLogout={handleLogout} />
      <main>
        <Hero user={user} onAuth={setAuthMode} />
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
      </main>
      <footer className="footer">
        <div className="wrap">
          <span>&copy; {new Date().getFullYear()} Garage Hub. All rights reserved.</span>
          <span>Demo site: garages, contact details and prices are sample data.</span>
        </div>
      </footer>
      {authMode && (
        <AuthModal
          mode={authMode}
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
  onAuth: (m: AuthMode) => void;
  onLogout: () => void;
}) {
  const { user, checking, onAuth, onLogout } = props;
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
          <a href="#garages">Garages</a>
          <a href="#process">How it works</a>
        </nav>
        <div className="auth-actions">
          {checking ? null : user ? (
            <>
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

function Stars({ rating, reviews }: { rating: number; reviews: number }) {
  return (
    <span className="rating" aria-label={`Rated ${rating} out of 5 from ${reviews} reviews`}>
      <FaStar /> <b>{rating.toFixed(1)}</b> <small>({reviews})</small>
    </span>
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

  // Every service offered by at least one garage, for the filter chips.
  const serviceOptions = useMemo(() => {
    const map = new Map<string, string>();
    garages?.forEach((g) => g.serviceIds.forEach((id, i) => map.set(id, g.serviceNames[i])));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [garages]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (garages ?? []).filter(
      (g) =>
        (!serviceFilter || g.serviceIds.includes(serviceFilter)) &&
        (!q || g.name.toLowerCase().includes(q) || g.area.toLowerCase().includes(q)),
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
              placeholder="Search by garage or neighbourhood"
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
                      <FaMapMarkerAlt /> {g.area}, Seattle
                    </p>
                  </div>
                  <Stars rating={g.rating} reviews={g.reviews} />
                </div>
                <p className="tagline">{g.tagline}</p>
                <p className="open-hours">
                  <FaClock /> {g.hours}
                </p>
                <ul className="tags" aria-label="Services offered">
                  {g.serviceIds.map((id, i) => (
                    <li key={id} className={id === serviceFilter ? 'match' : ''}>
                      {ICONS[id] ?? <FaWrench />} {g.serviceNames[i]}
                    </li>
                  ))}
                </ul>
                <button className="btn btn-primary btn-block" onClick={() => onSelect(g.id)}>
                  {!user && <FaLock />} {g.id === selectedId ? 'Viewing services & pricing' : 'View services & pricing'}
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
  return (
    <section id="garage-detail" className="section alt">
      <div className="wrap">
        <button className="link back" onClick={onBack}>
          &larr; Back to all garages
        </button>
        <div className="detail-head">
          <div>
            <p className="eyebrow">Services &amp; pricing</p>
            <h2>{name}</h2>
            <p className="muted">{garage?.tagline ?? summary?.tagline}</p>
          </div>
          {garage && (
            <ul className="detail-meta">
              <li>
                <Stars rating={garage.rating} reviews={garage.reviews} />
              </li>
              <li>
                <FaMapMarkerAlt /> {garage.address}
              </li>
              <li>
                <FaClock /> {garage.hours}
              </li>
              <li>
                <FaPhoneAlt /> <a href={`tel:${garage.phone.replace(/[^\d+]/g, '')}`}>{garage.phone}</a>
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

        {garage && (
          <>
            <div className="cards">
              {garage.services.map((s) => (
                <article className="card" key={s.id}>
                  {s.badge && <span className="badge">{s.badge}</span>}
                  <span className="card-icon">{ICONS[s.id] ?? <FaWrench />}</span>
                  <h3>{s.name}</h3>
                  <p>{s.description}</p>
                  <div className="card-foot">
                    <div className="price">
                      <small>from</small> ${s.price}
                    </div>
                    <div className="duration">
                      <FaClock /> {s.duration}
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <p className="booking-note">
              <FaPhoneAlt />
              <span>
                Ready to book? Call {garage.name} on{' '}
                <a href={`tel:${garage.phone.replace(/[^\d+]/g, '')}`}>{garage.phone}</a> or drop in during opening
                hours. Prices are starting prices for a standard passenger vehicle.
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
    { n: '3', t: 'Compare services & prices', d: "See exactly what that garage offers and what it costs." },
    { n: '4', t: 'Call or drop in', d: 'Book directly with the garage using the details on its page.' },
  ];
  return (
    <section id="process" className="section">
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

function AuthModal(props: {
  mode: AuthMode;
  pendingName: string | null;
  onMode: (m: AuthMode) => void;
  onClose: () => void;
  onAuthed: (token: string, user: User) => void;
}) {
  const { mode, pendingName, onMode, onClose, onAuthed } = props;
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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === 'signup' ? await api.signup(name.trim(), email.trim(), password) : await api.login(email.trim(), password);
      onAuthed(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const isSignup = mode === 'signup';
  const reason = pendingName ? `to see ${pendingName}'s services and pricing` : 'to see garage services and pricing';
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="close" onClick={onClose} aria-label="Close">
          &times;
        </button>
        <h2 id="auth-title">{isSignup ? 'Create your account' : 'Welcome back'}</h2>
        <p className="muted">{isSignup ? `Sign up ${reason}.` : `Log in ${reason}.`}</p>
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
