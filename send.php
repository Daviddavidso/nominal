<?php
/* ═══════════════════════════════════════════════════════════
   Приём заявок с формы.
   1) пишет в leads.csv рядом с этим файлом
   2) если заполнены TG_TOKEN и TG_CHAT — дублирует в Telegram
   ═══════════════════════════════════════════════════════════ */

$TG_TOKEN = '';   // ← токен бота от @BotFather, напр. '7712345678:AAF...'
$TG_CHAT  = '';   // ← id чата, узнать у @userinfobot, напр. '123456789'

header('Content-Type: text/plain; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  exit('method not allowed');
}

$clean = function ($k, $max = 200) {
  $v = isset($_POST[$k]) ? (string)$_POST[$k] : '';
  $v = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $v);
  return mb_substr(trim($v), 0, $max);
};

// ловушка для ботов
if ($clean('site') !== '') { exit('ok'); }

$name    = $clean('name', 80);
$phone   = $clean('phone', 24);
$product = $clean('product', 24);
$consent = isset($_POST['consent']);

$titles = [
  'debit'   => 'Дебетовая карта',
  'credit'  => 'Кредитная карта',
  'loan'    => 'Кредит наличными',
  'deposit' => 'Вклад или накопительный счёт',
];
$productName = isset($titles[$product]) ? $titles[$product] : $product;

if ($name === '' || !preg_match('/^\+7\d{10}$/', $phone) || $productName === '' || !$consent) {
  http_response_code(422);
  exit('bad request');
}

$when = date('d.m.Y H:i');
$ip   = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';

// ── 1. в файл ──
$file = __DIR__ . '/leads.csv';
$new  = !file_exists($file);
if ($fh = @fopen($file, 'a')) {
  if (flock($fh, LOCK_EX)) {
    // 5-й аргумент задан явно: с PHP 8.5 без него сыпется Deprecated прямо в ответ
    if ($new) { fwrite($fh, "\xEF\xBB\xBF"); fputcsv($fh, ['Дата', 'Имя', 'Телефон', 'Продукт', 'IP'], ';', '"', '\\'); }
    fputcsv($fh, [$when, $name, $phone, $productName, $ip], ';', '"', '\\');
    flock($fh, LOCK_UN);
  }
  fclose($fh);
  @chmod($file, 0640);
}

// ── 2. в Telegram ──
if ($TG_TOKEN !== '' && $TG_CHAT !== '') {
  $text = "Новая заявка — Номинал\n"
        . "Имя: {$name}\n"
        . "Телефон: {$phone}\n"
        . "Продукт: {$productName}\n"
        . "Время: {$when}";
  $url = "https://api.telegram.org/bot{$TG_TOKEN}/sendMessage";
  $payload = http_build_query(['chat_id' => $TG_CHAT, 'text' => $text]);

  if (function_exists('curl_init')) {
    $c = curl_init($url);
    curl_setopt_array($c, [
      CURLOPT_POST => true,
      CURLOPT_POSTFIELDS => $payload,
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_TIMEOUT => 8,
    ]);
    curl_exec($c);
    curl_close($c);
  } else {
    @file_get_contents($url, false, stream_context_create([
      'http' => [
        'method'  => 'POST',
        'header'  => "Content-Type: application/x-www-form-urlencoded\r\n",
        'content' => $payload,
        'timeout' => 8,
      ],
    ]));
  }
}

echo 'ok';
