# Redline Auto Garage

A one-page car servicing garage website.

- **Frontend:** React 19 + TypeScript, bundled with esbuild (`frontend/`)
- **Backend:** Java 17+ using only the JDK's built-in HTTP server, no dependencies (`backend/`)
- **Flow:** visitors see the landing page; they must **sign up / log in** to see the service options and pricing.

## Run it locally

Requirements: JDK 17+ and Node 18+.

```bash
./run.sh
```

Then open <http://localhost:8080>. The script installs frontend dependencies (first run only), builds both
halves and starts one server that serves the API and the React app on the same port.

Manual steps, if you prefer:

```bash
cd frontend && npm install && npm run build      # outputs frontend/dist
cd ../backend && mkdir -p out && javac -d out src/main/java/garage/*.java
java -cp out garage.Main                          # run from backend/
```

Optional environment variables: `PORT` (default 8080), `STATIC_DIR` (default `../frontend/dist`),
`DATA_FILE` (default `data/users.tsv`).

Type-check the frontend with `npm run typecheck` (inside `frontend/`).

## API

| Method | Path            | Auth   | Description                            |
|--------|-----------------|--------|----------------------------------------|
| POST   | `/api/signup`   | none   | `{name,email,password}` -> `{token,user}` |
| POST   | `/api/login`    | none   | `{email,password}` -> `{token,user}`      |
| GET    | `/api/me`       | Bearer | current user                           |
| POST   | `/api/logout`   | Bearer | ends the session                       |
| GET    | `/api/services` | Bearer | services and prices (login required)   |

Service prices are enforced server-side: `/api/services` returns `401` without a valid session token.

## Notes

- Passwords are hashed with PBKDF2-HMAC-SHA256 (120k iterations, per-user salt). Users are stored in
  `backend/data/users.tsv` (git-ignored); sessions are in memory and last 12 hours.
- This is a starter, not production-ready: no HTTPS, rate limiting or email verification, and the file-based
  user store is meant for local use. Swap in a real database before deploying.
- The business name, address, phone number and prices are sample data. All artwork is hand-drawn SVG and the icons
  come from [react-icons](https://react-icons.github.io/react-icons/) (Font Awesome, free licence), so there are no
  third-party image downloads.
