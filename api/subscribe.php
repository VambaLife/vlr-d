<?php
declare(strict_types=1);

use Vlr\HttpException;
use Vlr\Response;

$container = require dirname(__DIR__) . '/app/bootstrap.php';
$request = $container['request'];
$logger = $container['logger'];
$requestId = $request->requestId();
$ip = $request->ip();
$baseContext = ['request_id' => $requestId, 'ip' => $ip, 'form' => 'subscribe'];
$consentVersion = '2026-09-24';

function confirmationPage(string $title, string $message): string
{
    $title = htmlspecialchars($title, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $message = htmlspecialchars($message, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>' . $title . '</title><style>body{margin:0;background:#000;color:#fff;font:16px/1.6 system-ui,sans-serif}.card{box-sizing:border-box;width:min(calc(100% - 32px),680px);margin:12vh auto;padding:40px;background:#fff;color:#111}h1{margin-top:0;font-size:clamp(2rem,6vw,4rem);line-height:1}a{display:inline-block;min-height:44px;padding:12px 18px;background:#111;color:#fff;text-decoration:none}</style></head><body><main class="card"><h1>' . $title . '</h1><p>' . $message . '</p><p><a href="/">Вернуться на главную</a></p></main></body></html>';
}

try {
    if ($request->method() === 'GET') {
        $action = $request->postString('action', 20);
        if ($action === '') {
            $action = trim((string) ($_GET['action'] ?? ''));
        }
        $token = trim((string) ($_GET['token'] ?? ''));
        if ($action === 'confirm') {
            $confirmed = $container['subscriptions']->confirm(
                $token,
                $container['config']->int('UNSUBSCRIBE_TOKEN_TTL_DAYS', 30)
            );
            if ($confirmed === null) {
                $logger->lead('subscription_confirmation_invalid', $baseContext);
                Response::html(confirmationPage('Ссылка недействительна', 'Срок подтверждения истёк или ссылка уже использована. Запросите подтверждение повторно.'), 400);
            }
            try {
                $unsubscribeUrl = $container['mailer']->appUrl('/api/subscribe.php?action=unsubscribe&token=' . rawurlencode($confirmed['unsubscribeToken']));
                $container['mailer']->send($confirmed['email'], 'Подписка ВЛР-Дмитров подтверждена', implode("\n", [
                    'Подписка подтверждена.',
                    '',
                    'Вы можете отписаться в любой момент по ссылке:',
                    $unsubscribeUrl,
                ]));
            } catch (Throwable $error) {
                $logger->error('subscription_welcome_mail_failed', $baseContext + ['type' => get_class($error)]);
            }
            $logger->lead('subscription_confirmed', $baseContext);
            Response::html(confirmationPage('Подписка подтверждена', 'Адрес добавлен в список новых объектов. Отписаться можно в каждом письме.'));
        }
        if ($action === 'unsubscribe') {
            $removed = $container['subscriptions']->unsubscribe($token);
            $logger->lead($removed ? 'subscription_unsubscribed' : 'subscription_unsubscribe_invalid', $baseContext);
            Response::html(confirmationPage(
                $removed ? 'Вы отписаны' : 'Ссылка недействительна',
                $removed ? 'Адрес удалён из списка рассылки.' : 'Ссылка уже использована или адрес не найден.'
            ));
        }
        throw new HttpException(400, 'Неизвестное действие подписки.');
    }

    if ($request->method() !== 'POST') {
        throw new HttpException(405, 'Метод не поддерживается.');
    }
    $request->assertBodySize();
    if (!$request->acceptsFormPayload() || !$request->isSameOrigin()) {
        throw new HttpException(415, 'Форма отправлена в неподдерживаемом формате.');
    }
    if (!$container['rateLimiter']->consume('subscribe', $ip, [
        ['limit' => 5, 'seconds' => 3600],
        ['limit' => 20, 'seconds' => 86400],
    ])) {
        $logger->lead('subscription_rate_limited', $baseContext);
        throw new HttpException(429, 'Слишком много запросов. Повторите попытку позднее.');
    }
    if ($request->postString('website', 200) !== '') {
        $logger->lead('subscription_honeypot', $baseContext);
        Response::json(200, ['ok' => true, 'message' => 'Запрос принят.']);
    }
    if (!$container['csrf']->validate($request->postString('csrf_token', 64))) {
        $logger->lead('subscription_csrf_rejected', $baseContext);
        throw new HttpException(403, 'Сессия формы истекла. Обновите страницу и повторите попытку.');
    }

    $email = $container['validator']->email($request->postString('email', 254));
    $consent = $request->postString('consent', 2) === '1';
    $errors = [];
    if ($email === null) {
        $errors['email'] = 'Укажите корректный адрес электронной почты.';
    }
    if (!$consent) {
        $errors['consent'] = 'Без согласия на рассылку отправить форму нельзя.';
    }
    if ($errors !== []) {
        $logger->lead('subscription_validation_failed', $baseContext + ['fields' => array_keys($errors)]);
        Response::json(422, ['ok' => false, 'message' => 'Проверьте заполнение формы.', 'errors' => $errors]);
    }

    $consentFile = $container['config']->root() . '/src/pages/consent.html';
    $consentHash = is_file($consentFile) ? (string) hash_file('sha256', $consentFile) : hash('sha256', $consentVersion);
    $subscription = $container['subscriptions']->request(
        $email,
        hash_hmac('sha256', $ip, $container['dataKey']),
        $request->userAgentHash($container['dataKey']),
        $consentVersion,
        $consentHash,
        $container['config']->int('SUBSCRIPTION_CONFIRM_TTL_HOURS', 48)
    );
    if ($subscription['status'] === 'active') {
        $logger->lead('subscription_already_active', $baseContext);
        Response::json(200, ['ok' => true, 'message' => 'Этот адрес уже подтверждён.']);
    }

    $confirmationUrl = $container['mailer']->appUrl('/api/subscribe.php?action=confirm&token=' . rawurlencode((string) $subscription['token']));
    try {
        $container['mailer']->send($email, 'Подтвердите подписку ВЛР-Дмитров', implode("\n", [
            'Для подписки на новые объекты подтвердите адрес.',
            '',
            'Ссылка действует 48 часов:',
            $confirmationUrl,
            '',
            'Если вы не запрашивали подписку, просто проигнорируйте письмо.',
        ]));
    } catch (Throwable $error) {
        $logger->error('subscription_mail_failed', $baseContext + ['type' => get_class($error)]);
        throw new HttpException(502, 'Не удалось отправить письмо подтверждения. Попробуйте позднее.');
    }
    $logger->lead('subscription_pending', $baseContext);
    Response::json(202, ['ok' => true, 'message' => 'Проверьте почту и подтвердите подписку в письме.']);
} catch (HttpException $error) {
    Response::json($error->status(), ['ok' => false, 'message' => $error->getMessage()]);
}
