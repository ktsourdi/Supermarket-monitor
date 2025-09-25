import { createClient, type Client as LibsqlClient, type Config as LibsqlConfig } from '@libsql/client';

export type SqliteDatabase = LibsqlClient;

export type WatchlistItem = {
  id: number;
  product_name: string | null;
  product_url: string;
  target_price: number | null;
  active: number; // 1 or 0
  last_notified_price: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export function getDb(): SqliteDatabase {
  const proc = (globalThis as any).process as { env?: Record<string, string | undefined> } | undefined;
  const url = proc?.env?.DATABASE_URL;
  const authToken = proc?.env?.DATABASE_AUTH_TOKEN;
  if (!url) {
    throw new Error('DATABASE_URL is required for LibSQL/Turso');
  }
  const config: LibsqlConfig = authToken ? { url, authToken } : { url };
  const client = createClient(config);
  // Initialize schema
  client.execute(
    `CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product TEXT NOT NULL,
      price REAL NOT NULL,
      currency TEXT NOT NULL,
      captured_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`
  ).catch(() => {});
  client.execute(
    `CREATE INDEX IF NOT EXISTS idx_product_time ON price_history(product, captured_at);`
  ).catch(() => {});

  // Watchlist schema for monitored products
  client.execute(
    `CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name TEXT,
      product_url TEXT NOT NULL UNIQUE,
      target_price REAL,
      active INTEGER DEFAULT 1,
      last_notified_price REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME
    );`
  ).catch(() => {});
  client.execute(
    `CREATE INDEX IF NOT EXISTS idx_watchlist_active ON watchlist(active);`
  ).catch(() => {});
  client.execute(
    `CREATE INDEX IF NOT EXISTS idx_watchlist_url ON watchlist(product_url);`
  ).catch(() => {});
  return client;
}

export async function listActiveWatchlist(db: SqliteDatabase): Promise<WatchlistItem[]> {
  const result = await db.execute({
    sql: `SELECT id, product_name, product_url, target_price, active, last_notified_price, created_at, updated_at
          FROM watchlist WHERE active = 1 ORDER BY id ASC`,
    args: [],
  });
  // @ts-expect-error libsql types use any for rows
  return result.rows as WatchlistItem[];
}

export async function listAllWatchlist(db: SqliteDatabase): Promise<WatchlistItem[]> {
  const result = await db.execute({
    sql: `SELECT id, product_name, product_url, target_price, active, last_notified_price, created_at, updated_at
          FROM watchlist ORDER BY id ASC`,
    args: [],
  });
  // @ts-expect-error libsql types use any for rows
  return result.rows as WatchlistItem[];
}

export async function setLastNotifiedPrice(db: SqliteDatabase, id: number, price: number): Promise<void> {
  await db.execute({
    sql: `UPDATE watchlist SET last_notified_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    args: [price, id],
  });
}

export async function upsertWatchItem(
  db: SqliteDatabase,
  item: { product_url: string; product_name?: string | null; target_price?: number | null; active?: number }
): Promise<void> {
  await db.execute({
    sql: `INSERT INTO watchlist (product_url, product_name, target_price, active)
          VALUES (?, ?, ?, COALESCE(?, 1))
          ON CONFLICT(product_url) DO UPDATE SET
            product_name = COALESCE(excluded.product_name, watchlist.product_name),
            target_price = COALESCE(excluded.target_price, watchlist.target_price),
            active = COALESCE(excluded.active, watchlist.active),
            updated_at = CURRENT_TIMESTAMP`,
    args: [item.product_url, item.product_name ?? null, item.target_price ?? null, item.active ?? 1],
  });
}

export async function deleteWatchItemById(db: SqliteDatabase, id: number): Promise<void> {
  await db.execute({
    sql: `DELETE FROM watchlist WHERE id = ?`,
    args: [id],
  });
}

export async function deleteWatchItemByUrl(db: SqliteDatabase, url: string): Promise<void> {
  await db.execute({
    sql: `DELETE FROM watchlist WHERE product_url = ?`,
    args: [url],
  });
}

export type PriceHistoryItem = {
  id: number;
  product: string;
  price: number;
  currency: string;
  captured_at: string;
};

export async function listPriceHistory(db: SqliteDatabase, limit: number = 100): Promise<PriceHistoryItem[]> {
  const lim = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 1000) : 100;
  const result = await db.execute({
    sql: `SELECT id, product, price, currency, captured_at FROM price_history ORDER BY captured_at DESC LIMIT ?`,
    args: [lim],
  });
  // @ts-expect-error libsql types use any for rows
  return result.rows as PriceHistoryItem[];
}