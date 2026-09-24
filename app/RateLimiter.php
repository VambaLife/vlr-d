<?php
declare(strict_types=1);

namespace Vlr;

use PDO;

final class RateLimiter
{
    public function __construct(private Database $database, private string $salt)
    {
        $this->database->pdo()->exec(
            'CREATE TABLE IF NOT EXISTS rate_limits (
                bucket TEXT NOT NULL,
                identifier TEXT NOT NULL,
                window_started INTEGER NOT NULL,
                hits INTEGER NOT NULL,
                PRIMARY KEY (bucket, identifier)
            )'
        );
    }

    /**
     * @param array<int,array{limit:int,seconds:int}> $limits
     */
    public function consume(string $bucket, string $ip, array $limits): bool
    {
        if ($this->salt === '') {
            throw new \RuntimeException('Rate limiter salt is not configured');
        }
        $identifier = hash_hmac('sha256', $ip, $this->salt);
        $pdo = $this->database->pdo();
        $now = time();
        $pdo->beginTransaction();
        try {
            foreach ($limits as $limit) {
                $window = max(1, (int) $limit['seconds']);
                $maximum = max(1, (int) $limit['limit']);
                $windowBucket = $bucket . ':' . $window;
                $statement = $pdo->prepare('SELECT window_started, hits FROM rate_limits WHERE bucket = :bucket AND identifier = :identifier');
                $statement->execute([':bucket' => $windowBucket, ':identifier' => $identifier]);
                $row = $statement->fetch();
                $started = $row ? (int) $row['window_started'] : 0;
                $hits = $row ? (int) $row['hits'] : 0;
                if ($row === false || $now - $started >= $window) {
                    $started = $now;
                    $hits = 1;
                } else {
                    $hits++;
                }
                $upsert = $pdo->prepare(
                    'INSERT INTO rate_limits (bucket, identifier, window_started, hits)
                     VALUES (:bucket, :identifier, :started, :hits)
                     ON CONFLICT(bucket, identifier) DO UPDATE SET window_started = excluded.window_started, hits = excluded.hits'
                );
                $upsert->execute([':bucket' => $windowBucket, ':identifier' => $identifier, ':started' => $started, ':hits' => $hits]);
                if ($hits > $maximum) {
                    $pdo->commit();
                    return false;
                }
            }
            $pdo->exec('DELETE FROM rate_limits WHERE window_started < ' . ($now - 86400));
            $pdo->commit();
            return true;
        } catch (\Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
    }
}
