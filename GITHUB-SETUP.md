# GitHub setup

Репозиторий подготовлен для GitHub: CI workflow и Dependabot уже добавлены, secrets не коммитятся.

## 1. Создать private repository

Рекомендуется сначала создать **Private** repository, например `vlr-dmitrov`, без automatic README/license initialization.

## 2. Подключить remote

После создания repository:

```bash
git remote add origin https://github.com/<OWNER>/<REPO>.git
git remote -v
git push -u origin main
```

Не добавлять `.env`, `node_modules`, `storage/*.sqlite`, `logs/*.log`, `backup/*` или сертификаты вручную: они исключены `.gitignore`.

## 3. GitHub Actions

Workflow `.github/workflows/ci.yml` запускает:

- `npm ci`;
- PHP 8.3 setup;
- Chromium for Playwright;
- `npm test`;
- Lighthouse lab;
- PHP lint;
- `npm audit`.

После первого push проверить статус Actions и не публиковать production deployment, пока CI зелёный.

## 4. Secrets

В GitHub Secrets не добавлять SMTP-пароль до момента настройки deployment. На сервере создать `.env` из `.env.example` и задать:

- `MAIL_TO=vikvin14@yandex.ru`;
- `MAIL_FROM=vikvin14@yandex.ru`;
- `MAIL_SMTP_HOST=smtp.yandex.ru`;
- `MAIL_SMTP_PORT=465`;
- `MAIL_SMTP_SECURITY=ssl`;
- `MAIL_SMTP_USER=vikvin14@yandex.ru`;
- `MAIL_SMTP_PASS=<Yandex app password, never commit>`;
- `RATE_LIMIT_SALT=<new secret>`;
- `DATA_HASH_KEY=<new secret>`.

Для Yandex использовать отдельный пароль приложения, если это предусмотрено аккаунтом, а не основной пароль.

## 5. Branch protection

После первого push включить:

- protected branch `main`;
- required status check `test`;
- disallow force-push;
- require pull request before merge;
- secret scanning and push protection, если доступны в тарифе.

## 6. Public repository

До перевода в Public проверить, что история Git не содержит `.env`, SMTP-паролей, ключей, SQLite и клиентских данных. В текущей baseline-истории находится только исходный прототип и публичные исходники; рабочие secrets не добавлялись.
