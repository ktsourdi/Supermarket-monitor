import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, listPriceHistory } from '../src/db/sqlite.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const limit = Number((req.query.limit as string | undefined) ?? '50');
    const db = getDb();
    const rows = await listPriceHistory(db, limit);
    res.status(200).json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
}


