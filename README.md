# ReachInbox — Full-stack Email Job Scheduler (No Docker)

A TypeScript/Express + React implementation of the ReachInbox hiring assignment. The UI follows the supplied references: Google login, inbox navigation, scheduled/sent message rows, message detail view, and a compose screen with send-later controls.

## Stack

- API: Node.js, TypeScript, Express, Passport Google OAuth, express-session (Redis-backed)
- Queue: BullMQ + Redis delayed jobs; Bull Board at `/admin/queues`
- Database: PostgreSQL + Prisma
- SMTP: Ethereal Email (a disposable test account is created automatically if SMTP credentials are blank)
- Search: Elasticsearch indexing
- Dashboard: React + TypeScript + Vite + CSS; CSV/text lead parsing with PapaParse
- Notifications: Slack OAuth v2 incoming-webhook installation

## Important: no Docker required

This project no longer includes Docker Compose or Docker startup scripts. You will install and run the three infrastructure services directly on Windows:

1. PostgreSQL — database
2. Memurai (Redis-compatible for Windows) — BullMQ queue and sessions
3. Elasticsearch — email search index

Keep these services running while using the application. Do not close their service windows/terminals.

## 1. Install prerequisites on Windows

### A. Node.js

Install the current Node.js LTS (20 or newer) from https://nodejs.org/. During installation, keep the option to add Node to PATH enabled. Open a new PowerShell terminal and verify:

```powershell
node -v
npm -v
```

### B. PostgreSQL

1. Download the Windows installer from https://www.postgresql.org/download/windows/ (the EDB installer).
2. Run the installer and select PostgreSQL Server and pgAdmin.
3. Keep port `5432`.
4. Set a password for the `postgres` database user and remember it.
5. Finish installation. PostgreSQL normally runs as a Windows service automatically.
6. Open pgAdmin, connect to your local server, right-click **Databases** → **Create** → **Database**, and name it `reachinbox`.

### C. Redis-compatible service (Memurai)

BullMQ requires Redis. The official Redis server is not natively supported on current Windows releases, so use Memurai, a Redis-compatible Windows service:

1. Download Memurai Developer from https://www.memurai.com/get-memurai.
2. Install it with the default port `6379`.
3. Start the **Memurai** Windows service if it is not already running.
4. Open PowerShell and test:

```powershell
memurai-cli ping
```

Expected response: `PONG`. If `memurai-cli` is not on PATH, use the Memurai installation folder to run `memurai-cli.exe ping`.

### D. Elasticsearch

1. Download the Windows ZIP distribution of Elasticsearch 8.x from https://www.elastic.co/downloads/elasticsearch.
2. Extract it to a simple path, for example `C:\elasticsearch`.
3. Open `C:\elasticsearch\config\elasticsearch.yml` in Notepad or VS Code.
4. Add this development-only setting on a new line:

```yaml
xpack.security.enabled: false
```

5. Save the file.
6. Open PowerShell and run:

```powershell
cd C:\elasticsearch\bin
.\elasticsearch.bat
```

Keep this terminal open. On first startup Elasticsearch may take a minute. In another terminal, verify by opening http://localhost:9200. You should see a JSON response containing the cluster name and version.

> This security-disabled setting is only for local development. Do not expose this Elasticsearch instance to the public internet.

## 2. Extract and open the project

1. Download and extract `reachinbox-assignment.zip`.
2. Open the extracted `reachinbox-assignment` folder in VS Code.
3. In VS Code choose **Terminal → New Terminal**. Confirm the terminal is at the project root (the folder containing `backend` and `frontend`).

## 3. Create and configure the backend environment

In the VS Code terminal:

```powershell
cd backend
Copy-Item .env.example .env
```

Open `backend/.env` and edit these values:

```env
DATABASE_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/reachinbox?schema=public"
REDIS_URL="redis://localhost:6379"
ELASTICSEARCH_URL="http://localhost:9200"
SESSION_SECRET="replace-this-with-a-long-random-secret"
GOOGLE_CLIENT_ID="your-google-oauth-client-id"
GOOGLE_CLIENT_SECRET="your-google-oauth-client-secret"
```

Replace `YOUR_POSTGRES_PASSWORD` with the password you chose during PostgreSQL installation. Keep the quotation marks around the connection string. The database name must be `reachinbox`.

## 4. Configure real Google OAuth

1. Open https://console.cloud.google.com/ and create a project (for example, `ReachInbox`).
2. Open Google Auth Platform and configure the consent screen. Use External audience if offered, and add your own Gmail address as a test user.
3. Open **Clients** → **Create client** → **Web application**.
4. Add this Authorized JavaScript origin:

```text
http://localhost:4000
```

5. Add this Authorized redirect URI:

```text
http://localhost:4000/auth/google/callback
```

6. Create the client and copy the Client ID and Client Secret into `backend/.env`.

## 5. Install backend packages and create database tables

Still inside the `backend` directory, run each command:

```powershell
npm install
npx prisma generate
npx prisma migrate dev --name init
```

If Prisma reports a successful migration, your PostgreSQL tables have been created.

## 6. Start the backend API and email worker

Keep infrastructure services (PostgreSQL, Memurai, Elasticsearch) running.

Open three separate terminals in VS Code. In terminal 1:

```powershell
cd backend
npm run dev
```

The API should listen at `http://localhost:4000`.

In terminal 2:

```powershell
cd backend
npm run worker
```

The worker connects to Redis and creates/uses an Ethereal test SMTP account if SMTP_USER and SMTP_PASS are blank.

In terminal 3, check the API health endpoint in your browser:

http://localhost:4000/health

Expected response:

```json
{"ok":true,"service":"reachinbox-api"}
```

## 7. Start the React frontend

In terminal 4:

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Open http://localhost:5173. Click **Login with Google**, choose the Google account you added as a test user, and complete consent. You should return to the dashboard.

## 8. Test scheduling two emails

1. Create a text or CSV file named `test-leads.csv` with this content:

```csv
email
alice@example.com
bob@example.com
```

2. In the dashboard click **Compose**.
3. Enter a subject and message body.
4. Upload the CSV. The UI should detect two unique email addresses.
5. Set the start time to about 2–3 minutes in the future.
6. Set delay between emails to 2 seconds and hourly limit to 200.
7. Click Schedule.
8. The two jobs should appear in Scheduled. After their scheduled time, the worker should process them and the records should move to Sent (or Failed if SMTP/configuration fails).

Ethereal does not deliver mail to the real example.com inboxes. Check terminal 2 for an Ethereal preview URL for each sent message. Open each preview URL in your browser to inspect the message.

## 9. Inspect the BullMQ dashboard and Elasticsearch

- Bull Board: http://localhost:4000/admin/queues
- Elasticsearch: http://localhost:9200
- API health: http://localhost:4000/health
- Frontend: http://localhost:5173

Bull Board shows waiting, delayed, active, completed and failed queue jobs. Jobs may disappear from the visible completed list after the configured retention period.

## 10. Optional: Slack OAuth notifications

1. Create an app at https://api.slack.com/apps.
2. Under **OAuth & Permissions**, add redirect URL `http://localhost:4000/slack/callback`.
3. Add the `incoming-webhook` OAuth scope and install the app to a test workspace.
4. Copy the Slack Client ID and Client Secret into `backend/.env`:

```env
SLACK_CLIENT_ID=your-slack-client-id
SLACK_CLIENT_SECRET=your-slack-client-secret
SLACK_REDIRECT_URI=http://localhost:4000/slack/callback
```

5. Restart the API. Sign into the dashboard and click **Connect Slack**. Authorize the workspace.
6. To test the rate-limit notification, schedule a small batch with hourly limit `1`. When the next recipient is deferred because the sender's hourly cap is reached, the connected Slack webhook should receive a notification.

If Slack is not connected, the scheduler should continue without sending a notification.

## Rate limiting, throughput and durability

- `WORKER_CONCURRENCY` configures BullMQ worker concurrency (default **5**).
- `MIN_DELAY_BETWEEN_SENDS_MS` configures minimum spacing between sends for a sender (default **2000 ms**). A Redis Lua script reserves the next send slot atomically.
- `MAX_EMAILS_PER_HOUR_PER_SENDER` configures the default hourly cap (default **200**); a per-campaign value can also be submitted in the compose form. Redis counters are shared by worker processes.
- When the cap is reached, the email is deferred to the next UTC hour boundary rather than dropped. A Redis dedupe key sends at most one Slack alert per sender/hour.
- Email records are stored in PostgreSQL and BullMQ delayed jobs are persisted in Redis. Stable job IDs and idempotency keys reduce duplicate queueing. Memurai/Redis persistence behavior depends on the installed service configuration; for a production deployment use a Redis service with persistence enabled and tested backups.
- For 1000+ emails scheduled together, jobs remain queued and worker concurrency, sender spacing and hourly reservations pace delivery.

### Delivery semantics note

The database claim (`SCHEDULED` → `PROCESSING`), unique idempotency key, and stable BullMQ job ID prevent normal duplicate queueing and concurrent duplicate claims. SMTP does not provide a transaction with PostgreSQL: a process crash after SMTP accepts a message but before the database status update creates an ambiguous-delivery window. Strict exactly-once delivery requires a provider API with idempotency support or provider reconciliation/outbox design.

## Useful API routes

- `GET /auth/google` — start Google OAuth
- `GET /auth/me` — current signed-in user
- `POST /auth/logout` — destroy session
- `POST /api/emails/schedule` — schedule a batch
- `GET /api/emails?status=SCHEDULED|SENT|FAILED` — list emails
- `GET /api/emails/search?q=...` — Elasticsearch search
- `GET /slack/connect` — start Slack OAuth

## Notes

- The login screen's email/password fields are visual elements; Google OAuth is the actual login method.
- The compose form accepts CSV or text files and extracts unique email addresses. The backend validates recipients and limits each request to 5000 addresses.
- Use local infrastructure only for development. For public deployment configure HTTPS, secure cookies, managed PostgreSQL/Redis/Elasticsearch, SMTP credentials, secret rotation, CSRF protection, API rate limiting and a production email provider.
