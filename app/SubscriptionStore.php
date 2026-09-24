<?php
declare(strict_types=1);

namespace Vlr;

use PDO;

final class SubscriptionStore
{
    public function __construct(private Database $database, private string $hashKey)
    {
        $this->database->pdo()->exec(
            'CREATE TABLE IF NOT EXISTS subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                email_hash TEXT NOT NULL UNIQUE,
                status TEXT NOT NULL,
                consent_version TEXT NOT NULL,
                consent_hash TEXT NOT NULL,
                confirmation_hash TEXT,
                unsubscribe_hash TEXT,
                requested_at TEXT NOT NULL,
                confirmed_at TEXT,
                unsubscribed_at TEXT,
                expires_at TEXT,
                unsubscribe_expires_at TEXT,
                ip_hash TEXT NOT NULL,
                user_agent_hash TEXT NOT NULL
            )'
        );
        $columns = $this->database->pdo()->query('PRAGMA table_info(subscriptions)')->fetchAll();
        $names = array_column($columns, 'name');
        if (!in_array('unsubscribe_expires_at', $names, true)) {
            $this->database->pdo()->exec('ALTER TABLE subscriptions ADD COLUMN unsubscribe_expires_at TEXT');
        }
    }

    /** @return array{status:string,token:?string,email:string} */
    public function request(string $email, string $ipHash, string $userAgentHash, string $consentVersion, string $consentHash, int $ttlHours): array
    {
        $pdo = $this->database->pdo();
        $normalizedEmail = function_exists('mb_strtolower') ? mb_strtolower($email, 'UTF-8') : strtolower($email);
        $emailHash = hash_hmac('sha256', $normalizedEmail, $this->hashKey);
        $now = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        $expires = $now->modify('+' . max(1, $ttlHours) . ' hours');
        $token = bin2hex(random_bytes(32));
        $confirmationHash = hash('sha256', $token);
        $statement = $pdo->prepare('SELECT id, status FROM subscriptions WHERE email_hash = :email_hash LIMIT 1');
        $statement->execute([':email_hash' => $emailHash]);
        $existing = $statement->fetch();
        if ($existing !== false && $existing['status'] === 'active') {
            return ['status' => 'active', 'token' => null, 'email' => $email];
        }
        if ($existing !== false) {
            $update = $pdo->prepare(
                'UPDATE subscriptions
                 SET status = :status, consent_version = :consent_version, consent_hash = :consent_hash,
                     confirmation_hash = :confirmation_hash, requested_at = :requested_at, expires_at = :expires_at,
                     ip_hash = :ip_hash, user_agent_hash = :user_agent_hash, unsubscribed_at = NULL
                 WHERE id = :id'
            );
            $update->execute([
                ':status' => 'pending',
                ':consent_version' => $consentVersion,
                ':consent_hash' => $consentHash,
                ':confirmation_hash' => $confirmationHash,
                ':requested_at' => $now->format(DATE_ATOM),
                ':expires_at' => $expires->format(DATE_ATOM),
                ':ip_hash' => $ipHash,
                ':user_agent_hash' => $userAgentHash,
                ':id' => $existing['id'],
            ]);
            return ['status' => 'pending', 'token' => $token, 'email' => $email];
        }
        $insert = $pdo->prepare(
            'INSERT INTO subscriptions
             (email, email_hash, status, consent_version, consent_hash, confirmation_hash, requested_at, expires_at, ip_hash, user_agent_hash)
             VALUES (:email, :email_hash, :status, :consent_version, :consent_hash, :confirmation_hash, :requested_at, :expires_at, :ip_hash, :user_agent_hash)'
        );
        $insert->execute([
            ':email' => $email,
            ':email_hash' => $emailHash,
            ':status' => 'pending',
            ':consent_version' => $consentVersion,
            ':consent_hash' => $consentHash,
            ':confirmation_hash' => $confirmationHash,
            ':requested_at' => $now->format(DATE_ATOM),
            ':expires_at' => $expires->format(DATE_ATOM),
            ':ip_hash' => $ipHash,
            ':user_agent_hash' => $userAgentHash,
        ]);
        return ['status' => 'pending', 'token' => $token, 'email' => $email];
    }

    /** @return array{email:string,unsubscribeToken:string}|null */
    public function confirm(string $token, int $unsubscribeTtlDays): ?array
    {
        if (preg_match('/^[a-f0-9]{64}$/', $token) !== 1) {
            return null;
        }
        $pdo = $this->database->pdo();
        $hash = hash('sha256', $token);
        $statement = $pdo->prepare('SELECT id, email, expires_at FROM subscriptions WHERE confirmation_hash = :hash AND status = :status LIMIT 1');
        $statement->execute([':hash' => $hash, ':status' => 'pending']);
        $row = $statement->fetch();
        if ($row === false || strtotime((string) $row['expires_at']) < time()) {
            return null;
        }
        $unsubscribeToken = bin2hex(random_bytes(32));
        $now = gmdate('c');
        $unsubscribeExpires = (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))
            ->modify('+' . max(1, $unsubscribeTtlDays) . ' days')
            ->format(DATE_ATOM);
        $update = $pdo->prepare(
            'UPDATE subscriptions
             SET status = :status, confirmed_at = :confirmed_at, confirmation_hash = NULL,
                 unsubscribe_hash = :unsubscribe_hash, unsubscribe_expires_at = :unsubscribe_expires_at, unsubscribed_at = NULL
             WHERE id = :id'
        );
        $update->execute([
            ':status' => 'active',
            ':confirmed_at' => $now,
            ':unsubscribe_hash' => hash('sha256', $unsubscribeToken),
            ':unsubscribe_expires_at' => $unsubscribeExpires,
            ':id' => $row['id'],
        ]);
        return ['email' => (string) $row['email'], 'unsubscribeToken' => $unsubscribeToken];
    }

    public function unsubscribe(string $token): bool
    {
        if (preg_match('/^[a-f0-9]{64}$/', $token) !== 1) {
            return false;
        }
        $statement = $this->database->pdo()->prepare(
            'UPDATE subscriptions SET status = :status, unsubscribed_at = :time
             WHERE unsubscribe_hash = :hash AND status = :active
             AND unsubscribe_expires_at IS NOT NULL AND unsubscribe_expires_at > :now'
        );
        $statement->execute([
            ':status' => 'unsubscribed',
            ':time' => gmdate('c'),
            ':now' => gmdate('c'),
            ':hash' => hash('sha256', $token),
            ':active' => 'active',
        ]);
        return $statement->rowCount() === 1;
    }
}
