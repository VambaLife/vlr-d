<?php
declare(strict_types=1);

use Vlr\Config;
use Vlr\Csrf;
use Vlr\Database;
use Vlr\Logger;
use Vlr\Mailer;
use Vlr\RateLimiter;
use Vlr\Request;
use Vlr\Response;
use Vlr\SubscriptionStore;
use Vlr\Validator;

ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);
if (function_exists('mb_internal_encoding')) {
    mb_internal_encoding('UTF-8');
}

$root = dirname(__DIR__);
require_once __DIR__ . '/Config.php';
require_once __DIR__ . '/HttpException.php';
require_once __DIR__ . '/Request.php';
require_once __DIR__ . '/Response.php';
require_once __DIR__ . '/Logger.php';
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/RateLimiter.php';
require_once __DIR__ . '/Csrf.php';
require_once __DIR__ . '/Validator.php';
require_once __DIR__ . '/Mailer.php';
require_once __DIR__ . '/SubscriptionStore.php';

$config = new Config($root);
date_default_timezone_set((string) $config->get('APP_TIMEZONE', 'Europe/Moscow'));
$logDirectory = $config->path('LOG_PATH', 'logs');
$logger = new Logger($logDirectory, (string) $config->get('LOG_LEVEL', 'info'));

set_error_handler(static function (int $severity, string $message, string $file, int $line) use ($logger): bool {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    $logger->error('php_warning', ['message' => $message, 'file' => basename($file), 'line' => $line]);
    return true;
});
set_exception_handler(static function (Throwable $error) use ($logger): void {
    $logger->error('uncaught_exception', [
        'type' => get_class($error),
        'message' => $error->getMessage(),
        'file' => basename($error->getFile()),
        'line' => $error->getLine(),
    ]);
    Response::json(500, ['ok' => false, 'message' => 'Внутренняя ошибка. Повторите попытку позднее.']);
});

try {
    $config->assertProductionConfiguration();
    $mailTransport = strtolower((string) $config->get('MAIL_TRANSPORT', 'mail'));
    if (!in_array($mailTransport, ['mail', 'log'], true)) {
        throw new RuntimeException('Unsupported MAIL_TRANSPORT');
    }
    if ($config->isProduction() && $mailTransport === 'log') {
        throw new RuntimeException('Log mail transport is forbidden in production');
    }
    $appUrl = rtrim((string) $config->get('APP_URL', 'http://127.0.0.1:8080'), '/');
    $secureSetting = strtolower((string) $config->get('COOKIE_SECURE', 'auto'));
    $secureCookie = $secureSetting === 'auto' ? $config->isProduction() : in_array($secureSetting, ['1', 'true', 'yes', 'on'], true);
    if ($config->isProduction() && !$secureCookie) {
        throw new RuntimeException('Secure session cookies are mandatory in production');
    }
    $sessionName = (string) $config->get('SESSION_NAME', 'vlr_session');
    if (preg_match('/^[A-Za-z0-9_]{1,64}$/', $sessionName) !== 1) {
        throw new RuntimeException('SESSION_NAME contains unsupported characters');
    }
    $rateSalt = (string) $config->get('RATE_LIMIT_SALT', '');
    $dataKey = (string) $config->get('DATA_HASH_KEY', '');
    if (!$config->isProduction()) {
        $rateSalt = $rateSalt !== '' ? $rateSalt : hash('sha256', $root . '|local-rate-limit');
        $dataKey = $dataKey !== '' ? $dataKey : hash('sha256', $root . '|local-data');
    }
    $storagePath = $config->path('STORAGE_PATH', 'storage');
    $sessionPath = $storagePath . DIRECTORY_SEPARATOR . 'sessions';
    if (!is_dir($sessionPath) && !mkdir($sessionPath, 0750, true) && !is_dir($sessionPath)) {
        throw new RuntimeException('Unable to create session directory');
    }
    ini_set('session.save_path', $sessionPath);
    $database = new Database($storagePath . DIRECTORY_SEPARATOR . 'application.sqlite');
    $mailer = new Mailer(
        $mailTransport,
        (string) $config->get('MAIL_TO', ''),
        (string) $config->get('MAIL_FROM', ''),
        (string) $config->get('MAIL_FROM_NAME', 'VLR-Dmitrov'),
        $logDirectory,
        $appUrl
    );

    return [
        'config' => $config,
        'logger' => $logger,
        'dataKey' => $dataKey,
        'request' => new Request(),
        'validator' => new Validator(),
        'csrf' => new Csrf($sessionName, $secureCookie),
        'rateLimiter' => new RateLimiter($database, $rateSalt),
        'subscriptions' => new SubscriptionStore($database, $dataKey),
        'mailer' => $mailer,
    ];
} catch (Throwable $error) {
    $logger->error('bootstrap_failure', ['message' => $error->getMessage()]);
    Response::json(503, ['ok' => false, 'message' => 'Сервис временно недоступен.']);
}
