# Changelog

## [Unreleased] — 2026-09-25

### Added

- Статический MPA-каркас с физическими URL для каталога, категорий и шести объектов.
- Генератор страниц, минификация CSS/JS, локальные OFL-шрифты Manrope и Cormorant Garamond.
- Честные текстовые placeholders вместо выдуманных фотографий и неподтверждённых цен.
- OG/social placeholder, явно не изображающий недвижимость.
- Доступные панели, custom lightbox, клавиатурная навигация, focus management, inert-изоляция, swipe и reduced-motion режим.
- Избранное и compare до четырёх объектов в versioned `localStorage`; только известные slug, без ПДн.
- URL-фильтры поиска с `URLSearchParams`, `history.pushState` и `popstate`.
- PHP 8.1+ API: CSRF-сессия, honeypot, origin check, валидация, rate limits, `mail()`/TLS SMTP и double-opt-in.
- SQLite prepared statements для rate limits и подписок; private storage/session directories.
- Consent/privacy/terms/requisites templates с честными launch blockers.
- Сгенерированные `.htaccess`, `nginx.conf`, CSP hash include, `robots.txt` и `sitemap.xml`.
- README, DEPLOY, SECURITY, TODO и backup runbook.
- Smoke, E2E, PHP integration, SMTP protocol, axe-core и Lighthouse test scripts.
- Локальный SMTP-клиент без внешних runtime-зависимостей, fake-server протокольный тест и Yandex-конфигурация без пароля в Git.
- Сервисные направления на главной вместо неподтверждённых карточек объектов; request type в контактной форме.
- Локальный оптимизированный hero-визуал Дмитровского кремля с CC BY 2.0 attribution и страницей `/credits.html`.
- CI workflow и Dependabot для GitHub; инструкция по push/protection/secrets в `GITHUB-SETUP.md`.

### Changed

- Удалён старый `влр.html` из deployable-каталога; исходник сохранён в baseline commit `c42ac7b`.
- Убран небезопасный `history.pushState('/')` из прототипа; страницы используют обычные ссылки и физические HTML-файлы.
- Удалены неподтверждённые рекламные утверждения и выдуманные media-композиции.
- Удалён неподтверждённый режим работы из footer; время ответа теперь уточняется по телефону.
- Публичные контакты риэлтора `+7 (925) 735-77-62` и `vikvin14@yandex.ru` добавлены в footer, формы, JSON-LD и конфигурацию получателя.
- Полный stylesheet подключается обычным `<link>` после измерения: это улучшило локальный FCP/LCP; critical CSS остаётся inline.

### Security and privacy

- CRM, внешний mailing provider, analytics и monitoring остаются disabled/none до подтверждения данных и договоров.
- Уведомления о новых подписках отправляются на публичный адрес риэлтора через настроенный transport; в локальных тестах используется только log transport.
- Уведомление Роскомнадзора не объявляется поданным без доказательства.
- Персональные данные, токены и тексты обращений не пишутся в `leads.log`/`error.log` намеренно.

## Not yet released

- Реальные реквизиты оператора, домен, dedicated legal contact и MTA credentials.
- Подтверждение уведомления Роскомнадзора и финальная юридическая проверка.
- 48 реальных фотографий объектов, лицензированное hero-видео и проверенные характеристики.
- Production PSI/field data, реальные iOS/Yandex/Samsung/VoiceOver и независимый penetration test.
