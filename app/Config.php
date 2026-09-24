<?php
declare(strict_types=1);

namespace Vlr;

final class Config
{
    private string $root;

    public function __construct(string $root)
    {
        $this->root = rtrim($root, DIRECTORY_SEPARATOR);
        $this->loadDotEnv($this->root . DIRECTORY_SEPARATOR . '.env');
    }

    public function root(): string
    {
        return $this->root;
    }

    public function get(string $key, ?string $default = null): ?string
    {
        $value = getenv($key);
        if ($value === false) {
            $value = $_ENV[$key] ?? $_SERVER[$key] ?? $default;
        }
        return $value === null ? null : (string) $value;
    }

    public function require(string $key): string
    {
        $value = trim((string) $this->get($key, ''));
        if ($value === '') {
            throw new \RuntimeException("Missing required configuration: {$key}");
        }
        return $value;
    }

    public function bool(string $key, bool $default = false): bool
    {
        $value = $this->get($key);
        if ($value === null || $value === '') {
            return $default;
        }
        return in_array(strtolower($value), ['1', 'true', 'yes', 'on'], true);
    }

    public function int(string $key, int $default): int
    {
        $value = $this->get($key);
        return $value !== null && preg_match('/^-?\d+$/', $value) === 1 ? (int) $value : $default;
    }

    public function path(string $key, string $default): string
    {
        $value = trim((string) $this->get($key, $default));
        if ($value === '') {
            $value = $default;
        }
        $isAbsolute = str_starts_with($value, '/')
            || str_starts_with($value, '\\')
            || preg_match('/^[A-Za-z]:[\\\\\/]/', $value) === 1;
        return $isAbsolute ? $value : $this->root . DIRECTORY_SEPARATOR . $value;
    }

    public function isProduction(): bool
    {
        return strtolower((string) $this->get('APP_ENV', 'production')) === 'production';
    }

    public function assertProductionConfiguration(): void
    {
        if (!$this->isProduction()) {
            return;
        }

        $this->require('APP_URL');
        $this->require('MAIL_TO');
        $this->require('MAIL_FROM');
        $this->require('RATE_LIMIT_SALT');
        $this->require('DATA_HASH_KEY');

        if (!str_starts_with((string) $this->get('APP_URL'), 'https://')) {
            throw new \RuntimeException('APP_URL must use HTTPS in production');
        }
        if (filter_var((string) $this->get('MAIL_TO'), FILTER_VALIDATE_EMAIL) === false) {
            throw new \RuntimeException('MAIL_TO must be a valid email address');
        }
        if (filter_var((string) $this->get('MAIL_FROM'), FILTER_VALIDATE_EMAIL) === false) {
            throw new \RuntimeException('MAIL_FROM must be a valid email address');
        }
        if (strlen((string) $this->get('RATE_LIMIT_SALT')) < 32) {
            throw new \RuntimeException('RATE_LIMIT_SALT must contain at least 32 characters');
        }
        if (strlen((string) $this->get('DATA_HASH_KEY')) < 32) {
            throw new \RuntimeException('DATA_HASH_KEY must contain at least 32 characters');
        }
        $crmProvider = strtolower((string) $this->get('CRM_PROVIDER', 'none'));
        if ($crmProvider !== 'none') {
            throw new \RuntimeException('No CRM adapter is configured; keep CRM_PROVIDER=none');
        }
        $subscriptionProvider = strtolower((string) $this->get('SUBSCRIPTION_PROVIDER', 'none'));
        if ($subscriptionProvider !== 'none') {
            throw new \RuntimeException('No mailing provider adapter is configured');
        }
    }

    private function loadDotEnv(string $file): void
    {
        if (!is_file($file) || !is_readable($file)) {
            return;
        }
        $lines = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            return;
        }
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
                continue;
            }
            [$key, $value] = array_map('trim', explode('=', $line, 2));
            if ($key === '' || preg_match('/^[A-Z][A-Z0-9_]*$/', $key) !== 1 || getenv($key) !== false) {
                continue;
            }
            if (strlen($value) >= 2 && (($value[0] === '"' && str_ends_with($value, '"')) || ($value[0] === "'" && str_ends_with($value, "'")))) {
                $value = substr($value, 1, -1);
            }
            putenv($key . '=' . $value);
            $_ENV[$key] = $value;
        }
    }
}
