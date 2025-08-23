# 🛒 Supermarket Monitor

A simple scraper + alerting system that monitors **online supermarket websites** for product prices and promotions.  

It uses [Playwright](https://playwright.dev/) to extract data from category/product pages, stores results in SQLite, and optionally notifies you via Telegram when your favourite items are on sale.

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

