import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaCar, FaClock, FaMapMarkerAlt, FaPaperPlane, FaPhoneAlt } from 'react-icons/fa';
import * as api from './api';
import type { ApptDetail, ApptStatus, ApptSummary, GarageDetail } from './api';

/** The happy path, in order. requested / declined / cancelled sit outside it. */
const STEPS: { status: ApptStatus; label: string }[] = [
  { status: 'booked', label: 'Appointment booked' },
  { status: 'at_garage', label: 'Car at the garage' },
  { status: 'in_progress', label: 'Work in progress' },
  { status: 'completed', label: 'Work completed' },
  { status: 'picked_up', label: 'Car picked up' },
];

const GARAGE_BUTTON: Record<string, string> = {
  booked: 'Accept appointment',
  declined: 'Decline',
  at_garage: 'Car has arrived at the garage',
  in_progress: 'Start the work',
  completed: 'Mark work completed',
  picked_up: 'Car handed back to the owner',
  cancelled: 'Cancel appointment',
};
const CUSTOMER_BUTTON: Record<string, string> = { cancelled: 'Cancel my appointment', picked_up: 'I picked up my car' };
const DANGER = new Set<string>(['declined', 'cancelled']);

const localToday = (): string => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export const formatWhen = (date: string, time: string): string => {
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime())
    ? `${date} ${time}`
    : d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const formatStamp = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const FUELS = ['Empty', '1/4', '1/2', '3/4', 'Full'];
const STATE_LABEL: Record<string, string> = { ok: 'OK', attention: 'Needs attention', notchecked: 'Not checked' };

/**
 * The digital job card. The garage fills it in while the car is in the workshop (intake details, inspection,
 * extra parts and labour). The driver sees it read-only and approves or declines extra work.
 */
function JobCardSection(props: { d: ApptDetail; onUpdate: (a: ApptDetail) => void; onError: (e: unknown) => void }) {
  const { d, onUpdate, onError } = props;
  const c = d.card;
  const editable = d.canEditCard;
  const [odo, setOdo] = useState(c.odometer ? String(c.odometer) : '');
  const [fuel, setFuel] = useState(c.fuel);
  const [tech, setTech] = useState(c.technician);
  const [checks, setChecks] = useState<Record<string, { state: api.CheckState; note: string }>>(() =>
    Object.fromEntries(d.cardItems.map((i) => {
      const found = c.checklist.find((x) => x.item === i);
      return [i, { state: found?.state ?? 'notchecked', note: found?.note ?? '' }];
    })),
  );
  const [work, setWork] = useState<api.WorkLine[]>(c.work.map(({ kind, text, qty, unit }) => ({ kind, text, qty, unit })));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extra = work.reduce((n, w) => n + (Number(w.qty) || 0) * (Number(w.unit) || 0), 0);
  const run = async (fn: () => Promise<{ appointment: ApptDetail }>, ok?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      onUpdate((await fn()).appointment);
      ok?.();
    } catch (e) {
      if (e instanceof api.ApiError && e.status < 500 && e.status !== 401) setError(e.message);
      else onError(e);
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(
      () =>
        api.saveJobCard(d.id, {
          odometer: Number(odo) || 0,
          fuel,
          technician: tech.trim(),
          checklist: d.cardItems.map((i) => ({ item: i, state: checks[i].state, note: checks[i].note.trim() })),
          work: work.map((w) => ({ ...w, text: w.text.trim(), qty: Number(w.qty), unit: Number(w.unit) })),
        }),
      () => setSaved(true),
    );
  const setLine = (i: number, patch: Partial<api.WorkLine>) => {
    setSaved(false);
    setWork(work.map((w, k) => (k === i ? { ...w, ...patch } : w)));
  };

  const est = c.estimate;
  return (
    <div className="job-card" aria-label="Job card">
      <div className="job-head">
        <h4>Job card</h4>
        <button type="button" className="btn btn-ghost no-print" onClick={() => window.print()}>
          Print
        </button>
      </div>
      <p className="muted job-meta">
        {d.vehicle}
        {d.plate ? ` (${d.plate})` : ''} &middot; {d.customerName}
      </p>

      {editable ? (
        <div className="job-intake">
          <label>
            Odometer
            <input inputMode="numeric" value={odo} onChange={(e) => { setSaved(false); setOdo(e.target.value.replace(/\D/g, '').slice(0, 7)); }} placeholder="e.g. 48200" />
          </label>
          <label>
            Fuel level
            <select value={fuel} onChange={(e) => { setSaved(false); setFuel(e.target.value); }}>
              <option value="">Not noted</option>
              {FUELS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label>
            Technician
            <input value={tech} onChange={(e) => { setSaved(false); setTech(e.target.value); }} maxLength={40} placeholder="e.g. Sam" />
          </label>
        </div>
      ) : (
        <p className="job-meta">
          {c.odometer ? <>Odometer {c.odometer.toLocaleString()} &middot; </> : null}
          {c.fuel ? <>Fuel {c.fuel} &middot; </> : null}
          {c.technician ? <>Technician {c.technician}</> : null}
        </p>
      )}

      <h5>Inspection</h5>
      <ul className="job-checks">
        {d.cardItems.map((i) => {
          const cur = editable ? checks[i] : c.checklist.find((x) => x.item === i) ?? { state: 'notchecked' as const, note: '' };
          return (
            <li key={i} className={`chk-${cur.state}`}>
              <span>{i}</span>
              {editable ? (
                <>
                  <select aria-label={`${i} state`} value={cur.state} onChange={(e) => { setSaved(false); setChecks({ ...checks, [i]: { ...checks[i], state: e.target.value as api.CheckState } }); }}>
                    {Object.entries(STATE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input aria-label={`${i} note`} value={cur.note} maxLength={80} placeholder="Note" onChange={(e) => { setSaved(false); setChecks({ ...checks, [i]: { ...checks[i], note: e.target.value } }); }} />
                </>
              ) : (
                <>
                  <b>{STATE_LABEL[cur.state]}</b>
                  {cur.note && <em>{cur.note}</em>}
                </>
              )}
            </li>
          );
        })}
      </ul>

      <h5>Extra parts and labour</h5>
      {work.length === 0 && !editable && <p className="muted">No extra work.</p>}
      {work.length > 0 && (
        <table className="job-work">
          <thead>
            <tr><th>Item</th><th>Qty</th><th>Each</th><th>Total</th>{editable && <th />}</tr>
          </thead>
          <tbody>
            {work.map((w, i) => (
              <tr key={i}>
                <td>
                  {editable ? (
                    <div className="work-edit">
                      <select aria-label="Type" value={w.kind} onChange={(e) => setLine(i, { kind: e.target.value as 'part' | 'labour' })}>
                        <option value="part">Part</option>
                        <option value="labour">Labour</option>
                      </select>
                      <input aria-label="Description" value={w.text} maxLength={60} placeholder="e.g. Front brake pads" onChange={(e) => setLine(i, { text: e.target.value })} />
                    </div>
                  ) : (
                    <>{w.kind === 'part' ? 'Part' : 'Labour'}: {w.text}</>
                  )}
                </td>
                <td>{editable ? <input aria-label="Quantity" inputMode="numeric" value={w.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value.replace(/\D/g, '').slice(0, 2)) })} /> : w.qty}</td>
                <td>{editable ? <input aria-label="Price each" inputMode="numeric" value={w.unit} onChange={(e) => setLine(i, { unit: Number(e.target.value.replace(/\D/g, '').slice(0, 5)) })} /> : `$${w.unit}`}</td>
                <td>${(Number(w.qty) || 0) * (Number(w.unit) || 0)}</td>
                {editable && (
                  <td>
                    <button type="button" className="icon-btn" aria-label="Remove line" onClick={() => { setSaved(false); setWork(work.filter((_, k) => k !== i)); }}>
                      &times;
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editable && work.length < 30 && (
        <button type="button" className="btn btn-outline add no-print" onClick={() => { setSaved(false); setWork([...work, { kind: 'part', text: '', qty: 1, unit: 0 }]); }}>
          + Add a part or labour line
        </button>
      )}

      <div className="job-totals">
        <span>Booked services <b>${c.bookedTotal}</b></span>
        <span>Extra work <b>${editable ? extra : c.extraTotal}</b></span>
        <span className="grand">Total <b>${c.bookedTotal + (editable ? extra : c.extraTotal)}</b></span>
      </div>

      {c.work.length > 0 && (
        <div className={`estimate est-${est}`}>
          {est === 'none' && <span>Extra work not yet sent for approval.</span>}
          {est === 'sent' && <span>Extra work of ${c.estimateTotal} is waiting for the customer&apos;s approval.</span>}
          {est === 'approved' && <span>Customer approved the extra work (${c.estimateTotal}).</span>}
          {est === 'declined' && <span>Customer declined the extra work. Talk to them before going ahead.</span>}
          {d.role === 'customer' && est === 'sent' && (
            <span className="action-row no-print">
              <button className="btn btn-primary" disabled={busy} onClick={() => run(() => api.estimateAction(d.id, 'approve'))}>Approve extra work</button>
              <button className="btn btn-danger" disabled={busy} onClick={() => run(() => api.estimateAction(d.id, 'decline'))}>Decline</button>
            </span>
          )}
        </div>
      )}

      {error && <div className="notice error" role="alert">{error}</div>}
      {editable && (
        <div className="action-row no-print">
          <button className="btn btn-primary" disabled={busy} onClick={save}>{saved ? 'Saved ✓' : 'Save job card'}</button>
          {c.work.length > 0 && est !== 'sent' && est !== 'approved' && (
            <button className="btn btn-outline" disabled={busy || !saved} title={saved ? '' : 'Save the job card first'} onClick={() => run(() => api.estimateAction(d.id, 'send'))}>
              Send extra work for approval
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

/** Tracks payment. Money goes directly to the garage; the driver reports it and the garage confirms it. */
function PaySection(props: { d: ApptDetail; onUpdate: (a: ApptDetail) => void; onError: (e: unknown) => void }) {
  const { d, onUpdate, onError } = props;
  const isGarage = d.role === 'garage';
  const methods = d.garagePay?.methods ?? [];
  const [method, setMethod] = useState<string>(d.payMethod || methods[0] || 'cash');
  const [busy, setBusy] = useState(false);
  const run = async (action: 'report' | 'confirm') => {
    setBusy(true);
    try {
      onUpdate((await api.payAppointment(d.id, action, method)).appointment);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };
  const label = (m: string) => api.PAY_LABELS[m as api.PayMethod] ?? m;
  return (
    <div className="pay-box" aria-label="Payment">
      <h4>Payment {d.total > 0 && <small>(estimated total: from ${d.total})</small>}</h4>
      {d.payStatus === 'paid' ? (
        <p className="pay-done">Paid{d.payMethod ? ` by ${label(d.payMethod).toLowerCase()}` : ''}. Thank you!</p>
      ) : isGarage ? (
        <>
          <p className="muted">
            {d.payStatus === 'reported' ? `The customer says they paid by ${label(d.payMethod).toLowerCase()}.` : 'Waiting for the customer to pay.'}
          </p>
          {d.payStatus !== 'reported' && (
            <label>
              Paid by
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                {(Object.keys(api.PAY_LABELS) as api.PayMethod[]).map((m) => <option key={m} value={m}>{api.PAY_LABELS[m]}</option>)}
              </select>
            </label>
          )}
          <button className="btn btn-primary" disabled={busy} onClick={() => run('confirm')}>Confirm payment received</button>
        </>
      ) : d.payStatus === 'reported' ? (
        <p className="muted">You said you paid by {label(d.payMethod).toLowerCase()}. Waiting for the garage to confirm.</p>
      ) : (
        <>
          <p className="muted">Pay the garage directly, then tell us how you paid.</p>
          <label>
            How will you pay?
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              {methods.map((m) => <option key={m} value={m}>{label(m)}</option>)}
            </select>
          </label>
          {method === 'online' && d.garagePay?.link && (
            <a className="btn btn-outline" href={d.garagePay.link} target="_blank" rel="noopener noreferrer">Open the garage&apos;s payment page</a>
          )}
          {d.garagePay?.note && <p className="muted">Garage note: {d.garagePay.note}</p>}
          <button className="btn btn-primary" disabled={busy} onClick={() => run('report')}>I&apos;ve paid</button>
        </>
      )}
    </div>
  );
}

/** One review per finished job, from the driver. */
function ReviewSection(props: { d: ApptDetail; onUpdate: (a: ApptDetail) => void; onError: (e: unknown) => void }) {
  const { d, onUpdate, onError } = props;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  if (d.review) {
    return (
      <div className="pay-box" aria-label="Review">
        <h4>{d.role === 'customer' ? 'Your review' : 'Customer review'}</h4>
        <p className="review-stars" aria-label={`${d.review.rating} out of 5 stars`}>{stars(d.review.rating)}</p>
        {d.review.comment && <p>{d.review.comment}</p>}
      </div>
    );
  }
  return (
    <div className="pay-box" aria-label="Leave a review">
      <h4>How did {d.garageName} do?</h4>
      <div className="star-pick" role="group" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} className={n <= rating ? 'on' : ''} aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={n === rating} onClick={() => setRating(n)}>
            ★
          </button>
        ))}
      </div>
      <label>
        One line about your visit <small>(optional, max 140 characters)</small>
        <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={140} placeholder="e.g. Fair price and ready on time" />
      </label>
      <button
        className="btn btn-primary"
        disabled={busy || rating === 0}
        onClick={async () => {
          setBusy(true);
          try {
            onUpdate((await api.reviewAppointment(d.id, rating, comment.trim())).appointment);
          } catch (e) {
            onError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        Submit review
      </button>
    </div>
  );
}

export function StatusBadge({ status, label }: { status: ApptStatus; label: string }) {
  return <span className={`status-badge s-${status}`}>{label}</span>;
}

function Stepper({ status }: { status: ApptStatus }) {
  if (status === 'requested') {
    return <div className="stepper-note wait">Waiting for the garage to accept this appointment.</div>;
  }
  if (status === 'declined' || status === 'cancelled') {
    return (
      <div className="stepper-note closed">
        {status === 'declined' ? 'The garage declined this appointment.' : 'This appointment was cancelled.'}
      </div>
    );
  }
  const current = STEPS.findIndex((s) => s.status === status);
  const finished = status === 'picked_up';
  return (
    <ol className="stepper" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li
          key={s.status}
          className={i < current || (i === current && (status === 'completed' || finished)) ? (i === current ? 'done current' : 'done') : i === current ? 'current' : ''}
          aria-current={i === current ? 'step' : undefined}
        >
          <span>{i < current || (i === current && (status === 'completed' || finished)) ? '✓' : i + 1}</span>
          <em>{s.label}</em>
        </li>
      ))}
    </ol>
  );
}

/** Details, status tracker, status actions and chat for one appointment. Polls for new messages while open. */
export function AppointmentPanel(props: {
  id: string;
  onChanged: () => void;
  onSessionExpired: () => void;
}) {
  const { id } = props;
  const [d, setD] = useState<ApptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const lastUpdated = useRef<string>('');

  // Keep the latest callbacks in refs so polling never restarts just because a parent re-rendered.
  const changedRef = useRef(props.onChanged);
  const expiredRef = useRef(props.onSessionExpired);
  changedRef.current = props.onChanged;
  expiredRef.current = props.onSessionExpired;

  const handle = useCallback((e: unknown) => {
    if (e instanceof api.ApiError && e.status === 401) expiredRef.current();
    else setError(e instanceof Error ? e.message : 'Something went wrong.');
  }, []);

  const apply = useCallback((a: ApptDetail) => {
    setD(a);
    setError(null);
    if (a.updatedAt !== lastUpdated.current) {
      lastUpdated.current = a.updatedAt;
      changedRef.current(); // refresh the list and unread badges
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setD(null);
    setError(null);
    setText('');
    setNote('');
    lastUpdated.current = '';
    const load = () =>
      api
        .fetchAppointment(id)
        .then((r) => !cancelled && apply(r.appointment))
        .catch((e) => !cancelled && handle(e));
    load();
    const timer = setInterval(() => !document.hidden && load(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, apply, handle]);

  const count = d?.messages.length ?? 0;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const r = await api.sendMessage(id, t);
      apply(r.appointment);
      setText('');
    } catch (e) {
      handle(e);
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const act = async (status: ApptStatus) => {
    if (!d || busy) return;
    if (DANGER.has(status) && !window.confirm(`${d.role === 'garage' ? GARAGE_BUTTON[status] : CUSTOMER_BUTTON[status]}? This can't be undone.`)) return;
    setBusy(true);
    try {
      const r = await api.setStatus(id, status, note.trim());
      apply(r.appointment);
      setNote('');
    } catch (e) {
      handle(e);
    } finally {
      setBusy(false);
    }
  };

  if (!d) {
    return error ? (
      <div className="notice error" role="alert">
        {error}
      </div>
    ) : (
      <div className="card skeleton" aria-busy="true" />
    );
  }

  const isGarage = d.role === 'garage';
  const buttons = isGarage ? GARAGE_BUTTON : CUSTOMER_BUTTON;
  return (
    <div className="appt-panel">
      <div className="appt-head">
        <div>
          <h3>{isGarage ? d.customerName : d.garageName}</h3>
          <p className="muted">
            <FaCar /> {d.vehicle}{d.plate ? ` (${d.plate})` : ''} &middot; <FaClock /> {formatWhen(d.date, d.time)}
          </p>
        </div>
        <StatusBadge status={d.status} label={d.statusLabel} />
      </div>

      <Stepper status={d.status} />

      <dl className="appt-facts">
        <dt>Services</dt>
        <dd>
          {d.services.map((s) => (
            <span className="fact-line" key={s.name}>
              {s.name}
              {s.price > 0 && <b> from ${s.price}</b>}
            </span>
          ))}
          {d.total > 0 && <span className="fact-line total">Estimated total: from ${d.total}</span>}
        </dd>
        {d.notes && (
          <>
            <dt>{isGarage ? 'Customer note' : 'Your note'}</dt>
            <dd>{d.notes}</dd>
          </>
        )}
        {!isGarage && (d.garagePhone || d.garageAddress) && (
          <>
            <dt>Garage</dt>
            <dd>
              {d.garageAddress && (
                <span className="fact-line">
                  <FaMapMarkerAlt /> {d.garageAddress}
                </span>
              )}
              {d.garagePhone && (
                <span className="fact-line">
                  <FaPhoneAlt /> <a href={`tel:${d.garagePhone.replace(/[^\d+]/g, '')}`}>{d.garagePhone}</a>
                </span>
              )}
            </dd>
          </>
        )}
      </dl>

      {d.actions.length > 0 && (
        <div className="status-actions">
          {isGarage && (
            <label>
              Add a note for the customer <small>(optional, sent with the update)</small>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                placeholder="e.g. Front pads are worn, +$90. OK to go ahead?"
              />
            </label>
          )}
          <div className="action-row">
            {d.actions.map((a) => (
              <button
                key={a.status}
                className={`btn ${DANGER.has(a.status) ? 'btn-danger' : 'btn-primary'}`}
                disabled={busy}
                onClick={() => act(a.status)}
              >
                {buttons[a.status] ?? a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {d.card.exists || d.canEditCard ? <JobCardSection d={d} onUpdate={apply} onError={handle} /> : null}
      {(d.canPay || d.payStatus === 'paid') && <PaySection d={d} onUpdate={apply} onError={handle} />}
      {(d.canReview || d.review) && <ReviewSection d={d} onUpdate={apply} onError={handle} />}

      <div className="chat">
        <h4>Messages &amp; updates</h4>
        <div className="chat-list" ref={listRef} aria-live="polite">
          {d.messages.map((m, i) =>
            m.from === 'system' ? (
              <div className="msg system" key={i}>
                <span>{m.text}</span>
                <time>{formatStamp(m.at)}</time>
              </div>
            ) : (
              <div className={`msg ${m.from === d.role ? 'mine' : 'theirs'}`} key={i}>
                <b>{m.from === d.role ? 'You' : m.name}</b>
                <p>{m.text}</p>
                <time>{formatStamp(m.at)}</time>
              </div>
            ),
          )}
        </div>
        {d.canChat ? (
          <div className="chat-input">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
              maxLength={300}
              placeholder={isGarage ? 'Message the customer...' : 'Message the garage...'}
              aria-label="Message"
            />
            <button className="btn btn-primary" onClick={send} disabled={busy || !text.trim()} aria-label="Send message">
              <FaPaperPlane /> Send
            </button>
          </div>
        ) : (
          <p className="muted">This appointment is closed, so the chat is read-only.</p>
        )}
      </div>

      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

type Role = 'customer' | 'garage';

const matches = (role: Role, filter: string, s: ApptSummary): boolean => {
  if (filter === 'all') return true;
  // "Open" includes finished work still waiting for the car to be collected.
  const open = s.status === 'requested' || s.status === 'booked' || s.status === 'at_garage' || s.status === 'in_progress' || s.status === 'completed';
  if (filter === 'action') return s.status === 'requested' || s.payStatus === 'reported';
  if (filter === 'active') return role === 'garage' ? open && s.status !== 'requested' : open;
  return !open; // done
};

/** List of appointments with filters, plus the selected appointment's panel. Used by drivers and garages. */
export function AppointmentsWorkspace(props: {
  role: Role;
  initialId?: string | null;
  onActivity: () => void;
  onSessionExpired: () => void;
}) {
  const { role, initialId, onActivity, onSessionExpired } = props;
  const [list, setList] = useState<ApptSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<string | null>(initialId ?? null);

  const expiredRef = useRef(onSessionExpired);
  expiredRef.current = onSessionExpired;
  const activityRef = useRef(onActivity);
  activityRef.current = onActivity;

  const refresh = useCallback(() => {
    const req = role === 'garage' ? api.fetchGarageAppointments() : api.fetchMyBookings();
    req
      .then((r) => {
        setList(r.appointments);
        setError(null);
        activityRef.current();
      })
      .catch((e: api.ApiError) => {
        if (e.status === 401) expiredRef.current();
        else setError(e.message);
      });
  }, [role]);

  useEffect(() => {
    refresh();
    const t = setInterval(() => !document.hidden && refresh(), 8000);
    return () => clearInterval(t);
  }, [refresh]);

  const filters: [string, string][] =
    role === 'garage'
      ? [['all', 'All'], ['action', 'Needs action'], ['active', 'Active'], ['done', 'Done']]
      : [['all', 'All'], ['active', 'Active'], ['done', 'Done']];

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const [key] of filters) c[key] = (list ?? []).filter((s) => matches(role, key, s)).length;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, role]);

  const visible = (list ?? []).filter((s) => matches(role, filter, s));

  return (
    <div className="appt-layout">
      <div className="appt-list-col">
        <div className="chips" role="group" aria-label="Filter appointments">
          {filters.map(([key, label]) => (
            <button
              key={key}
              className={`chip ${filter === key ? 'on' : ''}`}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label} <span className="count">{counts[key] ?? 0}</span>
            </button>
          ))}
        </div>

        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        {!list && !error && <div className="card skeleton" aria-busy="true" />}
        {list && visible.length === 0 && (
          <p className="muted empty">
            {list.length === 0
              ? role === 'garage'
                ? 'No appointments yet. When a driver books your garage, it shows up here.'
                : 'No bookings yet. Find a garage and book an appointment.'
              : 'Nothing here with this filter.'}
          </p>
        )}
        <ul className="appt-list">
          {visible.map((s) => (
            <li key={s.id}>
              <button className={`appt-item ${s.id === selected ? 'selected' : ''}`} onClick={() => setSelected(s.id)}>
                <span className="appt-item-top">
                  <b>{role === 'garage' ? s.customerName : s.garageName}</b>
                  {s.unread > 0 && <span className="unread" aria-label={`${s.unread} unread`}>{s.unread}</span>}
                </span>
                <span className="appt-item-mid">
                  {s.vehicle}{s.plate ? ` (${s.plate})` : ''} &middot; {formatWhen(s.date, s.time)}
                </span>
                <span className="appt-item-svc">{s.services.join(', ')}</span>
                <StatusBadge status={s.status} label={s.statusLabel} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="appt-detail-col">
        {selected ? (
          <AppointmentPanel id={selected} onChanged={refresh} onSessionExpired={onSessionExpired} />
        ) : (
          <div className="appt-placeholder">
            <p className="muted">Select an appointment to see its status and chat.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Half-hour appointment slots from 7:00 to 18:30. */
const TIME_SLOTS = Array.from({ length: 24 }, (_, i) => {
  const mins = 7 * 60 + i * 30;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${mins % 60 === 0 ? '00' : '30'}`;
});

const slotLabel = (t: string): string => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** "Book an appointment" form shown on a garage's page. */
export function BookingForm(props: {
  garage: GarageDetail;
  onBooked: (appointmentId: string) => void;
  onSessionExpired: () => void;
}) {
  const { garage, onBooked, onSessionExpired } = props;
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [vehicle, setVehicle] = useState('');
  const [plate, setPlate] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (sid: string) => setPicked((p) => (p.includes(sid) ? p.filter((x) => x !== sid) : [...p, sid]));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (picked.length === 0) return setError('Choose at least one service.');
    if (vehicle.trim().length < 2) return setError('Enter your car make and model.');
    if (!/^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$/.test(plate.trim())) return setError('Enter your number plate (letters and numbers only).');
    if (!date) return setError('Choose a date.');
    setBusy(true);
    try {
      const r = await api.bookAppointment({
        garageId: garage.id,
        serviceIds: picked,
        vehicle: vehicle.trim(),
        plate: plate.trim().toUpperCase(),
        date,
        time,
        notes: notes.trim(),
      });
      onBooked(r.appointment.id);
    } catch (err) {
      if (err instanceof api.ApiError && err.status === 401) onSessionExpired();
      else setError(err instanceof Error ? err.message : 'Could not book.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="book-cta">
        <div>
          <h3>Ready to book?</h3>
          <p className="muted">Send {garage.name} a request. They&apos;ll accept it, and you can chat and follow the work here.</p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => setOpen(true)}>
          Book an appointment
        </button>
      </div>
    );
  }

  return (
    <form className="book-form" onSubmit={submit} noValidate>
      <h3>Book at {garage.name}</h3>
      <fieldset>
        <legend>Which services?</legend>
        <div className="svc-pick">
          {garage.services.map((s) => (
            <label key={s.id} className={`pick ${picked.includes(s.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggle(s.id)} />
              <span>
                {s.name}
                {garage.mode === 'listing' && s.price > 0 && (
                  <b>
                    {' '}from ${s.finalPrice}
                    {s.discount > 0 && <> ({s.discount}% off)</>}
                  </b>
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="two">
        <label>
          Car make and model
          <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="e.g. Honda Civic 2018" maxLength={60} autoComplete="off" />
        </label>
        <label>
          Number plate
          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            placeholder="e.g. ABC 1234"
            maxLength={10}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </div>
      <div className="two">
        <label>
          Date
          <input type="date" value={date} min={localToday()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Time
          <select value={time} onChange={(e) => setTime(e.target.value)}>
            {TIME_SLOTS.map((t) => (
              <option key={t} value={t}>
                {slotLabel(t)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Short note for the garage <small>(optional, max 120 characters)</small>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={120} placeholder="e.g. Grinding noise when braking" />
      </label>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <div className="action-row">
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Sending...' : 'Send booking request'}
        </button>
      </div>
    </form>
  );
}
