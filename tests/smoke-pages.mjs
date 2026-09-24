import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 4174;
const origin = `http://127.0.0.1:${port}`;
const pages = [
  '/', '/about.html', '/faq.html', '/sitemap.html', '/privacy.html', '/consent.html', '/terms.html',
  '/ethical.html', '/requisites.html', '/search.html', '/account/favorites.html', '/404.html', '/500.html',
  '/properties.html', '/properties/', '/properties/flats.html', '/properties/houses.html',
  '/properties/commercial.html', '/properties/rent.html', '/property/berezovaya-25.html',
  '/property/kp-lesnoy.html', '/property/sovetskaya-12.html', '/property/centr-studio.html',
  '/property/kosmonavtov.html', '/property/iksha-voda.html'
];
const widths = [375, 768, 1440];
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function chromeExecutable() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  if (process.platform !== 'win32') return undefined;
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

async function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Local test server did not start in 10 seconds')), 10000);
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('Local preview')) { clearTimeout(timeout); resolve(); }
    });
    child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Local test server exited with ${code}`)); });
  });
}

async function run() {
  const server = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let browser;
  try {
    await waitForServer(server);
    const executablePath = chromeExecutable();
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleErrors = [];
    const badResponses = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    page.on('response', (response) => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });

    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of pages) {
        const response = await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded' });
        check(Boolean(response && response.status() === 200), `${route} @ ${width}: HTTP status ${response?.status()}`);
        if (route === '/properties.html') {
          await page.waitForURL(`${origin}/properties/`);
          continue;
        }
        await page.evaluate(() => document.fonts.ready);
        const metrics = await page.evaluate(() => ({
          h1: document.querySelectorAll('h1').length,
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          width: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
          title: document.title
        }));
        if (route !== '/properties.html') check(metrics.h1 === 1, `${route} @ ${width}: expected 1 h1, got ${metrics.h1}`);
        check(!metrics.overflow, `${route} @ ${width}: horizontal overflow ${metrics.width}/${metrics.viewport}`);
        check(Boolean(metrics.title), `${route} @ ${width}: empty title`);
      }
    }
    check(consoleErrors.length === 0, `Console errors: ${consoleErrors.join(' | ')}`);
    check(badResponses.length === 0, `HTTP errors: ${[...new Set(badResponses)].join(' | ')}`);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    await Promise.all([page.waitForURL(/\/property\/berezovaya-25\.html$/), page.locator('[data-property-card] a').first().click()]);
    check(page.url().endsWith('/property/berezovaya-25.html'), `Direct property navigation failed: ${page.url()}`);
    await page.goBack({ waitUntil: 'domcontentloaded' });
    check(new URL(page.url()).pathname === '/', `Browser Back failed: ${page.url()}`);

    const noJsContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
    const noJsPage = await noJsContext.newPage();
    for (const route of ['/properties/', '/property/berezovaya-25.html', '/search.html']) {
      const response = await noJsPage.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded' });
      check(Boolean(response && response.status() === 200), `${route} without JS: HTTP status ${response?.status()}`);
      const state = await noJsPage.evaluate(() => ({
        h1: document.querySelectorAll('h1').length,
        cards: document.querySelectorAll('[data-property-card]').length,
        styles: document.styleSheets.length,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1
      }));
      check(state.h1 === 1, `${route} without JS: expected one h1`);
      check(state.styles > 0, `${route} without JS: stylesheet missing`);
      check(!state.overflow, `${route} without JS: horizontal overflow`);
      if (route !== '/search.html') check(state.cards > 0, `${route} without JS: property cards missing`);
    }
    await noJsContext.close();
    await context.close();
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

run().then(() => {
  if (failures.length) {
    process.stderr.write(`Browser smoke tests failed:\n- ${failures.join('\n- ')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Browser smoke tests passed: ${pages.length} routes × ${widths.length} widths, Back/direct/no-JS checks.\n`);
}).catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
