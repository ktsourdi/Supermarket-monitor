import { runDailyJob } from '../src/jobs/dailyJob.js';
export default async function handler(req, res) {
    try {
        await runDailyJob();
        res.status(200).json({ ok: true });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
}
//# sourceMappingURL=run.js.map