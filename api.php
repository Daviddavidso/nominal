<?php
/* ==========================================================================
   ПУБЛИКАЦИЯ ИЗ АДМИНКИ.

   Админка правит каталог в браузере и присылает сюда готовый файл данных.
   Скрипт кладёт его на место, прежнюю версию прячет рядом (её возвращает
   кнопка «Вернуть предыдущую версию») и меняет метку ?v=… во всех html —
   без этого браузер посетителя отдал бы старый файл из кеша, и правки
   «не появились бы».

   Пароль лежит не здесь, а в файле .admin-pass — одной строкой, хеш SHA-256
   от соли и пароля. Скрипт ищет его сначала НАД корнем сайта (оттуда его
   нельзя скачать из браузера), потом рядом с собой.
   Сменить пароль:
     php -r 'echo hash("sha256", "nominal-salt-2026" . "новый-пароль");' > .admin-pass
   ========================================================================== */

declare(strict_types=1);

ini_set('display_errors', '0');
ini_set('log_errors', '1');

const SALT       = 'nominal-salt-2026';
const DATA_FILE  = 'data.js';       // какой файл переписываем
const MAX_BYTES  = 8388608;          // 8 МБ: картинки могут лежать в файле данных
const LIFETIME   = 2592000;          // 30 дней — чтобы пароль не спрашивали каждый раз
const TRY_LIMIT  = 10;               // попыток пароля
const TRY_WINDOW = 600;              // за 10 минут

/* Куски, без которых присланный файл считается битым: защита от того,
   чтобы на сайт уехала пустышка или чужой текст. */
const NEEDLES = ['const OFFERS', 'const CATEGORIES'];

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$dir = __DIR__;

/* $_SERVER['HTTPS'] бывает строкой 'off' — по !empty() она «истинна», и cookie
   уехала бы с флагом secure на http-сайт, то есть не сохранилась бы вовсе. */
$https = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
      || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

session_set_cookie_params([
    'lifetime' => LIFETIME,
    'path'     => '/',
    'httponly' => true,
    'samesite' => 'Lax',
    'secure'   => $https,
]);
session_name('nominal_admin');
session_start();

function out(array $data, int $code = 200): never
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/* Пароль хранится хэшем. Сначала ищем файл .admin-pass — так пароль меняется
   без правки кода; файл кладут НАД корнем сайта, оттуда его не скачать.
   Файла нет — берём хэш, вшитый сюда при сборке. Это тоже безопасно: .php
   отдаётся выполненным, исходник наружу не уходит. Нужно, потому что на части
   хостингов над корнем сайта по FTP не подняться. */
const PASS_HASH = '8fa503643eaf5cd8b7daf43947baa57b98712028112dd104ff72d02e9b4decc9';

function passHash(): string
{
    foreach ([dirname(__DIR__) . '/.admin-pass', __DIR__ . '/.admin-pass'] as $f) {
        if (is_file($f)) {
            $hash = trim((string) file_get_contents($f));
            if ($hash !== '') return $hash;
        }
    }
    return PASS_HASH;
}

function isAuthed(): bool
{
    $hash = passHash();
    return $hash !== '' && !empty($_SESSION['ok']) && hash_equals($hash, (string) $_SESSION['ok']);
}

function published(string $dir): array
{
    $f = $dir . '/published.json';
    if (!is_file($f)) return ['at' => null, 'hash' => null];
    $d = json_decode((string) file_get_contents($f), true);
    return is_array($d) ? $d + ['at' => null, 'hash' => null] : ['at' => null, 'hash' => null];
}

function tries(string $dir): array
{
    $f = $dir . '/.login-tries';
    if (!is_file($f)) return ['n' => 0, 'first' => 0];
    $d = json_decode((string) file_get_contents($f), true);
    if (!is_array($d) || time() - (int) ($d['first'] ?? 0) > TRY_WINDOW) return ['n' => 0, 'first' => 0];
    return ['n' => (int) ($d['n'] ?? 0), 'first' => (int) ($d['first'] ?? 0)];
}

function bumpTries(string $dir, array $t): void
{
    $t = ['n' => $t['n'] + 1, 'first' => $t['first'] ?: time()];
    @file_put_contents($dir . '/.login-tries', json_encode($t));
}

/* Все html рядом со скриптом: у метки версии нет смысла знать их имена заранее. */
function htmlPages(string $dir): array
{
    $list = glob($dir . '/*.html') ?: [];
    return array_map('basename', $list);
}

$raw    = file_get_contents('php://input') ?: '';
$in     = json_decode($raw, true);
$action = is_array($in) ? (string) ($in['action'] ?? '') : (string) ($_GET['action'] ?? '');

if ($action === 'state') {
    out(['ok' => true, 'auth' => isAuthed(), 'published' => published($dir)]);
}

if ($action === 'login') {
    $t = tries($dir);
    if ($t['n'] >= TRY_LIMIT) {
        $wait = TRY_WINDOW - (time() - $t['first']);
        out(['ok' => false, 'error' => 'Слишком много попыток. Подождите '
            . max(1, (int) ceil($wait / 60)) . ' мин. и попробуйте снова.'], 429);
    }
    $hash = passHash();
    if ($hash === '') {
        out(['ok' => false, 'error' => 'Публикация не настроена: на сайте нет файла с паролем. Напишите разработчику.'], 500);
    }
    $pass = trim((string) ($in['password'] ?? ''));
    if ($pass === '' || !hash_equals($hash, hash('sha256', SALT . $pass))) {
        bumpTries($dir, $t);
        out(['ok' => false, 'error' => 'Пароль не подошёл. Проверьте раскладку и заглавные буквы.'], 401);
    }
    @unlink($dir . '/.login-tries');
    session_regenerate_id(true);
    $_SESSION['ok'] = $hash;
    out(['ok' => true, 'auth' => true, 'published' => published($dir)]);
}

if ($action === 'logout') {
    $_SESSION = [];
    session_destroy();
    out(['ok' => true, 'auth' => false]);
}

if ($action === 'publish' || $action === 'rollback') {
    if (!isAuthed()) out(['ok' => false, 'error' => 'Нужно войти заново.', 'auth' => false], 401);

    $target = $dir . '/' . DATA_FILE;
    $prev   = $target . '.prev';

    if ($action === 'rollback') {
        if (!is_file($prev)) out(['ok' => false, 'error' => 'Предыдущей версии нет — откатывать не к чему.'], 409);
        $data = (string) file_get_contents($prev);
    } else {
        $data = (string) ($in['data'] ?? '');
        if ($data === '') out(['ok' => false, 'error' => 'Пустые данные — публиковать нечего.'], 400);
        if (strlen($data) > MAX_BYTES) {
            out(['ok' => false, 'error' => 'Слишком много данных: скорее всего, дело в тяжёлой картинке. Уменьшите её и попробуйте снова.'], 413);
        }
        foreach (NEEDLES as $needle) {
            if (!str_contains($data, $needle)) {
                out(['ok' => false, 'error' => 'Файл собран неправильно: не хватает блока «' . $needle . '».'], 400);
            }
        }
        if (str_contains($data, '<?')) {
            out(['ok' => false, 'error' => 'В данных недопустимый фрагмент кода.'], 400);
        }
    }

    if ($action === 'publish' && is_file($target)) @copy($target, $prev);

    $tmp = $target . '.tmp';
    if (file_put_contents($tmp, $data) === false || !@rename($tmp, $target)) {
        @unlink($tmp);
        out(['ok' => false, 'error' => 'Сайт не смог сохранить файл. Напишите разработчику: нет прав на запись ' . DATA_FILE . '.'], 500);
    }

    $stamp   = date('YmdHis');
    $touched = 0;
    foreach (htmlPages($dir) as $page) {
        $f = $dir . '/' . $page;
        $html = (string) file_get_contents($f);
        $new  = preg_replace('/\?v=\d+/', '?v=' . $stamp, $html);
        if ($new !== null && $new !== $html && file_put_contents($f, $new) !== false) $touched++;
    }

    $info = ['at' => date('c'), 'hash' => hash('sha256', $data), 'stamp' => $stamp];
    @file_put_contents($dir . '/published.json', json_encode($info, JSON_UNESCAPED_UNICODE));

    out(['ok' => true, 'published' => $info, 'pages' => $touched]);
}

if ($action === 'zip') {
    if (!isAuthed()) out(['ok' => false, 'error' => 'Нужно войти заново.', 'auth' => false], 401);
    if (!class_exists('ZipArchive')) {
        out(['ok' => false, 'error' => 'Хостинг не умеет собирать ZIP. Скачайте резервную копию каталога — кнопка рядом.'], 501);
    }
    $zipPath = tempnam(sys_get_temp_dir(), 'site') ?: '';
    $zip = new ZipArchive();
    if ($zipPath === '' || $zip->open($zipPath, ZipArchive::OVERWRITE) !== true) {
        out(['ok' => false, 'error' => 'Не получилось собрать архив. Попробуйте ещё раз.'], 500);
    }
    $skip = ['.admin-pass', '.login-tries', 'published.json', 'config.php'];
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    foreach ($it as $file) {
        $rel = substr($file->getPathname(), strlen($dir) + 1);
        if ($rel === '' || str_starts_with($rel, '.') || in_array(basename($rel), $skip, true)) continue;
        if (str_ends_with($rel, '.tmp') || str_ends_with($rel, '.prev')) continue;
        if ($file->isDir()) { $zip->addEmptyDir($rel); continue; }
        $zip->addFile($file->getPathname(), $rel);
    }
    $zip->close();
    $name = 'сайт-' . date('Y-m-d') . '.zip';
    header_remove('Content-Type');
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="site-' . date('Y-m-d') . '.zip"; '
         . "filename*=UTF-8''" . rawurlencode($name));
    header('Content-Length: ' . (string) filesize($zipPath));
    readfile($zipPath);
    @unlink($zipPath);
    exit;
}

out(['ok' => false, 'error' => 'Неизвестная команда.'], 400);
