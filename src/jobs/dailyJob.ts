import { getDb, initializeSchema, listActiveWatchlist, setLastNotifiedPrice } from '../db/sqlite.js';
import { scrapeSklavenitisProduct } from '../scraper/sklavenitis.js';
import { sendTelegramMessage } from '../notifications/telegram.js';

export async function runDailyJob(): Promise<void> {
  const db = getDb();
  await initializeSchema(db);
  const watchlist = await listActiveWatchlist(db);
  if (watchlist.length === 0) {
    await sendTelegramMessage('Watchlist is empty. Add product URLs to start monitoring.');
    return;
  }

  let capturedCount = 0;
  for (const item of watchlist) {
    try {
      const result = await scrapeSklavenitisProduct(item.product_url);
      if (!result) {
        // eslint-disable-next-line no-console
        console.warn('No scrape result for', item.product_url);
        continue;
      }
      // eslint-disable-next-line no-console
      console.log('Scraped', item.product_url, '->', result.price);
      capturedCount += 1;
      const insertSql = 'INSERT INTO price_history (product, price, currency) VALUES (?, ?, ?)';
      await db.execute({ sql: insertSql, args: [result.product, result.price, result.currency] });

      // Always update the last price in watchlist
      await setLastNotifiedPrice(db, item.id, result.price);

      const previousNotified = item.last_notified_price ?? undefined;
      const target = item.target_price ?? undefined;
      const shouldNotifyDrop = previousNotified !== undefined && result.price < previousNotified;
      const shouldNotifyTarget = target !== undefined && result.price <= target;
      if (shouldNotifyDrop || shouldNotifyTarget || previousNotified === undefined) {
        const reasons = [
          shouldNotifyTarget ? `target met (≤ ${target}€)` : '',
          shouldNotifyDrop ? `price drop (from ${previousNotified}€)` : '',
          previousNotified === undefined ? 'first capture' : '',
        ]
          .filter(Boolean)
          .join(', ');
        await sendTelegramMessage(`Sklavenitis: ${result.product}\nPrice: ${result.price}€\n${item.product_url}\n${reasons}`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Scrape error for', item.product_url, err);
      await sendTelegramMessage(`Error scraping: ${item.product_url}\n${(err as Error).message}`);
    }
  }

  if (capturedCount > 0) {
    await sendTelegramMessage(`Captured ${capturedCount} product(s) from watchlist.`);
  }
}
