import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import CleanCSS from 'clean-css';
import { minify as minifyHtml } from 'html-minifier-terser';
import { minify as minifyJs } from 'terser';
import { ensureMediaAssets } from './generate-assets.mjs';
import {
  assertNoUnresolvedTokens,
  breadcrumbSchema,
  collectionSchema,
  faqSchema,
  pageSchema,
  propertyMatchesCategory,
  propertySchema,
  readText,
  renderBreadcrumbs,
  renderCatalogPage,
  renderFaqItems,
  renderPropertyCard,
  renderPropertyPage,
  replaceTokens,
  safeJson
} from './lib.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '..');
const htmlMinifierOptions = {
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
  removeRedundantAttributes: false,
  removeScriptTypeAttributes: false,
  removeStyleLinkTypeAttributes: true,
  sortAttributes: true,
  sortClassName: false,
  useShortDoctype: true
};

async function readJson(relativePath) {
  return JSON.parse(await readText(root, relativePath));
}

async function minifyCss(source, output) {
  const result = await new CleanCSS({ level: 2, returnPromise: true }).minify(source);
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  if (result.warnings.length) process.stderr.write(`${result.warnings.join('\n')}\n`);
  await writeFile(path.join(root, output), `${result.styles}\n`, 'utf8');
}

async function minifyScript(source, output) {
  const result = await minifyJs(source, { compress: { passes: 2 }, mangle: true, format: { comments: false } });
  if (!result.code) throw new Error(`Minification failed for ${output}`);
  await writeFile(path.join(root, output), `${result.code}\n`, 'utf8');
}

async function writeHtml(output, source) {
  assertNoUnresolvedTokens(source, output);
  const minified = await minifyHtml(source, htmlMinifierOptions);
  await mkdir(path.dirname(path.join(root, output)), { recursive: true });
  await writeFile(path.join(root, output), `${minified.trim()}\n`, 'utf8');
  return output;
}

function absoluteUrl(site, pathname) {
  return new URL(pathname, site.baseUrl).href;
}

function socialBlocks(site) {
  const imageUrl = absoluteUrl(site, site.ogImage);
  return {
    ogImageBlock: `<meta property="og:image" content="${imageUrl}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="ВЛР-Дмитров — агентство недвижимости в Дмитровском округе">`,
    twitterImageBlock: `<meta name="twitter:image" content="${imageUrl}"><meta name="twitter:image:alt" content="ВЛР-Дмитров — агентство недвижимости">`
  };
}

async function renderLayout(context) {
  const { layout, header, footer, cookieBanner, overlays, page, content, schema, criticalCss, site } = context;
  const social = socialBlocks(site);
  return replaceTokens(layout, {
    lang: 'ru',
    title: page.title,
    description: page.description,
    robots: page.robots || 'index, follow, max-image-preview:large',
    canonical: absoluteUrl(site, page.canonical),
    ogType: 'website',
    siteName: site.brandName,
    ogImageBlock: social.ogImageBlock,
    twitterImageBlock: social.twitterImageBlock,
    schemaJson: safeJson(schema),
    criticalCss,
    bodyClass: page.bodyClass || 'page-content',
    pageKey: page.key,
    knownProperties: (context.site.knownProperties || []).join(','),
    header,
    content,
    footer,
    cookieBanner,
    overlays
  });
}

function staticBreadcrumbs(page) {
  if (!page.breadcrumb) return [];
  return [
    { name: 'Главная', url: '/' },
    { name: page.breadcrumb, url: page.canonical }
  ];
}

async function buildStaticPage({ page, template, tokens, site, faqs, layout, header, footer, cookieBanner, overlays, criticalCss, lightbox }) {
  let content = replaceTokens(template, tokens);
  const breadcrumbs = staticBreadcrumbs(page);
  if (breadcrumbs.length) content = `${renderBreadcrumbs(breadcrumbs)}${content}`;
  const extra = [];
  if (page.key === 'faq') extra.push(faqSchema(faqs));
  const schema = pageSchema(site, page, breadcrumbs, extra);
  const html = await renderLayout({ layout, header, footer, cookieBanner, overlays, page, content, schema, criticalCss, site });
  return writeHtml(page.output, html);
}

function categoryDefinitions() {
  return [
    { key: 'flats', title: 'Квартиры', lead: 'Карточки квартир будут опубликованы после проверки документов и характеристик.', notice: 'Черновые карточки ещё не отнесены к категории «Квартиры».' },
    { key: 'houses', title: 'Дома', lead: 'Раздел для домов и загородных объектов.', notice: 'Черновые карточки ещё не отнесены к категории «Дома».' },
    { key: 'commercial', title: 'Коммерция', lead: 'Раздел для коммерческих помещений и проектов.', notice: 'Черновые карточки ещё не отнесены к категории «Коммерция».' },
    { key: 'rent', title: 'Аренда', lead: 'Раздел для объектов, доступных в аренду.', notice: 'Условия аренды и принадлежность карточек к категории пока не подтверждены.' }
  ];
}

function catalogProperties(categoryKey, properties) {
  if (!categoryKey) return properties;
  return properties.filter((property) => propertyMatchesCategory(property, categoryKey));
}

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

async function collectCspScriptHashes(outputFiles) {
  const hashes = new Set();
  for (const file of outputFiles.filter((name) => name.endsWith('.html') && name !== 'properties.html')) {
    const source = await readText(root, file);
    for (const match of source.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      hashes.add(createHash('sha256').update(match[1], 'utf8').digest('base64'));
    }
  }
  return [...hashes].sort().map((hash) => `'sha256-${hash}'`).join(' ');
}

async function writeInfrastructure({ site, pageDefinitions, properties, outputFiles }) {
  const originUrl = new URL(site.baseUrl);
  const canonicalHost = originUrl.host;
  const cspHashes = await collectCspScriptHashes(outputFiles);
  const cspConfig = `# Generated by scripts/build.mjs. Do not edit manually.\nset $csp_script_hashes "${cspHashes}";\n`;
  await mkdir(path.join(root, 'assets/config'), { recursive: true });
  await writeFile(path.join(root, 'assets/config/csp-script-hashes.conf'), cspConfig, 'utf8');

  const [htaccessTemplate, nginxTemplate] = await Promise.all([
    readText(root, 'src/server/htaccess.template'),
    readText(root, 'src/server/nginx.conf.template')
  ]);
  const replacements = {
    __CSP_SCRIPT_HASHES__: cspHashes,
    __CANONICAL_HOST__: canonicalHost,
    __PROJECT_ROOT__: '/var/www/vlr-dmitrov',
    __CERT_PATH__: `/etc/letsencrypt/live/${canonicalHost}`,
    __PHP_FPM_SOCKET__: '/run/php/php8.3-fpm.sock'
  };
  const renderConfig = (source) => Object.entries(replacements).reduce(
    (value, [key, replacement]) => value.replaceAll(key, replacement),
    source
  );
  await writeFile(path.join(root, '.htaccess'), renderConfig(htaccessTemplate), 'utf8');
  await writeFile(path.join(root, 'nginx.conf'), renderConfig(nginxTemplate), 'utf8');

  const indexablePageUrls = pageDefinitions
    .filter((page) => !String(page.robots || '').includes('noindex'))
    .map((page) => page.canonical);
  const additionalUrls = [
    '/properties/',
    '/properties/flats.html',
    '/properties/houses.html',
    '/properties/commercial.html',
    '/properties/rent.html',
    ...properties.filter((property) => property.verified).map((property) => `/property/${property.slug}.html`)
  ];
  const sitemapUrls = [...new Set([...indexablePageUrls, ...additionalUrls])];
  const lastModified = site.legalPublishedAt || new Date().toISOString().slice(0, 10);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map((url) => `  <url><loc>${xmlEscape(new URL(url, site.baseUrl).href)}</loc><lastmod>${xmlEscape(lastModified)}</lastmod></url>`).join('\n')}\n</urlset>\n`;
  await writeFile(path.join(root, 'sitemap.xml'), sitemap, 'utf8');

  const robots = `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${new URL('/sitemap.xml', site.baseUrl).href}\n`;
  await writeFile(path.join(root, 'robots.txt'), robots, 'utf8');

  return ['.htaccess', 'nginx.conf', 'assets/config/csp-script-hashes.conf', 'robots.txt', 'sitemap.xml'];
}

async function main() {
  await ensureMediaAssets();
  const [site, properties, pageDefinitions, faqs, layout, header, footer, cookieBanner, overlays, lightbox, criticalSource, cssSource, jsSource] = await Promise.all([
    readJson('src/data/site.json'),
    readJson('src/data/properties.json'),
    readJson('src/data/pages.json'),
    readJson('src/data/faqs.json'),
    readText(root, 'src/layout.html'),
    readText(root, 'src/partials/header.html'),
    readText(root, 'src/partials/footer.html'),
    readText(root, 'src/partials/cookie-banner.html'),
    readText(root, 'src/partials/overlays.html'),
    readText(root, 'src/partials/lightbox.html'),
    readText(root, 'src/critical.css'),
    readText(root, 'assets/css/style.css'),
    readText(root, 'assets/js/main.js')
  ]);
  site.knownProperties = properties.map((property) => property.slug);

  const criticalResult = await new CleanCSS({ level: 2 }).minify(criticalSource);
  if (criticalResult.errors.length) throw new Error(criticalResult.errors.join('\n'));
  const criticalCss = criticalResult.styles;
  const templates = new Map();
  for (const page of pageDefinitions) {
    if (page.source) templates.set(page.key, await readText(root, `src/pages/${page.source}`));
  }

  const propertyCards = properties.map(renderPropertyCard).join('');
  const tokens = {
    propertyCards,
    faqItems: renderFaqItems(faqs),
    pageLinks: '',
    categoryLinks: '',
    propertyLinks: ''
  };
  const outputFiles = [];

  for (const page of pageDefinitions) {
    outputFiles.push(await buildStaticPage({
      page, template: templates.get(page.key), tokens, site, faqs, layout, header, footer,
      cookieBanner, overlays, criticalCss, lightbox
    }));
  }

  const indexPage = pageDefinitions.find((page) => page.key === 'home');
  tokens.pageLinks = pageDefinitions
    .filter((page) => !String(page.robots || '').includes('noindex'))
    .map((page) => `<a href="${page.canonical}">${page.title.split(' — ')[0]}</a>`)
    .join('');
  tokens.categoryLinks = categoryDefinitions().map((category) => `<a href="/properties/${category.key}.html">${category.title}</a>`).join('');
  tokens.propertyLinks = properties.map((property) => `<a href="/property/${property.slug}.html">${property.title}</a>`).join('');
  const sitemapPage = pageDefinitions.find((page) => page.key === 'sitemap');
  let sitemapContent = replaceTokens(templates.get('sitemap'), tokens);
  const sitemapBreadcrumbs = staticBreadcrumbs(sitemapPage);
  sitemapContent = `${renderBreadcrumbs(sitemapBreadcrumbs)}${sitemapContent}`;
  const sitemapSchema = pageSchema(site, sitemapPage, sitemapBreadcrumbs);
  outputFiles.push(await writeHtml(sitemapPage.output, await renderLayout({
    layout, header, footer, cookieBanner, overlays, page: sitemapPage,
    content: sitemapContent, schema: sitemapSchema, criticalCss, site
  })));

  const propertiesPage = {
    key: 'properties', output: 'properties/index.html', canonical: '/properties/',
    title: 'Каталог недвижимости ВЛР-Дмитров — Дмитровский округ',
    description: 'Каталог объектов недвижимости ВЛР-Дмитров. Просматривайте черновые карточки и переходите к страницам с проверенными данными после публикации. Статус проверки.',
    bodyClass: 'page-catalog', robots: 'index, follow, max-image-preview:large'
  };
  const propertiesBreadcrumbs = [{ name: 'Главная', url: '/' }, { name: 'Объекты', url: '/properties/' }];
  const propertiesContent = `${renderBreadcrumbs(propertiesBreadcrumbs)}${renderCatalogPage({
    key: 'all', title: 'Объекты недвижимости', lead: 'Карточки готовятся к публикации. Неподтверждённые цены и характеристики скрыты.',
    properties, notice: 'Все шесть карточек находятся в статусе проверки; фотографии и цена не публикуются.'
  })}`;
  const propertiesSchema = pageSchema(site, propertiesPage, propertiesBreadcrumbs, [collectionSchema(site, propertiesPage.title, { canonical: propertiesPage.canonical, properties })]);
  outputFiles.push(await writeHtml(propertiesPage.output, await renderLayout({
    layout, header, footer, cookieBanner, overlays, page: propertiesPage,
    content: propertiesContent, schema: propertiesSchema, criticalCss, site
  })));

  for (const category of categoryDefinitions()) {
    const categoryPage = {
      key: `category-${category.key}`, output: `properties/${category.key}.html`, canonical: `/properties/${category.key}.html`,
      title: `${category.title} — каталог недвижимости ВЛР-Дмитров в Дмитрове`,
      description: `Раздел «${category.title}» на сайте ВЛР-Дмитров. Карточки, фотографии и характеристики публикуются после проверки документов и прав на материалы. Данные уточняются.`,
      bodyClass: 'page-catalog', robots: 'index, follow, max-image-preview:large'
    };
    const categoryBreadcrumbs = [{ name: 'Главная', url: '/' }, { name: 'Объекты', url: '/properties/' }, { name: category.title, url: categoryPage.canonical }];
    const categoryContent = `${renderBreadcrumbs(categoryBreadcrumbs)}${renderCatalogPage({
      key: category.key, title: category.title, lead: category.lead,
      properties: catalogProperties(category.key, properties), notice: category.notice
    })}`;
    const categorySchema = pageSchema(site, categoryPage, categoryBreadcrumbs, [collectionSchema(site, category.title, { canonical: categoryPage.canonical, properties: catalogProperties(category.key, properties) })]);
    outputFiles.push(await writeHtml(categoryPage.output, await renderLayout({
      layout, header, footer, cookieBanner, overlays: overlays + lightbox, page: categoryPage,
      content: categoryContent, schema: categorySchema, criticalCss, site
    })));
  }

  for (const [index, property] of properties.entries()) {
    const propertyPage = {
      key: `property-${property.slug}`, output: `property/${property.slug}.html`, canonical: `/property/${property.slug}.html`,
      title: `${property.title} — карточка объекта недвижимости | ВЛР-Дмитров`,
      description: `Карточка объекта «${property.title}» на сайте ВЛР-Дмитров. Просмотрите подготовленную галерею, описание и контакты для уточнения информации. Характеристики уточняются.`,
      bodyClass: 'page-property',
      // Unverified drafts carry no address, price, area or photos, so indexing
      // them would only dilute local search. They stay reachable for the call
      // button, and writeInfrastructure() keeps them out of sitemap.xml by
      // listing only verified slugs.
      robots: property.verified ? 'index, follow, max-image-preview:large' : 'noindex, follow'
    };
    const similar = [...properties.slice(index + 1), ...properties.slice(0, index)];
    const propertyContent = renderPropertyPage(property, similar);
    const propertyBreadcrumbs = [
      { name: 'Главная', url: '/' }, { name: 'Объекты', url: '/properties/' }, { name: property.title, url: propertyPage.canonical }
    ];
    const schema = pageSchema(site, propertyPage, propertyBreadcrumbs, [propertySchema(site, property)]);
    outputFiles.push(await writeHtml(propertyPage.output, await renderLayout({
      layout, header, footer, cookieBanner, overlays: overlays + lightbox, page: propertyPage,
      content: propertyContent, schema, criticalCss, site
    })));
  }

  const redirectSource = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="robots" content="noindex, follow"><meta http-equiv="refresh" content="0;url=/properties/"><title>Объекты — ВЛР-Дмитров</title></head><body><p><a href="/properties/">Перейти к каталогу объектов</a></p></body></html>`;
  outputFiles.push(await writeHtml('properties.html', redirectSource));

  await minifyCss(cssSource, 'assets/css/style.min.css');
  await minifyScript(jsSource, 'assets/js/main.min.js');
  outputFiles.push('assets/css/style.min.css', 'assets/js/main.min.js');
  outputFiles.push(...await writeInfrastructure({ site, pageDefinitions, properties, outputFiles }));
  process.stdout.write(`Built ${outputFiles.length} production files.\n`);
}

main().catch(function (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
