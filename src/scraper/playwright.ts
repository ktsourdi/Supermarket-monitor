import type { Browser as PuppeteerBrowser } from 'puppeteer';
import type { Browser as PuppeteerCoreBrowser } from 'puppeteer-core';

export type BrowserLike = PuppeteerBrowser | PuppeteerCoreBrowser;

export type ScrapeResult = { product: string; price: number; currency: string };

async function launchBrowser(): Promise<BrowserLike> {
  // In Vercel/serverless, use puppeteer-core with @sparticuz/chromium.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION) {
    const { default: chromium } = await import('@sparticuz/chromium');
    const puppeteer = await import('puppeteer-core');
    if (typeof (chromium as unknown as { setHeadlessMode?: (h: boolean) => void }).setHeadlessMode === 'function') {
      (chromium as unknown as { setHeadlessMode: (h: boolean) => void }).setHeadlessMode(true);
    }
    if (typeof (chromium as unknown as { setGraphicsMode?: (g: boolean) => void }).setGraphicsMode === 'function') {
      (chromium as unknown as { setGraphicsMode: (g: boolean) => void }).setGraphicsMode(false);
    }
    const executablePath = await chromium.executablePath();
    return await puppeteer.launch({
      headless: chromium.headless,
      args: chromium.args,
      executablePath: executablePath ?? undefined,
      defaultViewport: chromium.defaultViewport,
    });
  }

  // Local/dev: use full puppeteer which bundles a Chromium binary.
  const puppeteer = await import('puppeteer');
  return await puppeteer.launch({ headless: true });
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
