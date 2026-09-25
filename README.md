# VLR-Dmitrov website

Production-oriented static website for a real-estate agency in the Dmitrov urban district. The frontend is a static multi-page application generated at build time; the only public server-side endpoints are the explicit PHP handlers under `/api/`.

Public realtor contact: `+7 (925) 735-77-62`, `vikvin14@yandex.ru`.

## Stack

- Node.js 22+ for generation, minification, link checks, browser tests, and PHP integration tests;
- vanilla Java/CSS, no runtime UI framework;
- PHP 8.1+ with PDO SQLite, `pdo_sqlite`, `sqlite3`, and `mbstring` recommended;
- PHP `mail()` and an optional dependency-free TLS SMTP transport (including Yandex) for controlled deployments;
- no Composer runtime dependency;
- no external production CDN, analytics, widget, or web-font request.

## Project map

```text
/                         generated public pages
/index.html               home
/properties/              all listings
/property/*.html          static property pages
/api/csrf.php             CSRF token endpoint
/api/send.php             contact form
/api/subscribe.php        double-opt-in subscription
/app/                     private PHP application code
/storage/                 private SQLite/session data
/logs/                    private runtime logs
/assets/                  local fonts, CSS, JS, icons, generated config
/src/                     page sources, data, templates, server templates
/scripts/                 build, dev server, backup and media generation
/tests/                   local smoke/e2e/PHP tests
```

`send.php` and `subscribe.php` are intentionally exposed only as `/api/send.php` and `/api/subscribe.php`; there are no duplicate root handlers.

## Requirements

- Node.js 22+ and npm 10+;
- PHP 8.1+ with `PDO`, `pdo_sqlite`, `sqlite3`, `session`, `mbstring`, and `openssl` (or a tested UTF-8 fallback);
- Apache 2.4 with `mod_rewrite`, `mod_headers`, `mod_deflate`, `mod_expires`, or Nginx with PHP-FPM;
- HTTPS at the edge.

## Local setup

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Create a local environment file. Never commit it:

   ```bash
   cp .env.example .env
   ```

   On Windows PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

3. For local testing, set `APP_ENV=testing`, `MAIL_TRANSPORT=log`, a local `APP_URL`, and test-only salts. For Yandex delivery, copy `.env.example` to a server-only `.env`, set `MAIL_TRANSPORT=smtp`, and provide `MAIL_SMTP_PASS` through a secret manager. Do not use `MAIL_TRANSPORT=log` in production; bootstrap rejects it.

4. Build generated pages and security configs:

   ```bash
   npm run build
   ```

5. Run all local tests:

   ```bash
   npm test
   ```

   This runs build/static checks, route smoke tests, browser interaction tests, PHP 8.1+ integration tests, the local SMTP protocol test, and axe-core. The PHP test uses a temporary SQLite database and log-only mail transport; it never sends a real email.

6. Preview the static frontend with Node:

   ```bash
   npm run dev
   ```

   Open `http://127.0.0.1:4173/`.

7. To preview PHP endpoints, run a PHP server from the project root after enabling the required extensions:

   ```bash
   php -S 127.0.0.1:8080 -t .
   ```

## Important commands

```bash
npm run build          # generate HTML, minified assets, CSP, robots, sitemap
npm run check          # static/link/SEO/security checks
npm run test:smoke     # all routes at 375/768/1440, Back/direct/no-JS
npm run test:e2e       # panels, lightbox, favorites, compare, search
npm run test:php       # CSRF, forms, limits, double-opt-in, logs
npm run test:smtp       # Mailer/SMTP integration against a local fake server
npm run test:a11y       # axe-core desktop/mobile
npm run lighthouse      # local lab Lighthouse; not PSI field data
npm audit              # dependency audit
./build.sh             # CI-style build and test entry point
```

## Content editing

- Page sources: `src/pages/`;
- page metadata: `src/data/pages.json`;
- object data: `src/data/properties.json`;
- FAQ: `src/data/faqs.json`;
- global site data: `src/data/site.json`;
- shared header/footer/dialogs: `src/partials/`.

Do not publish an object’s price, address, type, area, district, or legal claim until it is verified. Keep `verified: false` until the data and rights are confirmed. Real photos must be supplied with documented publication rights; see `TODO-CONTENT.md`.

## Forms and data handling

The contact form posts name, phone, email, request type, optional message and property identifier. The subscription form posts email only and sends a separate notification to the configured realtor mailbox. Both require a separate consent checkbox, CSRF token, honeypot, same-origin check, server validation, and independent IP limits. The site does not process payments or create ecommerce orders; "заказ" is handled as a typed request to the realtor.

Server logs contain event metadata, request ID, IP, outcome, and field names for failures. They do not intentionally contain the full message, name, phone, email, CSRF token, or subscription token. The local `log` mail transport is a test-only feature and writes mail content to a private test log. The SMTP client validates TLS settings and never logs the SMTP password.

## Fonts and visual assets

Manrope and Cormorant Garamond are self-hosted under the SIL Open Font License. The hero uses a local optimized copy of a Dmitrov Kremlin city view under CC BY 2.0; attribution is on `/credits.html` and next to the image. License texts and provenance are in `assets/fonts/` and `img/MEDIA-LICENSES.md`. Do not add proprietary fonts, generated fake property images, unlicensed stock media, or external CDN resources.

## SEO

Generated pages contain unique metadata, canonical URLs, Open Graph/Twitter tags, JSON-LD `Organization`, `WebSite`, `RealEstateAgent`, `RealEstateListing`, `BreadcrumbList`, and `FAQPage` where applicable. JSON-LD is protected by generated CSP hashes; do not add ad-hoc inline scripts without rebuilding.

## Security and deployment

Read `SECURITY.md`, `DEPLOY.md`, `DEPLOY-CHECKLIST.md`, and `GITHUB-SETUP.md` before configuring a server or pushing to GitHub. The generated `.htaccess`, `nginx.conf`, CSP hash include, `robots.txt`, and `sitemap.xml` are build outputs. Review them after every content/data build. Audit results are in `TEST-REPORT.md`, `SECURITY-REPORT.md`, `LEGAL-REPORT.md`, and `PERFORMANCE-REPORT.md`.

## License and legal status

This repository is a client project and is marked `UNLICENSED` in `package.json`. Third-party package licenses are recorded in `package-lock.json`; font licenses are in `assets/fonts/`. Legal documents are templates until real operator data and professional legal review are supplied.
