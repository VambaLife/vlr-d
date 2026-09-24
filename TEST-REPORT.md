# Test report

**Дата:** 24 сентября 2026
**Среда:** Windows, Node.js `v24.21.0`, npm `11.19.0`, системный Google Chrome, PHP `8.3.33` с `pdo_sqlite`, `sqlite3`, `mbstring`, `openssl`.

## Результат

| Проверка | Команда | Результат |
|---|---|---|
| Production build | `npm run build` | PASS — 33 generated files |
| Static/link/SEO/security | `npm run check` | PASS — 25 HTML, 65 required files, local references resolved |
| Dependency audit | `npm audit --audit-level=high` | PASS — 0 vulnerabilities |
| Route smoke | `npm run test:smoke` | PASS — 25 routes × 3 widths; direct URL, Back, no-JS |
| Browser interaction | `npm run test:e2e` | PASS — panels, lightbox, favorites, compare, search, mobile/no-JS |
| PHP integration | `npm run test:php` | PASS — CSRF, contact, validation, honeypot, limits, double-opt-in, unsubscribe, logs |
| Accessibility | `npm run test:a11y` | PASS — axe-core, 11 routes × desktop/mobile |
| Lighthouse lab | `npm run lighthouse` | PASS — local Chromium; accessibility/best-practices/SEO 1.00 |
| PHP syntax | `php -l` для всех `*.php` | PASS |
| Shell syntax | `bash -n build.sh scripts/backup.sh` | PASS |
| Backup smoke | `scripts/backup.sh` с внешним temp `BACKUP_DIR` | PASS — archive и SHA-256 созданы |

## Покрытие API

PHP integration-test использует отдельный временный каталог, SQLite и `MAIL_TRANSPORT=log`. Реальные письма и CRM-запросы не отправляются.

Проверено:

- `GET /api/csrf.php` выдаёт 64-hex token и session cookie;
- неверный Origin, отсутствующий CSRF и невалидные поля получают отказ;
- honeypot не создаёт заявку;
- contact/subscription limits работают независимо;
- contact form отправляет только серверно проверенные поля;
- double-opt-in переводит адрес из `pending` в `active`;
- unsubscribe-ссылка работает и имеет срок;
- `leads.log` содержит IP и событие, но не содержит тестовые email/phone/token;
- `error.log` не содержит warning/fatal в успешном сценарии.

## Lighthouse, фактический локальный запуск

Отчёт сохраняется во временный каталог `opencode`, не в Git.

| URL | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT |
|---|---:|---:|---:|---:|---:|---:|---:|
| `/` | 0.98 | 1.00 | 1.00 | 1.00 | 1961.69 ms | 0.000102 | 100 ms |
| `/property/berezovaya-25.html` | 0.96 | 1.00 | 1.00 | 1.00 | 2107.21 ms | 0 | 100 ms |
| `/search.html` | 0.96 | 1.00 | 1.00 | 1.00 | 2110.31 ms | 0 | 100 ms |

Повторный запуск home до подключения обычного stylesheet давал LCP 2.65 s; в последнем запуске после изменения — 1.96 s. Это лабораторная вариативность, не field data.

## Что не удалось проверить локально

- Реальный HTTPS, DNS, Let’s Encrypt, HSTS preload и HTTP/2 на production host.
- Nginx/Apache: executables отсутствуют в окружении; `nginx -t`/`httpd -t` не запускались и не выдаются за пройденные.
- Реальная доставляемость `mail()`, SPF/DKIM/DMARC и bounce handling.
- CRM, внешний mailing provider, analytics и мониторинг отключены до подтверждения.
- Реальные iOS Safari 15, VoiceOver, Yandex Browser, Samsung Internet, мобильные устройства и field INP.
- PageSpeed Insights/CrUX/WebPageTest с production URL.
- Независимый penetration test и restore на реальном хостинге.
- Реальные фото/видео, лицензии и юридическая проверка.

## Вывод

Код и локальные интеграционные сценарии проходят. Production-статус остаётся **не подтверждённым** до закрытия launch checklist и TODO-файлов.
