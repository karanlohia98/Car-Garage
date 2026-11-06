import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Admin from './Admin';
import App from './App';
import SitePage from './SitePage';
import { loadConfig } from './config';
import './styles.css';

// Tiny path router: /admin = platform admin, /g/{id} = a garage's own page, anything else = the directory.
const path = window.location.pathname;
const route = path.replace(/\/$/, '') || '/';
const siteId = /^\/g\/([^/]+)\/?$/.exec(path)?.[1];

// Country settings (currency, PIN/ZIP wording) are loaded before anything renders.
void loadConfig().then(() =>
  createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    {route === '/admin' ? <Admin /> : siteId ? <SitePage id={decodeURIComponent(siteId)} /> : <App home={route === '/owners' ? 'owner' : 'driver'} />}
  </StrictMode>,
  ),
);
