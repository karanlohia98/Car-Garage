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
import type { CatalogItem, GarageInput, OwnerGarage, PricingMode, User } from './api';
import { fullAddress, iconFor, isCustomService, isHttpUrl } from './shared';

interface ServiceRow {
  key: string;
  id: string; // catalog id, or '' for a custom service
  name: string;
  description: string;
  price: string;
  duration: string;
}

interface Answers {
  name: string;
  city: string;
  area: string;
  address: string;
  phone: string;
  hours: string;
  tagline: string;
  mode: PricingMode | '';
  website: string;
  services: ServiceRow[];
}

const EMPTY: Answers = {
  name: '', city: '', area: '', address: '', phone: '', hours: '', tagline: '', mode: '', website: '', services: [],
};

let rowCounter = 0;
const nextKey = () => `row${rowCounter++}`;

const fromGarage = (g: OwnerGarage): Answers => ({
  name: g.name,
  city: g.city,
  area: g.area,
  address: g.address,
  phone: g.phone,
  hours: g.hours,
  tagline: g.tagline,
  mode: g.mode,
  website: g.website,
  services: g.services.map((s) => ({
    key: nextKey(),
    id: isCustomService(s.id) ? '' : s.id,
    name: s.name,
    description: s.description,
    price: s.price ? String(s.price) : '',
    duration: s.duration,
  })),
});

const toInput = (a: Answers, published: boolean): GarageInput => ({
  name: a.name,
  city: a.city,
  area: a.area,
  address: a.address,
  phone: a.phone,
  hours: a.hours,
  tagline: a.tagline,
  mode: (a.mode || 'listing') as PricingMode,
  website: a.website,
  published,
  services: a.services.map((s) => {
    const base = { id: s.id, duration: s.duration };
    const price = a.mode === 'listing' && s.price.trim() !== '' ? Number(s.price) : undefined;
    return s.id ? { ...base, price } : { ...base, name: s.name, description: s.description, price };
  }),
});

const STEPS = ['About your garage', 'Where & when', 'How should customers see prices?', 'Your services', 'Review & publish'] as const;

/** Returns an error message for the given step, or null if it is complete. */
function validateStep(step: number, a: Answers): string | null {
  switch (step) {
    case 0:
      return a.name.trim().length < 2 ? 'Please enter your garage name.' : null;
    case 1:
      if (a.city.trim().length < 2) return 'Please enter your city.';
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
          if (s.price.trim() === '' || !Number.isInteger(p) || p < 1 || p > 10000) {
            return `Enter a whole-dollar price (1-10000) for ${s.id ? 'each catalog service' : s.name || 'each custom service'}.`;
          }
        }
      }
      return null;
    default:
      return null;
  }
}

export default function GarageDashboard({ user, onSessionExpired }: { user: User; onSessionExpired: () => void }) {
  const [garage, setGarage] = useState<OwnerGarage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    api
      .fetchMyGarage()
      .then((r) => {
        setGarage(r.garage);
        setEditing(r.garage === null);
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
          <p className="eyebrow">Garage dashboard</p>
          <h2>Welcome, {user.name.split(' ')[0]}</h2>
          <p className="muted">
            Answer a few quick questions and your garage appears in the directory. You can change your answers any time.
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

        {!loading && editing && (
          <Wizard
            initial={garage ? fromGarage(garage) : EMPTY}
            isNew={garage === null}
            wasPublished={garage?.published ?? false}
            onSaved={(g) => {
              setGarage(g);
              setEditing(false);
            }}
            onCancel={garage ? () => setEditing(false) : undefined}
            onSessionExpired={onSessionExpired}
          />
        )}

        {!loading && !editing && garage && (
          <MyGarageCard garage={garage} onEdit={() => setEditing(true)} onTogglePublish={togglePublish} />
        )}
      </div>
    </section>
  );
}

function MyGarageCard(props: { garage: OwnerGarage; onEdit: () => void; onTogglePublish: () => void }) {
  const { garage, onEdit, onTogglePublish } = props;
  return (
    <div className="my-garage">
      <div className={`status ${garage.published ? 'live' : 'draft'}`} role="status">
        {garage.published ? (
          <>
            <FaCheckCircle /> Your garage is <b>live</b> in the directory.
          </>
        ) : (
          <>Your garage is a <b>draft</b>: customers can&apos;t see it yet.</>
        )}
        <button className="btn btn-ghost" onClick={onTogglePublish}>
          {garage.published ? 'Unpublish' : 'Publish now'}
        </button>
      </div>

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
            {garage.mode === 'listing' && <b> ${s.price}</b>}
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
  const [a, setA] = useState<Answers>(initial);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);

  useEffect(() => {
    api.fetchCatalog().then((r) => setCatalog(r.services)).catch(() => setCatalog([]));
  }, []);

  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA((prev) => ({ ...prev, [k]: v }));

  const chosen = useMemo(() => new Set(a.services.filter((s) => s.id).map((s) => s.id)), [a.services]);

  const toggleCatalog = (c: CatalogItem) => {
    setError(null);
    if (chosen.has(c.id)) set('services', a.services.filter((s) => s.id !== c.id));
    else set('services', [...a.services, { key: nextKey(), id: c.id, name: c.name, description: c.description, price: '', duration: '' }]);
  };

  const updateRow = (key: string, patch: Partial<ServiceRow>) =>
    set('services', a.services.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const addCustom = () =>
    set('services', [...a.services, { key: nextKey(), id: '', name: '', description: '', price: '', duration: '' }]);

  const next = () => {
    const msg = validateStep(step, a);
    if (msg) return setError(msg);
    setError(null);
    setStep(step + 1);
    document.getElementById('dashboard')?.scrollIntoView({ behavior: 'smooth' });
  };

  const save = async (publish: boolean) => {
    for (let i = 0; i < 4; i++) {
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

        {step === 0 && (
          <div className="qa">
            <label>
              What is your garage called?
              <input value={a.name} onChange={(e) => set('name', e.target.value)} maxLength={80} autoFocus />
            </label>
            <label>
              Describe your garage in one line <small>(optional)</small>
              <input
                value={a.tagline}
                onChange={(e) => set('tagline', e.target.value)}
                maxLength={140}
                placeholder="e.g. Family-run since 1998, all makes and models"
              />
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="qa">
            <div className="two">
              <label>
                Which city are you in?
                <input value={a.city} onChange={(e) => set('city', e.target.value)} maxLength={60} autoFocus />
              </label>
              <label>
                Neighbourhood <small>(optional)</small>
                <input value={a.area} onChange={(e) => set('area', e.target.value)} maxLength={60} />
              </label>
            </div>
            <label>
              What&apos;s your street address?
              <input value={a.address} onChange={(e) => set('address', e.target.value)} maxLength={140} />
            </label>
            <div className="two">
              <label>
                Phone number for bookings
                <input value={a.phone} onChange={(e) => set('phone', e.target.value)} maxLength={25} inputMode="tel" />
              </label>
              <label>
                When are you open?
                <input
                  value={a.hours}
                  onChange={(e) => set('hours', e.target.value)}
                  maxLength={80}
                  placeholder="Mon-Fri 8am-6pm, Sat 9am-3pm"
                />
              </label>
            </div>
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
                What&apos;s your website address?
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
                    )}
                    <input
                      className="dur"
                      value={s.duration}
                      onChange={(e) => updateRow(s.key, { duration: e.target.value })}
                      placeholder="e.g. 1 hr"
                      aria-label={`Time for ${s.name || 'custom service'}`}
                      maxLength={20}
                    />
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
          <div className="qa review">
            <dl>
              <dt>Garage</dt>
              <dd>{a.name}</dd>
              <dt>Location</dt>
              <dd>{fullAddress(a)}</dd>
              <dt>Phone &amp; hours</dt>
              <dd>
                {a.phone} &middot; {a.hours}
              </dd>
              <dt>Prices</dt>
              <dd>{a.mode === 'website' ? `Customers are sent to ${a.website}` : 'Listed here on Garage Hub'}</dd>
              <dt>Services</dt>
              <dd>
                {a.services
                  .map((s) => `${s.name}${a.mode === 'listing' ? ` ($${s.price})` : ''}`)
                  .join(', ')}
              </dd>
            </dl>
            <p className="muted">
              Publishing puts your garage in the public directory. You can unpublish or edit it whenever you like.
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
                {busy ? 'Saving...' : wasPublished ? 'Save & keep live' : 'Publish my garage'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
