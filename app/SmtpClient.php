<?php
declare(strict_types=1);

namespace Vlr;

final class SmtpClient
{
    public function __construct(
        private string $host,
        private int $port,
        private string $security,
        private string $username,
        private string $password,
        private int $timeout = 15
    ) {
        $this->host = strtolower(trim($this->host));
        $this->security = strtolower(trim($this->security));
        if ($this->host === '' || strlen($this->host) > 253 || preg_match('/^[a-z0-9.-]+$/', $this->host) !== 1) {
            throw new \RuntimeException('Invalid SMTP host');
        }
        if ($this->port < 1 || $this->port > 65535) {
            throw new \RuntimeException('Invalid SMTP port');
        }
        if (!in_array($this->security, ['ssl', 'starttls', 'none'], true)) {
            throw new \RuntimeException('Unsupported SMTP security mode');
        }
        if ($this->security === 'none' && PHP_SAPI !== 'cli') {
            throw new \RuntimeException('Unencrypted SMTP is forbidden outside CLI tests');
        }
        $this->timeout = max(3, min(60, $this->timeout));
    }

    /** @param array<int,string> $headers */
    public function send(string $from, string $to, string $subject, string $body, array $headers): void
    {
        $from = trim($from);
        $to = trim($to);
        if (filter_var($from, FILTER_VALIDATE_EMAIL) === false || filter_var($to, FILTER_VALIDATE_EMAIL) === false) {
            throw new \RuntimeException('Invalid SMTP sender or recipient');
        }
        if (preg_match('/[\r\n]/', $subject) === 1) {
            throw new \RuntimeException('Invalid SMTP subject');
        }
        foreach ($headers as $header) {
            if (!is_string($header) || preg_match('/[\r\n]/', $header) === 1) {
                throw new \RuntimeException('Invalid SMTP header');
            }
        }
        $socket = null;
        try {
            $socket = $this->connect();
            $this->expect($socket, 220, 'SMTP greeting');
            $this->ehlo($socket);

            if ($this->security === 'starttls') {
                $this->command($socket, 'STARTTLS', 220, 'STARTTLS');
                $cryptoEnabled = stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
                if ($cryptoEnabled !== true) {
                    throw new \RuntimeException('SMTP STARTTLS negotiation failed');
                }
                $this->ehlo($socket);
            }

            if ($this->username !== '') {
                $this->command($socket, 'AUTH LOGIN', 334, 'SMTP AUTH');
                $this->command($socket, base64_encode($this->username), 334, 'SMTP username');
                $this->command($socket, base64_encode($this->password), 235, 'SMTP password');
            }

            $this->command($socket, 'MAIL FROM:<' . $from . '>', 250, 'SMTP MAIL FROM');
            $this->command($socket, 'RCPT TO:<' . $to . '>', [250, 251], 'SMTP RCPT TO');
            $this->command($socket, 'DATA', 354, 'SMTP DATA');

            $message = implode("\r\n", [
                'Date: ' . gmdate('r'),
                'Message-ID: <' . bin2hex(random_bytes(16)) . '@' . $this->host . '>',
                'Subject: ' . $subject,
                ...$headers,
                '',
                $body,
            ]);
            $message = preg_replace('/\r?\n/', "\r\n", $message) ?? $message;
            $message = preg_replace('/\r\n\./', "\r\n..", $message) ?? $message;
            $this->write($socket, $message . "\r\n.\r\n");
            $this->expect($socket, 250, 'SMTP message acceptance');
            $this->command($socket, 'QUIT', [221, 250], 'SMTP QUIT');
        } finally {
            if (is_resource($socket)) {
                @fclose($socket);
            }
        }
    }

    /** @return resource */
    private function connect()
    {
        $remote = ($this->security === 'ssl' ? 'ssl://' : 'tcp://') . $this->host . ':' . $this->port;
        $context = stream_context_create([
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
                'allow_self_signed' => false,
                'SNI_enabled' => true,
            ],
        ]);
        $socket = @stream_socket_client($remote, $errorNumber, $errorMessage, $this->timeout, STREAM_CLIENT_CONNECT, $context);
        if (!is_resource($socket)) {
            throw new \RuntimeException('SMTP connection failed', 0, new \RuntimeException($errorNumber . ': ' . $errorMessage));
        }
        stream_set_timeout($socket, $this->timeout);
        return $socket;
    }

    /** @param resource $socket */
    private function ehlo($socket): void
    {
        $this->command($socket, 'EHLO localhost', 250, 'SMTP EHLO');
    }

    /** @param resource $socket @param int|array<int,int> $expected */
    private function command($socket, string $command, int|array $expected, string $label): void
    {
        $this->write($socket, $command . "\r\n");
        $this->expect($socket, $expected, $label);
    }

    /** @param resource $socket */
    private function write($socket, string $data): void
    {
        $length = strlen($data);
        $written = 0;
        while ($written < $length) {
            $count = @fwrite($socket, substr($data, $written));
            if ($count === false || $count === 0) {
                throw new \RuntimeException('SMTP write failed');
            }
            $written += $count;
        }
    }

    /** @param resource $socket @param int|array<int,int> $expected */
    private function expect($socket, int|array $expected, string $label): void
    {
        $code = $this->readResponseCode($socket);
        $expectedCodes = is_array($expected) ? $expected : [$expected];
        if (!in_array($code, $expectedCodes, true)) {
            throw new \RuntimeException($label . ' failed with SMTP code ' . $code);
        }
    }

    /** @param resource $socket */
    private function readResponseCode($socket): int
    {
        $code = 0;
        while (true) {
            $line = @fgets($socket, 1024);
            if ($line === false || $line === '') {
                throw new \RuntimeException('SMTP response read failed');
            }
            if (preg_match('/^(\d{3})([ -]?)/', $line, $matches) !== 1) {
                throw new \RuntimeException('Malformed SMTP response');
            }
            $code = (int) $matches[1];
            if (($matches[2] ?? '') !== '-') {
                return $code;
            }
        }
    }
}
