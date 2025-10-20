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
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 40px 20px;
      color: #2d3748;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    h1 {
      color: white;
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 40px;
      text-align: center;
      text-shadow: 0 2px 10px rgba(0,0,0,0.2);
    }
    h3 {
      color: #2d3748;
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    h3::before {
      content: '';
      display: inline-block;
      width: 4px;
      height: 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 2px;
    }
    section {
      background: white;
      border-radius: 16px;
      padding: 32px;
      margin-bottom: 24px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    section:hover {
      transform: translateY(-2px);
      box-shadow: 0 15px 50px rgba(0,0,0,0.15);
    }
    .row {
      display: grid;
      grid-template-columns: 2fr 1.5fr 1fr auto;
      gap: 12px;
      align-items: end;
    }
    @media (max-width: 768px) {
      .row { grid-template-columns: 1fr; }
    }
    input {
      font-family: inherit;
      font-size: 15px;
      padding: 12px 16px;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      transition: all 0.2s;
      background: white;
    }
    input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    input::placeholder {
      color: #a0aec0;
    }
    button {
      font-family: inherit;
      font-size: 15px;
      font-weight: 600;
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
    }
    button:active {
      transform: translateY(0);
    }
    button.del {
      background: linear-gradient(135deg, #fc466b 0%, #3f5efb 100%);
      padding: 8px 16px;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(252, 70, 107, 0.3);
    }
    button.del:hover {
      box-shadow: 0 4px 15px rgba(252, 70, 107, 0.5);
    }
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin-top: 20px;
    }
    thead {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    th {
      padding: 16px 12px;
      text-align: left;
      font-weight: 600;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    th:first-child {
      border-radius: 8px 0 0 0;
    }
    th:last-child {
      border-radius: 0 8px 0 0;
    }
    td {
      padding: 16px 12px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 14px;
    }
    tbody tr {
      transition: background 0.2s;
    }
    tbody tr:hover {
      background: #f7fafc;
    }
    tbody tr:last-child td {
      border-bottom: none;
    }
    tbody tr:last-child td:first-child {
      border-radius: 0 0 0 8px;
    }
    tbody tr:last-child td:last-child {
      border-radius: 0 0 8px 0;
    }
    a {
      color: #667eea;
      text-decoration: none;
      font-weight: 500;
      transition: color 0.2s;
    }
    a:hover {
      color: #764ba2;
      text-decoration: underline;
    }
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #718096;
      font-style: italic;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }
    .badge.active {
      background: #c6f6d5;
      color: #22543d;
    }
    .badge.inactive {
      background: #fed7d7;
      color: #742a2a;
    }
    #run {
      width: 100%;
      padding: 16px;
      font-size: 16px;
    }
    .price {
      font-weight: 600;
      color: #667eea;
      font-size: 15px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🛒 Supermarket Monitor</h1>
    
    <section>
      <h3>Add Product to Watchlist</h3>
      <div class="row">
        <input id="url" placeholder="Product URL (e.g., https://www.sklavenitis.gr/...)" />
        <input id="name" placeholder="Product name (optional)" />
        <input id="target" placeholder="Target price €" type="number" step="0.01" />
        <button id="save">Add to Watchlist</button>
      </div>
    </section>
    
    <section>
      <h3>Current Watchlist</h3>
      <table id="watch">
        <thead>
          <tr>
            <th>ID</th>
            <th>Product Name</th>
            <th>URL</th>
            <th>Target Price</th>
            <th>Last Price</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
      <div id="watch-empty" class="empty-state" style="display:none;">
        No products in watchlist. Add one above to get started!
      </div>
    </section>
    
    <section>
      <h3>Recent Price History</h3>
      <table id="prices">
        <thead>
          <tr>
            <th>Captured</th>
            <th>Product</th>
            <th>Price</th>
            <th>Currency</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
      <div id="prices-empty" class="empty-state" style="display:none;">
        No price data yet. Run the job to capture current prices.
      </div>
    </section>
    
    <section>
      <button id="run">🔄 Run Price Check Now</button>
    </section>
  </div>
  <script>
    async function refresh() {
      const [w, p] = await Promise.all([
        fetch('/api/watchlist').then(r => r.json()),
        fetch('/api/prices?limit=50').then(r => r.json())
      ]);
      
      const wtbody = document.querySelector('#watch tbody');
      const wempty = document.querySelector('#watch-empty');
      const wtable = document.querySelector('#watch');
      wtbody.innerHTML='';
      
      if (w.length === 0) {
        wtable.style.display = 'none';
        wempty.style.display = 'block';
      } else {
        wtable.style.display = 'table';
        wempty.style.display = 'none';
        w.forEach(item => {
          const tr = document.createElement('tr');
          const statusBadge = item.active 
            ? '<span class="badge active">Active</span>' 
            : '<span class="badge inactive">Inactive</span>';
          const targetPrice = item.target_price ? '<span class="price">€'+item.target_price.toFixed(2)+'</span>' : '—';
          const lastPrice = item.last_notified_price ? '<span class="price">€'+item.last_notified_price.toFixed(2)+'</span>' : '—';
          tr.innerHTML = '<td>'+item.id+'</td>'+
            '<td><strong>'+(item.product_name||'Unnamed Product')+'</strong></td>'+
            '<td><a href="'+item.product_url+'" target="_blank">View Product</a></td>'+
            '<td>'+targetPrice+'</td>'+
            '<td>'+lastPrice+'</td>'+
            '<td>'+statusBadge+'</td>'+
            '<td><button data-id="'+item.id+'" class="del">Delete</button></td>';
          wtbody.appendChild(tr);
        });
        wtbody.querySelectorAll('button.del').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const id = e.target.getAttribute('data-id');
            if(confirm('Remove this product from watchlist?')) {
              await fetch('/api/watchlist/'+id, { method: 'DELETE' });
              refresh();
            }
          });
        });
      }
      
      const ptbody = document.querySelector('#prices tbody');
      const pempty = document.querySelector('#prices-empty');
      const ptable = document.querySelector('#prices');
      ptbody.innerHTML='';
      
      if (p.length === 0) {
        ptable.style.display = 'none';
        pempty.style.display = 'block';
      } else {
        ptable.style.display = 'table';
        pempty.style.display = 'none';
        p.forEach(row => {
          const tr = document.createElement('tr');
          const date = new Date(row.captured_at).toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric', 
            hour: '2-digit', minute: '2-digit'
          });
          tr.innerHTML = '<td>'+date+'</td>'+
            '<td>'+row.product+'</td>'+
            '<td><span class="price">€'+row.price.toFixed(2)+'</span></td>'+
            '<td>'+row.currency+'</td>';
          ptbody.appendChild(tr);
        });
      }
    }
    document.getElementById('save').addEventListener('click', async () => {
      const url = document.getElementById('url').value.trim();
      const name = document.getElementById('name').value.trim();
      const targetRaw = document.getElementById('target').value.trim();
      const target = targetRaw ? Number(targetRaw) : null;
      if (!url) { 
        alert('⚠️ Product URL is required!'); 
        return; 
      }
      const btn = document.getElementById('save');
      const originalText = btn.textContent;
      btn.textContent = '⏳ Adding...';
      btn.disabled = true;
      try {
        await fetch('/api/watchlist', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ product_url: url, product_name: name || null, target_price: target })
        });
        document.getElementById('url').value='';
        document.getElementById('name').value='';
        document.getElementById('target').value='';
        await refresh();
        btn.textContent = '✅ Added!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      } catch(e) {
        alert('❌ Error: ' + e.message);
        btn.textContent = originalText;
      } finally {
        btn.disabled = false;
      }
    });
    
    document.getElementById('run').addEventListener('click', async () => {
      const btn = document.getElementById('run');
      const originalText = btn.textContent;
      btn.textContent = '⏳ Checking prices...';
      btn.disabled = true;
      try {
        await fetch('/api/run', { method: 'POST' });
        await refresh();
        btn.textContent = '✅ Prices updated!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 3000);
      } catch(e) {
        alert('❌ Error: ' + e.message);
        btn.textContent = originalText;
      } finally {
        btn.disabled = false;
      }
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


