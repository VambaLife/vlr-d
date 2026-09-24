<?php
declare(strict_types=1);

use Vlr\HttpException;
use Vlr\Response;

$container = require dirname(__DIR__) . '/app/bootstrap.php';
$request = $container['request'];

try {
    if ($request->method() !== 'GET') {
        throw new HttpException(405, 'Метод не поддерживается.');
    }
    if (!$request->isSameOrigin()) {
        throw new HttpException(403, 'Источник запроса не распознан.');
    }
    Response::json(200, ['ok' => true, 'token' => $container['csrf']->issue()]);
} catch (HttpException $error) {
    Response::json($error->status(), ['ok' => false, 'message' => $error->getMessage()]);
}
