import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const htmlFiles = [
  'index.html',
  'about.html',
  'faq.html',
  'sitemap.html',
  'privacy.html',
  'consent.html',
  'terms.html',
  'ethical.html',
  'requisites.html',
  'search.html',
  'account/favorites.html',
  '404.html',
  '500.html',
  'properties.html',
  'properties/index.html',
  'properties/flats.html',
  'properties/houses.html',
  'properties/commercial.html',
  'properties/rent.html',
  'property/berezovaya-25.html',
  'property/kp-lesnoy.html',
  'property/sovetskaya-12.html',
  'property/centr-studio.html',
  'property/kosmonavtov.html',
  'property/iksha-voda.html'
];
const indexableErrorPages = new Set(['404.html', '500.html']);
const redirects = new Set(['properties.html']);
const titles = new Map();
const canonicals = new Map();

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function exists(relativePath) {
  try { await stat(path.join(root, relativePath)); return true; } catch (_) { return false; }
}

async function text(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

function localTarget(reference, currentFile) {
  if (!reference || reference.startsWith('#') || reference.startsWith('tel:') || reference.startsWith('mailto:') || reference.startsWith('data:')) return null;
  if (/^https?:\/\//i.test(reference) || reference.startsWith('//')) return null;
  if (reference.startsWith('/')) return { pathname: reference.split(/[?#]/)[0], fragment: reference.split('#')[1] || '' };
  if (/^[a-z][a-z0-9+.-]*:/i.test(reference)) return null;
  const resolved = path.posix.resolve(path.posix.dirname(`/${currentFile}`), reference.split(/[?#]/)[0]);
  return { pathname: resolved, fragment: reference.split('#')[1] || '' };
}

function targetFile(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch (_) { return null; }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  if (decoded === '/') return 'index.html';
  const relative = decoded.replace(/^\/+/, '');
  if (decoded.endsWith('/')) return path.posix.join(relative, 'index.html');
  return relative;
}

function attributes(tag) {
  const result = new Map();
  const expression = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = expression.exec(tag))) result.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
  return result;
}

function findTagAttribute(source, tagName, requiredName, requiredValue) {
  const expression = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  for (const match of source.matchAll(expression)) {
    const attrs = attributes(match[0]);
    if (String(attrs.get(requiredName) || '').toLowerCase() === requiredValue.toLowerCase()) return attrs;
  }
  return null;
}

function decodeBasicEntities(value) {
  return String(value).replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#039;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');
}

async function checkHtml(file) {
  const source = await text(file);
  const isRedirect = redirects.has(file);
  const robotsTag = findTagAttribute(source, 'meta', 'name', 'robots');
  const noindex = Boolean(robotsTag && String(robotsTag.get('content') || '').includes('noindex'));
  check(source.startsWith('<!doctype html>'), `${file}: missing doctype`);
  if (!isRedirect) check(source.includes('<html lang="ru">'), `${file}: html lang must be ru`);
  check(!/\{\{[^}]+\}\}/.test(source), `${file}: unresolved template token`);
  check(!/http:\/\/(?!www\.w3\.org\/)/i.test(source), `${file}: insecure or unexpected http URL`);
  check(!/\son[a-z]+\s*=/i.test(source), `${file}: inline event handler found`);
  const visibleSource = source.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  check(!/(?:2450\s*\+|100\s*%|№\s*1|лучш(?:ий|ая|ее)|гарантируем сделк)/i.test(visibleSource), `${file}: unsupported advertising claim found`);

  const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  check(duplicateIds.length === 0, `${file}: duplicate ids: ${[...new Set(duplicateIds)].join(', ')}`);
  const idSet = new Set(ids);

  for (const reference of [...source.matchAll(/\baria-(?:controls|describedby|labelledby)="([^"]+)"/g)].flatMap((match) => match[1].split(/\s+/))) {
    check(idSet.has(reference), `${file}: aria reference points to missing id #${reference}`);
  }
  for (const match of source.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)) check(idSet.has(match[1]), `${file}: label points to missing id #${match[1]}`);

  const imageTags = [...source.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  for (const image of imageTags) check(/\balt="[^"]*"/i.test(image), `${file}: img without alt: ${image.slice(0, 120)}`);

  const h1Count = (source.match(/<h1\b/gi) || []).length;
  if (!isRedirect) check(h1Count === 1, `${file}: expected exactly one h1, got ${h1Count}`);
  const mainCount = (source.match(/<main\b/gi) || []).length;
  if (!isRedirect) check(mainCount === 1, `${file}: expected exactly one main, got ${mainCount}`);

  const titleMatch = source.match(/<title>([^<]*)<\/title>/i);
  const descriptionTag = findTagAttribute(source, 'meta', 'name', 'description');
  const canonicalTag = findTagAttribute(source, 'link', 'rel', 'canonical');
  if (!isRedirect) {
    check(Boolean(titleMatch), `${file}: title missing`);
    check(Boolean(descriptionTag), `${file}: description missing`);
    check(Boolean(canonicalTag), `${file}: canonical missing`);
  }
  if (titleMatch) {
    const title = decodeBasicEntities(titleMatch[1]);
    check(!titles.has(title), `${file}: duplicate title with ${titles.get(title)}`);
    titles.set(title, file);
    if (!isRedirect && !indexableErrorPages.has(file)) check(title.length >= 50 && title.length <= 60, `${file}: title length ${title.length}, expected 50-60`);
  }
  if (descriptionTag) {
    const description = decodeBasicEntities(descriptionTag.get('content') || '');
    if (!isRedirect && !indexableErrorPages.has(file)) check(description.length >= 150 && description.length <= 160, `${file}: description length ${description.length}, expected 150-160`);
  }
  if (canonicalTag) {
    const canonical = canonicalTag.get('href') || '';
    check(canonical.startsWith('https://'), `${file}: canonical must use https`);
    check(!canonicals.has(canonical), `${file}: duplicate canonical with ${canonicals.get(canonical)}`);
    canonicals.set(canonical, file);
    if (indexableErrorPages.has(file)) check(noindex, `${file}: error page must be noindex`);
  }

  const jsonLd = source.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!isRedirect) {
    check(Boolean(jsonLd), `${file}: JSON-LD missing`);
    if (jsonLd) {
      try { JSON.parse(jsonLd[1].replaceAll('\\u003c', '<').replaceAll('\\u003e', '>').replaceAll('\\u0026', '&')); }
      catch (error) { failures.push(`${file}: invalid JSON-LD (${error.message})`); }
    }
  }

  const referenceTags = [...source.matchAll(/<(?:a|link|script|img|form)\b[^>]*(?:href|src|action)="[^"]+"[^>]*>/gi)].map((match) => match[0]);
  for (const tag of referenceTags) {
    const attrs = attributes(tag);
    const reference = attrs.get('href') || attrs.get('src') || attrs.get('action');
    if (attrs.has('target') && attrs.get('target') === '_blank') check(/\brel="[^"]*\bnoopener\b/i.test(tag), `${file}: target=_blank without noopener`);
    if (reference.startsWith('/api/')) continue;
    const local = localTarget(reference, file);
    if (!local) continue;
    const linkedFile = targetFile(local.pathname);
    if (!linkedFile) { failures.push(`${file}: invalid local reference ${reference}`); continue; }
    check(await exists(linkedFile), `${file}: broken local reference ${reference} -> ${linkedFile}`);
    if (local.fragment && linkedFile.endsWith('.html') && await exists(linkedFile)) {
      const linkedSource = await text(linkedFile);
      check(new RegExp(`\\bid="${local.fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(linkedSource), `${file}: missing fragment #${local.fragment} in ${linkedFile}`);
    }
  }
}

async function main() {
  const required = [
    'assets/css/style.min.css',
    'assets/js/main.min.js',
    'assets/fonts/manrope-cyrillic.woff2',
    'assets/fonts/manrope-latin.woff2',
    'assets/fonts/cormorant-cyrillic.woff2',
    'assets/fonts/cormorant-latin.woff2',
    'assets/fonts/Manrope-OFL.txt',
    'assets/fonts/CormorantGaramond-OFL.txt',
    'img/og-default.jpg',
    'img/dmitrov-poster.jpg',
    ...htmlFiles
  ];
  for (const file of required) check(await exists(file), `Missing required file: ${file}`);
  for (const file of htmlFiles) if (await exists(file)) await checkHtml(file);

  const runtimeFiles = ['assets/js/main.js', 'assets/js/main.min.js'];
  for (const file of runtimeFiles) {
    if (!await exists(file)) continue;
    const source = await text(file);
    check(!/console\.(?:log|debug|info|warn|error)\s*\(/.test(source), `${file}: console output found`);
    check(!/\beval\s*\(/.test(source), `${file}: eval found`);
    check(!/document\.write\s*\(/.test(source), `${file}: document.write found`);
    check(!/\.innerHTML\s*=/.test(source), `${file}: innerHTML assignment found`);
    check(!/\.outerHTML\s*=/.test(source), `${file}: outerHTML assignment found`);
    check(!/insertAdjacentHTML\s*\(/.test(source), `${file}: insertAdjacentHTML found`);
  }

  for (const file of [
    'assets/fonts/manrope-cyrillic.woff2',
    'assets/fonts/manrope-latin.woff2',
    'assets/fonts/cormorant-cyrillic.woff2',
    'assets/fonts/cormorant-latin.woff2'
  ]) {
    if (!await exists(file)) continue;
    const data = await readFile(path.join(root, file));
    check(data.subarray(0, 4).toString('ascii') === 'wOF2', `${file}: invalid WOFF2 signature`);
  }

  const imageDimensions = new Map([
    ['img/og-default.jpg', [1200, 630]],
    ['img/dmitrov-poster.jpg', [1920, 1080]]
  ]);
  for (const [file, expected] of imageDimensions) {
    if (!await exists(file)) continue;
    const metadata = await sharp(path.join(root, file)).metadata();
    check(metadata.width === expected[0] && metadata.height === expected[1], `${file}: expected ${expected.join('x')}, got ${metadata.width}x${metadata.height}`);
    check(metadata.format === 'jpeg', `${file}: expected JPEG, got ${metadata.format}`);
  }

  if (await exists('assets/js/main.min.js')) {
    const size = (await stat(path.join(root, 'assets/js/main.min.js'))).size;
    check(size > 0 && size < 50000, `main.min.js has unexpected size: ${size}`);
  }
  if (await exists('assets/css/style.min.css')) {
    const size = (await stat(path.join(root, 'assets/css/style.min.css'))).size;
    check(size > 0 && size < 60000, `style.min.css has unexpected size: ${size}`);
  }

  if (failures.length) {
    process.stderr.write(`Static checks failed:\n- ${failures.join('\n- ')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Static checks passed: ${htmlFiles.length} HTML files, ${required.length} required files, all local references resolved.\n`);
}

main().catch(function (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
