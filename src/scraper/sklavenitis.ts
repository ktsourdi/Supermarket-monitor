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
    // Prefer explicit data attribute when available (Sklavenitis uses data-price)
    const withDataPrice = document.querySelector('.main-price .price[data-price], .price[data-price]') as HTMLElement | null;
    if (withDataPrice) {
      const dp = withDataPrice.getAttribute('data-price') || '';
      if (dp.trim()) return dp.trim();
    }

    const candidates = [
      '[data-testid="product-price"]',
      '.main-price .price',
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
    // Broad fallback 1: any [data-price] on the page
    const anyDataPrice = Array.from(document.querySelectorAll('[data-price]'))
      .map((el) => (el as HTMLElement).getAttribute('data-price') || '')
      .find((t) => /\d+[\d\.,]*/.test(t));
    if (anyDataPrice && anyDataPrice.trim()) return anyDataPrice.trim();

    // Broad fallback 2: any element text that looks like a price with €
    const withEuro = Array.from(document.querySelectorAll('span, div, p, b, strong'))
      .map((n) => (n.textContent || '').trim())
      .find((t) => /\d+[\d\.,]*\s*€/.test(t));
    return withEuro || '';
  });

  const price = normalizePrice(priceText);
  if (!title || price == null) return null;
  return { product: title, price, currency: 'EUR' } satisfies ScrapeResult;
}

export async function scrapeSklavenitisProduct(url: string): Promise<ScrapeResult | null> {
  // Fast path for serverless (no headless browser): try HTTP fetch + parse
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION) {
    try {
      const res = await fetch(url, {
        headers: {
          'user-agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
          'accept-language': 'el-GR,el;q=0.9,en;q=0.8',
        },
      });
      const html = await res.text();
      // Product title: og:title
      const titleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i);
      const title = titleMatch?.[1]?.trim() ?? '';
      // Price: look for data-price or JSON price fields
      const dataPriceMatch = html.match(/data-price\s*=\s*"([0-9.,]+)"/i) || html.match(/"price"\s*:\s*"?([0-9.,]+)"?/i);
      const priceRaw = dataPriceMatch?.[1] ?? '';
      const priceNum = normalizePrice(priceRaw);
      if (title && priceNum != null) {
        return { product: title, price: priceNum, currency: 'EUR' };
      }
    } catch {}
    // In serverless, avoid launching a full browser if parsing failed
    return null;
  }

  let result: ScrapeResult | null = null;
  await withBrowser(async (browser: BrowserLike) => {
    const page: any = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36'
    );
    try {
      await page.setExtraHTTPHeaders({
        'accept-language': 'el-GR,el;q=0.9,en;q=0.8',
        'cache-control': 'no-cache',
      });
    } catch {}
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Try to accept cookie banners if present
    try {
      // First, click any obvious selectors
      const clicked = await page.evaluate(() => {
        const sel = [
          '#onetrust-accept-btn-handler',
          'button.cookie-accept',
          "button[aria-label*='accept' i]",
          "button[aria-label*='συμφωνώ' i]",
          "button[aria-label*='αποδοχή' i]",
          "button[aria-label*='αποδοχή όλων' i]",
        ];
        for (const s of sel) {
          const el = document.querySelector<HTMLButtonElement>(s);
          if (el) { el.click(); return true; }
        }
        // Fallback: find any button whose text matches common accept strings (Greek/English)
        const texts = [
          'Αποδοχή όλων', 'Αποδοχή', 'Συμφωνώ', 'Accept All', 'Accept', 'Allow All', 'Agree'
        ].map(t => t.toLowerCase());
        const btns = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
        for (const b of btns) {
          const t = (b.textContent || '').trim().toLowerCase();
          if (texts.some(x => t.includes(x))) { b.click(); return true; }
        }
        return false;
      });
      if (!clicked) {
        // Try clicking any element with role=button and matching text
        await page.evaluate(() => {
          const texts = ['Αποδοχή όλων', 'Αποδοχή', 'Συμφωνώ', 'Accept All', 'Accept', 'Allow All', 'Agree'].map(t => t.toLowerCase());
          const els = Array.from(document.querySelectorAll('[role="button"], a, div, span')) as HTMLElement[];
          for (const el of els) {
            const t = (el.textContent || '').trim().toLowerCase();
            if (texts.some(x => t.includes(x))) { (el as HTMLElement).click(); break; }
          }
        });
      }
    } catch {}
    // Wait for price element to render
    try {
      await page.waitForSelector('.main-price .price[data-price], .price[data-price], [data-testid="product-price"]', { timeout: 15000 });
      // Ensure data-price gets populated
      await page.waitForFunction(() => {
        const el = document.querySelector('.main-price .price[data-price], .price[data-price]') as HTMLElement | null;
        return !!(el && el.getAttribute('data-price'));
      }, { timeout: 15000 }).catch(() => {});
    } catch {}
    // Give client-side rendering some additional time
    await new Promise((r) => setTimeout(r, 2000));
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

