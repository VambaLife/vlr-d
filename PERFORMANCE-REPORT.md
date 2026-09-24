# Performance report

**Дата:** 24 сентября 2026
**Среда:** локальный Node static server, системный Chrome, Lighthouse lab mode. Это не PageSpeed Insights, CrUX или WebPageTest.

## Asset budget

| Asset | Размер |
|---|---:|
| `style.min.css` | 25 208 bytes |
| `main.min.js` | 17 613 bytes |
| critical inline CSS | 2 132 bytes |
| Manrope Cyrillic WOFF2 | 14 500 bytes |
| Manrope Latin WOFF2 | 24 836 bytes |
| Cormorant Cyrillic WOFF2 | 21 168 bytes |
| Cormorant Latin WOFF2 | 37 640 bytes |

Шрифты имеют локальные OFL license/provenance files. В production нет Google Fonts/CDN.

## Последний локальный Lighthouse run

| Маршрут | Performance | LCP | CLS | TBT | FCP |
|---|---:|---:|---:|---:|---:|
| `/` | 0.98 | 1.962 s | 0.000102 | 100 ms | 1.677 s |
| `/property/berezovaya-25.html` | 0.96 | 2.107 s | 0 | 100 ms | 1.658 s |
| `/search.html` | 0.96 | 2.110 s | 0 | 100 ms | 1.641 s |

Accessibility, Best Practices и SEO: `1.00` на всех трёх маршрутах.

## Цели и статус

| Метрика | Цель из задания | Локальный результат | Статус |
|---|---:|---:|---|
| LCP | < 2.5 s | 1.962 s latest home; 2.107/2.110 s inner pages | PASS в этом lab run, не field guarantee |
| CLS | < 0.1 | 0–0.000097 | PASS локально |
| TBT | < 200 ms | 100 ms | PASS локально |
| INP | < 200 ms | не измеряется | NOT VERIFIED |
| PSI/CrUX | production | нет production URL/field data | NOT VERIFIED |

## Принятые меры

- Нет тяжёлых UI-библиотек и клиентского роутера.
- JavaScript загружается с `defer`; критический CSS inline.
- Stylesheet подключён обычным `<link>` после сравнительного Lighthouse-замера: это улучшило home FCP/LCP.
- Шрифты локальные, с preload только нужных кириллических subset.
- `font-display: swap`, `font-optical-sizing:auto`, `text-wrap:balance` и `prefers-reduced-motion`.
- Изображения не имитируются: placeholders не создают fake LCP/CLS и не добавляют тяжёлые декоративные SVG.
- Lazy loading/реальные AVIF/WebP/srcset будут подключены только после поставки 48 фотографий; сейчас нет битых media URL.
- Video не подключён без лицензированного файла, поэтому нет скрытого preload/AVIF/video веса.
- Static assets имеют same-origin cache policy; API — `no-store`.

## Что нужно измерить после деплоя

1. Production PageSpeed Insights mobile/desktop на нескольких URL.
2. WebPageTest или аналогичный внешний test с TTFB и реальным хостингом.
3. CrUX/field INP после достаточного трафика.
4. Реальные iOS Safari 15 и 2026, Yandex Browser и Samsung Internet.
5. После добавления фото: LCP реального property image, AVIF/WebP fallback, размеры и CLS.
6. После добавления видео: poster, `preload=none`, bitrate и поведение на мобильных.

## Ограничения

Локальный сервер не воспроизводит TLS, CDN, реальный MTA, DNS, кэш CDN, TTFB, серверный PHP, базу данных, WAF или полевую телеметрию. Поэтому отчёт не использует формулировку «Core Web Vitals achieved in production».
