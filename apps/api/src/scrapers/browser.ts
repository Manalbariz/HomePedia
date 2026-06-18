import { chromium } from "playwright-extra";
// @ts-ignore — CJS default import, works fine with tsx
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser } from "playwright";

chromium.use(StealthPlugin());

let _browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (_browser?.isConnected()) return _browser;
  _browser = (await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--lang=fr-FR",
    ],
  })) as Browser;
  return _browser;
}

export async function closeBrowser(): Promise<void> {
  await _browser?.close();
  _browser = null;
}
