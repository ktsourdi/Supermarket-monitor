import 'dotenv/config';
import http from 'node:http';
import { URL } from 'node:url';
import {
  getDb,
  listAllWatchlist,
  upsertWatchItem,
  deleteWatchItemById,
  deleteWatchItemByUrl,
  listPriceHistory,
} from './db/sqlite.js';
import { runDailyJob } from './jobs/dailyJob.js';

type Json = Record<string, unknown> | unknown[] | string | number | null | boolean;

function send(res: http.ServerResponse, status: number, body: Json, headers: Record<string, string> = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(data);
}

async function parseBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function serveStaticIndex(res: http.ServerResponse) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Supermarket Monitor</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:24px;color:#111}
    h1{margin:0 0 12px}
    section{margin-bottom:24px}
    input,button{font:inherit;padding:8px}
    table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #ddd;padding:8px}
    th{background:#f5f5f5;text-align:left}
    code{background:#f2f2f2;padding:2px 4px;border-radius:4px}
    .row{display:flex;gap:8px;flex-wrap:wrap}
    .row>input{flex:1 1 280px}
  </style>
</head>
<body>
  <h1>Supermarket Monitor</h1>
  <section>
    <h3>Add / Update Watch Item</h3>
    <div class="row">
      <input id="url" placeholder="Product URL" />
      <input id="name" placeholder="Name (optional)" />
      <input id="target" placeholder="Target price (optional)" type="number" step="0.01" />
      <button id="save">Save</button>
    </div>
  </section>
  <section>
    <h3>Watchlist</h3>
    <table id="watch">
      <thead><tr><th>ID</th><th>Name</th><th>URL</th><th>Target</th><th>Active</th><th>Last Notified</th><th>Actions</th></tr></thead>
      <tbody></tbody>
    </table>
  </section>
  <section>
    <h3>Recent Price History</h3>
    <table id="prices">
      <thead><tr><th>When</th><th>Product</th><th>Price</th><th>Currency</th></tr></thead>
      <tbody></tbody>
    </table>
  </section>
  <section>
    <button id="run">Run job now</button>
  </section>
  <script>
    async function refresh() {
      const [w, p] = await Promise.all([
        fetch('/api/watchlist').then(r => r.json()),
        fetch('/api/prices?limit=50').then(r => r.json())
      ]);
      const wtbody = document.querySelector('#watch tbody');
      wtbody.innerHTML='';
      w.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td>'+item.id+'</td><td>'+ (item.product_name||'') +'</td><td><a href="'+item.product_url+'" target="_blank">link</a></td><td>'+ (item.target_price??'') +'</td><td>'+item.active+'</td><td>'+ (item.last_notified_price??'') +'</td>'+
          '<td><button data-id="'+item.id+'" class="del">Delete</button></td>';
        wtbody.appendChild(tr);
      });
      wtbody.querySelectorAll('button.del').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.target.getAttribute('data-id');
          await fetch('/api/watchlist/'+id, { method: 'DELETE' });
          refresh();
        });
      });
      const ptbody = document.querySelector('#prices tbody');
      ptbody.innerHTML='';
      p.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td>'+row.captured_at+'</td><td>'+row.product+'</td><td>'+row.price+'</td><td>'+row.currency+'</td>';
        ptbody.appendChild(tr);
      });
    }
    document.getElementById('save').addEventListener('click', async () => {
      const url = document.getElementById('url').value.trim();
      const name = document.getElementById('name').value.trim();
      const targetRaw = document.getElementById('target').value.trim();
      const target = targetRaw ? Number(targetRaw) : null;
      if (!url) { alert('URL is required'); return; }
      await fetch('/api/watchlist', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ product_url: url, product_name: name || null, target_price: target })
      });
      document.getElementById('url').value='';
      document.getElementById('name').value='';
      document.getElementById('target').value='';
      refresh();
    });
    document.getElementById('run').addEventListener('click', async () => {
      await fetch('/api/run', { method: 'POST' });
      refresh();
    });
    refresh();
  </script>
</body>
</html>`;
  // send as html
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(html);
}

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  const urlObj = new URL(req.url || '/', 'http://localhost');
  const path = urlObj.pathname;

  try {
    if (method === 'GET' && path === '/') {
      return serveStaticIndex(res);
    }
    if (path === '/api/watchlist' && method === 'GET') {
      const db = getDb();
      const rows = await listAllWatchlist(db);
      return send(res, 200, rows);
    }
    if (path === '/api/watchlist' && method === 'POST') {
      const body = await parseBody(req);
      const db = getDb();
      await upsertWatchItem(db, {
        product_url: String(body.product_url || ''),
        product_name: body.product_name ?? null,
        target_price: body.target_price ?? null,
      });
      return send(res, 200, { ok: true });
    }
    if (path.startsWith('/api/watchlist/') && method === 'DELETE') {
      const idStr = path.split('/').pop() || '';
      const db = getDb();
      if (/^\d+$/.test(idStr)) await deleteWatchItemById(db, Number(idStr));
      else await deleteWatchItemByUrl(db, idStr);
      return send(res, 200, { ok: true });
    }
    if (path === '/api/prices' && method === 'GET') {
      const limit = Number(urlObj.searchParams.get('limit') || '50');
      const db = getDb();
      const rows = await listPriceHistory(db, limit);
      return send(res, 200, rows);
    }
    if (path === '/api/run' && method === 'POST') {
      // fire-and-forget but respond success immediately
      runDailyJob().catch(() => {});
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'Not found' });
  } catch (err) {
    return send(res, 500, { error: (err as Error).message });
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`UI server listening on http://localhost:${port}`);
});


