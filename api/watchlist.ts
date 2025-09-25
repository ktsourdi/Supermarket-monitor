import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb, listAllWatchlist, upsertWatchItem, deleteWatchItemById } from '../src/db/sqlite.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const db = getDb();
    if (req.method === 'GET') {
      const rows = await listAllWatchlist(db);
      res.status(200).json(rows);
      return;
    }
    if (req.method === 'POST') {
      const body = req.body ?? {};
      await upsertWatchItem(db, {
        product_url: String(body.product_url || ''),
        product_name: body.product_name ?? null,
        target_price: body.target_price ?? null,
      });
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method === 'DELETE') {
      const idStr = String((req.query.id as string | string[] | undefined) ?? '');
      const id = Number(idStr);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: 'id required' });
        return;
      }
      await deleteWatchItemById(db, id);
      res.status(200).json({ ok: true });
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
}


