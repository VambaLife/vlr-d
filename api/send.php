<?php
declare(strict_types=1);

use Vlr\HttpException;
use Vlr\Response;

$container = require dirname(__DIR__) . '/app/bootstrap.php';
$request = $container['request'];
$logger = $container['logger'];
$requestId = $request->requestId();
$ip = $request->ip();
$baseContext = ['request_id' => $requestId, 'ip' => $ip, 'form' => 'contact'];

try {
    if ($request->method() !== 'POST') {
        throw new HttpException(405, 'Метод не поддерживается.');
    }
    $request->assertBodySize();
    if (!$request->acceptsFormPayload() || !$request->isSameOrigin()) {
        throw new HttpException(415, 'Форма отправлена в неподдерживаемом формате.');
    }
    if (!$container['rateLimiter']->consume('contact', $ip, [
        ['limit' => 5, 'seconds' => 3600],
        ['limit' => 20, 'seconds' => 86400],
    ])) {
        $logger->lead('contact_rate_limited', $baseContext);
        throw new HttpException(429, 'Слишком много заявок. Повторите попытку позднее.');
    }

    $website = $request->postString('website', 200);
    if ($website !== '') {
        $logger->lead('contact_honeypot', $baseContext);
        Response::json(200, ['ok' => true, 'message' => 'Заявка принята.']);
    }

    $csrf = $request->postString('csrf_token', 64);
    if (!$container['csrf']->validate($csrf)) {
        $logger->lead('contact_csrf_rejected', $baseContext);
        throw new HttpException(403, 'Сессия формы истекла. Обновите страницу и повторите попытку.');
    }

    [$errors, $values] = $container['validator']->validateContact($request);
    if ($errors !== []) {
        $logger->lead('contact_validation_failed', $baseContext + ['fields' => array_keys($errors)]);
        Response::json(422, [
            'ok' => false,
            'message' => 'Проверьте заполнение формы.',
            'errors' => $errors,
        ]);
    }

    $propertyLabel = $values['property'] !== '' ? $values['property'] : 'не указан';
    $text = implode("\n", [
        'Новая заявка с сайта VLR-Dmitrov',
        '',
        'Имя: ' . $values['name'],
        'Телефон: ' . $values['phone'],
        'Email: ' . $values['email'],
        'Идентификатор объекта: ' . $propertyLabel,
        '',
        'Сообщение:',
        $values['message'] !== '' ? $values['message'] : 'Не указано',
        '',
        'Версия согласия: 2026-09-24',
    ]);

    try {
        $container['mailer']->send(
            (string) $container['config']->get('MAIL_TO', ''),
            (string) $container['config']->get('MAIL_SUBJECT', 'Новая заявка с сайта'),
            $text
        );
    } catch (Throwable $error) {
        $logger->error('contact_mail_failed', $baseContext + ['type' => get_class($error)]);
        throw new HttpException(502, 'Не удалось отправить заявку. Позвоните нам по телефону.');
    }

    $logger->lead('contact_sent', $baseContext + ['form_id' => 'contact_form_v1', 'consent_version' => '2026-09-24', 'action' => 'submit']);
    Response::json(200, ['ok' => true, 'message' => 'Заявка принята. Мы свяжемся с вами после проверки обращения.']);
} catch (HttpException $error) {
    Response::json($error->status(), ['ok' => false, 'message' => $error->getMessage()]);
}
