# Performance report

**Дата:** 25 сентября 2026
**Среда:** локальный Node static server, системный Chrome, Lighthouse lab mode. Это не PageSpeed Insights, CrUX или WebPageTest.

## Asset budget

| Asset | Размер |
|---|---:|
| `style.min.css` | 26 918 bytes |
| `main.min.js` | 17 613 bytes |
| critical inline CSS | 2 684 bytes |
| Manrope Cyrillic WOFF2 | 14 500 bytes |
| Manrope Latin WOFF2 | 24 836 bytes |
| Cormorant Cyrillic WOFF2 | 21 168 bytes |
| Cormorant Latin WOFF2 | 37 640 bytes |
| hero AVIF 800/1200/1840 | 31 513 / 71 757 / 165 252 bytes |
| hero JPEG 800/1200/1840 | 91 447 / 209 824 / 485 781 bytes |

Шрифты имеют локальные OFL license/provenance files. В production нет Google Fonts/CDN. Hero-изображение Дмитровского кремля хранится локально в трёх responsive AVIF/WebP/JPEG widths; лицензия и атрибуция находятся в `img/MEDIA-LICENSES.md` и `/credits.html`.

## Последний локальный Lighthouse run

| Маршрут | Performance | LCP | CLS | TBT | FCP |
|---|---:|---:|---:|---:|---:|
| `/` | 0.91 | 2.295 s | 0.000137 | 300 ms | 1.950 s |
| `/property/berezovaya-25.html` | 0.95 | 2.195 s | 0 | 100 ms | 2.045 s |
| `/search.html` | 0.95 | 2.118 s | 0 | 100 ms | 1.913 s |

Accessibility, Best Practices и SEO: `1.00` на всех трёх маршрутах. Значения отражают один локальный запуск 25 сентября 2026; предыдущие прогоны показали заметную вариативность TBT/LCP.

## Цели и статус

| Метрика | Цель из задания | Локальный результат | Статус |
|---|---:|---:|---|
| LCP | < 2.5 s | 2.295 s latest home; 2.195/2.118 s inner pages | PASS в этом lab run, не field guarantee |
| CLS | < 0.1 | 0–0.000137 | PASS локально |
| TBT | < 200 ms | 300 ms home; 100 ms inner pages | В этом запуске home выше цели; требуется повторное поле/production измерение |
| INP | < 200 ms | не измеряется | NOT VERIFIED |
| PSI/CrUX | production | нет production URL/field data | NOT VERIFIED |

## Принятые меры

- Нет тяжёлых UI-библиотек и клиентского роутера.
- JavaScript загружается с `defer`; критический CSS inline.
- Stylesheet подключён обычным `<link>` после сравнительного Lighthouse-замера: critical CSS остаётся inline.
- Шрифты локальные, с preload только нужных кириллических subset.
- `font-display: swap`, `font-optical-sizing:auto`, `text-wrap:balance` и `prefers-reduced-motion`.
- Hero использует локальный `picture` с AVIF/WebP/JPEG `srcset`, фиксированными dimensions и `fetchpriority=high`; property photography остаётся честным text placeholder.
- Video не подключён без лицензированного файла, поэтому нет скрытого preload/AVIF/video веса.
- Static assets имеют same-origin cache policy; API — `no-store`.

## Что нужно измерить после деплоя

1. Production PageSpeed Insights mobile/desktop на нескольких URL.
2. WebPageTest или аналогичный внешний test с TTFB и реальным хостингом.
3. CrUX/field INP после достаточного трафика.
4. Реальные iOS Safari 15 и 2026, Yandex Browser и Samsung Internet.
5. После добавления object photos: LCP, AVIF/WebP fallback, размеры, CLS и лицензионные records.
6. После добавления видео: poster, `preload=none`, bitrate и поведение на мобильных.
7. TBT/LCP на production CDN и при synthetic CPU/network conditions, because local lab results vary.

## Ограничения

Локальный сервер не воспроизводит TLS, CDN, реальный MTA, DNS, кэш CDN, TTFB, серверный PHP, базу данных, WAF или полевую телеметрию. Поэтому отчёт не использует формулировку «Core Web Vitals achieved in production».
