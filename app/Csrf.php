<?php
declare(strict_types=1);

namespace Vlr;

final class Csrf
{
    public function __construct(private string $sessionName, private bool $secureCookie)
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.cookie_httponly', '1');
        ini_set('session.cookie_secure', $secureCookie ? '1' : '0');
        ini_set('session.cookie_samesite', 'Strict');
        session_name($this->sessionName);
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => $secureCookie,
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
        session_start();
    }

    public function issue(): string
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            throw new \RuntimeException('Session is not active');
        }
        $issuedAt = (int) ($_SESSION['csrf_issued_at'] ?? 0);
        if (!isset($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token']) || $issuedAt < time() - 7200) {
            session_regenerate_id(true);
            $token = bin2hex(random_bytes(32));
            $_SESSION['csrf_token'] = $token;
            $_SESSION['csrf_hash'] = hash('sha256', $token);
            $_SESSION['csrf_issued_at'] = time();
            return $token;
        }
        return (string) $_SESSION['csrf_token'];
    }

    public function validate(string $token): bool
    {
        $stored = $_SESSION['csrf_hash'] ?? '';
        $issuedAt = (int) ($_SESSION['csrf_issued_at'] ?? 0);
        $notExpired = $issuedAt >= time() - 7200;
        return $notExpired && is_string($stored) && $stored !== '' && preg_match('/^[a-f0-9]{64}$/', $token) === 1 && hash_equals($stored, hash('sha256', $token));
    }
}
