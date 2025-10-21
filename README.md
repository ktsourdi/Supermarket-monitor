# 🛒 Supermarket Monitor

A simple scraper + alerting system that monitors **online supermarket websites** for product prices and promotions.  

It uses headless Chromium to extract data from category/product pages (Puppeteer locally, serverless-compatible Chromium on Vercel), stores results in LibSQL (remote) or SQLite (local), and optionally notifies you via Telegram when your favourite items are on sale.

---
## Quick start

1) Copy `.env.example` to `.env` and set values.

2) Install deps and run in dev:

```
npm ci
npx playwright install chromium
npm run dev
```

3) Add Sklavenitis product URLs to watchlist:

```
npm run watch:add -- --url "https://www.sklavenitis.gr/katigories/.../product" --name "Milk 1L" --target 1.20
```

4) On each run, the job fetches current prices for all watchlisted items, stores them in `price_history`, and sends Telegram alerts when targets are met or price drops occur.

---


## ✨ Features
- Scrape **category pages** or **individual product pages** from supermarkets.
- Detect **product name, price, unit price, promo flags, EAN/barcode** (where available).
- Store results in a local **SQLite database** (`grocery.db`).
- Maintain a **watchlist** of products (by EAN or partial name).
- Trigger **Telegram alerts** when prices fall below your target or promo tags appear.
- Configurable, polite crawling with headless browser automation.
- Extendable to multiple supermarkets (via store-specific “ingestors”).

---

## Proxy support (to avoid IP bans)

You can route headless browser traffic through HTTP(S) proxies. Set any of the following environment variables:

- `BROWSER_PROXY_URLS` or `PROXY_URLS`: Comma-separated list of proxies. Each entry can be one of:
  - `http://user:pass@host:port`
  - `https://user:pass@host:port`
  - `host:port` (optional basic auth from `PROXY_USERNAME`/`PROXY_PASSWORD`)
- `HTTP_PROXY` / `HTTPS_PROXY`: Single proxy entry (standard envs)
- `PROXY_USERNAME`, `PROXY_PASSWORD`: Credentials when not embedded in the URL

On each run we randomly pick one proxy and launch Chromium with `--proxy-server=...`. If basic auth is required, the page will authenticate automatically.

Tip: provide multiple proxies to distribute requests and reduce the chance of blocks.

