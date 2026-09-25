import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 4176;
const origin = `http://127.0.0.1:${port}`;
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

async function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Local test server did not start in 10 seconds')), 10000);
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('Local preview')) { clearTimeout(timeout); resolve(); }
    });
    child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Local test server exited with ${code}`)); });
  });
}

async function dispatchSwipe(locator, startX, endX) {
  await locator.evaluate((element, points) => {
    const start = new Event('touchstart', { bubbles: true, cancelable: true });
    Object.defineProperty(start, 'touches', { value: [{ clientX: points.startX, clientY: 100 }] });
    element.dispatchEvent(start);
    const end = new Event('touchend', { bubbles: true, cancelable: true });
    Object.defineProperty(end, 'changedTouches', { value: [{ clientX: points.endX, clientY: 105 }] });
    element.dispatchEvent(end);
  }, { startX, endX });
}

async function assertNoOverflow(page, label) {
  const result = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  check(result.scroll <= result.viewport + 1, `${label}: horizontal overflow ${result.scroll}/${result.viewport}`);
}

async function assertVisibleButtonsAtLeast44(page, label) {
  const undersized = await page.evaluate(() => Array.from(document.querySelectorAll('button')).filter((button) => {
    const style = getComputedStyle(button);
    const rect = button.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
  }).map((button) => ({ id: button.id, className: button.className, text: button.textContent.trim().slice(0, 40), width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
  check(undersized.length === 0, `${label}: undersized buttons ${JSON.stringify(undersized)}`);
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
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const badResponses = [];
    const externalRequests = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });
    page.on('request', (request) => { if (new URL(request.url()).hostname !== '127.0.0.1') externalRequests.push(request.url()); });

    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    check(await page.locator('[data-cookie-banner]').isVisible(), 'Cookie banner is not visible without a choice');
    await page.locator('[data-cookie-choice="all"]').click();
    check(await page.evaluate(() => localStorage.getItem('vlr:cookie-consent:v1')) === 'all', 'Cookie choice was not stored');

    const menuTrigger = page.locator('[data-panel-open="menu-panel"]');
    await menuTrigger.click();
    check(await page.locator('#menu-panel').isVisible(), 'Menu panel did not open');
    check(await page.locator('#app-shell').getAttribute('aria-hidden') === 'true', 'Background was not aria-hidden');
    check(await page.locator('#app-shell').evaluate((element) => element.inert === true), 'Background was not inert');
    for (let index = 0; index < 12; index += 1) await page.keyboard.press('Tab');
    check(await page.evaluate(() => document.querySelector('#menu-panel').contains(document.activeElement)), 'Focus escaped the menu panel');
    await page.keyboard.press('Escape');
    check(await page.locator('#menu-panel').isHidden(), 'Escape did not close the menu panel');
    check(await menuTrigger.evaluate((element) => document.activeElement === element), 'Focus was not restored to the menu trigger');

    await menuTrigger.click();
    await page.locator('[data-panel-backdrop]').click({ position: { x: 4, y: 4 } });
    check(await page.locator('#menu-panel').isHidden(), 'Backdrop did not close the menu panel');
    await menuTrigger.click();
    await dispatchSwipe(page.locator('#menu-panel [data-swipe-handle]'), 100, 200);
    check(await page.locator('#menu-panel').isHidden(), 'Swipe did not close the menu panel');

    await page.goto(`${origin}/property/berezovaya-25.html`, { waitUntil: 'domcontentloaded' });
    check(await page.locator('[data-gallery-open]').count() === 8, 'Property gallery does not contain exactly 8 items');
    const firstGalleryItem = page.locator('[data-gallery-open]').first();
    await firstGalleryItem.click();
    check(await page.locator('[data-lightbox]').isVisible(), 'Lightbox did not open');
    check((await page.locator('[data-lightbox-counter]').textContent()).includes('1 из 8'), 'Lightbox initial counter is wrong');
    await page.keyboard.press('ArrowRight');
    check((await page.locator('[data-lightbox-counter]').textContent()).includes('2 из 8'), 'ArrowRight did not advance the lightbox');
    await page.keyboard.press('ArrowLeft');
    check((await page.locator('[data-lightbox-counter]').textContent()).includes('1 из 8'), 'ArrowLeft did not return the lightbox');
    await page.keyboard.press('Escape');
    check(await page.locator('[data-lightbox]').isHidden(), 'Escape did not close the lightbox');
    check(await firstGalleryItem.evaluate((element) => document.activeElement === element), 'Lightbox focus was not restored');

    await firstGalleryItem.click();
    await dispatchSwipe(page.locator('[data-lightbox-stage]'), 200, 100);
    check((await page.locator('[data-lightbox-counter]').textContent()).includes('2 из 8'), 'Lightbox horizontal swipe did not advance');
    await page.locator('[data-lightbox-close]').click();
    check(await page.locator('[data-lightbox]').isHidden(), 'Lightbox close button failed');

    await page.goto(`${origin}/properties/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.removeItem('vlr:v1:favorites'); localStorage.removeItem('vlr:v1:compare'); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const secondTab = await context.newPage();
    await secondTab.goto(`${origin}/properties/`, { waitUntil: 'domcontentloaded' });
    const firstFavorite = page.locator('[data-favorite]').first();
    await firstFavorite.click();
    check(await firstFavorite.getAttribute('aria-pressed') === 'true', 'Favorite aria-pressed did not change');
    const favoriteValue = await page.evaluate(() => JSON.parse(localStorage.getItem('vlr:v1:favorites')));
    check(Array.isArray(favoriteValue) && favoriteValue.length === 1 && typeof favoriteValue[0] === 'string', 'Favorites store is not a slug array');
    await secondTab.locator('[data-favorite]').first().waitFor({ state: 'visible' });
    await secondTab.waitForFunction(() => document.querySelector('[data-favorite]')?.getAttribute('aria-pressed') === 'true');
    check(await secondTab.locator('[data-favorite]').first().getAttribute('aria-pressed') === 'true', 'Favorites did not synchronize between tabs');

    await page.goto(`${origin}/account/favorites.html`, { waitUntil: 'domcontentloaded' });
    check((await page.locator('[data-favorite-count]').textContent()).includes('1'), 'Favorite count is wrong on favorites page');
    check(await page.locator('[data-page="favorites"] [data-property-card]:visible').count() === 1, 'Favorites page does not show exactly the selected card');
    await page.reload({ waitUntil: 'domcontentloaded' });
    check(await page.locator('[data-page="favorites"] [data-property-card]:visible').count() === 1, 'Favorites did not persist after reload');
    await page.locator('[data-page="favorites"] [data-favorite]').first().click();
    check(await page.locator('[data-favorites-empty]').isVisible(), 'Empty favorites state is not visible');

    await page.goto(`${origin}/properties/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('vlr:v1:compare'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    for (let index = 0; index < 4; index += 1) await page.locator('[data-compare]').nth(index).click();
    check(await page.locator('[data-compare]').nth(4).isDisabled(), 'Fifth compare control is not disabled');
    check((await page.evaluate(() => JSON.parse(localStorage.getItem('vlr:v1:compare')))).length === 4, 'Compare store does not contain four items');
    await page.goto(`${origin}/account/favorites.html`, { waitUntil: 'domcontentloaded' });
    check(await page.locator('[data-compare-note]').isVisible(), 'Compare limit note is not visible');
    check(await page.locator('[data-compare-table] thead th').count() === 5, 'Compare table does not contain four object columns');
    await page.locator('[data-remove-compare]').first().click();
    check(await page.locator('[data-compare-table] thead th').count() === 4, 'Compare remove control did not update the table');
    await page.reload({ waitUntil: 'domcontentloaded' });
    check(await page.locator('[data-compare-table] thead th').count() === 4, 'Compare selection did not persist');

    await page.goto(`${origin}/search.html?type=flat&deal=rent`, { waitUntil: 'domcontentloaded' });
    check(await page.locator('[data-page="search"] [data-property-card]:visible').count() === 1, 'URL filters did not initialize');
    check((await page.locator('[data-result-count]').textContent()).includes('1'), 'URL filter count is wrong');
    await page.locator('#filter-query').fill('"><img src=x onerror=alert(1)>');
    await page.locator('#filter-type').selectOption('');
    await page.locator('#filter-deal').selectOption('');
    await page.locator('[data-search-page-form] button[type="submit"]').click();
    check(page.url().includes('%3Cimg'), 'Malicious search text was not encoded in URL');
    check(await page.locator('[data-empty-state]').isVisible(), 'No-results state is not visible');
    check(await page.locator('img[src="x"]').count() === 0, 'Search text created an injected image');
    await page.goBack({ waitUntil: 'domcontentloaded' });
    check(await page.locator('[data-page="search"] [data-property-card]:visible').count() === 1, 'Browser Back did not restore search filters');

    const storageAudit = await page.evaluate(() => Object.entries(localStorage).map(([key, value]) => [key, value]));
    check(storageAudit.every(([key]) => !/(?:name|phone|email|passport|inn)/i.test(key)), 'Sensitive key found in localStorage');
    check(storageAudit.every(([, value]) => !/(?:@|\+7\s*\(?925)/.test(value)), 'Sensitive value found in localStorage');
    check(externalRequests.length === 0, `External requests found: ${[...new Set(externalRequests)].join(', ')}`);
    check(consoleErrors.length === 0, `Console errors: ${consoleErrors.join(' | ')}`);
    check(pageErrors.length === 0, `Page errors: ${pageErrors.join(' | ')}`);
    check(badResponses.length === 0, `HTTP errors: ${[...new Set(badResponses)].join(' | ')}`);

    await secondTab.close();
    await context.close();

    const mobileContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    await mobilePage.evaluate(() => localStorage.setItem('vlr:cookie-consent:v1', 'necessary'));
    await mobilePage.reload({ waitUntil: 'domcontentloaded' });
    const footerButton = mobilePage.locator('[data-footer-accordion] button').first();
    check(await footerButton.isVisible(), 'Mobile footer accordion button is not visible');
    check(await footerButton.getAttribute('aria-expanded') === 'false', 'Mobile footer accordion starts expanded');
    await footerButton.click();
    check(await footerButton.getAttribute('aria-expanded') === 'true', 'Mobile footer accordion did not expand');
    await assertNoOverflow(mobilePage, 'mobile home');
    await mobilePage.goto(`${origin}/property/berezovaya-25.html`, { waitUntil: 'domcontentloaded' });
    await assertNoOverflow(mobilePage, 'mobile property');
    await assertVisibleButtonsAtLeast44(mobilePage, 'mobile property');
    await mobilePage.goto(`${origin}/search.html`, { waitUntil: 'domcontentloaded' });
    await assertNoOverflow(mobilePage, 'mobile search');
    await assertVisibleButtonsAtLeast44(mobilePage, 'mobile search');
    await mobilePage.goto(`${origin}/account/favorites.html`, { waitUntil: 'domcontentloaded' });
    await assertNoOverflow(mobilePage, 'mobile favorites');
    await assertVisibleButtonsAtLeast44(mobilePage, 'mobile favorites');
    await mobileContext.close();

    const noJsContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
    const noJsPage = await noJsContext.newPage();
    await noJsPage.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    check(await noJsPage.locator('.site-nav').isVisible(), 'No-JS primary navigation is not visible');
    check(await noJsPage.locator('.footer-section__content').first().isVisible(), 'No-JS footer content is hidden');
    check(await noJsPage.locator('[data-footer-accordion] button').first().isHidden(), 'No-JS footer exposes a nonfunctional button');
    await noJsContext.close();
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

run().then(() => {
  if (failures.length) {
    process.stderr.write(`E2E tests failed:\n- ${failures.join('\n- ')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('E2E tests passed: panels, lightbox, favorites, compare, search, Back, mobile and no-JS.\n');
}).catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
