# Test report

**Дата:** 25 сентября 2026
**Среда:** Windows, Node.js `v24.21.0`, npm `11.19.0`, системный Google Chrome, PHP `8.3.33` с `pdo_sqlite`, `sqlite3`, `mbstring`, `openssl`.

## Результат

| Проверка | Команда | Результат |
|---|---|---|
| Full local suite | `npm test` | PASS — build, static checks, smoke, E2E, PHP, SMTP and axe-core |
| Production build | `npm run build` | PASS — 34 generated files |
| Static/link/SEO/security | `npm run check` | PASS — 26 HTML, 79 required files, local references resolved |
| Dependency audit | `npm audit --audit-level=high` | PASS — 0 vulnerabilities |
| Route smoke | `npm run test:smoke` | PASS — 26 routes × 3 widths; direct URL, Back, no-JS |
| Browser interaction | `npm run test:e2e` | PASS — panels, lightbox, favorites, compare, search, mobile/no-JS |
| PHP integration | `npm run test:php` | PASS — CSRF, contact/request type, validation, honeypot, limits, double-opt-in, realtor notification, unsubscribe, logs |
| SMTP integration | `npm run test:smtp` | PASS — Mailer + local fake server validate EHLO/AUTH/MAIL/RCPT/DATA/QUIT, headers and base64 body; no real message sent |
| Accessibility | `npm run test:a11y` | PASS — axe-core, 12 routes × desktop/mobile |
| Lighthouse lab | `npm run lighthouse` | PASS — local Chromium; accessibility/best-practices/SEO 1.00 |
| PHP syntax | `php -l` для всех `*.php` | PASS |
| Shell syntax | `bash -n build.sh scripts/backup.sh` | PASS |
| Backup smoke | `scripts/backup.sh` с внешним temp `BACKUP_DIR` | PASS — archive и SHA-256 созданы |

## Покрытие API

PHP integration-test использует отдельный временный каталог, SQLite и `MAIL_TRANSPORT=log`. Реальные письма и CRM-запросы не отправляются. SMTP-клиент отдельно проверен против локального fake server без внешнего SMTP-пароля.

Проверено:

- `GET /api/csrf.php` выдаёт 64-hex token и session cookie;
- неверный Origin, отсутствующий CSRF и невалидные поля получают отказ;
- honeypot не создаёт заявку;
- contact/subscription limits работают независимо;
- contact form отправляет только серверно проверенные поля, включая тип заявки;
- заявка и новая подписка формируют уведомление на тестовый `MAIL_TO`; подтверждение подписки уходит подписчику;
- double-opt-in переводит адрес из `pending` в `active`;
- unsubscribe-ссылка работает и имеет срок;
- `leads.log` содержит IP и событие, но не содержит тестовые email/phone/token;
- `error.log` не содержит warning/fatal в успешном сценарии.

## Lighthouse, фактический локальный запуск

Отчёт сохраняется во временный каталог `opencode`, не в Git. Последний запуск выполнен 25 сентября 2026 после добавления responsive city hero.

| URL | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT |
|---|---:|---:|---:|---:|---:|---:|---:|
| `/` | 0.91 | 1.00 | 1.00 | 1.00 | 2294.56 ms | 0.000137 | 300.00 ms |
| `/property/berezovaya-25.html` | 0.95 | 1.00 | 1.00 | 1.00 | 2195.13 ms | 0 | 100.00 ms |
| `/search.html` | 0.95 | 1.00 | 1.00 | 1.00 | 2118.01 ms | 0 | 100.00 ms |

Это лабораторные данные одного запуска, а не PSI/CrUX/WebPageTest и не field data. В предыдущих локальных прогонах home LCP/TBT менялись; после production-деплоя нужны повторные измерения.

## Что не удалось проверить локально

- Реальный HTTPS, DNS, Let’s Encrypt, HSTS preload и HTTP/2 на production host.
- Nginx/Apache: executables отсутствуют в окружении; `nginx -t`/`httpd -t` не запускались и не выдаются за пройденные.
- Реальная доставляемость Yandex SMTP, SPF/DKIM/DMARC, bounce handling и mailbox ownership.
- CRM, внешний mailing provider, analytics и мониторинг отключены до подтверждения.
- Реальные iOS Safari 15, VoiceOver, Yandex Browser, Samsung Internet, мобильные устройства и field INP.
- PageSpeed Insights/CrUX/WebPageTest с production URL.
- Независимый penetration test и restore на реальном хостинге.
- Реальные фото/видео объектов и юридическая проверка.

## Вывод

Код и локальные интеграционные сценарии проходят. Production-статус остаётся **не подтверждённым** до закрытия launch checklist, SMTP-доставки, TODO-файлов и внешней проверки.
