## Technical Guide

### 1) Stack choices (recommended)
- **Language**: Node.js 18+
  - Mature ecosystem, first-class Playwright support, easy deployment in containers.
- **Scraping**: Puppeteer (local) / puppeteer-core + @sparticuz/chromium (Vercel)
  - Works on Vercel Functions (serverless) without system dependencies.
- **DB (MVP)**: LibSQL/Turso (remote) in production, SQLite file in dev
  - Use `DATABASE_URL` + optional `DATABASE_AUTH_TOKEN` on Vercel.
- **Notifications**: Telegram Bot (simple & free)
  - Later: email (SMTP), Push (FCM/Expo), Slack/Discord webhooks.
- **Jobs/Scheduling**:
  - Local cron (dev)
  - Prod: Vercel Cron calling `/api/run`, or GitHub Actions workflow
- **API/Dashboard (optional)**: Next.js or Fastify/Express to expose price history, watchlists, charts.

### 2) Repository layout
```
src/
  index.ts                # Entry: runs scheduled job
  db/sqlite.ts            # SQLite helper + schema
  scraper/playwright.ts   # Playwright utilities and example scraper
  notifications/telegram.ts
  jobs/dailyJob.ts        # Orchestrates scraping, persistence, notifications
api/
  run.ts                  # Vercel function to trigger the job
scripts/
  run-job.sh              # Helper to run compiled job (for cron)
.github/workflows/
  scheduled.yml           # Daily scheduled CI job
Dockerfile
docker-compose.yml        # Local run or cron-like loop
.env.example              # Env template
```

### 3) Environment variables
Copy `.env.example` to `.env` and set:
- `TELEGRAM_BOT_TOKEN`: Telegram bot token
- `TELEGRAM_CHAT_ID`: Chat or channel id
- `DATABASE_URL`: e.g. `libsql://<db>-<org>.turso.io` (Vercel) or `file:./grocery.db` (dev)
- `DATABASE_AUTH_TOKEN`: Turso auth token (Vercel)

### 4) Local development
- Install dependencies: `npm ci`
- Install browser: `npx playwright install chromium`
- Dev run: `npm run dev`
- Build: `npm run build`
- Run compiled: `npm start`

### 5) Docker
- Build: `docker build -t supermarket-monitor .`
- Run once: `docker run --rm --env-file .env supermarket-monitor`
- Compose (cron-like loop): `docker compose up cron`

### 6) CI/CD (GitHub Actions)
- Workflow `scheduled.yml` runs daily at 06:00 UTC.
- Configure repository secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

### 7) Deployment to Vercel
- Add env vars in Vercel Project Settings: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DATABASE_URL`, `DATABASE_AUTH_TOKEN`.
- `vercel.json` includes a cron hitting `/api/run` at 06:00 UTC.
- Use Node.js 18 runtime.

### 8) Extending scraping
- Add new site-specific functions in `src/scraper/`.
- Return `ScrapeResult[]` and insert into `price_history`.
- Consider capturing network requests for shadow API responses before DOM parsing.

### 9) Scaling up
- Move to Postgres with a thin data-access layer.
- Add Fastify/Next.js for APIs and dashboards.
- Introduce a task queue for concurrency if needed.