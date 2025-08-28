import { createClient, type Client as LibsqlClient, type Config as LibsqlConfig } from '@libsql/client';

export type SqliteDatabase = LibsqlClient;

export function getDb(): SqliteDatabase {
  const url = process.env.DATABASE_URL;
  const authToken = process.env.DATABASE_AUTH_TOKEN;
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
  return client;
}