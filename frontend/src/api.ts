import { localizeData, t } from './i18n';
export type PricingMode = 'listing' | 'website';

/** Separate login for drivers and garage owners (the same email may hold one of each). */
export type Role = 'driver' | 'garage';

export interface User {
  name: string;
  email: string;
  /** Drivers and garage owners have separate logins. */
  role: Role;
  hasGarage: boolean;
}

/** Public summary: which services a garage offers, no prices. */
export interface GarageSummary {
  id: string;
  name: string;
  city: string;
  area: string;
  zip: string;
  rating: number;
  reviews: number;
  hours: string;
  tagline: string;
  mode: PricingMode;
  serviceIds: string[];
  serviceNames: string[];
  /** How close this garage is to the searched ZIP, e.g. "Same ZIP code". */
  nearness?: string;
}

/** How far around the ZIP code to look. The server matches on ZIP prefixes, so these are approximate areas. */
export interface Theme {
  accent: string;
  mode: 'light' | 'dark';
  font: 'modern' | 'classic' | 'rounded';
  headline: string;
  about: string;
}

export const DEFAULT_THEME: Theme = { accent: '#ff6a1a', mode: 'dark', font: 'modern', headline: '', about: '' };

/** Public data for a garage's own page (no prices). */
export interface SiteData extends GarageSummary {
  services: SiteService[];
  payMethods: PayMethod[];
  reviewList: Review[];
  address: string;
  phone: string;
  theme: Theme;
  live: boolean;
}

export type PayMethod = 'cash' | 'card' | 'upi' | 'transfer' | 'online';
export const PAY_LABELS: Record<PayMethod, string> = {
  cash: t('Cash'),
  card: t('Card at the garage'),
  upi: 'UPI',
  transfer: t('Bank transfer'),
  online: t('Online payment link'),
};

/** How a garage accepts payment. Payments are tracked here, but made directly to the garage. */
export interface PayInfo {
  methods: PayMethod[];
  link: string;
  note: string;
}

export interface Review {
  name: string;
  rating: number;
  comment: string;
  at: string;
}

export interface SiteService {
  id: string;
  name: string;
  description: string;
  duration: string;
  discount: number;
}

export type Range = 'exact' | 'near' | 'wide';

export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: string;
  badge: string;
  /** Percent off (0 = none). finalPrice is what the customer pays. */
  discount: number;
  finalPrice: number;
}

/** Full garage details with prices (login required). */
export interface GarageDetail {
  id: string;
  name: string;
  city: string;
  area: string;
  zip: string;
  address: string;
  phone: string;
  rating: number;
  reviews: number;
  hours: string;
  tagline: string;
  mode: PricingMode;
  website: string;
  pay: PayInfo;
  services: Service[];
  /** True when the signed-in user owns this garage (so the UI hides "Book"). */
  mine?: boolean;
}

export type CheckState = 'ok' | 'attention' | 'notchecked';
export interface CheckItem { item: string; state: CheckState; note: string }
export interface WorkLine { kind: 'part' | 'labour'; text: string; qty: number; unit: number; total?: number }

/** The workshop's digital job card for one appointment. */
export interface JobCard {
  exists: boolean;
  odometer: number;
  fuel: string;
  technician: string;
  checklist: CheckItem[];
  work: WorkLine[];
  /** Approval state of the extra work. */
  estimate: 'none' | 'sent' | 'approved' | 'declined';
  estimateTotal: number;
  extraTotal: number;
  bookedTotal: number;
  /** Date (YYYY-MM-DD) the next service is due; the customer is reminded by WhatsApp a week before. */
  nextDue: string;
}

export interface JobCardInput {
  odometer: number;
  fuel: string;
  technician: string;
  checklist: CheckItem[];
  work: WorkLine[];
  nextDue: string;
}

export interface Photo { id: string; caption: string; at: string }

export type PayStatus = 'unpaid' | 'reported' | 'paid';

export type ApptStatus = 'requested' | 'booked' | 'at_garage' | 'in_progress' | 'completed' | 'picked_up' | 'declined' | 'cancelled';

export interface ApptSummary {
  id: string;
  garageId: string;
  garageName: string;
  customerName: string;
  vehicle: string;
  plate: string;
  date: string;
  time: string;
  status: ApptStatus;
  statusLabel: string;
  services: string[];
  total: number;
  payStatus: PayStatus;
  unread: number;
  updatedAt: string;
}

export interface ApptMessage {
  from: 'customer' | 'garage' | 'system';
  name: string;
  text: string;
  at: string;
}

export interface ApptDetail {
  id: string;
  /** Which side the signed-in user is on for this appointment. */
  role: 'customer' | 'garage';
  garageId: string;
  garageName: string;
  garagePhone: string;
  garageAddress: string;
  customerName: string;
  /** Only filled in for the garage side, and only if the driver gave a mobile number. */
  customerPhone: string;
  vehicle: string;
  plate: string;
  date: string;
  time: string;
  notes: string;
  status: ApptStatus;
  statusLabel: string;
  services: { name: string; price: number }[];
  total: number;
  createdAt: string;
  updatedAt: string;
  messages: ApptMessage[];
  /** Status changes the signed-in user may make right now (enforced by the server). */
  actions: { status: ApptStatus; label: string }[];
  canChat: boolean;
  payStatus: PayStatus;
  payMethod: string;
  canPay: boolean;
  canReview: boolean;
  review: { rating: number; comment: string; at: string } | null;
  garagePay: PayInfo | null;
  card: JobCard;
  cardItems: string[];
  canEditCard: boolean;
  photos: Photo[];
  canAddPhoto: boolean;
}

export interface BookingInput {
  garageId: string;
  serviceIds: string[];
  vehicle: string;
  plate: string;
  /** Optional mobile number for WhatsApp updates. */
  phone?: string;
  date: string;
  time: string;
  notes: string;
}

/** A garage as seen by its owner (includes draft state). */
export type Approval = 'pending' | 'approved' | 'rejected';

export interface OwnerGarage extends GarageDetail {
  published: boolean;
  theme: Theme;
  /** Set by the platform admin. Only approved, published garages are visible to drivers. */
  approval: Approval;
  reviewNote: string;
}

export interface AdminGarage extends OwnerGarage {
  ownerEmail: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  description: string;
}

export interface ServiceInput {
  id: string;
  name?: string;
  description?: string;
  price?: number;
  duration?: string;
  discount?: number;
}

export interface GarageInput {
  name: string;
  city: string;
  area: string;
  zip: string;
  address: string;
  phone: string;
  hours: string;
  tagline: string;
  mode: PricingMode;
  website: string;
  published: boolean;
  theme: Theme;
  pay: PayInfo;
  services: ServiceInput[];
}

interface AuthResponse {
  token: string;
  user: User;
}

const TOKEN_KEY = 'garage.token';

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token: string | null): void => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: session lasts until reload */
  }
};

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? 'Something went wrong. Please try again.';
    throw new ApiError(t(msg), res.status);
  }
  return localizeData(data) as T;
}

export const signup = (name: string, email: string, password: string, role: Role) =>
  request<AuthResponse>('/api/signup', { method: 'POST', body: JSON.stringify({ name, email, password, role }) });

export const login = (email: string, password: string, role: Role) =>
  request<AuthResponse>('/api/login', { method: 'POST', body: JSON.stringify({ email, password, role }) });

export const me = () => request<{ user: User }>('/api/me');

export const logout = () => request<{ ok: boolean }>('/api/logout', { method: 'POST' });

export const fetchCatalog = () => request<{ services: CatalogItem[] }>('/api/catalog');

export interface Where {
  zip: string;
  range: Range;
}

/** Garages near a ZIP code. Without a ZIP the server returns nothing: drivers always pick a location first. */
export const fetchGarages = (w: Where) =>
  request<{ garages: GarageSummary[] }>(`/api/garages?zip=${encodeURIComponent(w.zip)}&range=${w.range}`);

/** Fallback search by city or neighbourhood name, for garages that have no ZIP on file. */
export const fetchGaragesByCity = (city: string) =>
  request<{ garages: GarageSummary[] }>(`/api/garages?city=${encodeURIComponent(city)}`);

export const fetchGarage = (id: string) =>
  request<{ garage: GarageDetail }>(`/api/garages/${encodeURIComponent(id)}`);

export const bookAppointment = (input: BookingInput) =>
  request<{ appointment: ApptDetail }>('/api/appointments', { method: 'POST', body: JSON.stringify(input) });

/** Appointments I booked as a driver. */
export const fetchMyBookings = () => request<{ appointments: ApptSummary[] }>('/api/appointments');

/** Appointments booked at my garage. */
export const fetchGarageAppointments = () => request<{ appointments: ApptSummary[] }>('/api/my/appointments');

export const fetchAppointment = (id: string) =>
  request<{ appointment: ApptDetail }>(`/api/appointments/${encodeURIComponent(id)}`);

export const sendMessage = (id: string, text: string) =>
  request<{ appointment: ApptDetail }>(`/api/appointments/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });

export const setStatus = (id: string, status: ApptStatus, note: string) =>
  request<{ appointment: ApptDetail }>(`/api/appointments/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    body: JSON.stringify({ status, note }),
  });

export const fetchMyGarage = () => request<{ garage: OwnerGarage | null }>('/api/my/garage');

export const saveMyGarage = (input: GarageInput) =>
  request<{ garage: OwnerGarage }>('/api/my/garage', { method: 'PUT', body: JSON.stringify(input) });


// ---------- platform admin (separate sign-in, separate token) ----------

const ADMIN_KEY = 'garage.admin';

export const getAdminToken = (): string | null => {
  try {
    return sessionStorage.getItem(ADMIN_KEY);
  } catch {
    return null;
  }
};

export const setAdminToken = (t: string | null): void => {
  try {
    if (t) sessionStorage.setItem(ADMIN_KEY, t);
    else sessionStorage.removeItem(ADMIN_KEY);
  } catch {
    /* ignore */
  }
};

const adminRequest = <T,>(path: string, init: RequestInit = {}) =>
  request<T>(path, { ...init, headers: { Authorization: `Bearer ${getAdminToken() ?? ''}` } });

export const adminLogin = (username: string, password: string) =>
  request<{ token: string }>('/api/admin/login', { method: 'POST', body: JSON.stringify({ username, password }), headers: { Authorization: '' } });

export const adminGarages = (status = '') =>
  adminRequest<{ garages: AdminGarage[]; pending: number }>(`/api/admin/garages${status ? `?status=${status}` : ''}`);

export const adminDecide = (id: string, decision: 'approve' | 'reject', note: string) =>
  adminRequest<{ garage: AdminGarage }>(`/api/admin/garages/${encodeURIComponent(id)}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision, note }),
  });

export const adminLogout = () => adminRequest<{ ok: boolean }>('/api/admin/logout', { method: 'POST' });

export const fetchSite = (id: string) => request<{ garage: SiteData }>(`/api/sites/${encodeURIComponent(id)}`);

export const payAppointment = (id: string, action: 'report' | 'confirm', method: string) =>
  request<{ appointment: ApptDetail }>(`/api/appointments/${encodeURIComponent(id)}/payment`, {
    method: 'POST',
    body: JSON.stringify({ action, method }),
  });

export const reviewAppointment = (id: string, rating: number, comment: string) =>
  request<{ appointment: ApptDetail }>(`/api/appointments/${encodeURIComponent(id)}/review`, {
    method: 'POST',
    body: JSON.stringify({ rating, comment }),
  });

export const saveJobCard = (id: string, input: JobCardInput) =>
  request<{ appointment: ApptDetail }>(`/api/appointments/${encodeURIComponent(id)}/jobcard`, { method: 'PUT', body: JSON.stringify(input) });

export const estimateAction = (id: string, action: 'send' | 'approve' | 'decline') =>
  request<{ appointment: ApptDetail }>(`/api/appointments/${encodeURIComponent(id)}/estimate`, { method: 'POST', body: JSON.stringify({ action }) });

/** Uploads one (already shrunk) photo to a job. */
export async function uploadPhoto(id: string, blob: Blob, caption: string): Promise<{ appointment: ApptDetail }> {
  const headers: Record<string, string> = { 'Content-Type': blob.type || 'image/jpeg' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api/appointments/${encodeURIComponent(id)}/photos?caption=${encodeURIComponent(caption)}`, { method: 'POST', headers, body: blob });
  const data = (await res.json().catch(() => null)) as ({ appointment: ApptDetail } & { error?: string }) | null;
  if (!res.ok || !data) throw new ApiError(data?.error ?? 'Could not upload the photo.', res.status);
  return data;
}

/** Photos need the sign-in header, so they are fetched and shown from a temporary object URL. */
export async function fetchPhotoUrl(id: string, photoId: string): Promise<string> {
  const token = getToken();
  const res = await fetch(`/api/appointments/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError('Could not load the photo.', res.status);
  return URL.createObjectURL(await res.blob());
}

export const deletePhoto = (id: string, photoId: string) =>
  request<{ appointment: ApptDetail }>(`/api/appointments/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}`, { method: 'DELETE' });
