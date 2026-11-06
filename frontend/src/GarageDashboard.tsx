import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaCheckCircle,
  FaClock,
  FaExternalLinkAlt,
  FaMapMarkerAlt,
  FaPhoneAlt,
  FaPlus,
  FaTrash,
} from 'react-icons/fa';
import * as api from './api';
import type { CatalogItem, GarageInput, OwnerGarage, PayInfo, PayMethod, PricingMode, Theme, User } from './api';
import { AppointmentsWorkspace } from './Appointments';
import { fullAddress, iconFor, isCustomService, isHttpUrl } from './shared';
import { themeVars } from './SitePage';

interface ServiceRow {
  key: string;
  id: string; // catalog id, or '' for a custom service
  name: string;
  description: string;
  price: string;
  /** Percent off, as typed. Empty = no discount. */
  discount: string;
  duration: string;
}

interface Answers {
  name: string;
  city: string;
  area: string;
  zip: string;
  address: string;
  phone: string;
  hours: string;
  tagline: string;
  mode: PricingMode | '';
  website: string;
  theme: Theme;
  pay: PayInfo;
  services: ServiceRow[];
}

const EMPTY: Answers = {
  name: '', city: '', area: '', zip: '', address: '', phone: '', hours: '', tagline: '', mode: '', website: '', theme: api.DEFAULT_THEME, pay: { methods: ['card', 'cash'], link: '', note: '' }, services: [],
};

let rowCounter = 0;
const nextKey = () => `row${rowCounter++}`;

const fromGarage = (g: OwnerGarage): Answers => ({
  name: g.name,
  city: g.city,
  area: g.area,
  zip: g.zip,
  address: g.address,
  phone: g.phone,
  hours: g.hours,
  tagline: g.tagline,
  mode: g.mode,
  website: g.website,
  theme: g.theme ?? api.DEFAULT_THEME,
  pay: g.pay ?? { methods: ['card', 'cash'], link: '', note: '' },
  services: g.services.map((s) => ({
    key: nextKey(),
    id: isCustomService(s.id) ? '' : s.id,
    name: s.name,
    description: s.description,
    price: s.price ? String(s.price) : '',
    discount: s.discount ? String(s.discount) : '',
    duration: s.duration,
  })),
});

const toInput = (a: Answers, published: boolean): GarageInput => ({
  name: a.name,
  city: a.city,
  area: a.area,
  zip: a.zip,
  address: a.address,
  phone: a.phone,
  hours: a.hours,
  tagline: a.tagline,
  mode: (a.mode || 'listing') as PricingMode,
  website: a.website,
  published,
  theme: a.theme,
  pay: a.pay,
  services: a.services.map((s) => {
    const base = { id: s.id, duration: s.duration, description: s.description.trim() };
    const price = a.mode === 'listing' && s.price.trim() !== '' ? Number(s.price) : undefined;
    const discount = a.mode === 'listing' && s.discount.trim() !== '' ? Number(s.discount) : 0;
    return s.id ? { ...base, price, discount } : { ...base, name: s.name, price, discount };
  }),
});

const DAY_OPTIONS = ['Mon-Fri', 'Mon-Sat', 'Mon-Sun', 'Tue-Sat', 'Sat-Sun', 'Daily'];
const TIMES = Array.from({ length: 29 }, (_, i) => {
  const mins = 5 * 60 + i * 30;
  const h = Math.floor(mins / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${mins % 60 === 0 ? '00' : '30'} ${h < 12 ? 'AM' : 'PM'}`;
});
/** Typical time for each standard service, used as the starting value when a garage ticks it. */
const DEFAULT_DURATION: Record<string, string> = {
  oil: '45 min', brakes: '1.5 hrs', tires: '45 min', battery: '30 min', ac: '1 hr',
  engine: '1 hr', align: '1 hr', inspection: '2 hrs', ev: '1.5 hrs', full: '3 hrs',
};
const DURATIONS = ['15 min', '30 min', '45 min', '1 hr', '1.5 hrs', '2 hrs', '3 hrs', 'Half a day', 'Full day'];

/** Opening hours are picked from lists, then saved as one readable line: "Mon-Fri, 8:00 AM - 6:00 PM". */
const composeHours = (days: string, open: string, close: string) => `${days}, ${open} - ${close}`;
const parseHours = (h: string): { days: string; open: string; close: string } | null => {
  const m = /^(.+?), (\d{1,2}:\d{2} [AP]M) - (\d{1,2}:\d{2} [AP]M)$/.exec(h);
  return m && DAY_OPTIONS.includes(m[1]) && TIMES.includes(m[2]) && TIMES.includes(m[3]) ? { days: m[1], open: m[2], close: m[3] } : null;
};

const STEPS = ['About your garage', 'Where & when', 'How should customers see prices?', 'Your services', 'Payments', 'Your page', 'Review & publish'] as const;

/** One-sentence explanation shown under each step heading. */
const STEP_HELP = [
  'This is how your garage is named in the directory. Customers see your name first, so use the name on your sign.',
  'Drivers search by ZIP code, so we only show your garage to people near you. Your phone and hours appear on your page and in booking confirmations.',
  'Pick one. You can switch later. Customers must be signed in to see prices either way.',
  'Choose what you offer. Each service starts with a ready-made description and typical time that you can reword. Add a percentage off to promote a service.',
  'Customers pay you directly. Tick how you accept payment; we track it so both sides know when a job is paid.',
  'Every garage gets its own web page you can share as your website. Choose how it looks; the preview updates as you go.',
  'Check everything below. New garages are reviewed by our team before they appear in the directory, usually within a day.',
] as const;

/** Returns an error message for the given step, or null if it is complete. */
function validateStep(step: number, a: Answers): string | null {
  switch (step) {
    case 0:
      return a.name.trim().length < 2 ? 'Please enter your garage name.' : null;
    case 1:
      if (a.city.trim().length < 2) return 'Please enter your city.';
      if (!/^\d{5}$/.test(a.zip.trim())) return 'Please enter your 5-digit ZIP code. Drivers find you by ZIP.';
      if (a.address.trim().length < 5) return 'Please enter your street address.';
      if (a.phone.replace(/\D/g, '').length < 7) return 'Please enter a valid phone number.';
      if (a.hours.trim().length < 2) return 'Please tell customers your opening hours.';
      return null;
    case 2:
      if (!a.mode) return 'Choose one of the two options.';
      if (a.mode === 'website' && !isHttpUrl(a.website.trim())) {
        return 'Enter your full website address, starting with https://';
      }
      return null;
    case 3:
      if (a.services.length === 0) return 'Add at least one service.';
      for (const s of a.services) {
        if (!s.id && s.name.trim().length < 2) return 'Give each custom service a name.';
        if (a.mode === 'listing') {
          const p = Number(s.price);
          if (s.discount.trim() !== '' && (!Number.isInteger(Number(s.discount)) || Number(s.discount) < 1 || Number(s.discount) > 90)) {
            return `Discount for ${s.name || 'a service'} must be 1 to 90 percent, or empty.`;
          }
          if (s.price.trim() === '' || !Number.isInteger(p) || p < 1 || p > 10000) {
            return `Enter a whole-dollar price (1-10000) for ${s.id ? 'each catalog service' : s.name || 'each custom service'}.`;
          }
        }
      }
      return null;
    case 4:
      if (a.pay.methods.length === 0) return 'Choose at least one way customers can pay.';
      if (a.pay.methods.includes('online') && !isHttpUrl(a.pay.link.trim())) return 'Enter your online payment link, starting with https://';
      return null;
    default:
      return null;
  }
}

export default function GarageDashboard(props: {
  user: User;
  onSessionExpired: () => void;
  /** Called after the garage is created, so the app can update the user's hasGarage flag. */
  onGarageCreated: () => void;
  /** Unread messages/updates across this garage's appointments (for the tab badge). */
  unread: number;
  /** Called whenever appointment data changed, so the app can refresh its badges. */
  onActivity: () => void;
}) {
  const { user, onSessionExpired, onGarageCreated, unread, onActivity } = props;
  const [garage, setGarage] = useState<OwnerGarage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<'appointments' | 'profile'>('appointments');

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    api
      .fetchMyGarage()
      .then((r) => {
        setGarage(r.garage);
        setEditing(r.garage === null);
        setTab(r.garage ? 'appointments' : 'profile');
      })
      .catch((e: api.ApiError) => {
        if (e.status === 401) onSessionExpired();
        else setLoadError(e.message);
      })
      .finally(() => setLoading(false));
  }, [onSessionExpired]);

  useEffect(load, [load]);

  const togglePublish = async () => {
    if (!garage) return;
    try {
      const r = await api.saveMyGarage({ ...toInput(fromGarage(garage), !garage.published) });
      setGarage(r.garage);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not update.');
    }
  };

  return (
    <section id="dashboard" className="section">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow">My garage</p>
          <h2>{garage ? garage.name : `Hi ${user.name.split(' ')[0]}, let's list your garage`}</h2>
          <p className="muted">
            {garage
              ? 'Accept bookings, chat with customers and keep them updated as the work moves along.'
              : 'Answer a few quick questions and your garage appears in the directory. You can change your answers any time.'}
          </p>
        </div>

        {loading && <div className="card skeleton" aria-busy="true" />}

        {loadError && (
          <div className="notice error" role="alert">
            {loadError}{' '}
            <button className="link" onClick={load}>
              Try again
            </button>
          </div>
        )}

        {!loading && garage && !editing && (
          <div className="tabs" role="tablist" aria-label="Garage sections">
            <button role="tab" aria-selected={tab === 'appointments'} className={tab === 'appointments' ? 'on' : ''} onClick={() => setTab('appointments')}>
              Appointments {unread > 0 && <span className="unread">{unread}</span>}
            </button>
            <button role="tab" aria-selected={tab === 'profile'} className={tab === 'profile' ? 'on' : ''} onClick={() => setTab('profile')}>
              Garage profile
            </button>
          </div>
        )}

        {!loading && garage && !editing && tab === 'appointments' && (
          <AppointmentsWorkspace role="garage" onActivity={onActivity} onSessionExpired={onSessionExpired} />
        )}

        {!loading && editing && (
          <Wizard
            initial={garage ? fromGarage(garage) : EMPTY}
            isNew={garage === null}
            wasPublished={garage?.published ?? false}
            onSaved={(g) => {
              if (!garage) onGarageCreated();
              setGarage(g);
              setEditing(false);
            }}
            onCancel={garage ? () => setEditing(false) : undefined}
            onSessionExpired={onSessionExpired}
          />
        )}

        {!loading && !editing && garage && tab === 'profile' && (
          <MyGarageCard garage={garage} onEdit={() => setEditing(true)} onTogglePublish={togglePublish} />
        )}
      </div>
    </section>
  );
}

function ApprovalStatus(props: { garage: OwnerGarage; onTogglePublish: () => void }) {
  const { garage, onTogglePublish } = props;
  if (!garage.zip) {
    return (
      <div className="status draft" role="status">
        Add your ZIP code so drivers nearby can find you. Choose <b>Edit my answers</b>, then <b>Where &amp; when</b>.
      </div>
    );
  }
  if (garage.approval === 'rejected') {
    return (
      <div className="status rejected" role="status">
        Not approved yet: <b>{garage.reviewNote || 'please check your details'}</b>. Edit your answers and submit again.
      </div>
    );
  }
  if (garage.approval === 'pending') {
    return (
      <div className="status pending" role="status">
        {garage.published ? (
          <>Waiting for approval. Our team is checking your garage; you will go live as soon as it is approved.</>
        ) : (
          <>Saved as a draft. Publish it to send it for approval.</>
        )}
        <button className="btn btn-ghost" onClick={onTogglePublish}>
          {garage.published ? 'Withdraw' : 'Submit for review'}
        </button>
      </div>
    );
  }
  return (
    <div className={`status ${garage.published ? 'live' : 'draft'}`} role="status">
      {garage.published ? (
        <>
          <FaCheckCircle /> Approved and <b>live</b> in the directory.
        </>
      ) : (
        <>Approved, but unpublished: customers can&apos;t see it.</>
      )}
      <button className="btn btn-ghost" onClick={onTogglePublish}>
        {garage.published ? 'Unpublish' : 'Publish now'}
      </button>
    </div>
  );
}

function MyGarageCard(props: { garage: OwnerGarage; onEdit: () => void; onTogglePublish: () => void }) {
  const { garage, onEdit, onTogglePublish } = props;
  return (
    <div className="my-garage">
      <ApprovalStatus garage={garage} onTogglePublish={onTogglePublish} />

      <div className="detail-head">
        <div>
          <h3 className="my-name">{garage.name}</h3>
          {garage.tagline && <p className="muted">{garage.tagline}</p>}
        </div>
        <ul className="detail-meta">
          <li>
            <FaMapMarkerAlt /> {fullAddress(garage)}
          </li>
          <li>
            <FaClock /> {garage.hours}
          </li>
          <li>
            <FaPhoneAlt /> {garage.phone}
          </li>
        </ul>
      </div>

      <p className="page-link">
        Your own web page: <a href={`/g/${garage.id}`} target="_blank" rel="noopener noreferrer">{window.location.origin}/g/{garage.id}</a>
        {garage.approval !== 'approved' || !garage.published ? <small className="hint"> (only you can see it until it is approved and published)</small> : null}
      </p>

      <p className="mode-line">
        {garage.mode === 'website' ? (
          <>
            Customers are sent to your website for prices: <a href={garage.website} target="_blank" rel="noopener noreferrer">{garage.website}</a>
          </>
        ) : (
          <>Your services and prices are listed here on Garage Hub.</>
        )}
      </p>

      <ul className="tags big" aria-label="Your services">
        {garage.services.map((s) => (
          <li key={s.id}>
            {iconFor(s.id)} {s.name}
            {garage.mode === 'listing' && <b> ${s.finalPrice}{s.discount > 0 && ` (${s.discount}% off)`}</b>}
          </li>
        ))}
      </ul>

      <button className="btn btn-primary" onClick={onEdit}>
        Edit my answers
      </button>
    </div>
  );
}

function Wizard(props: {
  initial: Answers;
  isNew: boolean;
  wasPublished: boolean;
  onSaved: (g: OwnerGarage) => void;
  onCancel?: () => void;
  onSessionExpired: () => void;
}) {
  const { initial, isNew, wasPublished, onSaved, onCancel, onSessionExpired } = props;
  const [a, setA] = useState<Answers>(() => ({ ...initial, hours: parseHours(initial.hours) ? initial.hours : '' }));
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);

  useEffect(() => {
    api.fetchCatalog().then((r) => setCatalog(r.services)).catch(() => setCatalog([]));
  }, []);

  const [hrs, setHrs] = useState(() => parseHours(initial.hours) ?? { days: 'Mon-Fri', open: '8:00 AM', close: '6:00 PM' });
  const setHours = (h: { days: string; open: string; close: string }) => {
    setHrs(h);
    setA((prev) => ({ ...prev, hours: composeHours(h.days, h.open, h.close) }));
  };
  // Make sure the picked defaults are what gets saved even if the owner never touches the lists.
  useEffect(() => {
    setA((prev) => (prev.hours ? prev : { ...prev, hours: composeHours(hrs.days, hrs.open, hrs.close) }));
  }, [hrs]);

  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA((prev) => ({ ...prev, [k]: v }));

  const chosen = useMemo(() => new Set(a.services.filter((s) => s.id).map((s) => s.id)), [a.services]);

  const toggleCatalog = (c: CatalogItem) => {
    setError(null);
    if (chosen.has(c.id)) set('services', a.services.filter((s) => s.id !== c.id));
    else set('services', [...a.services, { key: nextKey(), id: c.id, name: c.name, description: c.description, price: '', discount: '', duration: DEFAULT_DURATION[c.id] ?? '' }]);
  };

  const updateRow = (key: string, patch: Partial<ServiceRow>) =>
    set('services', a.services.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const addCustom = () =>
    set('services', [...a.services, { key: nextKey(), id: '', name: '', description: '', price: '', discount: '', duration: '' }]);

  const next = () => {
    const msg = validateStep(step, a);
    if (msg) return setError(msg);
    setError(null);
    setStep(step + 1);
    document.getElementById('dashboard')?.scrollIntoView({ behavior: 'smooth' });
  };

  const save = async (publish: boolean) => {
    for (let i = 0; i < 6; i++) {
      const msg = validateStep(i, a);
      if (msg) {
        setStep(i);
        return setError(msg);
      }
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.saveMyGarage(toInput(a, publish));
      onSaved(r.garage);
    } catch (e) {
      if (e instanceof api.ApiError && e.status === 401) onSessionExpired();
      else setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wizard">
      <ol className="progress" aria-label="Setup progress">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? 'current' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
            <span>{i < step ? '✓' : i + 1}</span>
            <em>{label}</em>
          </li>
        ))}
      </ol>

      <div className="wizard-card">
        <h3>{STEPS[step]}</h3>
        <p className="step-help">{STEP_HELP[step]}</p>

        {step === 0 && (
          <div className="qa">
            <label>
              Garage name
              <input value={a.name} onChange={(e) => set('name', e.target.value)} maxLength={80} autoFocus placeholder="e.g. Redline Auto Garage" />
              <small className="hint">Shown as the title of your listing.</small>
            </label>
            <label>
              Short tagline <small>(optional)</small>
              <input
                value={a.tagline}
                onChange={(e) => set('tagline', e.target.value)}
                maxLength={140}
                placeholder="e.g. Family-run since 1998, all makes and models"
              />
              <small className="hint">One line, up to 140 characters. Appears under your name on the garage card.</small>
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="qa">
            <div className="two">
              <label>
                City
                <input value={a.city} onChange={(e) => set('city', e.target.value)} maxLength={60} autoFocus placeholder="e.g. Seattle" />
              </label>
              <label>
                ZIP code
                <input
                  value={a.zip}
                  onChange={(e) => set('zip', e.target.value.replace(/\D/g, '').slice(0, 5))}
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="e.g. 98108"
                  autoComplete="postal-code"
                />
                <small className="hint">Drivers within your area see you when they search this ZIP.</small>
              </label>
            </div>
            <div className="two">
              <label>
                Street address
                <input value={a.address} onChange={(e) => set('address', e.target.value)} maxLength={140} placeholder="e.g. 815 S Spokane St" autoComplete="street-address" />
              </label>
              <label>
                Neighbourhood <small>(optional)</small>
                <input value={a.area} onChange={(e) => set('area', e.target.value)} maxLength={60} placeholder="e.g. Beacon Hill" />
              </label>
            </div>
            <label>
              Phone number
              <input value={a.phone} onChange={(e) => set('phone', e.target.value)} maxLength={25} inputMode="tel" placeholder="e.g. (206) 555-0142" autoComplete="tel" />
              <small className="hint">Customers call this number about their booking.</small>
            </label>
            <fieldset className="hours">
              <legend>Opening hours</legend>
              <div className="three">
                <label>
                  Days
                  <select value={hrs.days} onChange={(e) => setHours({ ...hrs, days: e.target.value })}>
                    {DAY_OPTIONS.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </label>
                <label>
                  Opens
                  <select value={hrs.open} onChange={(e) => setHours({ ...hrs, open: e.target.value })}>
                    {TIMES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </label>
                <label>
                  Closes
                  <select value={hrs.close} onChange={(e) => setHours({ ...hrs, close: e.target.value })}>
                    {TIMES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </label>
              </div>
              {!parseHours(initial.hours) && initial.hours && (
                <small className="hint">Your earlier hours were &ldquo;{initial.hours}&rdquo;. Pick them again above.</small>
              )}
            </fieldset>
          </div>
        )}

        {step === 2 && (
          <div className="qa">
            <div className="choices" role="radiogroup" aria-label="How should customers see your prices?">
              <label className={`choice ${a.mode === 'website' ? 'on' : ''}`}>
                <input type="radio" name="mode" checked={a.mode === 'website'} onChange={() => set('mode', 'website')} />
                <span>
                  <b>
                    <FaExternalLinkAlt /> Send customers to my website
                  </b>
                  <small>
                    You already publish your prices. Customers see your services here and click through to your site.
                  </small>
                </span>
              </label>
              <label className={`choice ${a.mode === 'listing' ? 'on' : ''}`}>
                <input type="radio" name="mode" checked={a.mode === 'listing'} onChange={() => set('mode', 'listing')} />
                <span>
                  <b>List my services and prices here</b>
                  <small>No website needed. Tell us what you offer and what it costs, and we show it to signed-in customers.</small>
                </span>
              </label>
            </div>
            {a.mode === 'website' && (
              <label>
                Website address
                <small className="hint">The page where customers can see your prices.</small>
                <input
                  type="url"
                  value={a.website}
                  onChange={(e) => set('website', e.target.value)}
                  placeholder="https://www.yourgarage.com/prices"
                  maxLength={200}
                  autoFocus
                />
              </label>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="qa">
            <p className="muted">
              {a.mode === 'listing' ? 'Tick the services you offer, then enter your starting price for each.' : 'Tick the services you offer.'}
            </p>
            <div className="chips">
              {catalog.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className={`chip ${chosen.has(c.id) ? 'on' : ''}`}
                  aria-pressed={chosen.has(c.id)}
                  onClick={() => toggleCatalog(c)}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {a.services.length > 0 && (
              <div className="svc-rows">
                {a.services.map((s) => (
                  <div className="svc-row" key={s.key}>
                    <div className="svc-name">
                      {s.id ? (
                        <span>
                          {iconFor(s.id)} {s.name}
                        </span>
                      ) : (
                        <input
                          value={s.name}
                          onChange={(e) => updateRow(s.key, { name: e.target.value })}
                          placeholder="Service name"
                          aria-label="Custom service name"
                          maxLength={60}
                        />
                      )}
                    </div>
                    {a.mode === 'listing' && (
                      <>
                        <label className="money">
                          <span>$</span>
                          <input
                            inputMode="numeric"
                            value={s.price}
                            onChange={(e) => updateRow(s.key, { price: e.target.value.replace(/[^\d]/g, '') })}
                            placeholder="from"
                            aria-label={`Price for ${s.name || 'custom service'}`}
                            maxLength={5}
                          />
                        </label>
                        <label className="money pct">
                          <input
                            inputMode="numeric"
                            value={s.discount}
                            onChange={(e) => updateRow(s.key, { discount: e.target.value.replace(/[^\d]/g, '').slice(0, 2) })}
                            placeholder="off"
                            aria-label={`Discount percent for ${s.name || 'custom service'}`}
                            maxLength={2}
                          />
                          <span>% off</span>
                        </label>
                      </>
                    )}
                    <select
                      className="dur"
                      value={s.duration}
                      onChange={(e) => updateRow(s.key, { duration: e.target.value })}
                      aria-label={`Time for ${s.name || 'custom service'}`}
                    >
                      <option value="">How long?</option>
                      {(s.duration && !DURATIONS.includes(s.duration) ? [s.duration, ...DURATIONS] : DURATIONS).map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                    {!s.id && (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Remove service"
                        onClick={() => set('services', a.services.filter((x) => x.key !== s.key))}
                      >
                        <FaTrash />
                      </button>
                    )}
                    <input
                      className="svc-desc"
                      value={s.description}
                      onChange={(e) => updateRow(s.key, { description: e.target.value })}
                      placeholder="Describe this service in one line"
                      aria-label={`Description for ${s.name || 'custom service'}`}
                      maxLength={160}
                    />
                  </div>
                ))}
              </div>
            )}
            <button type="button" className="btn btn-outline add" onClick={addCustom}>
              <FaPlus /> Add a service that isn&apos;t listed
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="qa">
            <fieldset className="pay-methods">
              <legend>How can customers pay you?</legend>
              {(Object.keys(api.PAY_LABELS) as PayMethod[]).map((m) => (
                <label key={m} className="check">
                  <input
                    type="checkbox"
                    checked={a.pay.methods.includes(m)}
                    onChange={(e) =>
                      set('pay', { ...a.pay, methods: e.target.checked ? [...a.pay.methods, m] : a.pay.methods.filter((x) => x !== m) })
                    }
                  />
                  {api.PAY_LABELS[m]}
                </label>
              ))}
            </fieldset>
            {a.pay.methods.includes('online') && (
              <label>
                Online payment link
                <input
                  type="url"
                  value={a.pay.link}
                  onChange={(e) => set('pay', { ...a.pay, link: e.target.value })}
                  placeholder="https://pay.example.com/your-garage"
                  maxLength={300}
                />
                <small className="hint">A payment page you already have, for example a Stripe, PayPal or Square payment link. Customers are sent there to pay you.</small>
              </label>
            )}
            <label>
              Payment note <small>(optional)</small>
              <input
                value={a.pay.note}
                onChange={(e) => set('pay', { ...a.pay, note: e.target.value })}
                maxLength={100}
                placeholder="e.g. Zelle: 206 555 0142"
              />
              <small className="hint">Shown to the customer when they pay, for example transfer details.</small>
            </label>
          </div>
        )}

        {step === 5 && (
          <div className="qa">
            <div>
              <b>Colour</b>
              <div className="swatches" role="group" aria-label="Accent colour">
                {['#ff6a1a', '#e11d48', '#2563eb', '#0d9488', '#16a34a', '#7c3aed', '#ca8a04', '#111827'].map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`swatch ${a.theme.accent === c ? 'on' : ''}`}
                    style={{ background: c }}
                    aria-label={`Accent ${c}`}
                    aria-pressed={a.theme.accent === c}
                    onClick={() => set('theme', { ...a.theme, accent: c })}
                  />
                ))}
                <input
                  type="color"
                  value={a.theme.accent}
                  onChange={(e) => set('theme', { ...a.theme, accent: e.target.value })}
                  aria-label="Custom colour"
                  style={{ width: 44, height: 36, padding: 2 }}
                />
              </div>
            </div>
            <div className="two">
              <div>
                <b>Background</b>
                <div className="seg" role="group" aria-label="Light or dark">
                  {(['dark', 'light'] as const).map((m) => (
                    <button type="button" key={m} className={a.theme.mode === m ? 'on' : ''} onClick={() => set('theme', { ...a.theme, mode: m })}>
                      {m === 'dark' ? 'Dark' : 'Light'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <b>Font style</b>
                <div className="seg" role="group" aria-label="Font style">
                  {(['modern', 'classic', 'rounded'] as const).map((f) => (
                    <button type="button" key={f} className={a.theme.font === f ? 'on' : ''} onClick={() => set('theme', { ...a.theme, font: f })}>
                      {f[0].toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <label>
              Headline <small>(optional)</small>
              <input value={a.theme.headline} onChange={(e) => set('theme', { ...a.theme, headline: e.target.value })} maxLength={80} placeholder={a.name || 'e.g. Honest repairs, fair prices'} />
              <small className="hint">Big text at the top of your page. Defaults to your garage name.</small>
            </label>
            <label>
              About your garage <small>(optional)</small>
              <input value={a.theme.about} onChange={(e) => set('theme', { ...a.theme, about: e.target.value })} maxLength={200} placeholder="e.g. Family-run since 1998, all makes and models" />
              <small className="hint">One or two sentences under the headline, up to 200 characters.</small>
            </label>
            <div className="site theme-preview" style={themeVars(a.theme)} aria-label="Preview of your page">
              <div className="site-hero" style={{ padding: '28px 22px' }}>
                <h1 style={{ fontSize: '1.7rem' }}>{a.theme.headline || a.name || 'Your garage'}</h1>
                <p className="s-lead" style={{ fontSize: '.95rem' }}>{a.theme.about || a.tagline || 'Your short description appears here.'}</p>
                <span className="site-btn">See our services</span>
              </div>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="qa review">
            <dl>
              <dt>Garage</dt>
              <dd>{a.name}</dd>
              <dt>Location</dt>
              <dd>
                {fullAddress(a)} {a.zip}
              </dd>
              <dt>Phone &amp; hours</dt>
              <dd>
                {a.phone} &middot; {a.hours}
              </dd>
              <dt>Prices</dt>
              <dd>{a.mode === 'website' ? `Customers are sent to ${a.website}` : 'Listed here on Garage Hub'}</dd>
              <dt>Payment</dt>
              <dd>{a.pay.methods.map((m: PayMethod) => api.PAY_LABELS[m]).join(', ')}</dd>
              <dt>Services</dt>
              <dd>
                {a.services
                  .map((s) => `${s.name}${a.mode === 'listing' ? ` ($${s.price}${s.discount ? `, ${s.discount}% off` : ''})` : ''}`)
                  .join(', ')}
              </dd>
            </dl>
            <p className="muted">
              {isNew || !wasPublished
                ? 'After you publish, our team checks your garage. Once approved, it appears for drivers in your ZIP area. You can edit it any time.'
                : 'You are live. Changes are saved straight away.'}
            </p>
          </div>
        )}

        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}

        <div className="wizard-actions">
          {step > 0 ? (
            <button className="btn btn-ghost" onClick={() => { setError(null); setStep(step - 1); }} disabled={busy}>
              Back
            </button>
          ) : onCancel ? (
            <button className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary" onClick={next}>
              Next
            </button>
          ) : (
            <div className="end-actions">
              {(isNew || !wasPublished) && (
                <button className="btn btn-outline" onClick={() => save(false)} disabled={busy}>
                  Save as draft
                </button>
              )}
              <button className="btn btn-primary" onClick={() => save(true)} disabled={busy}>
                {busy ? 'Saving...' : wasPublished ? 'Save & keep live' : 'Submit for review'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
