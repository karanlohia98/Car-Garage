# Garage Hub

A one-page directory of car garages.

- **Frontend:** React 19 + TypeScript, bundled with esbuild (`frontend/`)
- **Backend:** Java 17+ using only the JDK's built-in HTTP server, no dependencies (`backend/`)

## How it works

**Drivers (customers)**
1. Browse the public list of garages, search by name/area/city and filter by service.
2. Sign up or log in (choose the *Driver* tab) to open a garage and see its services and prices.
3. If a garage prefers to publish prices on its own site, the driver sees its services and a "Visit their website" button.

**Garage owners**
1. Sign up on the *Garage owner* tab ("List my garage" on the home page).
2. Answer a few questions in the dashboard: name, location and hours, how customers should see prices, and services.
3. Choose **either**:
   - *Send customers to my website*: enter your site address; customers are linked to it, or
   - *List my services and prices here*: tick services from a standard list (or add your own) and enter a price for each.
4. Publish. You can unpublish or edit your answers any time.

Drivers and garage owners have separate accounts and separate screens. A driver cannot reach the garage dashboard
(the API returns 403), and garage owners can only edit their own garage.

## Run it locally

Requirements: JDK 17+ and Node 18+.

```bash
./run.sh
```

Then open <http://localhost:8080>. The script installs frontend dependencies (first run only), builds both
halves and starts one server that serves the API and the React app on the same port.

Manual steps:

```bash
cd frontend && npm install && npm run build      # outputs frontend/dist
cd ../backend && mkdir -p out && javac -d out src/main/java/garage/*.java
java -cp out garage.Main                          # run from backend/
```

On first start the server creates five sample garages in `backend/data/garages.json`. Delete the `backend/data`
folder to reset everything, or start with `SEED_SAMPLES=false` for an empty directory.

Environment variables (all optional): `PORT` (8080), `STATIC_DIR` (`../frontend/dist`), `DATA_FILE`
(`data/users.tsv`), `GARAGES_FILE` (`data/garages.json`), `SEED_SAMPLES` (`true`).

Type-check the frontend with `npm run typecheck` (inside `frontend/`).

## API

| Method | Path               | Auth                | Description |
|--------|--------------------|---------------------|-------------|
| POST   | `/api/signup`      | none                | `{name,email,password,role}` where role is `customer` (default) or `garage` |
| POST   | `/api/login`       | none                | `{email,password}` -> `{token,user}` |
| GET    | `/api/me`          | Bearer              | current user (includes `role`) |
| POST   | `/api/logout`      | Bearer              | ends the session |
| GET    | `/api/catalog`     | none                | standard service list garages can pick from |
| GET    | `/api/garages`     | none                | published garages and the services they offer, **no prices** |
| GET    | `/api/garages/{id}`| Bearer              | one garage with prices or website link |
| GET    | `/api/my/garage`   | Bearer, garage role | the owner's own garage (or `null`) |
| PUT    | `/api/my/garage`   | Bearer, garage role | create or update the owner's garage |

Prices are enforced server-side: `/api/garages/{id}` returns `401` without a valid session token, and the public
list never contains prices. All garage input is validated on the server (lengths, phone format, whole-dollar prices,
`http(s)` website URLs only, known catalog service ids, at most 20 services).

## Notes

- Passwords are hashed with PBKDF2-HMAC-SHA256 (120k iterations, per-user salt). Users are stored in
  `backend/data/users.tsv` and garages in `backend/data/garages.json` (both git-ignored); sessions are in memory and
  last 12 hours.
- This is a starter, not production-ready: no HTTPS, rate limiting, email verification or password reset, and the
  file-based stores are meant for local use. Swap in a real database before deploying. Garage accounts are not
  verified, so in production you would want an approval step before a garage goes live.
- The sample garages, addresses, phone numbers, ratings and prices are made up. All artwork is hand-drawn SVG and
  the icons come from [react-icons](https://react-icons.github.io/react-icons/) (Font Awesome, free licence).
