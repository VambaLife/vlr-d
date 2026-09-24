<?php
declare(strict_types=1);

namespace Vlr;

final class Mailer
{
    public function __construct(
        private string $transport,
        private string $to,
        private string $from,
        private string $fromName,
        private string $logDirectory,
        private string $appUrl
    ) {
    }

    public function send(string $to, string $subject, string $text): void
    {
        $to = trim($to);
        $from = trim($this->from);
        if (filter_var($to, FILTER_VALIDATE_EMAIL) === false || filter_var($from, FILTER_VALIDATE_EMAIL) === false) {
            throw new \RuntimeException('Mail recipient or sender is not configured');
        }
        $safeSubject = trim(preg_replace('/[\r\n]+/', ' ', $subject) ?? 'Message');
        $encodedSubject = '=?UTF-8?B?' . base64_encode($safeSubject) . '?=';
        $headers = [
            'From: ' . $this->encodeAddress($this->fromName) . ' <' . $from . '>',
            'Reply-To: ' . $from,
            'X-Mailer: VLR-Dmitrov',
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
        ];
        $body = chunk_split(base64_encode($text), 76, "\r\n");
        if ($this->transport === 'log') {
            $record = [
                'time' => gmdate('c'),
                'to' => $to,
                'subject' => $safeSubject,
                'body' => $text,
            ];
            file_put_contents($this->logDirectory . DIRECTORY_SEPARATOR . 'mail.log', json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL, FILE_APPEND | LOCK_EX);
            return;
        }
        if (!function_exists('mail')) {
            throw new \RuntimeException('PHP mail() is unavailable');
        }
        if (!mail($to, $encodedSubject, $body, implode("\r\n", $headers))) {
            throw new \RuntimeException('mail() delivery failed');
        }
    }

    public function appUrl(string $path): string
    {
        return rtrim($this->appUrl, '/') . '/' . ltrim($path, '/');
    }

    private function encodeAddress(string $name): string
    {
        $name = trim(preg_replace('/[\r\n"\\\\]+/', ' ', $name) ?? '');
        return $name === '' ? '' : '=?UTF-8?B?' . base64_encode($name) . '?=';
    }
}
