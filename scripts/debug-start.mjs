import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

const executablePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(path => path && existsSync(path));

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', error => errors.push(`pageerror: ${error.stack || error.message}`));
page.on('console', message => {
  if (message.type() === 'error' || message.type() === 'warning') errors.push(`${message.type()}: ${message.text()}`);
});
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
console.log(JSON.stringify({
  button: await page.locator('#start-btn').evaluate(button => ({ disabled: button.disabled, text: button.textContent })),
  loading: await page.locator('#loading-label').textContent().catch(() => null),
  errors,
}, null, 2));
await browser.close();
