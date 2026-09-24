import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import CleanCSS from 'clean-css';
import { minify as minifyHtml } from 'html-minifier-terser';
import { minify as minifyJs } from 'terser';
import { ensureMediaAssets } from './generate-assets.mjs';
import {
  assertNoUnresolvedTokens,
  metaDescriptionForHome,
  readText,
  renderPropertyCard,
  replaceTokens,
  safeJson,
  schemaForHome
} from './lib.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '..');

async function minifyCss(source, output) {
  const result = await new CleanCSS({ level: 2, returnPromise: true }).minify(source);
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  if (result.warnings.length) process.stderr.write(`${result.warnings.join('\n')}\n`);
  await writeFile(path.join(root, output), `${result.styles}\n`, 'utf8');
}

async function minifyScript(source, output) {
  const result = await minifyJs(source, {
    compress: { passes: 2 },
    mangle: true,
    format: { comments: false }
  });
  if (!result.code) throw new Error(`Minification failed for ${output}`);
  await writeFile(path.join(root, output), `${result.code}\n`, 'utf8');
}

async function buildPage({ layout, header, footer, cookieBanner, overlays, pageTemplate, site, properties, criticalCss, output, page }) {
  const content = replaceTokens(pageTemplate, {
    propertyCards: properties.map(renderPropertyCard).join('')
  });
  const title = 'Недвижимость в Дмитровском округе — ВЛР-Дмитров';
  const description = metaDescriptionForHome();
  const canonical = `${site.baseUrl}/`;
  const ogImageUrl = new URL(site.ogImage, site.baseUrl).href;
  const ogImageBlock = `<meta property="og:image" content="${ogImageUrl}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="ВЛР-Дмитров — агентство недвижимости в Дмитровском округе">`;
  const twitterImageBlock = `<meta name="twitter:image" content="${ogImageUrl}"><meta name="twitter:image:alt" content="ВЛР-Дмитров — агентство недвижимости">`;
  const html = replaceTokens(layout, {
    lang: 'ru',
    title,
    description,
    robots: 'index, follow, max-image-preview:large',
    canonical,
    ogType: 'website',
    siteName: site.brandName,
    ogImageBlock,
    twitterImageBlock,
    schemaJson: safeJson(schemaForHome(site)),
    criticalCss,
    bodyClass: 'page-home',
    pageKey: page,
    header,
    content,
    footer,
    cookieBanner,
    overlays
  });
  assertNoUnresolvedTokens(html, output);
  const minified = await minifyHtml(html, {
    collapseWhitespace: true,
    conservativeCollapse: true,
    continueOnParseError: true,
    decodeEntities: true,
    html5: true,
    keepClosingSlash: true,
    minifyCSS: false,
    minifyJS: false,
    processConditionalComments: true,
    quoteCharacter: '"',
    removeComments: false,
    removeEmptyAttributes: false,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: false,
    removeStyleLinkTypeAttributes: true,
    sortAttributes: true,
    sortClassName: false,
    useShortDoctype: true
  });
  await mkdir(path.dirname(path.join(root, output)), { recursive: true });
  await writeFile(path.join(root, output), `${minified.trim()}\n`, 'utf8');
  return output;
}

async function main() {
  await ensureMediaAssets();
  const [site, properties, layout, header, footer, cookieBanner, overlays, pageTemplate, criticalSource, cssSource, jsSource] = await Promise.all([
    readJson('src/data/site.json'),
    readJson('src/data/properties.json'),
    readText(root, 'src/layout.html'),
    readText(root, 'src/partials/header.html'),
    readText(root, 'src/partials/footer.html'),
    readText(root, 'src/partials/cookie-banner.html'),
    readText(root, 'src/partials/overlays.html'),
    readText(root, 'src/pages/home.html'),
    readText(root, 'src/critical.css'),
    readText(root, 'assets/css/style.css'),
    readText(root, 'assets/js/main.js')
  ]);

  const criticalResult = await new CleanCSS({ level: 2 }).minify(criticalSource);
  if (criticalResult.errors.length) throw new Error(criticalResult.errors.join('\n'));
  const outputFiles = [];
  outputFiles.push(await buildPage({
    layout, header, footer, cookieBanner, overlays, pageTemplate, site, properties,
    criticalCss: criticalResult.styles, output: 'index.html', page: 'home'
  }));
  await minifyCss(cssSource, 'assets/css/style.min.css');
  await minifyScript(jsSource, 'assets/js/main.min.js');
  outputFiles.push('assets/css/style.min.css', 'assets/js/main.min.js');
  process.stdout.write(`Built ${outputFiles.length} production assets.\n`);
}

async function readJson(relativePath) {
  return JSON.parse(await readText(root, relativePath));
}

main().catch(function (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
