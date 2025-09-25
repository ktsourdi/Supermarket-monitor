import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runDailyJob } from '../src/jobs/dailyJob.js';
import { getDb, initializeSchema } from '../src/db/sqlite.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Ensure database schema exists
    const db = getDb();
    await initializeSchema(db);
    
    await runDailyJob();
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
}

