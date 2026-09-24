<?php
declare(strict_types=1);

namespace Vlr;

final class Logger
{
    private const REDACTED_KEYS = [
        'name' => true,
        'phone' => true,
        'email' => true,
        'message' => true,
        'token' => true,
        'csrf_token' => true,
        'authorization' => true,
    ];

    public function __construct(private string $directory, private string $minimumLevel = 'info')
    {
        if (!is_dir($this->directory) && !mkdir($this->directory, 0750, true) && !is_dir($this->directory)) {
            throw new \RuntimeException('Unable to create log directory');
        }
    }

    public function lead(string $event, array $context = []): void
    {
        $record = [
            'time' => gmdate('c'),
            'event' => $event,
            'context' => $this->redact($context),
        ];
        $line = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . PHP_EOL;
        file_put_contents($this->directory . DIRECTORY_SEPARATOR . 'leads.log', $line, FILE_APPEND | LOCK_EX);
    }

    public function info(string $event, array $context = []): void
    {
        $this->write('info', $event, $context);
    }

    public function warning(string $event, array $context = []): void
    {
        $this->write('warning', $event, $context);
    }

    public function error(string $event, array $context = []): void
    {
        $this->write('error', $event, $context);
    }

    private function write(string $level, string $event, array $context): void
    {
        $levels = ['debug' => 10, 'info' => 20, 'warning' => 30, 'error' => 40];
        $current = $levels[$level] ?? 20;
        $minimum = $levels[strtolower($this->minimumLevel)] ?? 20;
        if ($current < $minimum) {
            return;
        }
        $record = [
            'time' => gmdate('c'),
            'level' => $level,
            'event' => $event,
            'context' => $this->redact($context),
        ];
        $line = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . PHP_EOL;
        file_put_contents($this->directory . DIRECTORY_SEPARATOR . 'error.log', $line, FILE_APPEND | LOCK_EX);
    }

    private function redact(array $context): array
    {
        foreach ($context as $key => $value) {
            if (isset(self::REDACTED_KEYS[strtolower((string) $key)])) {
                $context[$key] = '[redacted]';
            } elseif (is_array($value)) {
                $context[$key] = $this->redact($value);
            } elseif (is_string($value)) {
                $context[$key] = str_replace(["\r", "\n"], ' ', $value);
            }
        }
        return $context;
    }
}
