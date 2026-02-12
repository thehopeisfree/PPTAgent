import { chromium, type Browser } from "playwright";

/**
 * Launch a Chromium browser with environment-aware defaults.
 *
 * In CaaS containers, set CHROMIUM_PATH=/usr/bin/chromium to use the
 * system browser instead of Playwright's bundled download. The required
 * sandbox flags are added automatically when CHROMIUM_PATH is set.
 */
export async function launchBrowser(): Promise<Browser> {
  const executablePath = process.env.CHROMIUM_PATH;
  if (executablePath) {
    return chromium.launch({
      executablePath,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return chromium.launch();
}
