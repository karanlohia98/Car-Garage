/** Country settings from the server (COUNTRY env): currency, postal code wording and length, number format. */
export interface Config {
  country: string;
  currency: string;
  postalLabel: string;
  postalLength: number;
  locale: string;
  maxPrice: number;
}

export let cfg: Config = { country: 'IN', currency: '₹', postalLabel: 'PIN code', postalLength: 6, locale: 'en-IN', maxPrice: 200000 };

export async function loadConfig(): Promise<void> {
  try {
    const r = await fetch('/api/config');
    if (r.ok) cfg = (await r.json()) as Config;
  } catch {
    /* keep the defaults */
  }
}

export const money = (n: number): string => `${cfg.currency}${Math.round(n).toLocaleString(cfg.locale)}`;
export const postalRe = (): RegExp => new RegExp(`^\\d{${cfg.postalLength}}$`);
export const postalExample = (): string => (cfg.country === 'US' ? '98108' : '380009');
