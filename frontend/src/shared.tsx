import type { ReactElement } from 'react';
import {
  FaBolt,
  FaCarBattery,
  FaCarSide,
  FaClipboardCheck,
  FaCogs,
  FaOilCan,
  FaRegCircle,
  FaSnowflake,
  FaStar,
  FaTachometerAlt,
  FaTools,
  FaWrench,
} from 'react-icons/fa';

export const ICONS: Record<string, ReactElement> = {
  oil: <FaOilCan />,
  brakes: <FaCogs />,
  tires: <FaRegCircle />,
  battery: <FaCarBattery />,
  ac: <FaSnowflake />,
  engine: <FaTachometerAlt />,
  align: <FaCarSide />,
  inspection: <FaClipboardCheck />,
  ev: <FaBolt />,
  full: <FaTools />,
};

/** Icon for a service id; custom services fall back to a wrench. */
export const iconFor = (id: string): ReactElement => ICONS[id] ?? <FaWrench />;

export const isCustomService = (id: string): boolean => id.startsWith('custom');

export const scrollToId = (id: string) =>
  setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 80);

/** True only for plain http(s) URLs, so a link can never be a javascript: URL. */
export const isHttpUrl = (value: string): boolean => {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

/** Street address plus city, without repeating the city if the owner already typed it. */
export const fullAddress = (g: { address: string; city: string }): string =>
  g.city && !g.address.toLowerCase().includes(g.city.toLowerCase()) ? `${g.address}, ${g.city}` : g.address;

export const formatPlace =(g: { area: string; city: string }): string => [g.area, g.city].filter(Boolean).join(', ');

export function Stars({ rating, reviews }: { rating: number; reviews: number }) {
  if (!rating) {
    return (
      <span className="rating new">
        <FaStar /> <b>New</b>
      </span>
    );
  }
  return (
    <span className="rating" aria-label={`Rated ${rating} out of 5 from ${reviews} reviews`}>
      <FaStar /> <b>{rating.toFixed(1)}</b> <small>({reviews})</small>
    </span>
  );
}
