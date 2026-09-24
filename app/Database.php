<?php
declare(strict_types=1);

namespace Vlr;

use PDO;
use PDOException;

final class Database
{
    private PDO $pdo;

    public function __construct(string $file)
    {
        $directory = dirname($file);
        if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
            throw new PDOException('Unable to create storage directory');
        }
        $this->pdo = new PDO('sqlite:' . $file, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $this->pdo->exec('PRAGMA foreign_keys = ON');
        $this->pdo->exec('PRAGMA busy_timeout = 5000');
        $this->pdo->exec('PRAGMA journal_mode = WAL');
        @chmod($file, 0640);
    }

    public function pdo(): PDO
    {
        return $this->pdo;
    }
}
