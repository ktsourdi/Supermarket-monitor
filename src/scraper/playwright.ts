import type { Browser as PuppeteerBrowser } from 'puppeteer';
import type { Browser as PuppeteerCoreBrowser } from 'puppeteer-core';

export type BrowserLike = PuppeteerBrowser | PuppeteerCoreBrowser;

export type ScrapeResult = { product: string; price: number; currency: string };

async function launchBrowser(): Promise<BrowserLike> {
  // In serverless environments like Vercel, we cannot launch browsers
  // due to missing system libraries (libnss3.so, etc.)
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION) {
    throw new Error('Browser automation is not supported in serverless environments. Use HTTP-based scraping instead.');
  }

  // Local/dev: use full puppeteer which bundles a Chromium binary.
  const puppeteer = await import('puppeteer');
  return await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--disable-default-apps',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });
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
