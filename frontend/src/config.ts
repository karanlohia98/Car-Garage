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
export const postalExample = (): string => (cfg.country === 'US' ? '98108' : '380015');

/** A click-to-chat WhatsApp link (works without any account setup). Returns '' if the number is unusable. */
export function waLink(phone: string, text: string): string {
  let d = phone.replace(/\D/g, '');
  const code = cfg.country === 'US' ? '1' : '91';
  if (d.length === 10) d = code + d;
  else if (d.length === 11 && d.startsWith('0')) d = code + d.slice(1);
  return d.length >= 11 && d.length <= 15 ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : '';
}
