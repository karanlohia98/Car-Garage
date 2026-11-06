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
];

const GARAGE_BUTTON: Record<string, string> = {
  booked: 'Accept appointment',
  declined: 'Decline',
  at_garage: 'Car has arrived at the garage',
  in_progress: 'Start the work',
  completed: 'Mark work completed',
  cancelled: 'Cancel appointment',
};
const CUSTOMER_BUTTON: Record<string, string> = { cancelled: 'Cancel my appointment' };
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
  return (
    <ol className="stepper" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li
          key={s.status}
          className={i < current ? 'done' : i === current ? (status === 'completed' ? 'done current' : 'current') : ''}
          aria-current={i === current ? 'step' : undefined}
        >
          <span>{i < current || status === 'completed' ? '✓' : i + 1}</span>
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
  const open = s.status === 'requested' || s.status === 'booked' || s.status === 'at_garage' || s.status === 'in_progress';
  if (filter === 'action') return s.status === 'requested';
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
                {garage.mode === 'listing' && s.price > 0 && <b> from ${s.price}</b>}
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
