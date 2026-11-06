# Hosting Garage Hub cheaply

The whole site is **one small Java process** (API plus the built React files) and three data files (accounts, garages,
appointments and chats, admin), so it needs very little: about 256 MB of memory, and a disk that survives restarts.

## The cheapest options

Prices below were checked in November 2026 and change often, so confirm on the provider's pricing page.

| Option | Roughly | Notes |
|---|---|---|
| **Small VPS** (e.g. Hetzner Cloud) | about 6 EUR/month | Smallest plan listed was 2 vCPU, 4 GB RAM, 40 GB disk for 5.99 EUR/month incl. IPv4, ex-VAT, after a June 2026 price rise. Hetzner also restricted new server creation from late June 2026, so availability may vary. Any similar VPS works. |
| **Fly.io** | about $2-6/month | No free tier. 256 MB machine about $1.94/month, 512 MB about $3.19/month (plus a small volume for the data files). |
| **Render / Railway** | about $7+/month always-on | Free tiers exist but **sleep when idle** (Render: after 15 min, about a minute to wake), which makes a login site feel broken. Check how disks work on whichever plan you pick, because accounts are stored in files. |

**Recommendation:** a small VPS for roughly 5-6 EUR/month is the simplest and cheapest *reliable* setup. Fly.io is
cheaper if you are comfortable with its CLI. Use a free sleeping tier only for demos.

You will also want a domain (roughly $10-15/year); HTTPS is free via Let's Encrypt/Caddy.

## Option A: a VPS (recommended)

On a fresh Ubuntu server (JDK, Node and Caddy installed):

```bash
git clone https://github.com/karanlohia98/Car-Garage.git && cd Car-Garage
(cd frontend && npm install && npm run build)
(cd backend && mkdir -p out && javac -d out src/main/java/garage/*.java)

cd backend
HOST=127.0.0.1 PORT=8080 SEED_SAMPLES=false java -Xmx256m -cp out garage.Main
```

Run it as a service (systemd) so it restarts, and put Caddy in front for HTTPS. A `Caddyfile` is just:

```
yourdomain.com {
    reverse_proxy 127.0.0.1:8080
}
```

## Option B: Docker (Fly.io, Render, or any VPS with Docker)

```bash
docker build -t garage-hub .
docker run -p 8080:8080 -v garage-data:/data garage-hub
```

The `-v garage-data:/data` volume is what keeps accounts and garages across restarts. On Fly.io create a volume and
mount it at `/data`. The Dockerfile sets `HOST=0.0.0.0` and `SEED_SAMPLES=false` (no fake garages in production).

## Before real users arrive

- **Back up `/data`** (four small files) regularly. Appointments and chat history are in there.
- Logins are held in memory, so everyone is signed out when the server restarts. That is fine for a start.
- Chat updates arrive by polling every few seconds (no push notifications or emails yet), so a garage only sees a
  new booking while it has the site open. Email or SMS alerts would be the next thing to add.
- There is **no rate limiting** on login, no email verification and no password reset yet.
- New garages need approval at `/admin`. On a fresh server set `ADMIN_USERNAME` and `ADMIN_PASSWORD` (12+ chars), or read the generated credentials from `admin-credentials.txt` (in `/data` in Docker) once and delete it.
- Once you have many garages or want several servers, move the data files to a database (e.g. Postgres).
