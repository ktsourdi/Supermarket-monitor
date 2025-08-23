## Technical Guide

### 1) Stack choices (recommended)
- **Language**: Node.js 18+
  - Mature ecosystem, first-class Playwright support, easy deployment in containers.
- **Scraping**: Playwright (Chromium)
  - Robust vs. JS-heavy sites, lets you capture shadow APIs (XHR/GraphQL) before DOM fallback.
- **DB (MVP)**: SQLite (`file:grocery.db`)
  - Zero-ops, perfect for prototyping.
  - Scale-up: Postgres (managed) for history & dashboards.
- **Notifications**: Telegram Bot (simple & free)
  - Later: email (SMTP), Push (FCM/Expo), Slack/Discord webhooks.
- **Jobs/Scheduling**:
  - Local cron (dev)
  - Prod: GitHub Actions scheduled workflow, containerized cron (Docker/K8s CronJob), or Cloud Run jobs.
- **API/Dashboard (optional)**: Next.js or Fastify/Express to expose price history, watchlists, charts.

### 2) Repository layout
```
src/
  index.ts                # Entry: runs scheduled job
  db/sqlite.ts            # SQLite helper + schema
  scraper/playwright.ts   # Playwright utilities and example scraper
  notifications/telegram.ts
  jobs/dailyJob.ts        # Orchestrates scraping, persistence, notifications
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
- `DATABASE_URL`: e.g. `file:./grocery.db`

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

### 7) Extending scraping
- Add new site-specific functions in `src/scraper/`.
- Return `ScrapeResult[]` and insert into `price_history`.
- Consider capturing network requests for shadow API responses before DOM parsing.

### 8) Scaling up
- Move to Postgres with a thin data-access layer.
- Add Fastify/Next.js for APIs and dashboards.
- Introduce a task queue for concurrency if needed.