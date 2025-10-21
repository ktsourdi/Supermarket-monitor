import type { Browser as PuppeteerBrowser } from 'puppeteer';
import type { Browser as PuppeteerCoreBrowser } from 'puppeteer-core';

export type BrowserLike = PuppeteerBrowser | PuppeteerCoreBrowser;

export type ScrapeResult = { product: string; price: number; currency: string };

// --- Proxy utilities (env-driven) ---
type ProxySelection = {
  proxyServerArg: string; // value suitable for --proxy-server=
  auth?: { username: string; password: string } | null;
};

function parseProxyEntry(raw: string): ProxySelection | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const hasScheme = /^\w+:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
    const url = new URL(hasScheme);
    const protocol = url.protocol.replace(/:$/, '') || 'http';
    const host = url.hostname;
    const port = url.port || (protocol === 'https' ? '443' : '80');
    const proxyServerArg = `${protocol}://${host}:${port}`;
    const username = decodeURIComponent(url.username || '');
    const password = decodeURIComponent(url.password || '');
    const auth = username && password ? { username, password } : null;
    return { proxyServerArg, auth };
  } catch {
    return null;
  }
}

function getProxyCandidatesFromEnv(): ProxySelection[] {
  const rawList = (process.env.BROWSER_PROXY_URLS || process.env.PROXY_URLS || '').split(',');
  const single = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || '';
  const entries = [...rawList, single].map((s) => s.trim()).filter(Boolean);
  const parsed = entries
    .map(parseProxyEntry)
    .filter((x): x is ProxySelection => !!x);
  return parsed;
}

let currentProxyAuth: { username: string; password: string } | null = null;

export function getCurrentProxyAuth(): { username: string; password: string } | null {
  // If explicit env auth provided, prefer it over URL-embedded credentials
  const envUser = process.env.PROXY_USERNAME?.trim();
  const envPass = process.env.PROXY_PASSWORD?.trim();
  if (envUser && envPass) return { username: envUser, password: envPass };
  return currentProxyAuth;
}

async function launchBrowser(): Promise<BrowserLike> {
  // Choose a proxy if configured
  const proxies = getProxyCandidatesFromEnv();
  const selected = proxies.length ? proxies[Math.floor(Math.random() * proxies.length)] : null;
  currentProxyAuth = selected?.auth ?? null;

  // In Vercel/serverless, use puppeteer-core with @sparticuz/chromium.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION) {
    const { default: chromium } = await import('@sparticuz/chromium');
    const puppeteer = await import('puppeteer-core');

    // Sparticuz chromium provides these sensible defaults.
    // Making them explicit in case of version changes.
    await chromium.font('https://raw.githack.com/googlei18n/noto-cjk/main/NotoSansCJK-Regular.ttc');

    const executablePath = await chromium.executablePath();
    const args = selected ? [...chromium.args, `--proxy-server=${selected.proxyServerArg}`] : chromium.args;
    return await puppeteer.launch({
      headless: chromium.headless,
      args,
      executablePath: executablePath ?? undefined,
      defaultViewport: chromium.defaultViewport,
    });
  }

  // Local/dev: use full puppeteer which bundles a Chromium binary.
  const puppeteer = await import('puppeteer');
  const launchArgs = selected ? [`--proxy-server=${selected.proxyServerArg}`] : [];
  return await puppeteer.launch({ headless: true, args: launchArgs });
}

export async function withBrowser(action: (browser: BrowserLike) => Promise<void>) {
  const browser = await launchBrowser();
  try {
    await action(browser);
  } finally {
    await browser.close();
  }
}

export async function scrapeExampleSite(): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = [];
  await withBrowser(async (browser) => {
    const page = await browser.newPage();
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
    const elementHandle = await page.$('h1');
    let title = '';
    if (elementHandle) {
      const textProp = await elementHandle.getProperty('textContent');
      const raw = (await textProp.jsonValue()) as string | null;
      title = (raw ?? '').trim();
      await elementHandle.dispose();
    }
    if (title) {
      results.push({ product: title, price: 0, currency: 'USD' });
    }
    await page.close();
  });
  return results;
}
