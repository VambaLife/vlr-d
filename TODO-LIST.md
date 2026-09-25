# Consolidated TODO list

Состояние на 25 сентября 2026. Детали разделены в `TODO-CONTENT.md` и `TODO-REQUISITES.md`.

## P0 — блокирует production

- [ ] Получить и проверить полное наименование юридического лица/ИП.
- [ ] Получить ОГРН/ОГРНИП, ИНН, КПП, юридический и фактический адреса.
- [x] Публичный email риэлтора `vikvin14@yandex.ru` указан для контактов и уведомлений.
- [ ] Получить и подтвердить dedicated legal contact/email для заявлений по 149-ФЗ и PDн.
- [ ] Определить владельца домена, оператора PDн, исполнителя рекламы и агентства; описать роли.
- [ ] Проверить необходимость уведомления в Роскомнадзор и сохранить доказательство.
- [ ] Заполнить `APP_URL`, `MAIL_TO`, `MAIL_FROM`, SMTP credentials и проверить домен/MTA.
- [ ] Сгенерировать production `RATE_LIMIT_SALT` и `DATA_HASH_KEY`.
- [ ] Проверить/настроить HTTPS, HSTS, firewall, WAF и реальные server headers.
- [ ] Провести юридическую проверку политики, согласия, terms, реквизитов и рекламных формулировок.
- [ ] Заполнить сроки хранения, карту сервисов, стран обработки и cross-border оснований.
- [ ] Получить 48 реальных фотографий и подтверждение прав на публикацию.
- [x] Hero video оставлен disabled (`heroVideo=null`), чтобы не публиковать медиа без лицензии.
- [ ] Подтвердить цены, адреса, типы, площади и описания всех объектов.
- [ ] Выполнить restore test внешнего backup.

## P1 — до подключения сервисов

- [ ] Решить, нужен ли CRM; до решения оставить `CRM_PROVIDER=none`.
- [ ] Решить mailing provider; провести double-opt-in/unsubscribe provider test.
- [ ] Заполнить consent/cookie policy при подключении аналитики.
- [ ] Настроить logrotate/systemd journal и WAF/fail2ban по реальному access-log format.
- [ ] Проверить SPF/DKIM/DMARC, bounce handling и deliverability.
- [ ] Провести независимый penetration test.
- [ ] Проверить реальные iOS Safari, VoiceOver, Yandex Browser и Samsung Internet.
- [ ] Запустить production PSI, WebPageTest и собрать field INP/CLS/LCP.

## P2 — после запуска

- [ ] Настроить uptime/availability monitoring без отправки форм и ПДн.
- [ ] Добавить GlitchTip/Sentry только после DSN, consent, PII scrubbing и legal review.
- [ ] Проверять сроки хранения и удалять старые consent proofs/logs.
- [ ] Проводить регулярный `npm audit`, PHP dependency review и secret rotation.
- [ ] Обновлять CHANGELOG и TEST-REPORT для каждого релиза.
- [ ] Пересматривать robots/sitemap/CSP после изменения routes/data.

## Уже выполнено в коде

- [x] Baseline Git commit с исходным прототипом.
- [x] Статический MPA и физические property URLs.
- [x] Локальные OFL-шрифты, critical CSS и mini assets.
- [x] Lightbox, panels, focus management, keyboard/touch controls.
- [x] Избранное и compare с localStorage только slug.
- [x] URL-поиск и browser Back.
- [x] PHP CSRF, validation, honeypot, rate limits, `mail()`/TLS SMTP и request type.
- [x] Double-opt-in и unsubscribe.
- [x] Security headers templates, robots, sitemap, backup script.
- [x] Smoke/E2E/PHP/SMTP/axe/Lighthouse local test scripts.
- [x] Honest placeholders при отсутствии фото/видео; локальный городской hero с CC BY 2.0 attribution.
- [x] Юридические документы с явными placeholders и launch blockers.

## Нельзя закрыть кодом

- [ ] Реальные документы и реквизиты.
- [ ] Доказательства рекламных/финансовых утверждений.
- [ ] Права на фото/видео/музыку.
- [ ] Реальные результаты внешних браузеров, PSI и penetration test.
