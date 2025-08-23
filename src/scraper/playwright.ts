import { chromium, type Browser } from 'playwright';

export type ScrapeResult = { product: string; price: number; currency: string };

export async function withBrowser(action: (browser: Browser) => Promise<void>) {
  const browser = await chromium.launch({ headless: true });
  try {
    await action(browser);
  } finally {
    await browser.close();
  }
}

export async function scrapeExampleSite(): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = [];
  await withBrowser(async (browser) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('https://example.com');
    const title = await page.textContent('h1');
    if (title) {
      results.push({ product: title.trim(), price: 0, currency: 'USD' });
    }
    await context.close();
  });
  return results;
}
