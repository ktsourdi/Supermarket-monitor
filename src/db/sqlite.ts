import type { Database as SqliteDatabase } from 'better-sqlite3';
import BetterSqlite3 from 'better-sqlite3';

export function getDb(): SqliteDatabase {
  const dbPath = process.env.DATABASE_URL?.replace('file:', '') || 'grocery.db';
  const db = new BetterSqlite3(dbPath);
  db.exec(
    "CREATE TABLE IF NOT EXISTS price_history (\n" +
      "  id INTEGER PRIMARY KEY AUTOINCREMENT,\n" +
      "  product TEXT NOT NULL,\n" +
      "  price REAL NOT NULL,\n" +
      "  currency TEXT NOT NULL,\n" +
      "  captured_at DATETIME DEFAULT CURRENT_TIMESTAMP\n" +
      ");\n" +
      "CREATE INDEX IF NOT EXISTS idx_product_time ON price_history(product, captured_at);\n",
  );
  return db;
}