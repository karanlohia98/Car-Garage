# Garage Hub

A one-page directory of car garages.

- **Frontend:** React 19 + TypeScript, bundled with esbuild (`frontend/`)
- **Backend:** Java 17+ using only the JDK's built-in HTTP server, no dependencies (`backend/`)

## How it works

**Separate logins.** Drivers and garage owners sign up and log in separately (use the *Driver* / *Garage owner*
switch in the sign-in window, or the *Driver login* / *Garage login* buttons). The same email can hold one account of
each kind, each with its own password. Garage owner accounts only see the garage dashboard (appointments, chat,
profile); driver accounts only see the directory and *My bookings*. The server enforces this: garage accounts can't
book, driver accounts can't manage a garage. Accounts created before roles existed still work for both logins.

**Two front doors.** Drivers use `/`; garage owners use `/owners`. Each home page shows only its own options, and a
signed-in account is sent to its own side.

**Drivers**
1. Browse the garages near their ZIP code, search by name/area/city and filter by service.
2. Choosing a garage opens that garage's own page (`/g/{id}`). Signing in as a driver there shows its prices and lets them book.
3. If a garage prefers to publish prices on its own site, the driver sees its services and a "Visit their website" button.

**Garage owners**
1. Click **Register my garage** and create a garage owner account (or use **Garage login**).
2. Answer a few questions in the dashboard: name, location and hours, how customers should see prices, and services.
3. Choose **either**:
   - *Send customers to my website*: enter your site address; customers are linked to it, or
   - *List my services and prices here*: tick services from a standard list (or add your own) and enter a price for each.
4. Publish. You can unpublish or edit your answers any time.

Each account can only read and edit its own garage profile.

**Location.** On a first visit the browser asks to share the visitor's location; if they allow it, the ZIP code is filled in automatically (coordinates are turned into a ZIP by OpenStreetMap's Nominatim service, called from the browser, US only). If they decline, or on any failure, they type their ZIP instead. A *Use my location* button retries. Drivers enter a ZIP code and a range (my ZIP / around my ZIP / my wider area) and only garages in that
area are listed, nearest first. The choice is remembered in the browser. Matching is by ZIP prefix (same ZIP, same
first 4 digits, same first 3 digits), so it is an approximation of distance, not exact miles. Garages saved before ZIP
existed get one from their address if it contains one; otherwise the owner is asked to add it.

**Admin approval.** New garages are *pending* until the platform admin approves them at `/admin`. Rejections need a
reason, which the owner sees. Garages that existed before this feature are treated as approved. On first start the
server creates the admin account with a random username and password, stores only a hash in `data/admin.json`, and
writes the plain credentials once to `admin-credentials.txt` (git-ignored; delete it after saving them). Set
`ADMIN_USERNAME` and `ADMIN_PASSWORD` (12+ characters) to choose your own. Five wrong logins lock the admin login for 10 minutes.

**Each garage's own page.** Every garage has a page at `/g/{garage-id}` that works as its own website: headline, about
line, services, hours, address, phone and booking. Owners choose accent colour, light or dark, font style, headline and
about line in the **Your page** step. Prices and booking still need a signed-in customer. Owners can preview the page
before approval.

## Services, offers, payments and reviews

- Every service has a one-line description (ticking a standard service fills in a ready-made description and a typical
  duration that the owner can reword) and an optional **percentage discount** (1-90%). Customers see the original and
  discounted price, and bookings use the discounted price.
- **Payment** is tracked, not processed. Garages choose how they accept payment: cash, card at the garage, bank transfer,
  or their own online payment link (e.g. a Stripe, PayPal or Square payment link). After the work is completed the
  driver picks a method and taps *I've paid*, and the garage confirms receipt. No card details ever touch this site.
  Taking card payments directly in the site would need a payment provider account and keys.
- **Reviews:** after the work is completed, the driver can leave one 1-5 star review with a one-line comment per job.
  The garage's average rating updates and recent reviews appear on its page.
- After *Work completed* the job has a final step, **Car picked up**, which either the garage or the driver can mark.

## Digital job card

Each appointment has a job card that replaces the paper card in the workshop. Once a booking is accepted the garage can
record the odometer, fuel level and technician, run through an inspection checklist (brakes, tires, lights, battery,
fluids, wipers, suspension, engine bay: OK / needs attention / not checked, with a short note), and add extra parts and
labour with quantities and prices. The total (booked services + extra work) updates as they type and feeds the payment
step. Extra work is sent to the driver as an estimate, which they approve or decline; changing the extra work afterwards
sends it back for approval. Drivers see the card read-only, and either side can print it. The card locks once the car is
picked up. Photos and PDF export are not included yet.

## Appointments and chat

1. A driver opens a garage, clicks **Book an appointment**, picks services, their car, a date and time, and sends the
   request. It appears under **My bookings**.
2. The garage sees it under **My garage > Appointments** (with an unread badge) and can **accept** or **decline** it,
   adding a note to the customer.
3. Each appointment has its own **chat** between driver and garage. Both sides see new messages within a few seconds.
4. The garage moves the job through the status tracker and can attach an update note at every step:

   `Appointment booked` -> `Car at the garage` -> `Work in progress` -> `Work completed` -> `Car picked up`

   (A booking starts as *waiting for the garage to accept*. The garage can also decline it. The driver can cancel
   until the car is at the garage.)

Every status change appears in the chat timeline. The server enforces who can do what: only the garage can accept and
advance a job, steps can't be skipped or reversed, only the two people involved can see an appointment, and you can't
book your own garage. Chat is single-line plain text (markup is shown, never executed), limited to 300 characters per message. Bookings take the car make/model and number plate in separate fields.

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
folder to reset everything (this also removes the admin account, which is then regenerated), or start with `SEED_SAMPLES=false` for an empty directory.

Environment variables (all optional): `HOST` (`127.0.0.1`; use `0.0.0.0` on a server), `PORT` (8080), `STATIC_DIR`
(`../frontend/dist`), `DATA_FILE` (`data/users.tsv`), `GARAGES_FILE` (`data/garages.json`), `APPOINTMENTS_FILE`
(`data/appointments.json`), `ADMIN_FILE` (`data/admin.json`), `ADMIN_CREDENTIALS_FILE` (`admin-credentials.txt`),
`ADMIN_USERNAME`/`ADMIN_PASSWORD`, `SEED_SAMPLES` (`true`).

To put it online cheaply, see [HOSTING.md](HOSTING.md) (includes a `Dockerfile`).

Type-check the frontend with `npm run typecheck` (inside `frontend/`).

## India / country settings

`COUNTRY=IN` (default) uses 6-digit PIN codes, rupees (₹, Indian digit grouping) and UPI as a payment method; PIN search
matches by prefix (same PIN, nearby, wider area). `COUNTRY=US` uses 5-digit ZIP codes and dollars. The frontend reads
`/api/config`. Fresh installs seed Ahmedabad sample garages (invented) unless `SEED_SAMPLES=false`.

## API

| Method | Path               | Auth                | Description |
|--------|--------------------|---------------------|-------------|
| POST   | `/api/signup`      | none                | `{name,email,password,role}` (`role`: `driver` or `garage`) -> `{token,user}` |
| POST   | `/api/login`       | none                | `{email,password,role}` -> `{token,user}` |
| GET    | `/api/me`          | Bearer              | current user (`role`, `hasGarage`) |
| POST   | `/api/logout`      | Bearer              | ends the session |
| GET    | `/api/catalog`     | none                | standard service list garages can pick from |
| GET    | `/api/garages?zip=&range=` | none        | approved, published garages near a ZIP (`range`: `exact`, `near`, `wide`), **no prices** |
| GET    | `/api/sites/{id}`  | none                | public data for a garage's own page (owner can preview before approval) |
| POST   | `/api/admin/login` | none                | `{username,password}` -> admin token |
| GET/POST | `/api/admin/garages[/{id}/decision]` | admin token | review queue; `{decision:"approve"\|"reject",note}` |
| GET    | `/api/garages/{id}`| Bearer              | one garage with prices or website link |
| GET    | `/api/my/garage`   | Bearer              | your own garage profile (or `null`) |
| PUT    | `/api/my/garage`   | Bearer              | create or update your garage profile |
| POST   | `/api/appointments` | Bearer             | book: `{garageId,serviceIds,vehicle,plate,date,time,notes}` |
| GET    | `/api/appointments` | Bearer             | my bookings as a driver |
| GET    | `/api/my/appointments` | Bearer          | bookings made at my garage |
| GET    | `/api/appointments/{id}` | Bearer        | details and chat (only the driver or that garage's owner); marks it read |
| POST   | `/api/appointments/{id}/messages` | Bearer | `{text}` |
| POST   | `/api/appointments/{id}/status` | Bearer | `{status,note?}`, allowed transitions only |

Prices are enforced server-side: `/api/garages/{id}` returns `401` without a valid session token, and the public
list never contains prices. All garage input is validated on the server (lengths, phone format, whole-dollar prices,
`http(s)` website URLs only, known catalog service ids, at most 20 services).

## Notes

- Passwords are hashed with PBKDF2-HMAC-SHA256 (120k iterations, per-user salt). Users are stored in
  `backend/data/users.tsv`, garages in `garages.json` and appointments/chats in `appointments.json` (all git-ignored);
  sessions are in memory and last 12 hours.
- Chat is refreshed by polling (every 5 s while a conversation is open), not push. There are no email/SMS
  notifications yet, so a garage only sees a new booking while the site is open.
- This is a starter, not production-ready: no HTTPS, rate limiting, email verification or password reset, and the
  file-based stores are meant for local use. Swap in a real database before deploying. Garage accounts are not
  verified, so in production you would want an approval step before a garage goes live.
- The sample garages, addresses, phone numbers, ratings and prices are made up. All artwork is hand-drawn SVG and
  the icons come from [react-icons](https://react-icons.github.io/react-icons/) (Font Awesome, free licence).
