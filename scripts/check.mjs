import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function exists(relativePath) {
  try { await stat(path.join(root, relativePath)); return true; } catch (_) { return false; }
}

async function text(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

async function main() {
  const required = [
    'index.html',
    'assets/css/style.min.css',
    'assets/js/main.min.js',
    'assets/fonts/manrope-cyrillic.woff2',
    'assets/fonts/manrope-latin.woff2',
    'assets/fonts/cormorant-cyrillic.woff2',
    'assets/fonts/cormorant-latin.woff2',
    'assets/fonts/Manrope-OFL.txt',
    'assets/fonts/CormorantGaramond-OFL.txt'
  ];
  for (const file of required) check(await exists(file), `Missing required file: ${file}`);

  const htmlFiles = ['index.html'];
  for (const file of htmlFiles) {
    if (!await exists(file)) continue;
    const source = await text(file);
    check(source.includes('<html lang="ru">'), `${file}: html lang must be ru`);
    check(!/\{\{[^}]+\}\}/.test(source), `${file}: unresolved template token`);
    check(!/http:\/\/(?!www\.w3\.org\/)/i.test(source), `${file}: insecure or unexpected http URL`);
    check(!/\son[a-z]+\s*=/i.test(source), `${file}: inline event handler found`);
    const jsonLd = source.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (jsonLd) {
      try { JSON.parse(jsonLd[1].replaceAll('\\u003c', '<').replaceAll('\\u003e', '>').replaceAll('\\u0026', '&')); }
      catch (error) { failures.push(`${file}: invalid JSON-LD (${error.message})`); }
    }
  }

  const runtimeFiles = ['assets/js/main.js', 'assets/js/main.min.js'];
  for (const file of runtimeFiles) {
    if (!await exists(file)) continue;
    const source = await text(file);
    check(!/console\.(?:log|debug|info|warn|error)\s*\(/.test(source), `${file}: console output found`);
    check(!/\beval\s*\(/.test(source), `${file}: eval found`);
    check(!/document\.write\s*\(/.test(source), `${file}: document.write found`);
    check(!/\.innerHTML\s*=/.test(source), `${file}: innerHTML assignment found`);
    check(!/\.outerHTML\s*=/.test(source), `${file}: outerHTML assignment found`);
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
  process.stdout.write(`Static checks passed (${required.length} required files).\n`);
}

main().catch(function (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
