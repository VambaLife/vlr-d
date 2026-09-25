# Deployment runbook

This runbook covers Apache/shared hosting and Nginx/VPS-style deployment. The site cannot be declared live until every launch gate in `TODO-REQUISITES.md` and `TODO-CONTENT.md` is closed.

## 1. Preflight

- [ ] `npm test` passes on the release commit.
- [ ] `npm audit --audit-level=high` reports no high/critical vulnerabilities.
- [ ] PHP 8.1+ is enabled with `PDO`, `pdo_sqlite`, `sqlite3`, `session`, `mbstring`, and `openssl` (or a tested fallback).
- [ ] Public realtor contact (`+7 (925) 735-77-62`, `vikvin14@yandex.ru`) is authorized for the site; legal operator requisites, operator email, domain, mail credentials, and Roskomnadzor status are confirmed.
- [ ] Real property data and media rights are confirmed.
- [ ] `.env` exists only on the server and is not in Git.
- [ ] `RATE_LIMIT_SALT` and `DATA_HASH_KEY` are newly generated secrets.
- [ ] `COOKIE_SECURE=auto` is not disabled.
- [ ] A restore-tested backup target outside the project exists.

## 2. Build artifact

Run in CI or a trusted build machine:

```bash
npm ci
npm test
```

The deployable tree must include:

- generated HTML and `assets/`;
- `api/`, `app/`, `config/`, `src/pages/consent.html` (used for the consent proof hash);
- `.htaccess` or `nginx.conf` as appropriate;
- `robots.txt` and `sitemap.xml`;
- empty writable `logs/`, `storage/`, and `backup/` directories;
- `README.md`, `DEPLOY.md`, `SECURITY.md`, `GITHUB-SETUP.md`, and TODO files for operators.

Do not deploy `.git`, `node_modules`, tests, temporary logs, `.env`, or build caches. `src/`, `scripts/`, `tests/`, and config files remain private and are denied by the web configs. `src/pages/consent.html` must remain available to the PHP consent-proof workflow, or that workflow must be replaced by a separately versioned consent file before removing it.

## 3. Environment

Create `.env` on the server with permissions `0600`:

```ini
APP_ENV=production
APP_DEBUG=false
APP_URL=https://vlr-dmitrov.ru
APP_TIMEZONE=Europe/Moscow
SESSION_NAME=vlr_session
COOKIE_SECURE=auto
MAIL_TRANSPORT=smtp
MAIL_TO=vikvin14@yandex.ru
MAIL_FROM=vikvin14@yandex.ru
MAIL_FROM_NAME=ВЛР-Дмитров
MAIL_SUBJECT=Новая заявка с сайта
MAIL_SMTP_HOST=smtp.yandex.ru
MAIL_SMTP_PORT=465
MAIL_SMTP_SECURITY=ssl
MAIL_SMTP_USER=vikvin14@yandex.ru
MAIL_SMTP_PASS=<server-only Yandex app password>
MAIL_SMTP_TIMEOUT=15
CRM_PROVIDER=none
SUBSCRIPTION_PROVIDER=none
RATE_LIMIT_SALT=<new 32+ character secret>
DATA_HASH_KEY=<new 32+ character secret>
STORAGE_PATH=storage
LOG_PATH=logs
LOG_LEVEL=info
```

Do not paste production secrets into chat, Git, CI logs, or a public issue. Use the hosting secret manager or a protected file.

## 4. Filesystem permissions

Recommended Linux ownership and modes:

```bash
chown -R deploy:www-data /var/www/vlr-dmitrov
find /var/www/vlr-dmitrov -type d -exec chmod 755 {} \;
find /var/www/vlr-dmitrov -type f -exec chmod 644 {} \;
chmod 600 .env
chmod 750 logs storage storage/sessions backup
```

The PHP worker must be able to write only `logs/` and `storage/`. Never make the project directory or `.env` world-writable.

## 5. Apache / shared hosting

1. Set the domain document root to the project directory.
2. Enable `mod_rewrite`, `mod_headers`, `mod_deflate`, `mod_expires`, and `AllowOverride All` or include the generated root `.htaccess` in the vhost.
3. Set PHP 8.1+ and enable the extensions listed above.
4. Copy `config/php.ini` values into the hosting PHP settings; the extension lines remain commented because extension names are host-specific.
5. Ensure the host does not append `.php` to arbitrary files, does not expose `.env`, and does not list directories.
6. Test `/api/csrf.php`, `/api/send.php`, and `/api/subscribe.php` through HTTPS.
7. Verify that a request to `/app/Config.php`, `/storage/application.sqlite`, `/.env`, `/src/`, `/backup/`, and `/logs/` returns 403/404, never source or file content.

## 6. Nginx / PHP-FPM

1. Copy the generated `nginx.conf` into the server’s `sites-available` directory.
2. Replace `/var/www/vlr-dmitrov` with the release path.
3. Replace `/run/php/php8.3-fpm.sock` with the host’s actual PHP-FPM socket.
4. Install certificates at the configured path or edit the certificate directives.
5. Ensure `mime.types` is included at the `http` level.
6. Install/test the `ngx_brotli` module before enabling the commented Brotli directives.
7. Run `nginx -t` and reload only after a successful test.
8. Confirm the CSP hash include path is readable by Nginx but not downloadable from the public path.

Nginx provides the requested access boundary: only the three explicit `/api/*.php` handlers execute; all other PHP requests return 404 and private directories return 404.

## 7. DNS and TLS

1. Point `A/AAAA` records to the hosting provider.
2. Decide whether `www` redirects to the canonical host; the generated HTTP block redirects both names to the canonical HTTPS host.
3. Obtain a Let’s Encrypt or provider certificate.
4. Verify TLS 1.2+ and TLS 1.3; disable TLS 1.0/1.1 and weak ciphers.
5. Verify HTTP → HTTPS, certificate chain, OCSP, and HSTS header.
6. Do not request HSTS preload until every current and future subdomain is permanently HTTPS-only. `preload` in the config is present per requirement but operational submission remains a separate decision.

## 8. Mail

- Configure the host MTA or an approved SMTP relay in the panel/server.
- For the realtor mailbox, set `MAIL_TRANSPORT=smtp`, `MAIL_SMTP_HOST=smtp.yandex.ru`, `MAIL_SMTP_PORT=465`, and `MAIL_SMTP_SECURITY=ssl`.
- Set `MAIL_SMTP_USER` and `MAIL_TO`/`MAIL_FROM` to the authorized mailbox. Keep `MAIL_SMTP_PASS` only in the server secret store; never commit or paste it into chat.
- If STARTTLS is required by another provider, use its documented port and set `MAIL_SMTP_SECURITY=starttls`; do not use unencrypted SMTP on a public web server.
- Verify SPF, DKIM, DMARC, sender domain, bounce handling, and mailbox ownership.
- Send a controlled test through the public contact and subscription flows and inspect headers for correct `From`, `Reply-To`, MIME encoding, and no sensitive form data in logs.
- Do not enable `MAIL_TRANSPORT=log` in production; bootstrap rejects it.

## 9. Backups

The repository includes `scripts/backup.sh`. Set an external absolute `BACKUP_DIR`, for example:

```cron
15 3 * * * BACKUP_DIR=/mnt/offsite-backups/vlr-dmitrov /var/www/vlr-dmitrov/scripts/backup.sh >> /var/log/vlr-backup.log 2>&1
```

The script excludes `.env`, Git, dependencies, logs, and the local backup directory; writes a SHA-256 file; and removes archives older than 30 days. Store the second copy in a separate provider/account. Test restore monthly. Protect and separately back up `.env` in a secrets manager; do not put it in the code archive.

## 10. WAF, fail2ban, monitoring

- Enable the hosting provider WAF or Cloudflare only after checking that it does not cache API responses or bypass origin HTTPS.
- Configure fail2ban from the provider’s real access-log format. The application rate limiter remains the primary control because this site has no login/admin surface.
- Monitor 4xx/5xx rates, PHP error logs, mail delivery, disk space, certificate expiry, uptime, and `/api/` failures.
- GlitchTip/Sentry is optional and currently disabled. If enabled, obtain a DSN, document PII scrubbing and cross-border processing, and load it only under the approved consent/privacy model.
- Do not send form bodies, names, phone numbers, emails, CSRF tokens, or subscription tokens to monitoring.

## 11. Release verification

After deploy:

```bash
curl -I https://vlr-dmitrov.ru/
curl -I https://vlr-dmitrov.ru/property/berezovaya-25.html
curl -I https://vlr-dmitrov.ru/.env
curl -I https://vlr-dmitrov.ru/app/Config.php
curl -I https://vlr-dmitrov.ru/storage/application.sqlite
```

Expected: public pages 200, private paths 403/404, HTTP redirects to HTTPS, security headers present, no `X-Powered-By`.

Run the full local suite against the release artifact, including `npm run test:smtp`, then perform a real mobile PageSpeed/PSI and WebPageTest run on the public URL. Field INP and real Safari/Yandex/Samsung results remain external verification gates.
