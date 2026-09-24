<?php
declare(strict_types=1);

namespace Vlr;

final class Request
{
    public function __construct(private int $maxBodyBytes = 32768)
    {
    }

    public function method(): string
    {
        return strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    }

    public function ip(): string
    {
        $ip = trim((string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'));
        return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '0.0.0.0';
    }

    public function requestId(): string
    {
        $id = (string) ($_SERVER['HTTP_X_REQUEST_ID'] ?? '');
        if (preg_match('/^[a-zA-Z0-9._-]{8,80}$/', $id) === 1) {
            return $id;
        }
        return bin2hex(random_bytes(16));
    }

    public function contentType(): string
    {
        return strtolower(trim(explode(';', (string) ($_SERVER['CONTENT_TYPE'] ?? ''))[0]));
    }

    public function acceptsFormPayload(): bool
    {
        return in_array($this->contentType(), ['application/x-www-form-urlencoded', 'multipart/form-data'], true);
    }

    public function assertBodySize(): void
    {
        $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        if ($length < 0 || $length > $this->maxBodyBytes) {
            throw new HttpException(413, 'Слишком большой объём запроса.');
        }
    }

    public function postString(string $key, int $maxLength = 255): string
    {
        $value = $_POST[$key] ?? '';
        if (!is_string($value)) {
            return '';
        }
        $value = str_replace("\0", '', trim($value));
        $length = function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : (preg_match_all('/./us', $value, $matches) ?: strlen($value));
        if ($length > $maxLength) {
            throw new HttpException(422, 'Одно из полей формы слишком длинное.');
        }
        if (function_exists('mb_substr')) {
            return mb_substr($value, 0, $maxLength, 'UTF-8');
        }
        return $length <= $maxLength ? $value : substr($value, 0, $maxLength);
    }

    public function header(string $name): string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        return trim((string) ($_SERVER[$key] ?? ''));
    }

    public function isSameOrigin(): bool
    {
        $origin = $this->header('Origin');
        if ($origin === '') {
            return true;
        }
        $expected = rtrim((string) getenv('APP_URL'), '/');
        return hash_equals($expected, rtrim($origin, '/'));
    }

    public function userAgentHash(string $key): string
    {
        return hash_hmac('sha256', (string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), $key);
    }
}
