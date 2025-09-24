import { withBrowser, type ScrapeResult, type BrowserLike } from './playwright.js';

function normalizePrice(raw: string): number | null {
  // Greek format often uses comma as decimal separator, dot as thousand separator
  const cleaned = raw
    .replace(/[^0-9.,]/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

async function extractFromProductPage(page: any): Promise<ScrapeResult | null> {
  // Try common selectors, fallback to meta tags
  const title = await page.evaluate(() => {
    const sel = [
      'h1.product-title',
      'h1[itemprop="name"]',
      'h1',
      'meta[property="og:title"]',
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      if (el) {
        if (el.tagName === 'META') {
          const c = (el as HTMLMetaElement).getAttribute('content') || '';
          if (c.trim()) return c.trim();
        } else {
          const t = el.textContent || '';
          if (t.trim()) return t.trim();
        }
      }
    }
    return '';
  });

  const priceText: string = await page.evaluate(() => {
    const candidates = [
      '[data-testid="product-price"]',
      '.price, .product-price, span[itemprop="price"]',
      'meta[property="product:price:amount"]',
    ];
    for (const s of candidates) {
      const el = document.querySelector(s);
      if (el) {
        if (el.tagName === 'META') {
          const c = (el as HTMLMetaElement).getAttribute('content') || '';
          if (c.trim()) return c.trim();
        } else {
          const t = el.textContent || '';
          if (t.trim()) return t.trim();
        }
      }
    }
    // look for currency signs in spans
    const withEuro = Array.from(document.querySelectorAll('span, div, p'))
      .map((n) => n.textContent || '')
      .find((t) => /\d+[\d\.,]*\s*€/.test(t));
    return withEuro || '';
  });

  const price = normalizePrice(priceText);
  if (!title || price == null) return null;
  return { product: title, price, currency: 'EUR' } satisfies ScrapeResult;
}

export async function scrapeSklavenitisProduct(url: string): Promise<ScrapeResult | null> {
  let result: ScrapeResult | null = null;
  await withBrowser(async (browser: BrowserLike) => {
    const page: any = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36'
    );
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Give client-side rendering some time
    await new Promise((r) => setTimeout(r, 1500));
    result = await extractFromProductPage(page);
    await page.close();
  });
  return result;
}

export async function scrapeSklavenitisCategory(url: string, limit: number = 50): Promise<ScrapeResult[]> {
  const items: ScrapeResult[] = [];
  await withBrowser(async (browser: BrowserLike) => {
    const page: any = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36'
    );
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1500));
    // Try to select product cards and extract name/price
    const results = await (page as any).evaluate((max: number) => {
      const out: { product: string; price: string }[] = [];
      const cards = Array.from(document.querySelectorAll('[data-testid="product-card"], .product-card, li, article'));
      for (const card of cards) {
        if (out.length >= max) break;
        const nameEl = card.querySelector('.product-title, [itemprop="name"], h2, h3');
        const priceEl = card.querySelector('[data-testid="product-price"], .price, [itemprop="price"], .product-price');
        const name = (nameEl?.textContent || '').trim();
        const price = (priceEl?.textContent || '').trim();
        if (name && price) out.push({ product: name, price });
      }
      return out;
    }, limit);
    for (const r of results) {
      const num = normalizePrice(r.price);
      if (num != null) items.push({ product: r.product, price: num, currency: 'EUR' });
    }
    await page.close();
  });
  return items;
}

