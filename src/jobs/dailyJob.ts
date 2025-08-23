import { getDb } from '../db/sqlite.js';
import { scrapeExampleSite } from '../scraper/playwright.js';
import { sendTelegramMessage } from '../notifications/telegram.js';

export async function runDailyJob(): Promise<void> {
  const db = getDb();
  const results = await scrapeExampleSite();
  const insert = db.prepare('INSERT INTO price_history (product, price, currency) VALUES (?, ?, ?)');
  for (const r of results) {
    insert.run(r.product, r.price, r.currency);
  }
  if (results.length > 0) {
    await sendTelegramMessage(`Captured ${results.length} items`);
  }
  db.close();
}
