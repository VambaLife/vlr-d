# Production deployment checklist

**Проект:** VLR-Dmitrov
**Дата:** 25 сентября 2026
**Текущий статус:** NOT PRODUCTION-APPROVED — внешние данные и инфраструктура не подтверждены.

## 1. Pre-release

- [ ] `git status --short` чистый.
- [ ] `npm ci` проходит на чистом checkout.
- [ ] `npm test` проходит полностью.
- [ ] `npm audit --audit-level=high` — 0 high/critical.
- [ ] `npm run test:a11y` — PASS.
- [ ] `npm run test:smtp` — PASS на локальном fake SMTP server.
- [ ] `npm run lighthouse` выполнен и отчёт приложен отдельно.
- [ ] PHP lint всех файлов проходит.
- [ ] `bash -n build.sh scripts/backup.sh` проходит.
- [ ] `CHANGELOG.md`, `TEST-REPORT.md`, `SECURITY-REPORT.md`, `LEGAL-REPORT.md`, `PERFORMANCE-REPORT.md` обновлены.

## 2. Content/legal gate

- [x] Публичные телефон и email риэлтора указаны на сайте; email не подтверждает реквизиты юридического оператора.
- [ ] Юридический оператор, его email, ОГРН/ИНН/КПП и адрес заполнены на `/requisites.html` и в footer.
- [ ] Все 6 объектов имеют verified data.
- [ ] Цены, адреса, площади, типы и описания подтверждены.
- [ ] 48 фото имеют rights/consent records.
- [x] Фото Дмитровского кремля на главной имеет локальную копию, CC BY 2.0 и attribution на `/credits.html`; оно не используется как фото объекта.
- [x] Hero video отключён (`heroVideo=null`), поэтому битых video/preload и непроверенных music rights нет.
- [ ] Нет неподтверждённых `2450+`, рейтингов, гарантий, «100%» и рекламных обещаний.
- [ ] Нет выдуманных отзывов.
- [ ] Статус уведомления Роскомнадзора подтверждён документом или оставлен «не подтверждено».
- [ ] Policy/consent/terms проверены юристом.
- [ ] Retention и third-party/cross-border register заполнены.

## 3. Server

- [ ] DNS A/AAAA и canonical host настроены.
- [ ] TLS certificate установлен; TLS 1.2/1.3 проверены.
- [ ] HTTP → HTTPS 301 работает.
- [ ] HSTS не включается в preload до подтверждения всех subdomains.
- [ ] Apache/Nginx config прошёл `nginx -t`/`httpd -t` на реальном host.
- [ ] Только 3 PHP endpoints доступны извне.
- [ ] `/app/`, `/config/`, `/logs/`, `/storage/`, `/backup/`, `/src/`, `/scripts/`, `/tests/` возвращают 403/404.
- [ ] `.env`, `.git`, database, logs, markdown и конфиги недоступны извне.
- [ ] PHP worker имеет write только в `logs/` и `storage/`.

## 4. Environment/mail

- [ ] `.env` создан вне Git и имеет права 0600.
- [ ] `APP_ENV=production`, `APP_DEBUG=false`.
- [ ] `APP_URL` — реальный HTTPS URL.
- [ ] `COOKIE_SECURE=auto` не заменён на false.
- [ ] `MAIL_TRANSPORT=smtp`, `MAIL_TO`, `MAIL_FROM`, `MAIL_SMTP_HOST`, `MAIL_SMTP_USER` и секретный `MAIL_SMTP_PASS` подтверждены на сервере.
- [ ] `MAIL_FROM` проходит SPF/DKIM/DMARC checks.
- [ ] Controlled test письма проходит; headers не содержат PII в subject/header.
- [ ] Заявка, подтверждение подписки и уведомление риэлтору проверены на реальном mailbox; SPF/DKIM/DMARC и bounce handling проверены.
- [ ] `CRM_PROVIDER=none` и `SUBSCRIPTION_PROVIDER=none` не меняются без решения.

## 5. Security/operations

- [ ] Secrets сгенерированы и не попали в Git/логи/issue.
- [ ] WAF/firewall/fail2ban настроены по реальному log format.
- [ ] Log rotation и retention настроены.
- [ ] Error monitoring не принимает form body/PII.
- [ ] Backup destination находится вне project directory.
- [ ] Backup archive и SHA-256 созданы.
- [ ] Restore test выполнен на отдельной копии.
- [ ] Incident response contact и резервный канал подтверждены.
- [ ] Независимый security review/penetration test проведён или принят как launch blocker.

## 6. Post-deploy smoke

```bash
curl -I https://DOMAIN/
curl -I https://DOMAIN/properties/
curl -I https://DOMAIN/property/berezovaya-25.html
curl -I https://DOMAIN/.env
curl -I https://DOMAIN/app/Config.php
curl -I https://DOMAIN/storage/application.sqlite
```

Ожидаемые результаты:

- public HTML: 200, HTTPS, security headers;
- private paths: 403/404, no content;
- HTTP: 301 to HTTPS;
- no `X-Powered-By`;
- `Content-Security-Policy` содержит self-only script policy и generated hashes;
- `/api/csrf.php` выдаёт cookie/token без PII;
- contact and subscription проходят browser test без real send in staging или с controlled mailbox;
- no horizontal overflow at 320/375/768/1440.

## 7. External verification

- [ ] PageSpeed Insights mobile/desktop on public URL.
- [ ] WebPageTest/equivalent on public URL.
- [ ] Real iOS Safari 15 and current iOS.
- [ ] VoiceOver and hardware keyboard.
- [ ] Yandex Browser and Samsung Internet.
- [ ] Field INP/LCP/CLS after sufficient traffic.
- [ ] Mail deliverability and bounce processing.
- [ ] Restore and incident tabletop.

## Sign-off

| Роль | Имя | Дата | Подпись |
|---|---|---|---|
| Владелец продукта | TODO | TODO | TODO |
| Оператор/юрист | TODO | TODO | TODO |
| Dev/ security | TODO | TODO | TODO |
| Hosting | TODO | TODO | TODO |

**Нельзя ставить release approved, пока P0 пункты и юридические gates не закрыты.**
