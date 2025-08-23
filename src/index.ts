import 'dotenv/config';
import { runDailyJob } from './jobs/dailyJob.js';

async function main() {
  await runDailyJob();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
