import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function readText(root, relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function safeJson(value) {
  return JSON.stringify(value, null, 2)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
}

export function replaceTokens(template, values) {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, function (match, key) {
    if (!Object.prototype.hasOwnProperty.call(values, key)) throw new Error(`Unknown template token: ${key}`);
    return String(values[key] ?? '');
  });
}

export function assertNoUnresolvedTokens(html, filePath) {
  const match = html.match(/\{\{[a-zA-Z0-9_]+\}\}/);
  if (match) throw new Error(`Unresolved token ${match[0]} in ${filePath}`);
}

export function propertyTypeLabel(property) {
  if (!property.verified) return 'Данные уточняются';
  const typeLabels = { flat: 'Квартира', house: 'Дом', commercial: 'Коммерция' };
  const dealLabels = { sale: 'Продажа', rent: 'Аренда' };
  return `${typeLabels[property.type] || 'Объект'} · ${dealLabels[property.deal] || 'Сделка уточняется'}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value));
}

function dataAttribute(name, value) {
  return escapeHtml(value ?? '');
}

export function renderPropertyCard(property) {
  const href = `/property/${property.slug}.html`;
  const title = escapeHtml(property.title);
  const location = escapeHtml(property.location);
  const typeLabel = escapeHtml(propertyTypeLabel(property));
  const price = property.price === null || property.price === undefined
    ? 'Цена уточняется'
    : `${formatNumber(property.price)} ₽`;
  const searchText = `${property.title} ${property.location} ${property.district || ''}`.toLowerCase();
  return `
    <article class="property-card" data-property-card data-property-id="${property.id}" data-property-slug="${escapeHtml(property.slug)}" data-title="${dataAttribute('title', property.title)}" data-location="${dataAttribute('location', property.location)}" data-type="${dataAttribute('type', property.type)}" data-deal="${dataAttribute('deal', property.deal)}" data-category="${dataAttribute('category', property.category)}" data-price="${dataAttribute('price', property.price)}" data-area="${dataAttribute('area', property.area)}" data-district="${dataAttribute('district', property.district)}" data-type-label="${typeLabel}" data-deal-label="${dataAttribute('deal', property.deal)}" data-search-text="${escapeHtml(searchText)}" data-verified="${property.verified ? 'true' : 'false'}">
      <a class="property-card__link" href="${href}">
        <div class="property-card__media" role="img" aria-label="Фотографии объекта ${title} предоставляются после проверки">
          <span class="property-card__state">${property.verified ? 'Данные проверены' : 'Данные уточняются'}</span>
          <span class="property-card__media-text">Фото объекта будут опубликованы после согласования</span>
        </div>
        <p class="eyebrow">${typeLabel}</p>
        <h3 class="property-card__title">${title}</h3>
        <p class="property-card__location">${location}</p>
        <p class="property-card__price">${escapeHtml(price)}</p>
      </a>
      <div class="property-card__actions">
        <button class="property-card__action" type="button" data-favorite="${escapeHtml(property.slug)}" aria-pressed="false" aria-label="Добавить ${title} в избранное" hidden><span aria-hidden="true">♡</span><span class="visually-hidden">В избранное</span></button>
        <button class="property-card__action" type="button" data-compare="${escapeHtml(property.slug)}" aria-pressed="false" aria-label="Добавить ${title} к сравнению" hidden><span aria-hidden="true">＋</span><span class="visually-hidden">К сравнению</span></button>
      </div>
    </article>`;
}

export function propertyMatchesCategory(property, category) {
  if (category === 'flats') return property.type === 'flat';
  if (category === 'houses') return property.type === 'house';
  if (category === 'commercial') return property.type === 'commercial';
  if (category === 'rent') return property.deal === 'rent';
  return true;
}

const photoLabels = ['Фасад', 'Гостиная', 'Кухня', 'Спальня', 'Санузел', 'Балкон', 'Двор', 'Вид из окна'];

function renderGalleryItem(property, index) {
  const number = String(index + 1).padStart(2, '0');
  const label = photoLabels[index] || `Фото ${number}`;
  const photo = Array.isArray(property.photos) ? property.photos[index] : null;
  const accessibleLabel = `${property.title}: ${label}`;
  if (photo && photo.thumb800 && photo.full) {
    const loading = index === 0 ? 'eager' : 'lazy';
    const fetchpriority = index === 0 ? ' fetchpriority="high"' : '';
    return `<a class="gallery__item" href="${escapeHtml(photo.full)}" data-gallery-open data-gallery-index="${index}" data-gallery-full="${escapeHtml(photo.full)}" data-gallery-alt="${escapeHtml(accessibleLabel)}" aria-label="Открыть фотографию: ${escapeHtml(accessibleLabel)}">
      <picture>
        <source type="image/webp" srcset="${escapeHtml(photo.thumb400 || photo.thumb800)} 400w, ${escapeHtml(photo.thumb800)} 800w" sizes="(max-width: 767px) 50vw, 25vw">
        <img src="${escapeHtml(photo.thumb800)}" alt="${escapeHtml(accessibleLabel)}" width="800" height="600" loading="${loading}"${fetchpriority}>
      </picture>
      <span class="visually-hidden">${escapeHtml(label)}</span>
    </a>`;
  }
  return `<a class="gallery__item gallery__item--placeholder" href="#property-media-note" data-gallery-open data-gallery-index="${index}" data-gallery-full="" data-gallery-alt="${escapeHtml(accessibleLabel)}" aria-label="Открыть место для фотографии: ${escapeHtml(accessibleLabel)}">
    <span class="gallery__number">${number}</span>
    <span>${escapeHtml(label)}</span>
    <span class="gallery__status">Ожидает материала</span>
  </a>`;
}

export function renderGallery(property) {
  return `<div class="property-gallery" data-property-gallery aria-label="Галерея объекта: восемь фотографий">${Array.from({ length: property.photoCount || 8 }, (_, index) => renderGalleryItem(property, index)).join('')}</div>`;
}

export function renderBreadcrumbs(items) {
  return `<nav class="breadcrumbs" aria-label="Хлебные крошки"><ol>${items.map((item, index) => {
    const current = index === items.length - 1;
    return `<li>${current ? `<span aria-current="page">${escapeHtml(item.name)}</span>` : `<a href="${escapeHtml(item.url)}">${escapeHtml(item.name)}</a>`}<span class="breadcrumbs__separator" aria-hidden="true">/</span></li>`;
  }).join('')}</ol></nav>`;
}

export function renderPropertyPage(property, similarProperties) {
  const title = escapeHtml(property.title);
  const location = escapeHtml(property.location);
  const similar = similarProperties.slice(0, 3).map(renderPropertyCard).join('');
  return `
    <article class="property-page">
      <header class="property-hero">
        <div class="shell">
          ${renderBreadcrumbs([{ name: 'Главная', url: '/' }, { name: 'Объекты', url: '/properties/' }, { name: property.title, url: `/property/${property.slug}.html` }])}
          <div class="property-hero__grid">
            <div>
              <p class="eyebrow">Карточка объекта</p>
              <h1>${title}</h1>
              <p class="property-hero__location">${location}</p>
            </div>
            <div class="property-hero__aside">
              <p class="data-notice">Цена, адрес, площадь и иные характеристики не публикуются до проверки.</p>
              <a class="button" href="tel:+79257357762">Уточнить по телефону</a>
            </div>
          </div>
        </div>
      </header>

      <section class="property-gallery-section" aria-labelledby="property-gallery-heading">
        <div class="shell">
          <h2 id="property-gallery-heading" class="visually-hidden">Фотографии объекта</h2>
          ${renderGallery(property)}
          <p class="data-notice" id="property-media-note">Восемь мест под фотографии подготовлены. До получения материалов и подтверждения прав используются честные текстовые placeholders.</p>
        </div>
      </section>

      <section class="property-details" aria-labelledby="property-details-heading">
        <div class="shell property-details__grid">
          <div>
            <p class="eyebrow">Описание</p>
            <h2 id="property-details-heading">Информация об объекте</h2>
          </div>
          <div class="prose">
            <p>${escapeHtml(property.description)}</p>
            <dl class="details-list">
              <div><dt>Статус данных</dt><dd>Требуется проверка</dd></div>
              <div><dt>Публикация цены</dt><dd>Ожидает подтверждения</dd></div>
              <div><dt>Права на фотографии</dt><dd>Не подтверждены</dd></div>
            </dl>
            <div class="button-row">
              <a class="button" href="tel:+79257357762">Позвонить</a>
              <button class="button button--secondary" type="button" data-panel-open="contact-panel">Оставить вопрос</button>
            </div>
          </div>
        </div>
      </section>

      <section class="similar-section" aria-labelledby="similar-heading">
        <div class="shell">
          <div class="section-heading">
            <div><p class="eyebrow">Карточки</p><h2 id="similar-heading">Другие объекты</h2></div>
            <a class="text-link" href="/properties/">Все объекты</a>
          </div>
          <div class="editorial-grid">${similar}</div>
        </div>
      </section>
    </article>`;
}

export function renderCatalogPage({ key, title, lead, properties, notice }) {
  const cards = properties.map(renderPropertyCard).join('');
  return `
    <section class="content-hero content-hero--compact">
      <div class="shell content-hero__inner"><p class="eyebrow">Каталог</p><h1>${escapeHtml(title)}</h1><p class="content-hero__lead">${escapeHtml(lead)}</p></div>
    </section>
    <section class="content-section" data-catalog-page="${escapeHtml(key)}">
      <div class="shell">
        <p class="data-notice">${escapeHtml(notice)}</p>
        <div class="section-heading"><div><p class="eyebrow">Карточки</p><h2>Доступные материалы</h2></div><p class="result-count">Найдено: ${properties.length}</p></div>
        <div class="editorial-grid" data-property-grid>${cards}</div>
        ${properties.length ? '' : '<div class="empty-state"><h3>Публикаций пока нет</h3><p>Карточки появятся после проверки данных.</p></div>'}
      </div>
    </section>`;
}

export function renderFaqItems(faqs) {
  return faqs.map((faq, index) => `<details class="faq-item"${index === 0 ? ' open' : ''}><summary><span>${escapeHtml(faq.question)}</span><span class="faq-item__toggle" aria-hidden="true"></span></summary><div class="faq-item__answer"><p>${escapeHtml(faq.answer)}</p></div></details>`).join('');
}

export function organizationSchema(site) {
  return {
    '@type': 'Organization',
    name: site.brandName,
    url: site.baseUrl,
    telephone: site.phone
  };
}

export function websiteSchema(site) {
  return {
    '@type': 'WebSite',
    name: site.brandName,
    url: site.baseUrl,
    inLanguage: 'ru-RU',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${site.baseUrl}/search.html?q={search_term_string}`,
      'query-input': 'required name=search_term_string'
    }
  };
}

export function breadcrumbSchema(site, items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: new URL(item.url, site.baseUrl).href
    }))
  };
}

export function faqSchema(faqs) {
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer }
    }))
  };
}

export function collectionSchema(site, title, items) {
  return {
    '@type': 'CollectionPage',
    name: title,
    url: new URL(items.canonical, site.baseUrl).href,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: items.properties.map((property, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: property.title,
        url: `${site.baseUrl}/property/${property.slug}.html`
      }))
    }
  };
}

export function propertySchema(site, property) {
  return {
    '@type': ['RealEstateListing', 'Offer'],
    name: property.title,
    description: property.description,
    url: `${site.baseUrl}/property/${property.slug}.html`,
    itemOffered: { '@type': 'Thing', name: 'Объект недвижимости; характеристики уточняются' }
  };
}

export function pageSchema(site, page, breadcrumbs, extra = []) {
  const graph = [
    organizationSchema(site),
    { '@type': 'WebPage', name: page.title, description: page.description, url: new URL(page.canonical, site.baseUrl).href, inLanguage: 'ru-RU' }
  ];
  if (page.key === 'home') graph.push(websiteSchema(site));
  if (breadcrumbs?.length) graph.push(breadcrumbSchema(site, breadcrumbs));
  graph.push(...extra);
  return { '@context': 'https://schema.org', '@graph': graph };
}
