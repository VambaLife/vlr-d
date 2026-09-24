# Security policy and implemented controls

## Security status

The code implements a strong baseline for a small static site, but production security also depends on the hosting provider, TLS, DNS, mail relay, secrets, patching, backups, and real legal/operator data. Do not treat this document as a certification or substitute for an independent penetration test.

## Data classification

- **Public:** HTML, CSS, JS, local fonts, approved public media, public phone number.
- **Internal:** source maps/build caches if added later, server configuration, non-public operational metadata.
- **Sensitive:** name, phone, email, message, property interest, subscription status, tokens, session identifiers, logs containing IP, `.env`, database files.
- **Secret:** `RATE_LIMIT_SALT`, `DATA_HASH_KEY`, mail/CRM/monitoring credentials, TLS private keys.

Secrets must not be committed, placed in HTML/CSS/JS, sent to analytics, or printed in logs.

## Implemented controls

### Access control and server boundaries

- Static multi-page routes with real `/property/{slug}.html` files and normal browser history.
- Only `/api/csrf.php`, `/api/send.php`, and `/api/subscribe.php` are intended public PHP endpoints.
- Generated Apache/Nginx rules deny `app/`, `config/`, `logs/`, `storage/`, `backup/`, `src/`, `scripts/`, `tests/`, `node_modules/`, `vendor/`, dotfiles, database files, logs, and non-PHP files under the API boundary.
- No admin panel or authentication surface is implemented. If one is added, use a framework/reviewed auth design, Argon2id/bcrypt, session regeneration, 2FA where appropriate, and an independent threat model.
- No upload endpoint is implemented. If added, validate MIME by content, isolate storage, scan files, and never execute uploads.

### Transport and headers

- HTTPS is required in the deployment runbook.
- Generated Apache/Nginx configurations set HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP and CORP.
- TLS 1.2/1.3, modern ciphers, OCSP and secure cookies are server/deployment requirements.
- HSTS `preload` must only be submitted after all subdomains are confirmed HTTPS-only.
- `X-Powered-By` is removed/unset in both server configurations.

### CSP and browser boundary

- No external production scripts, fonts, analytics, widgets, or CDN resources are loaded.
- CSP `script-src` is self-only plus build-generated SHA-256 hashes for the actual JSON-LD blocks.
- Critical CSS is inline; `style-src` permits inline styles for the generated critical CSS and server-rendered confirmation page.
- `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `img-src 'self' data:`, `media-src 'self'` are configured.
- Inline event handlers, `eval`, `document.write`, `innerHTML`, `outerHTML`, and `insertAdjacentHTML` are prohibited and statically checked.
- Client DOM data from URL/localStorage is treated as untrusted; it is validated against known slugs and inserted as text, never executable HTML.

### Forms and injection

- Client and independent server validation.
- Required separate consent checkbox for contact and marketing forms.
- Honeypot `website` field.
- Same-origin check and CSRF session token with HttpOnly/Secure/SameSite=Strict cookie and two-hour token TTL.
- Body size and field length limits.
- 5 requests/hour and 20/day per IP for contact and subscription endpoints.
- `PDO` prepared statements only; no shell execution functions or user-controlled `exec`/`system`.
- Mail headers are sanitized and recipient/sender are validated.
- No arbitrary URL input is fetched server-side, so SSRF surface is not exposed. Any future CRM/mail provider call must use a fixed server-side allowlist and never a user-provided URL.

### Data minimization and storage

- Contact/subscription values are not written intentionally to `leads.log` or `error.log`.
- Lead log records time, request ID, IP, form, outcome, field names, consent/form version, and does not contain message/contact values.
- SQLite stores subscription email, status, consent version/hash, hashed IP/User-Agent and hashed confirmation/unsubscribe tokens.
- Favorites and compare store only known slugs in versioned localStorage; no name, phone, email, message or token.
- Database, session and log directories are private and should be excluded from backups/public artifacts.
- Cross-border and third-party service inventory is a launch gate; CRM, mailing provider, analytics and monitoring are currently disabled.

### Logging and monitoring

- `logs/leads.log` records form events and IP as required for abuse investigation.
- `logs/error.log` records server/bootstrap errors.
- Logs use newline-safe JSON records and file locking.
- Retention/rotation must be configured by the host (logrotate/systemd journal), with 30-day or shorter policy subject to legal review.
- Optional GlitchTip/Sentry requires a DSN, PII scrubbing, consent/legal review and a documented data flow.
- No console logging is shipped in production JavaScript.

### Supply chain and deployment

- npm dependencies are lockfile-pinned and audited with `npm audit`.
- No Composer runtime dependency or old jQuery/Bootstrap is used.
- Local OFL font files include provenance and SHA-256 hashes.
- SRI is not applicable to same-origin resources; there are no third-party production resources to SRI-hash.
- `.gitignore` excludes secrets, logs, databases, sessions, dependencies and backups.
- `build.sh` is the CI-style build/test entry point.
- `nginx.conf` and `.htaccess` are generated and must be reviewed after each data/content build.
- Daily offsite backup, 30-day retention and restore drills are required by `DEPLOY.md`/`scripts/backup.sh`.

### Authentication and uploads

- A07 authentication controls are not applicable because no admin/login exists.
- A08 upload integrity controls are not applicable because no upload feature exists.
- These are not claims that such features are secure if added later; they require a new review.

## Incident response

1. **Triage:** record UTC time, affected host, endpoint, request IDs, observed symptom and whether PII or credentials may be involved.
2. **Preserve evidence:** snapshot relevant logs, access logs, database, configuration and current release before cleanup; restrict access to the evidence.
3. **Contain:** disable affected route or provider, block abusive source at WAF/firewall, rotate credentials, revoke sessions/tokens, and preserve availability where safe.
4. **Assess:** determine data categories, recipients, cross-border paths, number of records, and whether notification to affected people or regulators is required.
5. **Eradicate:** patch the root cause, remove compromised files/dependencies, rebuild from a trusted commit, and verify checksums.
6. **Recover:** restore a clean release, rotate secrets in dependency order, run `npm test`, verify headers/API/mail, and monitor for recurrence.
7. **Communicate:** use the confirmed operator contacts and legal counsel; do not speculate in public status messages.
8. **Post-incident:** document timeline, root cause, detection gap, corrective actions and owners.

Do not send incident evidence containing PDN to public issue trackers or unapproved third-party services.

## Key rotation

- `RATE_LIMIT_SALT`: rotate during a controlled maintenance window; rotation resets rate counters.
- `DATA_HASH_KEY`: changing it invalidates correlation of existing IP hashes; plan data migration and legal review.
- Mail/API/provider secrets: rotate at provider and server together, test, then revoke old values.
- TLS private keys: rotate through the certificate manager, reload the server, and verify the full chain.
- Never commit old or new values.

## Reporting a vulnerability

Use the confirmed private security contact from `requisites.html`/`TODO-REQUISITES.md` after launch. Until an email is confirmed, do not publish a sensitive vulnerability report in a public issue. Provide a minimal reproduction, affected route/version, impact, and safe remediation evidence. Do not include real customer data or active exploitation code.

## Known limitations before launch

- Operator/requisites, Roskomnadzor notification status, mail addresses, CRM, hosting, and real content are not confirmed.
- No third-party penetration test has been performed.
- Real Safari/iOS, Яндекс.Браузер, Samsung Internet and production field INP require external verification.
- No real property photography/video has been supplied.
- `mail()` deliverability depends on the hosting MTA and DNS records.
- HSTS preload and WAF are deployment decisions, not local code guarantees.
