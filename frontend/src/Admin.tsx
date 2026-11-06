import { FormEvent, useCallback, useEffect, useState } from 'react';
import { FaCheckCircle, FaMapMarkerAlt, FaPhoneAlt, FaTimesCircle } from 'react-icons/fa';
import * as api from './api';
import type { AdminGarage } from './api';
import { fullAddress } from './shared';
import { money } from './config';

type Filter = 'pending' | 'approved' | 'rejected' | '';

/** Platform admin: separate sign-in at /admin. Reviews garages before they go live. */
export default function Admin() {
  const [signedIn, setSignedIn] = useState<boolean>(!!api.getAdminToken());

  const signOut = useCallback(async () => {
    try {
      await api.adminLogout();
    } catch {
      /* ignore */
    }
    api.setAdminToken(null);
    setSignedIn(false);
  }, []);

  return (
    <div className="admin">
      <header className="admin-top">
        <b>Garage Hub admin</b>
        {signedIn && (
          <button className="btn btn-ghost" onClick={signOut}>
            Sign out
          </button>
        )}
      </header>
      <main className="wrap admin-main">
        {signedIn ? <Review onExpired={() => { api.setAdminToken(null); setSignedIn(false); }} /> : <Login onDone={() => setSignedIn(true)} />}
      </main>
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.adminLogin(username.trim(), password);
      api.setAdminToken(r.token);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="admin-login card" onSubmit={submit}>
      <h1>Admin sign in</h1>
      <label>
        Username
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
      </label>
      <label>
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </label>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <button className="btn btn-primary" disabled={busy || !username || !password}>
        {busy ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  );
}

function Review({ onExpired }: { onExpired: () => void }) {
  const [filter, setFilter] = useState<Filter>('pending');
  const [list, setList] = useState<AdminGarage[] | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .adminGarages(filter)
      .then((r) => {
        setList(r.garages);
        setPending(r.pending);
        setError(null);
      })
      .catch((e: api.ApiError) => (e.status === 401 ? onExpired() : setError(e.message)));
  }, [filter, onExpired]);

  useEffect(() => {
    setList(null);
    load();
    const t = setInterval(() => !document.hidden && load(), 10000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <>
      <h1>Garage requests</h1>
      <div className="chips" role="group" aria-label="Filter">
        {([['pending', `Waiting (${pending})`], ['approved', 'Approved'], ['rejected', 'Rejected'], ['', 'All']] as [Filter, string][]).map(([f, label]) => (
          <button key={f || 'all'} className={`chip ${filter === f ? 'on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {label}
          </button>
        ))}
      </div>
      {error && <div className="notice error" role="alert">{error}</div>}
      {!list && !error && <div className="card skeleton" aria-busy="true" />}
      {list && list.length === 0 && <p className="muted empty">Nothing here.</p>}
      <div className="admin-list">
        {list?.map((g) => (
          <Card key={g.id} g={g} onDone={load} onExpired={onExpired} />
        ))}
      </div>
    </>
  );
}

function Card({ g, onDone, onExpired }: { g: AdminGarage; onDone: () => void; onExpired: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: 'approve' | 'reject') => {
    setBusy(true);
    setError(null);
    try {
      await api.adminDecide(g.id, decision, note);
      setNote('');
      onDone();
    } catch (e) {
      if (e instanceof api.ApiError && e.status === 401) onExpired();
      else setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card admin-card" data-garage={g.name}>
      <div className="admin-card-top">
        <h2>{g.name}</h2>
        <span className={`approval ${g.approval}`}>{g.approval}</span>
      </div>
      {g.tagline && <p className="muted">{g.tagline}</p>}
      <ul className="detail-meta">
        <li>
          <FaMapMarkerAlt /> {fullAddress(g)} {g.zip || '(no PIN/ZIP)'}
        </li>
        <li>
          <FaPhoneAlt /> {g.phone} &middot; {g.hours}
        </li>
        <li>Owner: {g.ownerEmail}</li>
        <li>{g.published ? 'Owner has published it' : 'Still a draft (owner has not published)'}</li>
        <li>{g.mode === 'website' ? <>Prices on their website: {g.website}</> : `Lists ${g.services.length} services with prices here`}</li>
      </ul>
      {g.services.length > 0 && (
        <ul className="tags" aria-label="Services">
          {g.services.map((s) => (
            <li key={s.id}>
              {s.name}
              {g.mode === 'listing' && <b> {money(s.price)}</b>}
            </li>
          ))}
        </ul>
      )}
      {g.reviewNote && <p className="muted">Last note: {g.reviewNote}</p>}
      <label className="admin-note">
        Note to the owner <small>(required when rejecting)</small>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. Phone number looks wrong" />
      </label>
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="action-row">
        {g.approval !== 'rejected' && (
          <button className="btn btn-danger" disabled={busy} onClick={() => decide('reject')}>
            <FaTimesCircle /> Reject
          </button>
        )}
        {g.approval !== 'approved' && (
          <button className="btn btn-primary" disabled={busy} onClick={() => decide('approve')}>
            <FaCheckCircle /> Approve
          </button>
        )}
      </div>
    </article>
  );
}
