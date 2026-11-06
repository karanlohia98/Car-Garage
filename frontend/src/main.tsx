import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Admin from './Admin';
import App from './App';
import SitePage from './SitePage';
import './styles.css';

// Tiny path router: /admin = platform admin, /g/{id} = a garage's own page, anything else = the directory.
const path = window.location.pathname;
const siteId = /^\/g\/([^/]+)\/?$/.exec(path)?.[1];

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    {path.replace(/\/$/, '') === '/admin' ? <Admin /> : siteId ? <SitePage id={decodeURIComponent(siteId)} /> : <App />}
  </StrictMode>,
);
