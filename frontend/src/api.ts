export interface User {
  name: string;
  email: string;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: string;
  badge: string;
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
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export const signup = (name: string, email: string, password: string) =>
  request<AuthResponse>('/api/signup', { method: 'POST', body: JSON.stringify({ name, email, password }) });

export const login = (email: string, password: string) =>
  request<AuthResponse>('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) });

export const me = () => request<{ user: User }>('/api/me');

export const logout = () => request<{ ok: boolean }>('/api/logout', { method: 'POST' });

export const fetchServices = () => request<{ services: Service[] }>('/api/services');
