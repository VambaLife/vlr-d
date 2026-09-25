import { spawn } from 'node:child_process';
import http from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 4178;
const origin = `http://127.0.0.1:${port}`;
const routes = ['/', '/property/berezovaya-25.html', '/search.html', '/account/favorites.html', '/about.html', '/faq.html', '/privacy.html', '/consent.html', '/terms.html', '/requisites.html', '/credits.html', '/404.html'];
const viewports = [{ width: 1440, height: 900 }, { width: 375, height: 812 }];
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function chromeExecutable() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  if (process.platform !== 'win32') return undefined;
  return [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ].find((candidate) => existsSync(candidate));
}

function probe(url) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method: 'GET', agent: false, headers: { connection: 'close' } }, (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode));
    });
    request.once('error', reject);
    request.end();
  });
}

async function waitForServer(child) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Static server exited with ${child.exitCode}`);
    try {
      if (await probe(`${origin}/index.html`) === 200) return;
    } catch (_) { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Static server did not become ready');
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
    browser = await chromium.launch({ headless: true, ...(chromeExecutable() ? { executablePath: chromeExecutable() } : {}) });
    const context = await browser.newContext();
    const page = await context.newPage();
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const route of routes) {
        await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => document.fonts.ready);
        const result = await new AxeBuilder({ page }).analyze();
        check(result.violations.length === 0, `${route} @ ${viewport.width}: ${result.violations.map((violation) => `${violation.id} (${violation.impact})`).join(', ')}`);
      }
    }
    await context.close();
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

run().then(() => {
  if (failures.length) {
    process.stderr.write(`Accessibility tests failed:\n- ${failures.join('\n- ')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Accessibility tests passed: ${routes.length} routes × ${viewports.length} viewports with axe-core.\n`);
}).catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
