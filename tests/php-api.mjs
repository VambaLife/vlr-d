import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 4177;
const origin = `http://127.0.0.1:${port}`;
const testBase = path.join(os.homedir(), 'AppData', 'Local', 'Temp', 'opencode', 'vlr-php-api-test');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function findPhp() {
  if (process.env.PHP_BINARY && existsSync(process.env.PHP_BINARY)) return process.env.PHP_BINARY;
  const candidates = ['C:\\Program Files\\PHP\\php.exe'];
  const packageRoot = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages');
  if (existsSync(packageRoot)) {
    for (const entry of readdirSync(packageRoot)) {
      if (entry.startsWith('PHP.PHP.')) candidates.push(path.join(packageRoot, entry, 'php.exe'));
    }
  }
  return candidates.find((candidate) => existsSync(candidate)) || 'php';
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

class CookieJar {
  constructor() { this.cookie = ''; }
  update(response) {
    const values = typeof response.headers?.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : (Array.isArray(response.headers?.['set-cookie']) ? response.headers['set-cookie'] : [response.headers?.get?.('set-cookie')].filter(Boolean));
    for (const value of values) {
      const pair = value.split(';', 1)[0];
      const [name, ...rest] = pair.split('=');
      if (!name || rest.length === 0) continue;
      const cookie = `${name}=${rest.join('=')}`;
      const parts = this.cookie ? this.cookie.split('; ') : [];
      const next = parts.filter((item) => !item.startsWith(`${name}=`));
      next.push(cookie);
      this.cookie = next.join('; ');
    }
  }
}

function rawRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const headers = { ...(options.headers || {}), connection: 'close' };
    if (options.headers instanceof Headers) {
      for (const [key, value] of options.headers.entries()) headers[key.toLowerCase()] = value;
    }
    const request = http.request(url, { method: options.method || 'GET', headers, agent: false }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ response, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

async function request(url, options = {}, jar = new CookieJar()) {
  const headers = new Headers(options.headers || {});
  if (jar.cookie) headers.set('Cookie', jar.cookie);
  const result = await rawRequest(url.startsWith('http') ? url : `${origin}${url}`, { ...options, headers });
  jar.update(result.response);
  let json = null;
  try { json = JSON.parse(result.body); } catch (_) { /* HTML response */ }
  return {
    response: { status: result.response.statusCode, native: result.response },
    body: result.body,
    json,
    jar
  };
}

async function waitForServer(child) {
  let output = '';
  child.stdout.on('data', (chunk) => { output += String(chunk); });
  child.stderr.on('data', (chunk) => { output += String(chunk); });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`PHP test server exited with ${child.exitCode}: ${output}`);
    try {
      const response = await rawRequest(`${origin}/index.html`);
      if (response.response.statusCode === 200) return;
    } catch (_) { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`PHP test server did not become ready: ${output}`);
}

async function csrf(jar) {
  const result = await request('/api/csrf.php', { headers: { Accept: 'application/json' } }, jar);
  check(result.response.status === 200, `CSRF endpoint status ${result.response.status}`);
  check(typeof result.json?.token === 'string' && /^[a-f0-9]{64}$/.test(result.json.token), `CSRF token is missing or malformed: ${result.response.status} ${result.body.slice(0, 300)}`);
  if (typeof result.json?.token !== 'string') throw new Error(`CSRF endpoint failed: ${result.response.status} ${result.body.slice(0, 300)}`);
  return result.json.token;
}

function formBody(values) {
  return new URLSearchParams(values).toString();
}

async function postContact(jar, token, values) {
  return request('/api/send.php', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin },
    body: formBody({ csrf_token: token, consent: '1', ...values })
  }, jar);
}

async function run() {
  rmSync(testBase, { recursive: true, force: true });
  mkdirSync(path.join(testBase, 'storage'), { recursive: true });
  mkdirSync(path.join(testBase, 'logs'), { recursive: true });
  const php = findPhp();
  const phpDirectory = path.dirname(php);
  const extensionDirectory = path.join(phpDirectory, 'ext');
  const phpArgs = [];
  if (existsSync(extensionDirectory)) {
    phpArgs.push('-d', `extension_dir=${extensionDirectory}`, '-d', 'extension=pdo_sqlite', '-d', 'extension=sqlite3', '-d', 'extension=mbstring', '-d', 'extension=openssl');
  }
  phpArgs.push('-S', `127.0.0.1:${port}`, '-t', root);
  const server = spawn(php, phpArgs, {
    cwd: root,
    env: {
      ...process.env,
      APP_ENV: 'testing',
      APP_DEBUG: 'false',
      APP_URL: origin,
      APP_TIMEZONE: 'Europe/Moscow',
      COOKIE_SECURE: '0',
      SESSION_NAME: 'vlr_test_session',
      MAIL_TRANSPORT: 'log',
      MAIL_TO: 'inbox@example.test',
      MAIL_FROM: 'no-reply@example.test',
      MAIL_FROM_NAME: 'VLR Test',
      MAIL_SUBJECT: 'Test lead',
      CRM_PROVIDER: 'none',
      SUBSCRIPTION_PROVIDER: 'none',
      RATE_LIMIT_SALT: 'test-rate-limit-salt-32-characters-minimum-value',
      DATA_HASH_KEY: 'test-data-hash-key-32-characters-minimum-value',
      STORAGE_PATH: path.join(testBase, 'storage'),
      LOG_PATH: path.join(testBase, 'logs'),
      LOG_LEVEL: 'debug',
      SUBSCRIPTION_CONFIRM_TTL_HOURS: '48',
      UNSUBSCRIBE_TOKEN_TTL_DAYS: '30'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let browser;
  try {
    await waitForServer(server);
    browser = await chromium.launch({ headless: true, ...(chromeExecutable() ? { executablePath: chromeExecutable() } : {}) });
    const browserContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await browserContext.addInitScript(() => localStorage.setItem('vlr:cookie-consent:v1', 'necessary'));
    const page = await browserContext.newPage();
    const browserErrors = [];
    page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
    page.on('pageerror', (error) => browserErrors.push(error.message));

    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-panel-open="contact-panel"]').first().click();
    await page.locator('#contact-name').fill('Тестовый Пользователь');
    await page.locator('#contact-phone').fill('+7 (999) 123-45-67');
    await page.locator('#contact-email').fill('lead@example.test');
    await page.locator('#contact-request-type').selectOption('Заказ услуги');
    await page.locator('#contact-message').fill('Тестовое сообщение без HTML.');
    await page.locator('.contact-form input[name="consent"]').check();
    await page.locator('.contact-form button[type="submit"]').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('#contact-status')?.textContent || '';
      return status.length > 0 && status !== 'Отправка…';
    });
    const contactStatus = await page.locator('#contact-status').textContent();
    check(contactStatus.includes('Заявка принята'), `Browser contact form did not receive a success response: ${contactStatus}`);
    await page.locator('#contact-panel [data-panel-close]').click();
    check(await page.locator('#contact-panel').isHidden(), 'Contact panel did not close after successful submission');

    await page.locator('#subscribe-email').fill('subscriber@example.test');
    await page.locator('#contact-panel').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => !document.body.classList.contains('is-locked'));
    const subscriptionConsent = page.locator('#subscribeForm input[name="consent"]');
    await page.locator('#subscribeForm .checkbox-field').click();
    if (!await subscriptionConsent.isChecked()) await subscriptionConsent.check();
    check(await subscriptionConsent.isChecked(), 'Subscription consent checkbox was not checked through its label');
    await page.locator('#subscribeForm button[type="submit"]').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('#subscribe-status')?.textContent || '';
      return status.length > 0 && status !== 'Отправка…';
    });
    const subscribeStatus = await page.locator('#subscribe-status').textContent();
    check(subscribeStatus.includes('Проверьте почту'), `Browser subscription form did not enter pending state: ${subscribeStatus}`);
    check(browserErrors.length === 0, `Browser PHP errors: ${browserErrors.join(' | ')}`);
    await browserContext.close();

    const jar = new CookieJar();
    let token = await csrf(jar);
    const setCookie = jar.cookie;
    check(/vlr_test_session=/.test(setCookie), 'Session cookie is missing');
    const invalid = await postContact(jar, token, { name: 'A', phone: '123', email: 'bad', consent: '1' });
    check(invalid.response.status === 422, `Invalid contact status ${invalid.response.status}`);
    check(Boolean(invalid.json?.errors?.name && invalid.json?.errors?.phone && invalid.json?.errors?.email), 'Invalid contact field errors are incomplete');

    const noCsrf = await request('/api/send.php', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin },
      body: formBody({ name: 'Test User', phone: '+79991234567', email: 'user@example.test', consent: '1' })
    }, jar);
    check(noCsrf.response.status === 403, `Missing CSRF status ${noCsrf.response.status}`);

    const honeypot = await postContact(jar, token, { website: 'bot', name: 'Bot', phone: '+79991234567', email: 'bot@example.test', consent: '1' });
    check(honeypot.response.status === 200, `Honeypot status ${honeypot.response.status}: ${honeypot.body}`);

    await postContact(jar, token, { name: 'Rate One', phone: '+79991234567', email: 'rate1@example.test', consent: '1' });
    const limited = await postContact(jar, token, { name: 'Rate Two', phone: '+79991234567', email: 'rate2@example.test', consent: '1' });
    check(limited.response.status === 429, `Rate limit status ${limited.response.status}`);

    const badOrigin = await request('/api/send.php', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://evil.example' },
      body: formBody({ csrf_token: token, name: 'Test', phone: '+79991234567', email: 'test@example.test', consent: '1' })
    }, jar);
    check(badOrigin.response.status === 415, `Cross-origin request status ${badOrigin.response.status}`);

    const mailPath = path.join(testBase, 'logs', 'mail.log');
    const mailRecords = readFileSync(mailPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    check(mailRecords.some((record) => record.body.includes('Тип заявки: Заказ услуги')), 'Contact request type is missing from the email');
    check(mailRecords.some((record) => record.subject.includes('Новая подписка')), 'Realtor subscription notification was not sent');
    check(mailRecords.some((record) => record.to === 'subscriber@example.test'), 'Subscriber confirmation recipient is wrong');
    check(mailRecords.some((record) => record.to === 'inbox@example.test'), 'Realtor notification recipient is wrong');
    const confirmationRecord = [...mailRecords].reverse().find((record) => record.subject.includes('Подтвердите подписку'));
    check(Boolean(confirmationRecord), 'Confirmation email was not written by test transport');
    const confirmationMatch = confirmationRecord?.body.match(/action=confirm&token=([a-f0-9]{64})/);
    check(Boolean(confirmationMatch), 'Confirmation URL/token is missing');
    if (confirmationMatch) {
      const confirmed = await request(`/api/subscribe.php?action=confirm&token=${confirmationMatch[1]}`);
      check(confirmed.response.status === 200 && confirmed.body.includes('Подписка подтверждена'), 'Subscription confirmation failed');
      const afterConfirm = readFileSync(mailPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
      const welcome = [...afterConfirm].reverse().find((record) => record.subject.includes('подтверждена'));
      const unsubscribeMatch = welcome?.body.match(/action=unsubscribe&token=([a-f0-9]{64})/);
      check(Boolean(unsubscribeMatch), 'Unsubscribe token was not issued');
      if (unsubscribeMatch) {
        const unsubscribed = await request(`/api/subscribe.php?action=unsubscribe&token=${unsubscribeMatch[1]}`);
        check(unsubscribed.response.status === 200 && unsubscribed.body.includes('Вы отписаны'), 'Unsubscribe failed');
      }
    }

    const leads = readFileSync(path.join(testBase, 'logs', 'leads.log'), 'utf8');
    const errorPath = path.join(testBase, 'logs', 'error.log');
    const errors = existsSync(errorPath) ? readFileSync(errorPath, 'utf8') : '';
    check(leads.includes('contact_sent') && leads.includes('subscription_pending') && leads.includes('subscription_confirmed'), 'Lead events are missing');
    check(leads.includes('127.0.0.1'), 'Lead log does not contain request IP');
    check(!leads.includes('lead@example.test') && !leads.includes('subscriber@example.test'), 'PII was written to leads.log');
    check(!leads.includes(confirmationMatch?.[1] || 'token') && !errors.includes(confirmationMatch?.[1] || 'token'), 'Subscription token was written to application logs');
    check(!errors.includes('Warning') && !errors.includes('Fatal'), 'PHP error log contains warnings/fatals');
  } finally {
    if (browser) await browser.close();
    server.kill();
    rmSync(testBase, { recursive: true, force: true });
  }
}

run().then(() => {
  if (failures.length) {
    process.stderr.write(`PHP API tests failed:\n- ${failures.join('\n- ')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('PHP API tests passed: CSRF, contact, validation, honeypot, limits, double-opt-in, unsubscribe and logs.\n');
}).catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
