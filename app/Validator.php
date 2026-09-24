<?php
declare(strict_types=1);

namespace Vlr;

final class Validator
{
    /** @return array{0:array<string,string>,1:array<string,string>} */
    public function validateContact(Request $request): array
    {
        $errors = [];
        $values = [];
        $name = $request->postString('name', 100);
        $phone = $this->phone($request->postString('phone', 40));
        $email = $this->email($request->postString('email', 254));
        $message = $this->multiline($request->postString('message', 2000));
        $property = $request->postString('property', 80);
        $consent = $request->postString('consent', 2);

        if ($name === '' || preg_match('/^[\p{L}\p{M}][\p{L}\p{M}\s\'’\-]{1,99}$/u', $name) !== 1) {
            $errors['name'] = 'Укажите имя буквами, от 2 до 100 символов.';
        }
        if ($phone === null) {
            $errors['phone'] = 'Укажите телефон в формате +7 (999) 123-45-67.';
        }
        if ($email === null) {
            $errors['email'] = 'Укажите корректный адрес электронной почты.';
        }
        if ($property !== '' && preg_match('/^[a-z0-9-]{1,80}$/', $property) !== 1) {
            $errors['property'] = 'Некорректный идентификатор объекта.';
        }
        if ($consent !== '1') {
            $errors['consent'] = 'Без согласия на обработку данных отправить форму нельзя.';
        }
        $values = compact('name', 'phone', 'email', 'message', 'property');
        return [$errors, $values];
    }

    public function email(string $value): ?string
    {
        $value = trim($value);
        if ($value === '' || strlen($value) > 254 || filter_var($value, FILTER_VALIDATE_EMAIL) === false) {
            return null;
        }
        return $value;
    }

    public function phone(string $value): ?string
    {
        $value = trim($value);
        $digits = preg_replace('/\D+/', '', $value) ?? '';
        if (str_starts_with($digits, '8') && strlen($digits) === 11) {
            $digits = '7' . substr($digits, 1);
        }
        if (str_starts_with($digits, '7') && strlen($digits) === 11) {
            $digits = substr($digits, 1);
        }
        if (strlen($digits) !== 10) {
            return null;
        }
        return '+7' . $digits;
    }

    private function multiline(string $value): string
    {
        $value = str_replace(["\0", "\r"], ['', ''], trim($value));
        $value = preg_replace('/[^\P{C}\t\n]+/u', '', $value) ?? '';
        return trim($value);
    }
}
