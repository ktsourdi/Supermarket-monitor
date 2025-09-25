import 'dotenv/config';
import { getDb, initializeSchema, upsertWatchItem } from '../db/sqlite.js';

function parseArgs(argv: readonly string[]) {
  const args = Array.from(argv).slice(2);
  const out: { url?: string | undefined; name?: string | undefined; target?: number | undefined; active?: number | undefined } = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--url' && args[i + 1]) out.url = args[++i] as string;
    else if (a === '--name' && args[i + 1]) out.name = args[++i] as string;
    else if (a === '--target' && args[i + 1]) out.target = Number(args[++i] as string);
    else if (a === '--inactive') out.active = 0;
  }
  return out;
}

async function main() {
  const proc = (globalThis as any).process as { argv: string[] } | undefined;
  const { url, name, target, active } = parseArgs(proc?.argv ?? []);
  if (!url) {
    console.error('Usage: tsx src/tools/watchlist.ts --url <productUrl> [--name <name>] [--target <price>] [--inactive]');
    // eslint-disable-next-line no-process-exit
    ;(globalThis as any).process?.exit(1);
  }
  const db = getDb();
  await initializeSchema(db);
  await upsertWatchItem(db, {
    product_url: url as string,
    product_name: name ?? null,
    target_price: target ?? null,
    ...(active !== undefined ? { active } : {}),
  });
  console.log('Upserted watch item:', { url, name, target, active: active ?? 1 });
}

main().catch((err) => {
  console.error(err);
  // eslint-disable-next-line no-process-exit
  ;(globalThis as any).process?.exit(1);
});

