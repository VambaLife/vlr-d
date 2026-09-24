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
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      throw new Error(`Unknown template token: ${key}`);
    }
    return String(values[key] ?? '');
  });
}

export function assertNoUnresolvedTokens(html, filePath) {
  const match = html.match(/\{\{[a-zA-Z0-9_]+\}\}/);
  if (match) throw new Error(`Unresolved token ${match[0]} in ${filePath}`);
}

export function propertyTypeLabel(property) {
  const typeLabels = { flat: 'Квартира', house: 'Дом', commercial: 'Коммерция' };
  const dealLabels = { sale: 'Продажа', rent: 'Аренда' };
  return `${typeLabels[property.type] || 'Объект'} · ${dealLabels[property.deal] || 'Уточняется'}`;
}

export function renderPropertyCard(property) {
  const href = `/property/${property.slug}.html`;
  const label = propertyTypeLabel(property);
  const title = escapeHtml(property.title);
  const location = escapeHtml(property.location);
  return `
    <article class="property-card" data-property-card data-property-id="${property.id}" data-type="${escapeHtml(property.type)}" data-deal="${escapeHtml(property.deal)}" data-category="${escapeHtml(property.category)}" data-search-text="${escapeHtml(`${property.title} ${property.location}`.toLowerCase())}">
      <a class="property-card__link" href="${href}">
        <div class="property-card__media" role="img" aria-label="Фотографии объекта ${title} предоставляются после проверки">
          <span class="property-card__state">Данные уточняются</span>
          <span class="property-card__media-text">Фото объекта будут опубликованы после согласования</span>
        </div>
        <p class="eyebrow">${escapeHtml(label)}</p>
        <h3 class="property-card__title">${title}</h3>
        <p class="property-card__location">${location}</p>
      </a>
      <button class="property-card__favorite" type="button" data-favorite="${property.slug}" aria-pressed="false" aria-label="Добавить ${title} в избранное" hidden>
        <span aria-hidden="true">♡</span>
      </button>
    </article>`;
}

export function schemaForHome(site) {
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    name: site.brandName,
    url: `${site.baseUrl}/`,
    telephone: site.phone
  };
}

export function metaDescriptionForHome() {
  return 'ВЛР-Дмитров — агентство недвижимости в Дмитровском округе. Каталог объектов, фотографии и контакты для подбора недвижимости и консультации.';
}
