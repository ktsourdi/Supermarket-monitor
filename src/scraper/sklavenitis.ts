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

  const priceText: string = await page.evaluate(async () => {
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
    const dataPriceCandidates = Array.from(document.querySelectorAll('[data-price]'))
      .map((el) => (el as HTMLElement).getAttribute('data-price') || '')
      .filter((t) => /\d+[\d\.,]*/.test(t));
    if (dataPriceCandidates.length > 0) return dataPriceCandidates[0]?.trim() ?? '';

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

// Global request tracking for throttling and session management
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 3000; // Increased to 3 seconds between requests
let requestCount = 0;
const MAX_REQUESTS_PER_SESSION = 5; // Limit requests per "session"

// Persisted cookie so the server returns full HTML without 403
const CONSENT_COOKIE_RAW = '{"version":"7C87B57438D00EFA48BF57151CDD2D85DNT0","categories":{"Functional":{"wanted":false},"Marketing":{"wanted":false},"Analytics":{"wanted":false},"Necessary":{"wanted":true}},"dnt":false}';
const STORESID_COOKIE = '7c755392-2486-48c0-9776-88c432dd2263';
const ZONE_COOKIE = '%7B%22ShippingType%22%3A1%2C%22HubID%22%3A7%7D'; // URI-encoded JSON
const AKA_COOKIE = 'A';

const COOKIE_HEADER = [
  `AKA_A2=${AKA_COOKIE}`,
  `cconsent=${encodeURIComponent(CONSENT_COOKIE_RAW)}`,
  `StoreSID=${STORESID_COOKIE}`,
  `Zone=${ZONE_COOKIE}`,
].join('; ');

// Realistic user agents to rotate through
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // Add some older versions to vary the fingerprint
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
];

// Helper function to extract Chrome version from user agent
function extractChromeVersion(userAgent: string): string {
  const match = userAgent.match(/Chrome\/(\d+)/);
  return match && match[1] ? match[1] : '120';
}

// Helper function to get a random user agent
function getRandomUserAgent(): string {
  const index = Math.floor(Math.random() * USER_AGENTS.length);
  return USER_AGENTS[index] ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
}

// Helper function to create realistic headers
function createHeaders(userAgent?: string): Record<string, string> {
  const ua = userAgent || getRandomUserAgent();
  const chromeVersion = extractChromeVersion(ua);
  const isMobile = Math.random() < 0.1; // 10% chance of mobile
  const headers: Record<string, string | undefined> = {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8,en-US;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': Math.random() < 0.5 ? 'max-age=0' : 'no-cache',
    'Pragma': Math.random() < 0.3 ? 'no-cache' : undefined,
    'Cookie': COOKIE_HEADER,
    'Sec-Ch-Ua': ua.includes('Chrome') ? '"Not_A Brand";v="8", "Chromium";v="' + chromeVersion + '", "Google Chrome";v="' + chromeVersion + '"' : '"Not_A Brand";v="8", "Chromium";v="' + chromeVersion + '"',
    'Sec-Ch-Ua-Mobile': isMobile ? '?1' : '?0',
    'Sec-Ch-Ua-Platform': ua.includes('Windows') ? '"Windows"' : ua.includes('Mac') ? '"macOS"' : '"Linux"',
    // Add more realistic browser headers
    'Sec-Ch-Ua-Platform-Version': ua.includes('Windows') ? '"10.0.0"' : ua.includes('Mac') ? '"14.1.0"' : '"6.5.0"',
    'Sec-Ch-Ua-Bitness': '"64"',
    'Sec-Ch-Ua-Arch': '"x86"',
    'Sec-Ch-Ua-Branding': ua.includes('Chrome') ? '"Google Chrome"' : '"Chromium"',
    'Sec-Ch-Ua-Form-Factors': isMobile ? '"Mobile"' : '"Desktop"',
    'Sec-Ch-Ua-Full-Version': '"' + chromeVersion + '.0.0.0"',
    'Sec-Ch-Ua-Full-Version-List': ua.includes('Chrome') ? '"Not_A Brand";v="8.0.0.0", "Chromium";v="' + chromeVersion + '.0.0.0", "Google Chrome";v="' + chromeVersion + '.0.0.0"' : '"Not_A Brand";v="8.0.0.0", "Chromium";v="' + chromeVersion + '.0.0.0"',
    'Sec-Ch-Ua-Model': isMobile ? '"Pixel 7"' : '""',
    // Add realistic referrer
    'Referer': Math.random() < 0.7 ? 'https://www.google.com/' : undefined,
    'Origin': undefined, // Don't set origin for cross-site requests
    // Additional headers that real browsers send
    'X-Requested-With': Math.random() < 0.1 ? 'XMLHttpRequest' : undefined,
    'X-Forwarded-For': undefined, // Don't set this as it can trigger bot detection
    // Additional browser-like headers
    'Viewport-Width': Math.random() < 0.5 ? '1920' : '1366',
    'Sec-Viewport-Width': Math.random() < 0.5 ? '1920' : '1366',
  };

  // Remove undefined values and return clean object
  return Object.fromEntries(
    Object.entries(headers).filter(([_, value]) => value !== undefined)
  ) as Record<string, string>;
}

// Clean headers to remove any Vercel-specific identifiers
function cleanHeaders(headers: Record<string, string>): Record<string, string> {
  const cleaned = { ...headers };

  // Remove any Vercel-specific headers
  delete cleaned['x-vercel-id'];
  delete cleaned['x-vercel-deployment-url'];
  delete cleaned['x-vercel-request-id'];
  delete cleaned['x-vercel-forwarded-for'];

  return cleaned;
}

// Helper function to sleep/delay
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry function with exponential backoff and user agent rotation
async function retryWithBackoff<T>(
  fn: (userAgent?: string) => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  let userAgent: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Use a different user agent for each retry attempt
      userAgent = getRandomUserAgent();
      return await fn(userAgent);
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        break;
      }

      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      console.warn(`Attempt ${attempt + 1} failed (UA: ${userAgent}), retrying in ${delay}ms:`, lastError.message);
      await sleep(delay);
    }
  }

  throw lastError!;
}

// Build a list of proxies from env or defaults
function getProxyList(): string[] {
  const listFromEnv = (process.env.CORS_PROXY_URLS || '').split(',').map(s => s.trim()).filter(Boolean);
  const single = (process.env.CORS_PROXY_URL || '').trim();
  const out: string[] = [];
  if (listFromEnv.length) out.push(...listFromEnv);
  if (single) out.push(single);
  if (!out.length) {
    out.push(
      'https://api.allorigins.win/raw?url=',
      'https://corsproxy.io/?',
      'https://thingproxy.freeboard.io/fetch/',
      'https://cors-anywhere.herokuapp.com/'
    );
  }
  // Deduplicate while preserving order
  return Array.from(new Set(out));
}

// Build a proxied URL for various proxy styles
function buildProxiedUrl(proxyBase: string, targetUrl: string): string {
  if (proxyBase.endsWith('=') || proxyBase.endsWith('?')) {
    return proxyBase + encodeURIComponent(targetUrl);
  }
  if (proxyBase.endsWith('/')) {
    return proxyBase + targetUrl;
  }
  return proxyBase + targetUrl;
}

function parseHtmlForProductData(html: string): ScrapeResult | null {
  // Product title extraction strategies (in order of preference)
  const titleSelectors = [
    /<meta[^>]*property=['"]og:title['"][^>]*content=['"]([^'"]+)['"][^>]*>/i,
    /<meta[^>]*name=['"]title['"][^>]*content=['"]([^'"]+)['"][^>]*>/i,
    /<h1[^>]*class=['"][^'"]*product[^'"]*['"][^>]*>([^<]+)<\/h1>/i,
    /<h1[^>]*itemprop=['"]name['"][^>]*>([^<]+)<\/h1>/i,
    /<title[^>]*>([^<]+)<\/title>/i,
  ];

  let title = '';
  for (const selector of titleSelectors) {
    const match = html.match(selector);
    if (match && match[1] && match[1].trim()) {
      title = match[1].trim();
      break;
    }
  }

  // Price extraction strategies (in order of preference)
  const priceSelectors = [
    // Sklavenitis specific data-price attribute
    /data-price\s*=\s*"([0-9.,]+)"/i,
    // Standard product schema price
    /<meta[^>]*property=['"]product:price:amount['"][^>]*content=['"]([^'"]+)['"][^>]*>/i,
    // JSON-LD structured data
    /"price"\s*:\s*"([0-9.,]+)"/i,
    /"price"\s*:\s*([0-9.,]+)/i,
    // Generic price patterns
    /<span[^>]*class=['"][^'"]*price[^'"]*['"][^>]*>([^<]+)<\/span>/i,
    /(\d+[\d\.,]*)\s*€/i,
    /€\s*(\d+[\d\.,]*)/i,
  ];

  let priceRaw = '';
  for (const selector of priceSelectors) {
    const match = html.match(selector);
    if (match && match[1] && match[1].trim()) {
      priceRaw = match[1].trim();
      break;
    }
  }

  // Extract from JSON-LD scripts if not found above
  if (!priceRaw) {
    const scriptRegex = /<script[^>]*type=['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = scriptRegex.exec(html)) !== null) {
      const jsonText = (m[1] ?? '').trim();
      if (!jsonText) continue;
      try {
        const data = JSON.parse(jsonText);
        const arr = Array.isArray(data) ? data : [data];
        for (const obj of arr) {
          const offers = obj?.offers ? (Array.isArray(obj.offers) ? obj.offers : [obj.offers]) : [];
          for (const o of offers) {
            const cand = o?.price ?? o?.lowPrice ?? o?.highPrice;
            if (cand) { priceRaw = String(cand); break; }
          }
          if (priceRaw) break;
        }
        if (priceRaw) break;
      } catch {}
    }
  }

  const priceNum = normalizePrice(priceRaw);
  if (title && priceNum != null) {
    return { product: title, price: priceNum, currency: 'EUR' };
  }

  return null;
}

export async function scrapeSklavenitisProduct(url: string): Promise<ScrapeResult | null> {
  // HTTP-based scraping has proven unreliable due to advanced bot detection.
  // This implementation now exclusively uses a headless browser for all environments,
  // relying on @sparticuz/chromium for serverless deployment on Vercel.
  let result: ScrapeResult | null = null;
  await withBrowser(async (browser: BrowserLike) => {
    const page: any = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    try {
      await page.setExtraHTTPHeaders({
        'accept-language': 'el-GR,el;q=0.9,en;q=0.8',
        'cache-control': 'no-cache',
      });
      await page.setCookie(
        { name: 'AKA_A2', value: AKA_COOKIE, domain: '.sklavenitis.gr', path: '/' },
        { name: 'cconsent', value: encodeURIComponent(CONSENT_COOKIE_RAW), domain: '.sklavenitis.gr', path: '/' },
        { name: 'StoreSID', value: STORESID_COOKIE, domain: '.sklavenitis.gr', path: '/' },
        { name: 'Zone', value: ZONE_COOKIE, domain: '.sklavenitis.gr', path: '/' },
      );
    } catch {}
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 40000 });
    await new Promise(r=>setTimeout(r,1500));

    // Try to accept cookie banners if present
    try {
      const selectors = [
        '#onetrust-accept-btn-handler',
        'button.cookie-accept',
        "button[aria-label*='accept' i]",
        "button[aria-label*='συμφωνώ' i]",
        "button[aria-label*='αποδοχή' i]",
        "button[aria-label*='αποδοχή όλων' i]",
      ];
      let handled = false;
      for (const sel of selectors) {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click().catch(() => {});
          await new Promise(r=>setTimeout(r,800));
          handled = true;
          break;
        }
      }
      if (!handled) {
        const acceptTexts = ['αποδοχή όλων', 'αποδοχή', 'συμφωνώ', 'accept all', 'accept', 'allow all', 'agree'];
        const buttons = await page.$$('button, [role="button"], a, div, span');
        for (const btn of buttons) {
          const text = await page.evaluate((el: HTMLElement) => (el.textContent || '').trim().toLowerCase(), btn);
          if (acceptTexts.some((t) => text.includes(t))) {
            await btn.click().catch(() => {});
            await new Promise(r=>setTimeout(r,800));
            break;
          }
        }
      }
    } catch {}

    try {
      await page.waitForSelector('.main-price .price[data-price], .price[data-price], [data-testid="product-price"]', { timeout: 20000 });
      await page.waitForFunction(() => {
        const el = document.querySelector('.main-price .price[data-price], .price[data-price]') as HTMLElement | null;
        return !!el && !!el.getAttribute('data-price');
      }, { timeout: 20000 }).catch(() => {});
    } catch {}
    await new Promise(r=>setTimeout(r,1500));
    try {
      await page.evaluate(() => window.scrollBy(0, 200));
      await new Promise(r=>setTimeout(r,500));
    } catch {}
    result = await extractFromProductPage(page);
    if (!result) {
      const fallbackPrice = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script')).map((s) => s.textContent || '');
        for (const content of scripts) {
          const match = content.match(/"price"\s*:\s*"?([0-9.,]+)"?/i);
          if (match) return match[1];
        }
        return '';
      });
      const normalized = fallbackPrice ? normalizePrice(fallbackPrice) : null;
      if (normalized != null) {
        const title = await page.title();
        const productTitle = title?.trim() || 'Sklavenitis Product';
        result = { product: productTitle, price: normalized, currency: 'EUR' };
      }
    }
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

