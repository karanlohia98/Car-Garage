import { FormEvent, ReactElement, useCallback, useEffect, useState } from 'react';
import {
  FaCarBattery,
  FaCarSide,
  FaClock,
  FaCogs,
  FaLock,
  FaMapMarkerAlt,
  FaOilCan,
  FaPhoneAlt,
  FaRegCircle,
  FaShieldAlt,
  FaSnowflake,
  FaStar,
  FaTachometerAlt,
  FaTools,
  FaWrench,
} from 'react-icons/fa';
import * as api from './api';
import type { Service, User } from './api';

type AuthMode = 'login' | 'signup';

const ICONS: Record<string, ReactElement> = {
  oil: <FaOilCan />,
  brakes: <FaCogs />,
  tires: <FaRegCircle />,
  battery: <FaCarBattery />,
  ac: <FaSnowflake />,
  engine: <FaTachometerAlt />,
  align: <FaCarSide />,
  full: <FaTools />,
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState<boolean>(!!api.getToken());
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);

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
    // Take the new customer straight to their pricing.
    setTimeout(() => document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' }), 80);
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      /* ignore: token is dropped locally either way */
    }
    api.setToken(null);
    setUser(null);
  };

  return (
    <>
      <Header user={user} checking={checking} onAuth={setAuthMode} onLogout={handleLogout} />
      <main>
        <Hero user={user} onAuth={setAuthMode} />
        <TrustStrip />
        <ServicesSection user={user} checking={checking} onAuth={setAuthMode} onSessionExpired={handleLogout} />
        <Process />
        <Contact />
      </main>
      <footer className="footer">
        <div className="wrap">
          <span>&copy; {new Date().getFullYear()} Redline Auto Garage. All rights reserved.</span>
          <span>Demo site: contact details and prices are sample data.</span>
        </div>
      </footer>
      {authMode && <AuthModal mode={authMode} onMode={setAuthMode} onClose={() => setAuthMode(null)} onAuthed={handleAuthed} />}
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
        <a href="#top" className="brand" aria-label="Redline Auto Garage home">
          <svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true">
            <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="7" strokeDasharray="10 5" />
            <circle cx="32" cy="32" r="7" fill="currentColor" />
          </svg>
          <span>
            Redline <b>Auto Garage</b>
          </span>
        </a>
        <nav className="nav" aria-label="Main">
          <a href="#services">Services</a>
          <a href="#process">How it works</a>
          <a href="#contact">Visit us</a>
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
          <p className="eyebrow">Independent garage &middot; Since 2009</p>
          <h1>
            Keep it running.
            <br />
            <span className="accent">Keep it honest.</span>
          </h1>
          <p className="lead">
            Fair prices, clear quotes and certified technicians for every make and model. Create a free account to
            see our full service menu and pricing.
          </p>
          <div className="cta-row">
            {user ? (
              <a className="btn btn-primary btn-lg" href="#services">
                View services &amp; pricing
              </a>
            ) : (
              <>
                <button className="btn btn-primary btn-lg" onClick={() => onAuth('signup')}>
                  Create free account
                </button>
                <button className="btn btn-outline btn-lg" onClick={() => onAuth('login')}>
                  I already have one
                </button>
              </>
            )}
          </div>
          <ul className="hero-points">
            <li>
              <FaShieldAlt /> 12-month / 12,000-mile warranty
            </li>
            <li>
              <FaStar /> 4.9 average customer rating
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
        {/* garage floor + lift */}
        <rect x="20" y="340" width="520" height="10" rx="5" fill="#2a2e35" />
        <rect x="90" y="300" width="14" height="42" fill="#3a3f48" />
        <rect x="456" y="300" width="14" height="42" fill="#3a3f48" />
        <rect x="70" y="292" width="420" height="12" rx="4" fill="#4a505b" />
        {/* car */}
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
        {/* floating gear */}
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
    { icon: <FaWrench />, title: 'Certified techs', text: 'ASE-certified mechanics on every job.' },
    { icon: <FaClock />, title: 'Same-day service', text: 'Most routine work done while you wait.' },
    { icon: <FaShieldAlt />, title: 'Written warranty', text: 'Parts and labor covered for 12 months.' },
    { icon: <FaTools />, title: 'All makes & models', text: 'Domestic, import, hybrid and EV checks.' },
  ];
  return (
    <section className="trust" aria-label="Why choose us">
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

function ServicesSection(props: {
  user: User | null;
  checking: boolean;
  onAuth: (m: AuthMode) => void;
  onSessionExpired: () => void;
}) {
  const { user, checking, onAuth, onSessionExpired } = props;
  const [services, setServices] = useState<Service[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .fetchServices()
      .then((r) => setServices(r.services))
      .catch((e: api.ApiError) => {
        if (e.status === 401) onSessionExpired();
        else setError(e.message);
      });
  }, [onSessionExpired]);

  useEffect(() => {
    if (user) load();
    else setServices(null);
  }, [user, load]);

  return (
    <section id="services" className="section">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow">Services &amp; pricing</p>
          <h2>Everything your car needs, priced up front</h2>
          <p className="muted">Starting prices for a standard passenger vehicle. We confirm the exact quote before any work begins.</p>
        </div>

        {!user && !checking && <LockedServices onAuth={onAuth} />}

        {user && error && (
          <div className="notice error" role="alert">
            {error}{' '}
            <button className="link" onClick={load}>
              Try again
            </button>
          </div>
        )}

        {user && !services && !error && (
          <div className="cards" aria-busy="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <div className="card skeleton" key={i} />
            ))}
          </div>
        )}

        {user && services && (
          <div className="cards">
            {services.map((s) => (
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
        )}

        {user && services && (
          <p className="booking-note">
            <FaPhoneAlt /> Ready to book? Call <a href="tel:+12065550142">(206) 555-0142</a> or drop in during opening hours.
          </p>
        )}
      </div>
    </section>
  );
}

function LockedServices({ onAuth }: { onAuth: (m: AuthMode) => void }) {
  const teaser = ['Oil & Filter Change', 'Brake Inspection & Pads', 'Tire Rotation & Balance', 'Engine Diagnostics'];
  return (
    <div className="locked">
      <div className="cards blurred" aria-hidden="true">
        {teaser.map((t) => (
          <div className="card" key={t}>
            <span className="card-icon">
              <FaWrench />
            </span>
            <h3>{t}</h3>
            <p>Detailed description of what is included in this service.</p>
            <div className="card-foot">
              <div className="price">$•••</div>
              <div className="duration">•• min</div>
            </div>
          </div>
        ))}
      </div>
      <div className="locked-cta">
        <span className="lock">
          <FaLock />
        </span>
        <h3>Sign in to see our services and prices</h3>
        <p>It takes less than a minute and it&apos;s free.</p>
        <div className="cta-row">
          <button className="btn btn-primary" onClick={() => onAuth('signup')}>
            Create account
          </button>
          <button className="btn btn-outline" onClick={() => onAuth('login')}>
            Log in
          </button>
        </div>
      </div>
    </div>
  );
}

function Process() {
  const steps = [
    { n: '1', t: 'Create your account', d: 'Sign up free to unlock our service menu and pricing.' },
    { n: '2', t: 'Pick your service', d: 'Compare options and starting prices at your own pace.' },
    { n: '3', t: 'Drop in or call', d: 'We confirm your exact quote before touching the car.' },
    { n: '4', t: 'Drive away happy', d: 'Every job comes with a written 12-month warranty.' },
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

function Contact() {
  return (
    <section id="contact" className="section">
      <div className="wrap contact-grid">
        <div>
          <p className="eyebrow">Visit us</p>
          <h2>Find the garage</h2>
          <ul className="contact-list">
            <li>
              <FaMapMarkerAlt /> 1420 Industrial Way, Seattle, WA 98134
            </li>
            <li>
              <FaPhoneAlt /> <a href="tel:+12065550142">(206) 555-0142</a>
            </li>
          </ul>
        </div>
        <div className="hours">
          <h3>
            <FaClock /> Opening hours
          </h3>
          <dl>
            <dt>Mon &ndash; Fri</dt>
            <dd>8:00 am &ndash; 6:00 pm</dd>
            <dt>Saturday</dt>
            <dd>9:00 am &ndash; 3:00 pm</dd>
            <dt>Sunday</dt>
            <dd>Closed</dd>
          </dl>
        </div>
      </div>
    </section>
  );
}

function AuthModal(props: {
  mode: AuthMode;
  onMode: (m: AuthMode) => void;
  onClose: () => void;
  onAuthed: (token: string, user: User) => void;
}) {
  const { mode, onMode, onClose, onAuthed } = props;
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
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="close" onClick={onClose} aria-label="Close">
          &times;
        </button>
        <h2 id="auth-title">{isSignup ? 'Create your account' : 'Welcome back'}</h2>
        <p className="muted">{isSignup ? 'Sign up to view our services and pricing.' : 'Log in to see our services and pricing.'}</p>
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
