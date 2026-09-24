<?php
/**
 * ============================================================
 *  Үг Таа — Монгол үг таах тоглоом
 *  api.php — v6
 * ============================================================
 *  Бүх хүсэлт:  api.php?action=<нэр>
 *  Хариу:       { success: true, ... } эсвэл { success: false, message }
 *
 *  v6-д юу өөрчлөгдсөн бэ (товч):
 *   • Google ID token-ы RS256 гарын үсгийг жинхэнээр шалгана
 *     (өмнө нь хэн ч хуурамч token хийж, дурын хүн болж нэвтэрч болдог байсан).
 *   • Мөнгөтэй бүх үйлдэл (шагнал, таталт, тэмцээн, premium) хэрэглэгчийн
 *     мөрийг түгжиж (FOR UPDATE) давхар төлөлтөөс хамгаална.
 *   • Тэмцээн жинхэнээр ажиллана: оноо тооцож, дараагийн өдөр нь
 *     шагналыг автоматаар хуваарилна (ялагчгүй бол хураамжийг буцаана).
 *   • Архив горим, статистик, оноотой шилдгийн самбар, админы шинэ хэрэгслүүд.
 *   • Нууц мэдээлэл config.php руу шилжсэн. Өдөр Монголын цагаар солигдоно.
 * ============================================================
 */
declare(strict_types=1);

const APP_VERSION = '6.3.0';

define('VGTAA', true);
require __DIR__ . '/config.php';

error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');
mb_internal_encoding('UTF-8');
date_default_timezone_set(APP_TIMEZONE);
ob_start();

/* ============================================================
   HEADERS / CORS
   ============================================================ */
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');

$origin = isset($_SERVER['HTTP_ORIGIN']) && is_string($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
if ($origin !== '' && in_array($origin, ALLOWED_ORIGINS, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Token');
    header('Access-Control-Max-Age: 86400');
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    ob_end_clean();
    http_response_code(204);
    exit;
}

/* ============================================================
   ALDAA BARIX
   ============================================================ */
final class ApiError extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 400, public readonly array $extra = [])
    {
        parent::__construct($message);
    }
}

function respond(array $data, int $status = 200): never
{
    while (ob_get_level() > 0) ob_end_clean();
    http_response_code($status);
    $body  = (string)json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    $tasks = $GLOBALS['__after_response'] ?? [];
    $GLOBALS['__after_response'] = [];
    if ($tasks && !headers_sent()) {
        ignore_user_abort(true);
        header('Connection: close');
        header('Content-Length: ' . strlen($body));
    }
    echo $body;
    if ($tasks) {
        // Хэрэглэгч хариугаа хүлээхгүйгээр ар талд ажиллана (Telegram шалгах г.м.)
        if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
        elseif (function_exists('litespeed_finish_request')) litespeed_finish_request();
        else flush();
        foreach ($tasks as $task) {
            try {
                $task();
            } catch (Throwable $e) {
                error_log('[vgtaa] after_response: ' . $e->getMessage());
            }
        }
    }
    exit;
}

function after_response(callable $task): void
{
    $GLOBALS['__after_response'][] = $task;
}

function ok(array $data = []): never
{
    respond(['success' => true] + $data);
}

function fail(string $message, int $status = 400, array $extra = []): never
{
    throw new ApiError($message, $status, $extra);
}

set_exception_handler(function (Throwable $e): void {
    error_log('[vgtaa] Uncaught: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    respond(['success' => false, 'message' => 'Серверийн алдаа гарлаа. Дараа дахин оролдоно уу.'], 500);
});

register_shutdown_function(function (): void {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        while (ob_get_level() > 0) ob_end_clean();
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=UTF-8');
        }
        echo json_encode(['success' => false, 'message' => 'Серверийн алдаа гарлаа.'], JSON_UNESCAPED_UNICODE);
    }
});

/* ============================================================
   MEDEELLIIN SAN
   ============================================================ */
function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    try {
        $pdo = new PDO(
            vgtaa_dsn(),
            DB_USER,
            DB_PASS,
            [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
                PDO::ATTR_STRINGIFY_FETCHES  => false,
                PDO::ATTR_TIMEOUT            => 10,
            ] + vgtaa_ssl_options()
        );
        // MySQL-ийн NOW()/CURDATE() нь PHP-тэй ижил (Монголын) цагаар ажиллана
        $pdo->exec("SET time_zone = '" . date('P') . "'");
    } catch (PDOException $e) {
        error_log('[vgtaa] DB connect failed: ' . $e->getMessage());
        $pdo = null;
        fail('Мэдээллийн сантай холбогдож чадсангүй. Түр хүлээгээд дахин оролдоно уу.', 503);
    }
    return $pdo;
}

function q(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute(array_values($params));
    return $st;
}

function row(string $sql, array $params = []): ?array
{
    $r = q($sql, $params)->fetch();
    return $r === false ? null : $r;
}

function rows(string $sql, array $params = []): array
{
    return q($sql, $params)->fetchAll();
}

function val(string $sql, array $params = []): mixed
{
    $v = q($sql, $params)->fetchColumn();
    return $v === false ? null : $v;
}

function num(string $sql, array $params = []): int
{
    return (int)(val($sql, $params) ?? 0);
}

/** Гүйлгээ. Дотор нь дахин дуудвал гадна талын гүйлгээнд нэгдэнэ. */
function tx(callable $fn): mixed
{
    $pdo = db();
    if ($pdo->inTransaction()) return $fn();
    $pdo->beginTransaction();
    try {
        $result = $fn();
        $pdo->commit();
        return $result;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

function kv_get(string $k): ?string
{
    try {
        $r = row("SELECT v, expires_at FROM app_kv WHERE k = ? LIMIT 1", [$k]);
    } catch (PDOException) {
        return null;
    }
    if (!$r) return null;
    if ((int)$r['expires_at'] > 0 && (int)$r['expires_at'] < time()) return null;
    return (string)$r['v'];
}

function kv_set(string $k, string $v, int $ttl = 0): void
{
    try {
        q(
            "INSERT INTO app_kv (k, v, expires_at) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE v = VALUES(v), expires_at = VALUES(expires_at)",
            [$k, $v, $ttl > 0 ? time() + $ttl : 0]
        );
    } catch (PDOException) {
        // app_kv хүснэгт байхгүй бол зүгээр л cache-гүй ажиллана
    }
}

/* ============================================================
   ORОЛТ (input)
   ============================================================ */
function input(): array
{
    static $in = null;
    if ($in === null) {
        $raw = file_get_contents('php://input');
        $d = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
        $in = is_array($d) ? $d : [];
    }
    return $in;
}

function clean_text(string $s, int $max): string
{
    $s = strip_tags($s);
    $s = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $s) ?? '';
    $s = preg_replace('/\s+/u', ' ', $s) ?? '';
    return mb_substr(trim($s), 0, $max);
}

function in_str(string $k, int $max = 255): string
{
    $v = input()[$k] ?? '';
    if (is_int($v) || is_float($v)) $v = (string)$v;
    return is_string($v) ? clean_text($v, $max) : '';
}

function in_int(string $k, int $default = 0): int
{
    $v = input()[$k] ?? null;
    if (is_int($v)) return $v;
    if (is_float($v) && is_finite($v)) return (int)$v;
    if (is_string($v) && preg_match('/^\s*-?\d{1,10}\s*$/', $v)) return (int)$v;
    return $default;
}

function in_bool(string $k): bool
{
    $v = input()[$k] ?? false;
    return $v === true || $v === 1 || $v === '1' || $v === 'true';
}

function qs(string $k, string $default = ''): string
{
    $v = $_GET[$k] ?? $default;
    return is_string($v) ? trim($v) : $default;
}

function valid_date(string $d): bool
{
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) return false;
    [$y, $m, $dd] = array_map('intval', explode('-', $d));
    return checkdate($m, $dd, $y);
}

function client_ip(): string
{
    if (BEHIND_PROXY) {
        // Render мэт proxy хэрэглэгчийн IP-г X-Forwarded-For-ийн төгсгөлд нэмдэг
        $xff = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
        if (is_string($xff) && $xff !== '') {
            $parts = array_map('trim', explode(',', $xff));
            $last = (string)end($parts);
            if (filter_var($last, FILTER_VALIDATE_IP)) return $last;
        }
    }
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    return is_string($ip) && filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '';
}

/* ============================================================
   TSAG HUGATSAA
   ============================================================ */
function today(): string
{
    return date('Y-m-d');
}

function now_str(): string
{
    return date('Y-m-d H:i:s');
}

function day_shift(string $date, int $days): string
{
    return date('Y-m-d', (int)strtotime($date . ' ' . ($days >= 0 ? '+' : '') . $days . ' day'));
}

function time_payload(): array
{
    return [
        'now'        => time(),
        'today'      => today(),
        'next_reset' => (int)strtotime('tomorrow'),
        'tz'         => APP_TIMEZONE,
    ];
}

function game_number(string $date): int
{
    static $first = null;
    if ($first === null) {
        try {
            $first = (string)(val("SELECT MIN(game_date) FROM daily_words") ?? '');
        } catch (PDOException) {
            $first = '';
        }
        if ($first === '') $first = today();
    }
    return max(1, (int)round((strtotime($date) - strtotime($first)) / 86400) + 1);
}

/* ============================================================
   HTTP (Google, Telegram руу)
   ============================================================ */
/** @return array{0:int,1:string,2:array<string,string>} */
function http_get(string $url, int $timeout = 8): array
{
    return http_request($url, null, $timeout);
}

/** $json !== null бол JSON POST илгээнэ. @return array{0:int,1:string,2:array<string,string>} */
function http_request(string $url, ?array $json = null, int $timeout = 8): array
{
    $payload = $json !== null ? (string)json_encode($json, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null;
    $attempt = function (bool $verify) use ($url, $timeout, $payload): ?array {
        if (function_exists('curl_init')) {
            $headers = [];
            $ch = curl_init($url);
            if ($payload !== null) {
                curl_setopt_array($ch, [
                    CURLOPT_POST       => true,
                    CURLOPT_POSTFIELDS => $payload,
                    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                ]);
            }
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => $timeout,
                CURLOPT_CONNECTTIMEOUT => 5,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS      => 3,
                CURLOPT_SSL_VERIFYPEER => $verify,
                CURLOPT_SSL_VERIFYHOST => $verify ? 2 : 0,
                CURLOPT_USERAGENT      => 'UgTaa/' . APP_VERSION,
                CURLOPT_HEADERFUNCTION => function ($ch, string $line) use (&$headers): int {
                    $p = strpos($line, ':');
                    if ($p !== false) {
                        $headers[strtolower(trim(substr($line, 0, $p)))] = trim(substr($line, $p + 1));
                    }
                    return strlen($line);
                },
            ]);
            $body   = curl_exec($ch);
            $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $errno  = curl_errno($ch);
            curl_close($ch);
            if (is_string($body) && $errno === 0) return [$status, $body, $headers];
            return null;
        }
        $http = ['timeout' => $timeout, 'ignore_errors' => true, 'header' => "User-Agent: UgTaa\r\n"];
        if ($payload !== null) {
            $http['method']  = 'POST';
            $http['header'] .= "Content-Type: application/json\r\n";
            $http['content'] = $payload;
        }
        $ctx = stream_context_create([
            'http' => $http,
            'ssl'  => ['verify_peer' => $verify, 'verify_peer_name' => $verify],
        ]);
        $body = @file_get_contents($url, false, $ctx);
        if (!is_string($body)) return null;
        $status = 0;
        $headers = [];
        foreach ($http_response_header ?? [] as $line) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m)) {
                $status = (int)$m[1];
            } elseif (($p = strpos($line, ':')) !== false) {
                $headers[strtolower(trim(substr($line, 0, $p)))] = trim(substr($line, $p + 1));
            }
        }
        return [$status, $body, $headers];
    };

    $r = $attempt(true);
    if ($r === null) {
        // Зарим үнэгүй хостинг дээр CA сертификатын багц дутуу байдаг.
        $r = $attempt(false);
        if ($r !== null) {
            $GLOBALS['http_insecure_fallback'] = true;
            error_log('[vgtaa] TLS verification failed, used insecure fallback for ' . parse_url($url, PHP_URL_HOST));
        }
    }
    return $r ?? [0, '', []];
}

/* ============================================================
   JWT (өөрийн token)
   ============================================================ */
function b64u_encode(string $d): string
{
    return rtrim(strtr(base64_encode($d), '+/', '-_'), '=');
}

function b64u_decode(string $d): string
{
    $pad = (4 - strlen($d) % 4) % 4;
    $r = base64_decode(strtr($d, '-_', '+/') . str_repeat('=', $pad), true);
    return $r === false ? '' : $r;
}

function jwt_issue(int $userId): string
{
    $h = b64u_encode('{"alg":"HS256","typ":"JWT"}');
    $p = b64u_encode((string)json_encode([
        'user_id' => $userId,
        'iat'     => time(),
        'exp'     => time() + TOKEN_TTL_DAYS * 86400,
        'v'       => 6,
    ]));
    $s = b64u_encode(hash_hmac('sha256', "$h.$p", JWT_SECRET, true));
    return "$h.$p.$s";
}

function jwt_verify(string $token): ?array
{
    $parts = explode('.', trim($token));
    if (count($parts) !== 3) return null;
    [$h, $p, $s] = $parts;
    if (!hash_equals(b64u_encode(hash_hmac('sha256', "$h.$p", JWT_SECRET, true)), $s)) return null;
    $header = json_decode(b64u_decode($h), true);
    if (!is_array($header) || ($header['alg'] ?? '') !== 'HS256') return null;
    $claims = json_decode(b64u_decode($p), true);
    if (!is_array($claims) || (int)($claims['exp'] ?? 0) < time()) return null;
    return $claims;
}

/* ============================================================
   GOOGLE ID TOKEN — гарын үсгийг жинхэнээр шалгана
   ============================================================ */
function google_certs(bool $refresh = false): array
{
    if (!$refresh) {
        $cached = kv_get('google_certs');
        if ($cached !== null) {
            $d = json_decode($cached, true);
            if (is_array($d) && $d) return $d;
        }
    }
    [$status, $body, $headers] = http_get('https://www.googleapis.com/oauth2/v1/certs');
    $d = $status === 200 ? json_decode($body, true) : null;
    if (!is_array($d) || !$d) return [];
    $ttl = 3600;
    if (preg_match('/max-age=(\d+)/', $headers['cache-control'] ?? '', $m)) {
        $ttl = max(300, min(86400, (int)$m[1]));
    }
    kv_set('google_certs', (string)json_encode($d), $ttl);
    return $d;
}

function google_claims_ok(array $c): bool
{
    $now = time();
    if (!in_array($c['iss'] ?? null, ['accounts.google.com', 'https://accounts.google.com'], true)) return false;
    $aud = $c['aud'] ?? null;
    $audOk = is_string($aud) ? hash_equals(GOOGLE_CLIENT_ID, $aud)
        : (is_array($aud) && in_array(GOOGLE_CLIENT_ID, $aud, true));
    if (!$audOk) return false;
    if ((int)($c['exp'] ?? 0) < $now - 60) return false;
    if ((int)($c['iat'] ?? 0) > $now + 300) return false;
    if (!is_string($c['sub'] ?? null) || $c['sub'] === '') return false;
    if (!is_string($c['email'] ?? null) || !filter_var($c['email'], FILTER_VALIDATE_EMAIL)) return false;
    $ev = $c['email_verified'] ?? false;
    return $ev === true || $ev === 'true';
}

function google_verify(string $jwt): ?array
{
    $parts = explode('.', $jwt);
    if (count($parts) !== 3) return null;
    [$h64, $p64, $s64] = $parts;
    $header = json_decode(b64u_decode($h64), true);
    $claims = json_decode(b64u_decode($p64), true);
    $sig    = b64u_decode($s64);
    if (!is_array($header) || !is_array($claims) || $sig === '') return null;
    if (($header['alg'] ?? '') !== 'RS256') return null;
    if (!google_claims_ok($claims)) return null;

    $kid = is_string($header['kid'] ?? null) ? $header['kid'] : '';
    if ($kid !== '' && function_exists('openssl_verify')) {
        $certs = google_certs();
        if (!isset($certs[$kid])) {
            // Google түлхүүрээ солисон байж магадгүй — минутад нэгээс олон татахгүй
            $last = (int)(kv_get('google_certs_refreshed') ?? 0);
            if (time() - $last > 60) {
                kv_set('google_certs_refreshed', (string)time(), 3600);
                $certs = google_certs(true);
            }
        }
        if (isset($certs[$kid]) && is_string($certs[$kid])) {
            $key = openssl_pkey_get_public($certs[$kid]);
            if ($key !== false) {
                return openssl_verify("$h64.$p64", $sig, $key, OPENSSL_ALGO_SHA256) === 1 ? $claims : null;
            }
        }
    }

    // Нөөц арга: Google өөрөө шалгаж өгнө
    [$status, $body] = http_get('https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode($jwt));
    $info = $status === 200 ? json_decode($body, true) : null;
    if (!is_array($info)) return null;
    if (($info['aud'] ?? '') !== GOOGLE_CLIENT_ID) return null;
    if (($info['sub'] ?? '') !== $claims['sub']) return null;
    return $claims;
}

/* ============================================================
   NEVTRELT
   ============================================================ */
function bearer_token(): ?string
{
    $candidates = [
        $_SERVER['HTTP_AUTHORIZATION'] ?? '',
        $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '',
    ];
    if (function_exists('getallheaders')) {
        foreach ((array)@getallheaders() as $k => $v) {
            if (strtolower((string)$k) === 'authorization') $candidates[] = $v;
        }
    }
    foreach ($candidates as $h) {
        if (is_string($h) && preg_match('/^Bearer\s+(\S+)$/i', trim($h), $m)) return $m[1];
    }
    $x = $_SERVER['HTTP_X_TOKEN'] ?? '';
    if (is_string($x) && trim($x) !== '') return trim($x);
    // InfinityFree заримдаа Authorization header-ийг хасдаг тул JS body-д давхар илгээдэг
    $b = input()['_token'] ?? '';
    return is_string($b) && $b !== '' ? trim($b) : null;
}

function is_premium(array $u): bool
{
    if ((int)($u['is_premium'] ?? 0) !== 1) return false;
    $exp = $u['premium_expires_at'] ?? null;
    return empty($exp) || strtotime((string)$exp) > time();
}

function new_referral_code(): string
{
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do {
        $code = '';
        for ($i = 0; $i < 8; $i++) $code .= $chars[random_int(0, strlen($chars) - 1)];
    } while (val("SELECT 1 FROM users WHERE referral_code = ? LIMIT 1", [$code]));
    return $code;
}

function auth_user(): ?array
{
    static $cache = false;
    if ($cache !== false) return $cache;
    $cache = null;

    $token = bearer_token();
    if (!$token) return null;
    $claims = jwt_verify($token);
    $uid = (int)($claims['user_id'] ?? 0);
    if ($uid <= 0) return null;

    $u = row("SELECT * FROM users WHERE id = ? LIMIT 1", [$uid]);
    if (!$u) return null;

    if ((int)$u['is_premium'] === 1 && !is_premium($u)) {
        q("UPDATE users SET is_premium = 0 WHERE id = ?", [$uid]);
        $u['is_premium'] = 0;
    }
    if (empty($u['referral_code'])) {
        $u['referral_code'] = new_referral_code();
        q("UPDATE users SET referral_code = ? WHERE id = ?", [$u['referral_code'], $uid]);
    }
    if (empty($u['last_seen_at']) || strtotime((string)$u['last_seen_at']) < time() - 600) {
        q("UPDATE users SET last_seen_at = NOW(), last_ip = ? WHERE id = ?", [client_ip(), $uid]);
    }
    return $cache = $u;
}

function require_user(): array
{
    $u = auth_user();
    if (!$u) fail('Нэвтрэх хугацаа дууссан байна. Дахин нэвтэрнэ үү.', 401);
    if ((int)($u['is_banned'] ?? 0) === 1) fail('Таны бүртгэл түр түдгэлзсэн байна. Админтай холбогдоно уу.', 403);
    return $u;
}

function require_admin(): array
{
    $u = require_user();
    if ((int)($u['is_admin'] ?? 0) !== 1) fail('Зөвхөн админ хандах боломжтой.', 403);
    return $u;
}

function user_public(array $u): array
{
    $prem = is_premium($u);
    return [
        'id'                 => (int)$u['id'],
        'username'           => (string)($u['username'] ?? ''),
        'email'              => (string)($u['email'] ?? ''),
        'avatar_url'         => (string)($u['avatar_url'] ?? ''),
        'balance'            => (int)($u['balance'] ?? 0),
        'won_balance'        => (int)($u['won_balance'] ?? 0),
        'referral_balance'   => (int)($u['referral_balance'] ?? 0),
        'referral_code'      => (string)($u['referral_code'] ?? ''),
        'is_premium'         => $prem,
        'premium_expires_at' => $prem ? ($u['premium_expires_at'] ?? null) : null,
        'is_admin'           => (int)($u['is_admin'] ?? 0) === 1,
        'created_at'         => $u['created_at'] ?? null,
    ];
}

function public_config(): array
{
    return [
        'google_client_id'   => GOOGLE_CLIENT_ID,
        'app_url'            => APP_URL,
        'version'            => APP_VERSION,
        'max_attempts'       => MAX_ATTEMPTS,
        'reward_amount'      => REWARD_AMOUNT,
        'reward_by_attempt'  => (object)REWARD_BY_ATTEMPT,
        'premium_multiplier' => PREMIUM_MULTIPLIER,
        'premium_price'      => PREMIUM_PRICE,
        'premium_days'       => PREMIUM_DAYS,
        'tournament_fee'     => TOURNAMENT_FEE,
        'tournament_split'   => TOURNAMENT_SPLIT,
        'tournament_rake'    => TOURNAMENT_RAKE,
        'daily_winner_cap'   => DAILY_WINNER_CAP,
        'referral_bonus'     => REFERRAL_BONUS,
        'referral_unlock'    => REFERRAL_UNLOCK,
        'min_withdrawal'     => MIN_WITHDRAWAL,
        'max_withdrawal'     => MAX_WITHDRAWAL,
        'practice_daily_free' => PRACTICE_DAILY_FREE,
        'require_valid_word' => REQUIRE_VALID_WORD,
        'banks'              => BANKS,
    ];
}

/* ============================================================
   MONEY — бүх мөнгөн өөрчлөлт энд
   ============================================================ */
/**
 * Хэрэглэгчийн балансыг өөрчилж, гүйлгээ бичнэ. Заавал tx() дотор дуудна.
 * $bucket — нийт хожсон/урамшууллын статистикийн багана (won_balance | referral_balance).
 * @return int шинэ баланс
 */
function credit(int $userId, int $amount, string $type, string $desc, ?int $refId = null, ?string $bucket = null): int
{
    if (!db()->inTransaction()) throw new LogicException('credit() must run inside tx()');
    if (!in_array($bucket, [null, 'won_balance', 'referral_balance'], true)) throw new LogicException('bad bucket');

    $before = (int)val("SELECT balance FROM users WHERE id = ? FOR UPDATE", [$userId]);
    $after  = $before + $amount;
    if ($after < 0) fail('Үлдэгдэл хүрэлцэхгүй байна.', 409, ['code' => 'insufficient_balance']);

    if ($bucket !== null && $amount > 0) {
        q("UPDATE users SET balance = balance + ?, $bucket = COALESCE($bucket, 0) + ? WHERE id = ?", [$amount, $amount, $userId]);
    } else {
        q("UPDATE users SET balance = balance + ? WHERE id = ?", [$amount, $userId]);
    }
    q(
        "INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, description, reference_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
        [$userId, $type, $amount, $before, $after, mb_substr($desc, 0, 255), $refId]
    );
    return $after;
}

/* ============================================================
   АДМИНЫ ТОХИРГОО (цэнэглэх данс, Telegram) — app_kv-д хадгална
   ============================================================ */
const SETTINGS_DEFAULTS = [
    'deposit_enabled'        => false,
    'deposit_bank'           => '',     // BANKS-ийн түлхүүр (Khan, Golomt, ...)
    'deposit_account_name'   => '',
    'deposit_account_number' => '',
    'deposit_iban'           => '',
    'deposit_min'            => 1000,
    'deposit_max'            => 1000000,
    'telegram_bot_token'     => '',
    'telegram_chat_id'       => '',
    'telegram_admin_ids'     => '',     // Telegram-аас «Орсон» дарах эрхтэй хүмүүсийн ID (таслалаар)
    'telegram_mode'          => 'poll', // poll = сайт өөрөө шалгана (InfinityFree) | webhook = Telegram шууд илгээнэ (Render)
    'telegram_webhook_secret' => '',
    'notify_withdrawals'     => true,
];
const TG_POLL_EVERY = 5; // секунд — «poll» горимд Telegram-ийг хэр олон шалгах

if (!defined('TELEGRAM_API')) define('TELEGRAM_API', 'https://api.telegram.org');

function settings(bool $fresh = false): array
{
    static $s = null;
    if ($s === null || $fresh) {
        $raw = null;
        try {
            $raw = val("SELECT v FROM app_kv WHERE k = 'settings' LIMIT 1");
        } catch (PDOException) {
            // app_kv хүснэгтгүй бол анхны утгууд
        }
        $d = is_string($raw) ? json_decode($raw, true) : null;
        $s = array_merge(SETTINGS_DEFAULTS, is_array($d) ? array_intersect_key($d, SETTINGS_DEFAULTS) : []);
    }
    return $s;
}

function settings_save(array $patch): array
{
    $s = array_merge(settings(true), array_intersect_key($patch, SETTINGS_DEFAULTS));
    q(
        "INSERT INTO app_kv (k, v, expires_at) VALUES ('settings', ?, 0)
         ON DUPLICATE KEY UPDATE v = VALUES(v), expires_at = 0",
        [(string)json_encode($s, JSON_UNESCAPED_UNICODE)]
    );
    return settings(true);
}

/** Цэнэглэлт идэвхтэй эсэх — данс бүрэн бөглөгдсөн байх ёстой */
function deposits_ready(?array $s = null): bool
{
    $s = $s ?? settings();
    return $s['deposit_enabled'] && $s['deposit_bank'] !== '' && $s['deposit_account_name'] !== '' && $s['deposit_account_number'] !== '';
}

function deposit_bank_public(array $s): array
{
    return [
        'bank'           => BANKS[$s['deposit_bank']] ?? (string)$s['deposit_bank'],
        'account_name'   => (string)$s['deposit_account_name'],
        'account_number' => (string)$s['deposit_account_number'],
        'iban'           => (string)$s['deposit_iban'],
    ];
}

/** Telegram Bot API дуудлага. @return array Telegram-ийн хариу (ok, result | description) */
function telegram_call(string $method, array $params = [], ?string $token = null): array
{
    $token = $token ?? (string)settings()['telegram_bot_token'];
    if ($token === '') return ['ok' => false, 'description' => 'Telegram bot token тохируулаагүй байна.'];
    [$status, $body] = http_request(TELEGRAM_API . '/bot' . $token . '/' . $method, $params, 8);
    $d = json_decode($body, true);
    if (!is_array($d)) return ['ok' => false, 'description' => $status ? "Telegram HTTP $status" : 'Telegram-тай холбогдож чадсангүй.'];
    return $d;
}

function tg_h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

/** Админы Telegram руу мэдэгдэл. Амжилтгүй болсон ч үндсэн үйлдлийг зогсоохгүй. @return ?int message_id */
function telegram_notify(string $html, ?array $markup = null): ?int
{
    $s = settings();
    if ($s['telegram_bot_token'] === '' || $s['telegram_chat_id'] === '') return null;
    $params = [
        'chat_id'                  => $s['telegram_chat_id'],
        'text'                     => $html,
        'parse_mode'               => 'HTML',
        'disable_web_page_preview' => true,
    ];
    if ($markup !== null) $params['reply_markup'] = $markup;
    $r = telegram_call('sendMessage', $params);
    if (empty($r['ok'])) {
        error_log('[vgtaa] telegram: ' . ($r['description'] ?? 'unknown error'));
        return null;
    }
    return (int)($r['result']['message_id'] ?? 0) ?: null;
}

/** $kind: 'd' = цэнэглэлт, 'w' = мөнгө татах */
function tg_markup(string $kind, int $id, bool $open): array
{
    $rows = [];
    if ($open) {
        $rows[] = [
            ['text' => $kind === 'd' ? '✅ Орсон' : '✅ Шилжүүлсэн', 'callback_data' => "$kind:a:$id"],
            ['text' => $kind === 'd' ? '❌ Татгалзах' : '❌ Цуцлах', 'callback_data' => "$kind:r:$id"],
        ];
    }
    if (str_starts_with(APP_URL, 'https://')) {
        $rows[] = [['text' => '🛡 Админ самбар', 'url' => APP_URL . '/#/admin/' . ($kind === 'd' ? 'deposits' : 'withdrawals')]];
    }
    return ['inline_keyboard' => $rows];
}

function tg_status_line(string $kind, array $r): string
{
    $when = !empty($r['processed_at']) ? ' · ' . substr((string)$r['processed_at'], 11, 5) : '';
    $note = !empty($r['admin_note']) ? ' — ' . tg_h((string)$r['admin_note']) : '';
    if ($r['status'] === 'approved') {
        return ($kind === 'd' ? '✅ <b>Орсон</b> · ' . number_format((int)$r['amount']) . '₮ хэтэвчинд орлоо' : '✅ <b>Шилжүүлсэн</b>') . $when . $note;
    }
    if ($r['status'] === 'rejected') {
        return '❌ <b>' . ($kind === 'd' ? 'Татгалзсан' : 'Цуцалсан, мөнгийг буцаасан') . '</b>' . $when . $note;
    }
    return '';
}

function tg_deposit_text(array $d, array $u): string
{
    $st = tg_status_line('d', $d);
    return "💰 <b>Цэнэглэлтийн хүсэлт #{$d['id']}</b>\n"
        . '👤 ' . tg_h((string)$u['username']) . ' · ID ' . (int)$u['id'] . "\n"
        . '✉️ ' . tg_h((string)$u['email']) . "\n"
        . '💵 <b>' . number_format((int)$d['amount']) . "₮</b>\n"
        . '📝 Гүйлгээний утга: <code>' . tg_h((string)$d['reference']) . "</code>\n"
        . '🕒 ' . substr((string)($d['submitted_at'] ?? $d['created_at'] ?? now_str()), 0, 16) . "\n\n"
        . ($st !== '' ? $st : 'Банкны орлогоо гүйлгээний утгаар шалгаад доорх товчоор шийднэ үү.');
}

function tg_withdrawal_text(array $w, array $u): string
{
    $st = tg_status_line('w', $w);
    return "🏦 <b>Мөнгө татах хүсэлт #{$w['id']}</b>\n"
        . '👤 ' . tg_h((string)$u['username']) . ' · ID ' . (int)$u['id'] . "\n"
        . '💵 <b>' . number_format((int)$w['amount']) . "₮</b>\n"
        . '🏛 ' . tg_h(BANKS[$w['bank_name']] ?? (string)$w['bank_name']) . ' · <code>' . tg_h((string)$w['account_number']) . "</code>\n"
        . '🪪 ' . tg_h((string)$w['account_name']) . "\n"
        . '🕒 ' . substr((string)($w['requested_at'] ?? now_str()), 0, 16) . "\n\n"
        . ($st !== '' ? $st : 'Банкаар шилжүүлсний дараа «Шилжүүлсэн» дарна уу.');
}

/** Шийдвэр гарсны дараа Telegram мессежийг шинэчилж, товчийг арилгана */
function tg_sync(string $kind, array $r): void
{
    if (empty($r['tg_message_id'])) return;
    $s = settings();
    if ($s['telegram_bot_token'] === '' || $s['telegram_chat_id'] === '') return;
    $u = row("SELECT id, username, email FROM users WHERE id = ? LIMIT 1", [$r['user_id']])
        ?? ['id' => $r['user_id'], 'username' => '?', 'email' => ''];
    $open = $kind === 'd' ? in_array($r['status'], ['created', 'submitted'], true) : $r['status'] === 'pending';
    telegram_call('editMessageText', [
        'chat_id'                  => $s['telegram_chat_id'],
        'message_id'               => (int)$r['tg_message_id'],
        'text'                     => $kind === 'd' ? tg_deposit_text($r, $u) : tg_withdrawal_text($r, $u),
        'parse_mode'               => 'HTML',
        'disable_web_page_preview' => true,
        'reply_markup'             => tg_markup($kind, (int)$r['id'], $open),
    ]);
}

/** Цэнэглэлтийг баталгаажуулах/татгалзах (админ самбар, Telegram хоёулаа ашиглана) */
function deposit_decide(int $id, string $op, ?int $amount = null, string $note = ''): array
{
    $row = tx(function () use ($id, $op, $amount, $note): array {
        $d = row("SELECT * FROM deposits WHERE id = ? LIMIT 1 FOR UPDATE", [$id]);
        if (!$d) fail('Хүсэлт олдсонгүй.', 404);
        if (!in_array($d['status'], ['created', 'submitted'], true)) fail('Энэ хүсэлт аль хэдийн шийдэгдсэн байна.', 409);
        if ($op === 'reject') {
            q("UPDATE deposits SET status = 'rejected', admin_note = ?, processed_at = NOW() WHERE id = ?", [$note ?: 'Шилжүүлэг олдсонгүй', $id]);
        } else {
            $amt = $amount ?? (int)$d['amount'];
            if ($amt <= 0 || $amt > 10000000) fail('Дүн буруу байна.');
            q("UPDATE deposits SET status = 'approved', amount = ?, admin_note = ?, processed_at = NOW() WHERE id = ?", [$amt, $note ?: null, $id]);
            credit((int)$d['user_id'], $amt, 'topup', 'Хэтэвч цэнэглэлт · ' . $d['reference'], (int)$d['id']);
        }
        return row("SELECT * FROM deposits WHERE id = ? LIMIT 1", [$id]);
    });
    return [
        'message' => $op === 'reject' ? 'Хүсэлтийг татгалзлаа.' : number_format((int)$row['amount']) . '₮ хэтэвчинд орлоо.',
        'row'     => $row,
    ];
}

/** Мөнгө татахыг шилжүүлсэн гэж тэмдэглэх / цуцалж буцаах */
function withdrawal_decide(int $id, string $op, string $note = ''): array
{
    $row = tx(function () use ($id, $op, $note): array {
        $w = row("SELECT * FROM withdrawals WHERE id = ? LIMIT 1 FOR UPDATE", [$id]);
        if (!$w) fail('Хүсэлт олдсонгүй.', 404);
        if ($w['status'] !== 'pending') fail('Энэ хүсэлт аль хэдийн шийдэгдсэн байна.', 409);
        if ($op === 'approve') {
            q("UPDATE withdrawals SET status = 'approved', admin_note = ?, processed_at = NOW() WHERE id = ?", [$note ?: null, $id]);
        } else {
            q("UPDATE withdrawals SET status = 'rejected', admin_note = ?, processed_at = NOW() WHERE id = ?", [$note ?: 'Цуцлагдсан', $id]);
            credit((int)$w['user_id'], (int)$w['amount'], 'withdrawal_refund', 'Таталт цуцлагдсан — буцаан олгов' . ($note ? ': ' . $note : ''), $id);
        }
        return row("SELECT * FROM withdrawals WHERE id = ? LIMIT 1", [$id]);
    });
    return [
        'message' => $op === 'approve' ? 'Таталтыг шилжүүлсэн гэж тэмдэглэлээ.' : 'Таталт цуцлагдаж, мөнгө буцаагдлаа.',
        'row'     => $row,
    ];
}

function tg_admin_ids(array $s): array
{
    $ids = array_values(array_filter(array_map('trim', explode(',', (string)$s['telegram_admin_ids']))));
    // Хувийн чат бол chat_id нь хэрэглэгчийн ID-тай ижил
    if (!$ids && preg_match('/^\d+$/', (string)$s['telegram_chat_id'])) $ids = [(string)$s['telegram_chat_id']];
    return $ids;
}

/** Telegram-аас ирсэн нэг шинэчлэлийг боловсруулна (webhook болон poll хоёулаа) */
function telegram_handle_update(array $upd): void
{
    $s = settings();

    // /start → Chat ID-г сануулна (админ «Олох» дарахад хэрэг болно)
    $m = $upd['message'] ?? null;
    if (is_array($m)) {
        $chat = $m['chat'] ?? [];
        if (($chat['type'] ?? '') === 'private' && isset($chat['id'])) {
            $from = $m['from'] ?? [];
            kv_set('tg_last_chat', (string)json_encode([
                'id'   => (string)$chat['id'],
                'from' => (string)($from['id'] ?? $chat['id']),
                'name' => trim(($from['first_name'] ?? '') . ' ' . ($from['last_name'] ?? '')),
            ], JSON_UNESCAPED_UNICODE), 86400);
            if (str_starts_with((string)($m['text'] ?? ''), '/start')) {
                telegram_call('sendMessage', [
                    'chat_id'    => $chat['id'],
                    'text'       => "👋 Сайн байна уу! Таны Chat ID: <code>{$chat['id']}</code>\nҮг Таа → Админ → Тохиргоо хэсгээс «Олох» дарна уу.",
                    'parse_mode' => 'HTML',
                ]);
            }
        }
        return;
    }

    $cq = $upd['callback_query'] ?? null;
    if (!is_array($cq) || !isset($cq['id'])) return;
    $answer = fn(string $text, bool $alert = false) => telegram_call('answerCallbackQuery', ['callback_query_id' => $cq['id'], 'text' => mb_substr($text, 0, 190), 'show_alert' => $alert]);

    if (!in_array((string)($cq['from']['id'] ?? ''), tg_admin_ids($s), true)) {
        $answer('⛔ Энэ үйлдлийг зөвхөн админ хийнэ.', true);
        return;
    }
    if (!preg_match('/^([dw]):([ar]):(\d+)$/', (string)($cq['data'] ?? ''), $mm)) {
        $answer('Тодорхойгүй товч.');
        return;
    }
    [, $kind, $op, $id] = $mm;
    $id = (int)$id;
    try {
        $r = $kind === 'd'
            ? deposit_decide($id, $op === 'a' ? 'approve' : 'reject', null, $op === 'r' ? 'Telegram-аас татгалзсан' : '')
            : withdrawal_decide($id, $op === 'a' ? 'approve' : 'reject', $op === 'r' ? 'Telegram-аас цуцалсан' : '');
        $answer(($op === 'a' ? '✅ ' : '❌ ') . $r['message']);
        tg_sync($kind, $r['row']);
    } catch (ApiError $e) {
        $answer($e->getMessage(), true);
        $row = row('SELECT * FROM ' . ($kind === 'd' ? 'deposits' : 'withdrawals') . ' WHERE id = ? LIMIT 1', [$id]);
        if ($row) tg_sync($kind, $row);
    }
}

/**
 * «poll» горим: Telegram-д дарагдсан товчнуудыг сайт өөрөө татаж авна.
 * InfinityFree нь Telegram-ийн webhook-ийг хаадаг тул сайтын хэвийн хандалтын
 * ар талд (TG_POLL_EVERY секунд тутамд нэг удаа) ажиллана.
 */
function telegram_poll(bool $force = false): int
{
    $s = settings();
    if ($s['telegram_bot_token'] === '' || $s['telegram_mode'] !== 'poll') return 0;
    if (!$force) {
        $now = time();
        $st = q("UPDATE app_kv SET v = ? WHERE k = 'tg_poll_at' AND CAST(v AS UNSIGNED) <= ?", [(string)$now, $now - TG_POLL_EVERY]);
        if ($st->rowCount() !== 1) {
            q("INSERT IGNORE INTO app_kv (k, v, expires_at) VALUES ('tg_poll_at', '0', 0)");
            return 0;
        }
        $pending = val("SELECT 1 FROM deposits WHERE status = 'submitted' AND tg_message_id IS NOT NULL LIMIT 1")
            ?? val("SELECT 1 FROM withdrawals WHERE status = 'pending' AND tg_message_id IS NOT NULL LIMIT 1");
        if (!$pending) return 0;
    }
    // Нэг зэрэг зөвхөн нэг хүсэлт Telegram-ийг шалгана (нэг товчийг 2 удаа боловсруулахгүй)
    try {
        if ((int)val("SELECT GET_LOCK('ugtaa_tg_poll', 0)") !== 1) return 0;
    } catch (Throwable) {
        // GET_LOCK дэмждэггүй DB — lock-гүйгээр үргэлжилнэ (шийдвэр өөрөө давхардахгүй)
    }
    try {
        $r = telegram_call('getUpdates', [
            'offset'          => (int)(kv_get('tg_offset') ?? '0'),
            'timeout'         => 0,
            'limit'           => 50,
            'allowed_updates' => ['message', 'callback_query'],
        ]);
        if (empty($r['ok']) || !is_array($r['result'] ?? null)) return 0;
        $n = 0;
        foreach ($r['result'] as $upd) {
            if (!is_array($upd)) continue;
            kv_set('tg_offset', (string)((int)($upd['update_id'] ?? 0) + 1));
            try {
                telegram_handle_update($upd);
                $n++;
            } catch (Throwable $e) {
                error_log('[vgtaa] telegram update: ' . $e->getMessage());
            }
        }
        return $n;
    } finally {
        try { val("SELECT RELEASE_LOCK('ugtaa_tg_poll')"); } catch (Throwable) { /* */ }
    }
}

/** Гүйлгээний утга: UT + хэрэглэгчийн ID + 4 үсэг (0/O, 1/I андуурагдахгүй) */
function deposit_reference(int $uid): string
{
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    do {
        $code = 'UT' . $uid;
        for ($i = 0; $i < 4; $i++) $code .= $chars[random_int(0, strlen($chars) - 1)];
    } while (val("SELECT 1 FROM deposits WHERE reference = ? LIMIT 1", [$code]));
    return $code;
}

function deposit_public(array $d): array
{
    return [
        'id'           => (int)$d['id'],
        'amount'       => (int)$d['amount'],
        'reference'    => (string)$d['reference'],
        'status'       => (string)$d['status'],
        'admin_note'   => $d['admin_note'] ?? null,
        'created_at'   => $d['created_at'] ?? null,
        'submitted_at' => $d['submitted_at'] ?? null,
        'processed_at' => $d['processed_at'] ?? null,
    ];
}

/* ============================================================
   UG / ТОГЛООМЫН ЛОГИК
   ============================================================ */
const MN_LETTERS = 'АБВГДЕЁЖЗИЙКЛМНОӨПРСТУҮФХЦЧШЩЪЫЬЭЮЯ';

function normalize_word(string $s): string
{
    $s = preg_replace('/\s+/u', '', $s) ?? '';
    return mb_strtoupper($s, 'UTF-8');
}

function is_mn_word(string $s): bool
{
    return (bool)preg_match('/^[' . MN_LETTERS . ']+$/u', $s);
}

function wlen(string $s): int
{
    return mb_strlen($s, 'UTF-8');
}

/** Wordle-ийн дүрмээр: correct / present / absent (давхар үсгийг зөв тооцно) */
function score_guess(string $guess, string $answer): array
{
    $g = mb_str_split($guess, 1, 'UTF-8');
    $a = mb_str_split($answer, 1, 'UTF-8');
    $n = count($a);
    $res = array_fill(0, $n, 'absent');
    $left = [];
    for ($i = 0; $i < $n; $i++) {
        if (($g[$i] ?? '') === $a[$i]) {
            $res[$i] = 'correct';
        } else {
            $left[$a[$i]] = ($left[$a[$i]] ?? 0) + 1;
        }
    }
    for ($i = 0; $i < $n; $i++) {
        if ($res[$i] === 'correct') continue;
        $c = $g[$i] ?? '';
        if (($left[$c] ?? 0) > 0) {
            $res[$i] = 'present';
            $left[$c]--;
        }
    }
    return $res;
}

function validate_guess(string $guess, int $len): void
{
    if ($guess === '') fail('Үгээ оруулна уу.', 422);
    if (!is_mn_word($guess)) fail('Зөвхөн монгол үсэг ашиглана уу.', 422);
    if (wlen($guess) !== $len) fail("{$len} үсэгтэй үг оруулна уу.", 422);
    if (REQUIRE_VALID_WORD && !val("SELECT 1 FROM words WHERE word = ? AND is_active = 1 LIMIT 1", [$guess])) {
        fail('Толь бичигт ийм үг алга.', 422, ['code' => 'not_in_dictionary']);
    }
}

function decode_attempts(mixed $json): array
{
    $d = is_string($json) && $json !== '' ? json_decode($json, true) : null;
    if (!is_array($d)) return [];
    $out = [];
    foreach ($d as $a) {
        if (is_array($a) && is_string($a['guess'] ?? null) && is_array($a['result'] ?? null)) {
            $out[] = ['guess' => $a['guess'], 'result' => array_values($a['result'])];
        }
    }
    return $out;
}

function session_payload(?array $s): ?array
{
    if (!$s) return null;
    return [
        'attempts'       => decode_attempts($s['attempts'] ?? null),
        'attempts_count' => (int)$s['attempts_count'],
        'is_won'         => (int)$s['is_won'] === 1,
        'is_completed'   => (int)$s['is_completed'] === 1,
        'reward_amount'  => (int)($s['reward_amount'] ?? 0),
        'completed_at'   => $s['completed_at'] ?? null,
    ];
}

/** Админ тухайн өдөр БҮГДЭД нэг үг товлосон бол тэр үг (онцгой өдөр) */
function fixed_word(string $date): ?array
{
    return row(
        "SELECT dw.word_id, w.word, w.definition FROM daily_words dw JOIN words w ON w.id = dw.word_id
         WHERE dw.game_date = ? AND dw.is_active = 1 AND dw.is_fixed = 1 LIMIT 1",
        [$date]
    );
}

/**
 * Тухайн өдрийн үгийн урт. Хэрэглэгч бүрт ӨӨР үг ирэх боловч урт нь ижил —
 * шилдгийн самбар, тэмцээн шударга хэвээр үлдэнэ.
 */
function day_length(string $date): int
{
    $fx = fixed_word($date);
    if ($fx) return wlen((string)$fx['word']);
    $key = 'daylen:' . $date;
    $v = kv_get($key);
    if ($v !== null && (int)$v > 0) return (int)$v;

    $counts = rows(
        "SELECT CHAR_LENGTH(word) AS len, COUNT(*) AS c FROM words
         WHERE is_active = 1 AND is_answer = 1 GROUP BY CHAR_LENGTH(word) ORDER BY len"
    );
    if (!$counts) return 0;
    // Хангалттай үгтэй уртуудаас (≥10) үгийн тоогоор жигнэж санамсаргүй сонгоно
    $pool = array_values(array_filter($counts, fn(array $r): bool => (int)$r['c'] >= 10)) ?: $counts;
    $pick = random_int(1, array_sum(array_map(fn(array $r): int => (int)$r['c'], $pool)));
    $len = (int)$pool[0]['len'];
    foreach ($pool as $r) {
        $pick -= (int)$r['c'];
        if ($pick <= 0) { $len = (int)$r['len']; break; }
    }
    // Зэрэг хүсэлт ирсэн ч нэг л урт тогтоно
    q("INSERT IGNORE INTO app_kv (k, v, expires_at) VALUES (?, ?, ?)", [$key, (string)$len, time() + 3 * 86400]);
    return (int)(kv_get($key) ?? $len);
}

/** Хэрэглэгчид өмнө нь ирээгүй санамсаргүй үг ($len = 0 бол ямар ч урт) */
function pick_word(int $uid, int $len = 0): ?int
{
    $base    = "SELECT id FROM words WHERE is_active = 1 AND is_answer = 1";
    $byLen   = " AND CHAR_LENGTH(word) = ?";
    $notSeen = " AND id NOT IN (SELECT word_id FROM game_sessions WHERE user_id = ?)
                 AND id NOT IN (SELECT word_id FROM practice_sessions WHERE user_id = ?)";
    $tries = $len > 0
        ? [[$byLen . $notSeen, [$len, $uid, $uid]], [$notSeen, [$uid, $uid]], [$byLen, [$len]], ['', []]]
        : [[$notSeen, [$uid, $uid]], ['', []]];
    foreach ($tries as [$where, $p]) {
        $id = val($base . $where . " ORDER BY RAND() LIMIT 1", $p);
        if ($id) return (int)$id;
    }
    return null;
}

/** Хэрэглэгчийн тухайн өдрийн тоглоом үгтэйгээ. $create бол санамсаргүй үг оноож үүсгэнэ. */
function user_day_game(int $uid, string $date, bool $create = true): ?array
{
    $sql = "SELECT gs.*, w.word, w.definition FROM game_sessions gs JOIN words w ON w.id = gs.word_id
            WHERE gs.user_id = ? AND gs.game_date = ? LIMIT 1";
    $g = row($sql, [$uid, $date]);
    if ($g || !$create) return $g;

    $fx  = fixed_word($date);
    $wid = $fx ? (int)$fx['word_id'] : pick_word($uid, day_length($date));
    if (!$wid) return null;
    $ins = q(
        "INSERT IGNORE INTO game_sessions (user_id, word_id, game_date, attempts, attempts_count, is_won, is_completed, reward_amount, reward_paid, created_at)
         VALUES (?, ?, ?, '[]', 0, 0, 0, 0, 0, NOW())",
        [$uid, $wid, $date]
    );
    if ($ins->rowCount() === 1) {
        q("UPDATE words SET used_count = used_count + 1, last_used_date = ? WHERE id = ?", [$date, $wid]);
    }
    return row($sql, [$uid, $date]);
}

function daily_reward(array $me, int $attempts, string $date): array
{
    $base = (int)(REWARD_BY_ATTEMPT[$attempts] ?? REWARD_AMOUNT);
    if ($base <= 0) return [0, false];
    $amount = $base * (is_premium($me) ? max(1, (int)PREMIUM_MULTIPLIER) : 1);
    if (DAILY_WINNER_CAP > 0) {
        $paid = num("SELECT COUNT(*) FROM game_sessions WHERE game_date = ? AND reward_paid = 1", [$date]);
        if ($paid >= DAILY_WINNER_CAP) return [0, true];
    }
    return [$amount, false];
}

/** Урьсан найз анх удаа таавал урьсан хүнд урамшуулал. tx() дотор. */
function referral_first_win(array $me): void
{
    if (empty($me['referred_by']) || REFERRAL_BONUS <= 0) return;
    $ref = row("SELECT * FROM referrals WHERE referred_id = ? AND is_verified = 0 LIMIT 1 FOR UPDATE", [$me['id']]);
    if (!$ref) return;
    q("UPDATE referrals SET is_verified = 1, bonus_paid = 1 WHERE id = ?", [$ref['id']]);
    $referrer = row("SELECT id, is_banned FROM users WHERE id = ? LIMIT 1", [$ref['referrer_id']]);
    if ($referrer && (int)$referrer['is_banned'] !== 1) {
        credit((int)$referrer['id'], REFERRAL_BONUS, 'referral', 'Урьсан найз: ' . $me['username'], (int)$ref['id'], 'referral_balance');
    }
}

function user_stats(int $uid): array
{
    $list = rows(
        "SELECT game_date, is_won, attempts_count FROM game_sessions
         WHERE user_id = ? AND is_completed = 1 ORDER BY game_date ASC",
        [$uid]
    );
    $dist = [];
    for ($i = 1; $i <= MAX_ATTEMPTS; $i++) $dist[(string)$i] = 0;
    $byDate = [];
    $wins = 0;
    $max = 0;
    $run = 0;
    $prevWon = null;
    foreach ($list as $r) {
        $d = (string)$r['game_date'];
        $won = (int)$r['is_won'] === 1;
        $byDate[$d] = $won;
        if ($won) {
            $wins++;
            $k = (string)(int)$r['attempts_count'];
            if (isset($dist[$k])) $dist[$k]++;
            $run = ($prevWon !== null && day_shift($prevWon, 1) === $d) ? $run + 1 : 1;
            $prevWon = $d;
        } else {
            $run = 0;
            $prevWon = null;
        }
        $max = max($max, $run);
    }
    $cur = 0;
    $d = today();
    if (!array_key_exists($d, $byDate)) $d = day_shift($d, -1);
    while (($byDate[$d] ?? false) === true) {
        $cur++;
        $d = day_shift($d, -1);
    }
    $played = count($list);
    $earned = num(
        "SELECT COALESCE(SUM(amount), 0) FROM transactions
         WHERE user_id = ? AND amount > 0 AND type IN ('win', 'referral', 'tournament_prize')",
        [$uid]
    );
    return [
        'played'         => $played,
        'wins'           => $wins,
        'win_rate'       => $played ? (int)round($wins * 100 / $played) : 0,
        'current_streak' => $cur,
        'max_streak'     => $max,
        'distribution'   => $dist,
        'earned'         => $earned,
    ];
}

/* ── Дасгал ───────────────────────────────────────────────── */
function practice_allowance(array $u): array
{
    $used = num(
        "SELECT COUNT(*) FROM practice_sessions WHERE user_id = ? AND created_at >= ? AND created_at < ?",
        [$u['id'], today() . ' 00:00:00', day_shift(today(), 1) . ' 00:00:00']
    );
    if (is_premium($u)) return ['unlimited' => true, 'used' => $used, 'limit' => null, 'left' => null];
    $limit = PRACTICE_DAILY_FREE + max(0, (int)($u['extra_plays'] ?? 0));
    return ['unlimited' => false, 'used' => $used, 'limit' => $limit, 'left' => max(0, $limit - $used)];
}

function practice_payload(array $p): array
{
    $sp   = session_payload($p);
    $done = $sp !== null && $sp['is_completed'];
    return [
        'mode'         => 'practice',
        'id'           => (int)$p['id'],
        'date'         => substr((string)$p['created_at'], 0, 10),
        'number'       => num("SELECT COUNT(*) FROM practice_sessions WHERE user_id = ? AND id <= ?", [$p['user_id'], $p['id']]),
        'length'       => wlen((string)$p['word']),
        'max_attempts' => MAX_ATTEMPTS,
        'session'      => $sp,
        'answer'       => $done ? (string)$p['word'] : null,
        'definition'   => $done ? (string)$p['definition'] : null,
    ];
}

/* ── Тэмцээн ─────────────────────────────────────────────── */
function tournament_score(bool $won, int $attempts, int $completedTs, string $date): int
{
    if (!$won) return 0;
    $secs = max(0, min(86399, $completedTs - (int)strtotime($date)));
    // Цөөн оролдлого түрүүлнэ; тэнцвэл эрт дуусгасан нь түрүүлнэ
    return (MAX_ATTEMPTS + 1 - $attempts) * 100000 + (86400 - $secs);
}

function tournament_record_result(int $uid, string $date, bool $won, int $attempts): void
{
    $t = row("SELECT id FROM tournaments WHERE tournament_date = ? LIMIT 1", [$date]);
    if (!$t) return;
    q(
        "UPDATE tournament_entries SET score = ? WHERE tournament_id = ? AND user_id = ?",
        [tournament_score($won, $attempts, time(), $date), $t['id'], $uid]
    );
}

function tournament_brief(int $uid, string $date): ?array
{
    $t = row("SELECT * FROM tournaments WHERE tournament_date = ? LIMIT 1", [$date]);
    if (!$t) return null;
    $e = row("SELECT * FROM tournament_entries WHERE tournament_id = ? AND user_id = ? LIMIT 1", [$t['id'], $uid]);
    $rank = null;
    if ($e && (int)$e['score'] > 0) {
        $rank = 1 + num(
            "SELECT COUNT(*) FROM tournament_entries
             WHERE tournament_id = ? AND (score > ? OR (score = ? AND id < ?))",
            [$t['id'], $e['score'], $e['score'], $e['id']]
        );
    }
    return [
        'id'           => (int)$t['id'],
        'date'         => (string)$t['tournament_date'],
        'status'       => (string)$t['status'],
        'entry_fee'    => (int)$t['entry_fee'],
        'prize_pool'   => (int)$t['prize_pool'],
        'participants' => (int)$t['participant_count'],
        'joined'       => (bool)$e,
        'rank'         => $rank,
    ];
}

function split_prizes(int $pool, int $places): array
{
    $split = array_values(array_filter(array_map('intval', TOURNAMENT_SPLIT), fn(int $x): bool => $x > 0));
    $w = array_slice($split, 0, $places);
    if (!$w || $pool <= 0) return array_fill(0, $places, 0);
    $sum = array_sum($w);
    $out = [];
    foreach ($w as $weight) $out[] = intdiv($pool * $weight, $sum);
    $out[0] += $pool - array_sum($out);
    return $out;
}

/** Өнгөрсөн өдрийн тэмцээнийг хаагаад шагналыг олгоно. Давхар төлөхгүй (FOR UPDATE). */
function finalize_tournament(int $tid, bool $cancel = false): bool
{
    return tx(function () use ($tid, $cancel): bool {
        $t = row("SELECT * FROM tournaments WHERE id = ? FOR UPDATE", [$tid]);
        if (!$t || $t['status'] === 'finished') return false;

        // Оноог тухайн өдрийн тоглолтоос дахин тооцно (хуучин өгөгдөлд ч зөв ажиллана)
        $date    = (string)$t['tournament_date'];
        $entries = rows(
            "SELECT te.*, gs.is_won, gs.attempts_count, gs.completed_at, gs.created_at AS played_at
             FROM tournament_entries te
             LEFT JOIN game_sessions gs ON gs.user_id = te.user_id AND gs.game_date = ?
             WHERE te.tournament_id = ?",
            [$date, $tid]
        );
        foreach ($entries as &$e) {
            $at = $e['completed_at'] ?? $e['played_at'] ?? null;
            $e['score'] = tournament_score(
                (int)($e['is_won'] ?? 0) === 1,
                (int)($e['attempts_count'] ?? 0),
                $at ? (int)strtotime((string)$at) : (int)strtotime($date . ' 23:59:59'),
                $date
            );
        }
        unset($e);
        usort($entries, fn(array $a, array $b): int => [$b['score'], $a['id']] <=> [$a['score'], $b['id']]);
        $pool    = (int)$t['prize_pool'];
        $places  = count(array_filter(array_map('intval', TOURNAMENT_SPLIT), fn(int $x): bool => $x > 0));
        $winners = $cancel ? [] : array_slice(array_values(array_filter($entries, fn(array $e): bool => (int)$e['score'] > 0)), 0, $places);
        $prizes  = $winners ? split_prizes($pool, count($winners)) : [];
        $prizeBy = [];

        foreach ($winners as $i => $e) {
            $prizeBy[(int)$e['id']] = $prizes[$i];
            if ($prizes[$i] > 0) {
                credit((int)$e['user_id'], $prizes[$i], 'tournament_prize',
                    sprintf('Тэмцээн %s — %d-р байр', $t['tournament_date'], $i + 1), $tid);
            }
        }
        if (!$winners) {
            foreach ($entries as $e) {
                if ((int)$e['fee_paid'] > 0) {
                    credit((int)$e['user_id'], (int)$e['fee_paid'], 'tournament_refund',
                        $cancel ? 'Тэмцээн цуцлагдсан — хураамж буцаав' : 'Тэмцээнд ялагч гараагүй — хураамж буцаав', $tid);
                }
            }
        }
        foreach ($entries as $i => $e) {
            q("UPDATE tournament_entries SET score = ?, `rank` = ?, prize_won = ? WHERE id = ?",
                [$e['score'], $cancel ? null : $i + 1, $prizeBy[(int)$e['id']] ?? 0, $e['id']]);
        }
        q(
            "UPDATE tournaments SET status = 'finished', finished_at = NOW(),
             first_prize = ?, second_prize = ?, third_prize = ? WHERE id = ?",
            [$prizes[0] ?? 0, $prizes[1] ?? 0, $prizes[2] ?? 0, $tid]
        );
        return true;
    });
}

function finalize_due_tournaments(): void
{
    try {
        $due = rows(
            "SELECT id FROM tournaments WHERE tournament_date < ? AND status <> 'finished'
             ORDER BY tournament_date ASC LIMIT 3",
            [today()]
        );
        foreach ($due as $r) finalize_tournament((int)$r['id']);
    } catch (Throwable $e) {
        error_log('[vgtaa] finalize tournaments: ' . $e->getMessage());
    }
}

/* ============================================================
   HANDLERS — нийтийн
   ============================================================ */
function a_config(): never
{
    $players = 0;
    $winners = 0;
    try {
        $r = row("SELECT COUNT(*) AS p, COALESCE(SUM(is_won), 0) AS w FROM game_sessions WHERE game_date = ? AND attempts_count > 0", [today()]);
        $players = (int)($r['p'] ?? 0);
        $winners = (int)($r['w'] ?? 0);
    } catch (Throwable) {
        // Нүүр хуудас DB-гүйгээр ч ачаалагдана
    }
    ok([
        'config' => public_config(),
        'today'  => ['players' => $players, 'winners' => $winners],
        'time'   => time_payload(),
    ]);
}

function a_ping(): never
{
    $dbOk = false;
    try {
        $dbOk = (int)val("SELECT 1") === 1;
    } catch (Throwable) {
    }
    ok(['version' => APP_VERSION, 'db' => $dbOk, 'time' => time_payload()]);
}

/* ============================================================
   HANDLERS — нэвтрэлт
   ============================================================ */
function a_google_login(): never
{
    $cred = input()['credential'] ?? '';
    if (!is_string($cred) || substr_count($cred, '.') !== 2 || strlen($cred) > 4096) {
        fail('Google нэвтрэлтийн мэдээлэл буруу байна.');
    }
    $g = google_verify($cred);
    if (!$g) fail('Google нэвтрэлтийг баталгаажуулж чадсангүй. Хуудсаа дахин ачаалаад оролдоно уу.', 401);

    $gid    = (string)$g['sub'];
    $email  = mb_strtolower(trim((string)$g['email']));
    $name   = clean_text(is_string($g['name'] ?? null) ? $g['name'] : '', 100);
    if ($name === '') $name = explode('@', $email)[0];
    $avatar = is_string($g['picture'] ?? null) ? $g['picture'] : '';
    if (!preg_match('#^https://[a-z0-9.-]+\.(googleusercontent|google)\.com/[^\s"\'<>]*$#i', $avatar)) $avatar = '';
    $avatar = mb_substr($avatar, 0, 500);
    $ip     = client_ip();

    $u = row("SELECT * FROM users WHERE google_id = ? LIMIT 1", [$gid]);
    if (!$u) {
        $u = row("SELECT * FROM users WHERE email = ? LIMIT 1", [$email]);
        if ($u) {
            if (!empty($u['google_id']) && $u['google_id'] !== $gid) {
                fail('Энэ имэйл өөр Google бүртгэлтэй холбогдсон байна.', 409);
            }
            q("UPDATE users SET google_id = ? WHERE id = ?", [$gid, $u['id']]);
        }
    }

    $isNew = false;
    if (!$u) {
        $refBy   = null;
        $refCode = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)(is_string(input()['referral_code'] ?? null) ? input()['referral_code'] : '')) ?? '');
        if ($refCode !== '' && strlen($refCode) <= 16) {
            $r = row("SELECT id FROM users WHERE referral_code = ? LIMIT 1", [$refCode]);
            if ($r) $refBy = (int)$r['id'];
        }
        try {
            $newId = tx(function () use ($gid, $email, $name, $avatar, $refBy, $ip): int {
                q(
                    "INSERT INTO users (google_id, email, username, avatar_url, referral_code, referred_by,
                                        signup_ip, last_ip, last_seen_at, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())",
                    [$gid, $email, $name, $avatar, new_referral_code(), $refBy, $ip, $ip]
                );
                $id = (int)db()->lastInsertId();
                if ($refBy) {
                    q("INSERT IGNORE INTO referrals (referrer_id, referred_id, created_at) VALUES (?, ?, NOW())", [$refBy, $id]);
                }
                return $id;
            });
            $isNew = true;
            $u = row("SELECT * FROM users WHERE id = ? LIMIT 1", [$newId]);
        } catch (PDOException $e) {
            // Зэрэг хоёр нэвтрэлт — нөгөө нь аль хэдийн үүсгэсэн
            if ((int)($e->errorInfo[1] ?? 0) !== 1062) throw $e;
            $u = row("SELECT * FROM users WHERE google_id = ? OR email = ? LIMIT 1", [$gid, $email]);
        }
        if (!$u) fail('Бүртгэл үүсгэхэд алдаа гарлаа. Дахин оролдоно уу.', 500);
    } else {
        if ($avatar !== '' && $avatar !== (string)$u['avatar_url']) {
            q("UPDATE users SET avatar_url = ? WHERE id = ?", [$avatar, $u['id']]);
            $u['avatar_url'] = $avatar;
        }
        q("UPDATE users SET last_seen_at = NOW(), last_ip = ? WHERE id = ?", [$ip, $u['id']]);
    }

    if ((int)($u['is_banned'] ?? 0) === 1) fail('Таны бүртгэл түр түдгэлзсэн байна. Админтай холбогдоно уу.', 403);

    ok([
        'token'  => jwt_issue((int)$u['id']),
        'user'   => user_public($u),
        'is_new' => $isNew,
    ]);
}

function a_me(): never
{
    $u = require_user();
    ok(['user' => user_public($u), 'time' => time_payload()]);
}

/* ============================================================
   HANDLERS — өдрийн тоглоом
   ============================================================ */
function a_daily(): never
{
    $u = require_user();
    $today = today();
    finalize_due_tournaments();

    $g = user_day_game((int)$u['id'], $today);
    if (!$g) fail('Үгийн сан хоосон байна. Админ үг нэмэх шаардлагатай.', 404);

    $sp   = session_payload($g);
    $done = $sp !== null && $sp['is_completed'];

    ok([
        'game' => [
            'mode'         => 'daily',
            'date'         => $today,
            'number'       => game_number($today),
            'length'       => wlen((string)$g['word']),
            'max_attempts' => MAX_ATTEMPTS,
            'session'      => $sp,
            'answer'       => $done ? (string)$g['word'] : null,
            'definition'   => $done ? (string)$g['definition'] : null,
        ],
        'stats'      => $done ? user_stats((int)$u['id']) : null,
        'tournament' => tournament_brief((int)$u['id'], $today),
        'archive'    => practice_allowance($u),
        'user'       => user_public($u),
        'time'       => time_payload(),
    ]);
}

function a_guess(): never
{
    $u     = require_user();
    $today = today();
    $dw    = user_day_game((int)$u['id'], $today);
    if (!$dw) fail('Үгийн сан хоосон байна.', 404);

    $answer = (string)$dw['word'];
    $guess  = normalize_word(in_str('guess', 64));
    validate_guess($guess, wlen($answer));
    $result = score_guess($guess, $answer);
    $won    = $guess === $answer;

    $r = tx(function () use ($u, $dw, $today, $guess, $result, $won): array {
        $me = row("SELECT * FROM users WHERE id = ? FOR UPDATE", [$u['id']]);
        $s  = row("SELECT * FROM game_sessions WHERE id = ? LIMIT 1 FOR UPDATE", [$dw['id']]);
        $attempts = $s ? decode_attempts($s['attempts']) : [];

        if ($s && (int)$s['is_completed'] === 1) fail('Өнөөдрийн тоглоом дууссан. Маргааш шинэ үг гарна!', 409);
        if (count($attempts) >= MAX_ATTEMPTS) fail('Оролдлого дууссан байна.', 409);
        foreach ($attempts as $a) {
            if ($a['guess'] === $guess) fail('Энэ үгийг аль хэдийн оруулсан байна.', 422);
        }

        $attempts[] = ['guess' => $guess, 'result' => $result];
        $n    = count($attempts);
        $done = $won || $n >= MAX_ATTEMPTS;
        $json = (string)json_encode($attempts, JSON_UNESCAPED_UNICODE);

        if ($s) {
            q(
                "UPDATE game_sessions SET attempts = ?, attempts_count = ?, is_won = ?, is_completed = ?, completed_at = ?
                 WHERE id = ?",
                [$json, $n, (int)$won, (int)$done, $done ? now_str() : null, $s['id']]
            );
            $sid = (int)$s['id'];
        } else {
            q(
                "INSERT INTO game_sessions (user_id, word_id, game_date, attempts, attempts_count, is_won,
                                            is_completed, reward_amount, reward_paid, created_at, completed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, NOW(), ?)",
                [$me['id'], $dw['word_id'], $today, $json, $n, (int)$won, (int)$done, $done ? now_str() : null]
            );
            $sid = (int)db()->lastInsertId();
        }

        $reward  = 0;
        $capped  = false;
        $balance = (int)$me['balance'];
        if ($won) {
            [$reward, $capped] = daily_reward($me, $n, $today);
            if ($reward > 0) {
                $balance = credit((int)$me['id'], $reward, 'win', 'Өдрийн үг таасан: ' . $guess, $sid, 'won_balance');
                q("UPDATE game_sessions SET reward_amount = ?, reward_paid = 1 WHERE id = ?", [$reward, $sid]);
            }
            referral_first_win($me);
        }
        if ($done) tournament_record_result((int)$me['id'], $today, $won, $n);

        return ['n' => $n, 'done' => $done, 'reward' => $reward, 'capped' => $capped, 'balance' => $balance];
    });

    ok([
        'result'         => $result,
        'is_won'         => $won,
        'is_completed'   => $r['done'],
        'attempts_count' => $r['n'],
        'reward_amount'  => $r['reward'],
        'reward_capped'  => $r['capped'],
        'balance'        => $r['balance'],
        'answer'         => $r['done'] ? $answer : null,
        'definition'     => $r['done'] ? (string)$dw['definition'] : null,
        'stats'          => $r['done'] ? user_stats((int)$u['id']) : null,
        'tournament'     => $r['done'] ? tournament_brief((int)$u['id'], $today) : null,
    ]);
}

function a_stats(): never
{
    $u = require_user();
    ok(['stats' => user_stats((int)$u['id'])]);
}

/* ============================================================
   HANDLERS — түүх ба дасгал
   ============================================================ */
function a_archive(): never
{
    $u     = require_user();
    $days  = rows(
        "SELECT gs.game_date, gs.is_won, gs.is_completed, gs.attempts_count, CHAR_LENGTH(w.word) AS len
         FROM game_sessions gs JOIN words w ON w.id = gs.word_id
         WHERE gs.user_id = ? AND gs.game_date < ? AND gs.attempts_count > 0
         ORDER BY gs.game_date DESC LIMIT 90",
        [$u['id'], today()]
    );
    $items = array_map(fn(array $d): array => [
        'date'     => (string)$d['game_date'],
        'number'   => game_number((string)$d['game_date']),
        'length'   => (int)$d['len'],
        'status'   => (int)$d['is_won'] === 1 ? 'won' : 'lost',
        'attempts' => (int)$d['attempts_count'],
    ], $days);

    $open = row(
        "SELECT ps.*, w.word, w.definition FROM practice_sessions ps JOIN words w ON w.id = ps.word_id
         WHERE ps.user_id = ? AND ps.is_completed = 0 ORDER BY ps.id DESC LIMIT 1",
        [$u['id']]
    );
    $recent = array_map(fn(array $p): array => [
        'id'       => (int)$p['id'],
        'won'      => (int)$p['is_won'] === 1,
        'done'     => (int)$p['is_completed'] === 1,
        'attempts' => (int)$p['attempts_count'],
        'length'   => (int)$p['len'],
        'word'     => (int)$p['is_completed'] === 1 ? (string)$p['word'] : null,
        'at'       => $p['created_at'],
    ], rows(
        "SELECT ps.id, ps.is_won, ps.is_completed, ps.attempts_count, ps.created_at, w.word, CHAR_LENGTH(w.word) AS len
         FROM practice_sessions ps JOIN words w ON w.id = ps.word_id
         WHERE ps.user_id = ? AND ps.is_completed = 1 ORDER BY ps.id DESC LIMIT 20",
        [$u['id']]
    ));

    ok([
        'items'        => $items,
        'practice'     => ['open' => $open ? practice_payload($open) : null, 'recent' => $recent],
        'allowance'    => practice_allowance($u),
        'max_attempts' => MAX_ATTEMPTS,
    ]);
}

/** Өнгөрсөн өдөр өөрийн тоглосон үгээ харах (зөвхөн харах) */
function a_archive_game(): never
{
    $u    = require_user();
    $date = qs('date');
    if (!valid_date($date) || $date >= today()) fail('Огноо буруу байна.', 422);
    $g = user_day_game((int)$u['id'], $date, false);
    if (!$g || (int)$g['attempts_count'] === 0) fail('Та энэ өдөр тоглоогүй байна.', 404);

    $sp = session_payload($g);
    $sp['is_completed'] = true; // Өдөр нь дууссан
    ok([
        'game' => [
            'mode'         => 'review',
            'date'         => $date,
            'number'       => game_number($date),
            'length'       => wlen((string)$g['word']),
            'max_attempts' => MAX_ATTEMPTS,
            'session'      => $sp,
            'answer'       => (string)$g['word'],
            'definition'   => (string)$g['definition'],
        ],
    ]);
}

function a_practice(): never
{
    $u = require_user();
    $p = row(
        "SELECT ps.*, w.word, w.definition FROM practice_sessions ps JOIN words w ON w.id = ps.word_id
         WHERE ps.user_id = ? AND ps.is_completed = 0 ORDER BY ps.id DESC LIMIT 1",
        [$u['id']]
    );
    ok(['game' => $p ? practice_payload($p) : null, 'allowance' => practice_allowance($u)]);
}

function a_practice_new(): never
{
    $u = require_user();
    $pid = tx(function () use ($u): int {
        $me = row("SELECT * FROM users WHERE id = ? FOR UPDATE", [$u['id']]);
        $open = val("SELECT id FROM practice_sessions WHERE user_id = ? AND is_completed = 0 ORDER BY id DESC LIMIT 1", [$u['id']]);
        if ($open) return (int)$open;
        $allow = practice_allowance($me);
        if (!$allow['unlimited'] && $allow['left'] <= 0) {
            fail('Өнөөдрийн дасгалын эрх дууслаа. Маргааш эсвэл Premium-ээр хязгааргүй тоглоорой!', 429, ['code' => 'practice_limit']);
        }
        $wid = pick_word((int)$u['id']);
        if (!$wid) fail('Үгийн сан хоосон байна.', 404);
        q("INSERT INTO practice_sessions (user_id, word_id, attempts, attempts_count, is_won, is_completed, created_at) VALUES (?, ?, '[]', 0, 0, 0, NOW())",
            [$u['id'], $wid]);
        return (int)db()->lastInsertId();
    });
    $p = row("SELECT ps.*, w.word, w.definition FROM practice_sessions ps JOIN words w ON w.id = ps.word_id WHERE ps.id = ?", [$pid]);
    ok(['game' => practice_payload($p), 'allowance' => practice_allowance($u)]);
}

function a_practice_guess(): never
{
    $u  = require_user();
    $id = in_int('id');
    $p  = row(
        "SELECT ps.*, w.word, w.definition FROM practice_sessions ps JOIN words w ON w.id = ps.word_id
         WHERE ps.id = ? AND ps.user_id = ? LIMIT 1",
        [$id, $u['id']]
    );
    if (!$p) fail('Дасгал олдсонгүй.', 404);

    $answer = (string)$p['word'];
    $guess  = normalize_word(in_str('guess', 64));
    validate_guess($guess, wlen($answer));
    $result = score_guess($guess, $answer);
    $won    = $guess === $answer;

    $r = tx(function () use ($id, $guess, $result, $won): array {
        $s = row("SELECT * FROM practice_sessions WHERE id = ? LIMIT 1 FOR UPDATE", [$id]);
        if ((int)$s['is_completed'] === 1) fail('Энэ дасгал дууссан байна.', 409);
        $attempts = decode_attempts($s['attempts']);
        foreach ($attempts as $a) {
            if ($a['guess'] === $guess) fail('Энэ үгийг аль хэдийн оруулсан байна.', 422);
        }
        $attempts[] = ['guess' => $guess, 'result' => $result];
        $n    = count($attempts);
        $done = $won || $n >= MAX_ATTEMPTS;
        q(
            "UPDATE practice_sessions SET attempts = ?, attempts_count = ?, is_won = ?, is_completed = ?, completed_at = ? WHERE id = ?",
            [(string)json_encode($attempts, JSON_UNESCAPED_UNICODE), $n, (int)$won, (int)$done, $done ? now_str() : null, $id]
        );
        return ['n' => $n, 'done' => $done];
    });

    ok([
        'result'         => $result,
        'is_won'         => $won,
        'is_completed'   => $r['done'],
        'attempts_count' => $r['n'],
        'answer'         => $r['done'] ? $answer : null,
        'definition'     => $r['done'] ? (string)$p['definition'] : null,
        'archive'        => practice_allowance($u),
    ]);
}

/* ============================================================
   HANDLERS — шилдгийн самбар
   ============================================================ */
function a_leaderboard(): never
{
    $u      = require_user();
    $period = qs('period', 'week');
    $today  = today();
    [$from, $to] = match ($period) {
        'today' => [$today, $today],
        'month' => [day_shift($today, -29), $today],
        'all'   => ['2000-01-01', $today],
        default => [day_shift($today, -6), $today],
    };
    if (!in_array($period, ['today', 'week', 'month', 'all'], true)) $period = 'week';

    $pts = MAX_ATTEMPTS + 1;
    $list = rows(
        "SELECT u.id, u.username, u.avatar_url, u.is_premium, u.premium_expires_at,
                SUM(gs.is_won) AS wins,
                COUNT(*) AS played,
                SUM(CASE WHEN gs.is_won = 1 THEN $pts - gs.attempts_count ELSE 0 END) AS points,
                MIN(CASE WHEN gs.is_won = 1 THEN gs.attempts_count END) AS best,
                MIN(CASE WHEN gs.is_won = 1 THEN gs.completed_at END) AS first_win
         FROM game_sessions gs
         JOIN users u ON u.id = gs.user_id
         WHERE gs.game_date BETWEEN ? AND ? AND gs.is_completed = 1 AND u.is_banned = 0
         GROUP BY u.id, u.username, u.avatar_url, u.is_premium, u.premium_expires_at
         HAVING wins > 0
         ORDER BY points DESC, wins DESC, first_win ASC, u.id ASC
         LIMIT 300",
        [$from, $to]
    );

    $out = [];
    $me  = null;
    foreach ($list as $i => $r) {
        $item = [
            'rank'       => $i + 1,
            'id'         => (int)$r['id'],
            'username'   => (string)$r['username'],
            'avatar_url' => (string)$r['avatar_url'],
            'is_premium' => is_premium($r),
            'points'     => (int)$r['points'],
            'wins'       => (int)$r['wins'],
            'played'     => (int)$r['played'],
            'best'       => $r['best'] !== null ? (int)$r['best'] : null,
            'time'       => $period === 'today' && $r['first_win'] ? substr((string)$r['first_win'], 11, 5) : null,
        ];
        if ($item['id'] === (int)$u['id']) $me = $item;
        if ($i < 50) $out[] = $item;
    }
    ok(['period' => $period, 'from' => $from, 'to' => $to, 'leaders' => $out, 'me' => $me, 'total' => count($list)]);
}

/* ============================================================
   HANDLERS — профайл, хэтэвч, найз урих, premium
   ============================================================ */
function a_profile(): never
{
    $u = require_user();
    $refs = row(
        "SELECT COALESCE(SUM(is_verified = 1), 0) AS verified, COUNT(*) AS total FROM referrals WHERE referrer_id = ?",
        [$u['id']]
    );
    ok([
        'user'      => user_public($u),
        'stats'     => user_stats((int)$u['id']),
        'referrals' => ['verified' => (int)($refs['verified'] ?? 0), 'total' => (int)($refs['total'] ?? 0)],
        'archive'   => practice_allowance($u),
    ]);
}

function a_wallet(): never
{
    $u = require_user();
    $tx = rows(
        "SELECT id, type, amount, balance_after, description, created_at
         FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 60",
        [$u['id']]
    );
    $wd = rows(
        "SELECT id, amount, bank_name, account_number, account_name, status, admin_note, requested_at, processed_at
         FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 20",
        [$u['id']]
    );
    foreach ($wd as &$w) {
        $acc = (string)$w['account_number'];
        $w['account_number'] = strlen($acc) > 4 ? str_repeat('•', 4) . substr($acc, -4) : $acc;
        $w['bank_label'] = BANKS[$w['bank_name']] ?? (string)$w['bank_name'];
    }
    unset($w);
    $verified = num("SELECT COUNT(*) FROM referrals WHERE referrer_id = ? AND is_verified = 1", [$u['id']]);
    $pending  = num("SELECT COUNT(*) FROM withdrawals WHERE user_id = ? AND status = 'pending'", [$u['id']]);
    $deps = [];
    try {
        $deps = rows("SELECT * FROM deposits WHERE user_id = ? AND status = 'submitted' ORDER BY id DESC LIMIT 5", [$u['id']]);
    } catch (PDOException) {
        // setup.php ажиллаагүй бол цэнэглэлтгүйгээр харуулна
    }
    ok([
        'user'         => user_public($u),
        'transactions' => $tx,
        'withdrawals'  => $wd,
        'deposits'     => ['enabled' => deposits_ready(), 'pending' => array_map('deposit_public', $deps)],
        'requirements' => [
            'verified_referrals' => $verified,
            'referral_unlock'    => REFERRAL_UNLOCK,
            'min_withdrawal'     => MIN_WITHDRAWAL,
            'has_pending'        => $pending > 0,
        ],
    ]);
}

function a_withdraw(): never
{
    $u      = require_user();
    $bank   = in_str('bank', 32);
    $acc    = strtoupper(preg_replace('/[\s\-]/', '', in_str('account_number', 40)) ?? '');
    $name   = in_str('account_name', 100);
    $amount = in_int('amount');

    if (!isset(BANKS[$bank])) fail('Банкаа сонгоно уу.', 422);
    if (!preg_match('/^(MN\d{18}|\d{8,20})$/', $acc)) fail('Дансны дугаар буруу байна (8–20 оронтой тоо эсвэл MN IBAN).', 422);
    if (mb_strlen($name) < 2) fail('Дансны эзэмшигчийн нэрийг оруулна уу.', 422);
    if ($amount < MIN_WITHDRAWAL) fail('Хамгийн бага таталт: ' . number_format(MIN_WITHDRAWAL) . '₮', 422);
    if ($amount > MAX_WITHDRAWAL) fail('Нэг удаад хамгийн ихдээ ' . number_format(MAX_WITHDRAWAL) . '₮ татна.', 422);

    [$balance, $wid] = tx(function () use ($u, $bank, $acc, $name, $amount): array {
        row("SELECT id FROM users WHERE id = ? FOR UPDATE", [$u['id']]);
        $verified = num("SELECT COUNT(*) FROM referrals WHERE referrer_id = ? AND is_verified = 1", [$u['id']]);
        if ($verified < REFERRAL_UNLOCK) {
            fail(REFERRAL_UNLOCK . ' найз урьж баталгаажуулсны дараа мөнгө татах боломжтой (одоо: ' . $verified . ').', 403, ['code' => 'referrals_required']);
        }
        if (num("SELECT COUNT(*) FROM withdrawals WHERE user_id = ? AND status = 'pending'", [$u['id']]) > 0) {
            fail('Таны өмнөх таталтын хүсэлт шийдэгдээгүй байна.', 409);
        }
        q(
            "INSERT INTO withdrawals (user_id, amount, bank_name, account_number, account_name, status, requested_at)
             VALUES (?, ?, ?, ?, ?, 'pending', NOW())",
            [$u['id'], $amount, $bank, $acc, $name]
        );
        $wid = (int)db()->lastInsertId();
        return [credit((int)$u['id'], -$amount, 'withdrawal', 'Мөнгө татах: ' . (BANKS[$bank] ?? $bank) . ' ••' . substr($acc, -4), $wid), $wid];
    });

    if (settings()['notify_withdrawals']) {
        $w = row("SELECT * FROM withdrawals WHERE id = ? LIMIT 1", [$wid]);
        $mid = $w ? telegram_notify(tg_withdrawal_text($w, $u), tg_markup('w', $wid, true)) : null;
        if ($mid) q("UPDATE withdrawals SET tg_message_id = ? WHERE id = ?", [$mid, $wid]);
    }

    ok(['message' => 'Таталтын хүсэлт илгээгдлээ. Ажлын 1–3 өдөрт шилжүүлнэ.', 'balance' => $balance]);
}

/* ============================================================
   HANDLERS — хэтэвч цэнэглэх (банкны шилжүүлэг + админ баталгаажуулалт)
   ============================================================ */
function deposit_state(array $u): array
{
    $s = settings();
    // 24 цагаас дээш төлөгдөөгүй хүсэлтийг хаана
    q("UPDATE deposits SET status = 'expired' WHERE user_id = ? AND status = 'created' AND created_at < ?",
        [$u['id'], date('Y-m-d H:i:s', time() - 86400)]);
    $open = row("SELECT * FROM deposits WHERE user_id = ? AND status = 'created' ORDER BY id DESC LIMIT 1", [$u['id']]);
    $recent = rows(
        "SELECT * FROM deposits WHERE user_id = ? AND status IN ('submitted', 'approved', 'rejected') ORDER BY id DESC LIMIT 20",
        [$u['id']]
    );
    $ready = deposits_ready($s);
    $min = (int)$s['deposit_min'];
    $max = (int)$s['deposit_max'];
    return [
        'enabled' => $ready,
        'min'     => $min,
        'max'     => $max,
        'presets' => array_values(array_filter([5000, 10000, 20000, 50000], fn(int $v): bool => $v >= $min && $v <= $max)),
        'bank'    => $ready ? deposit_bank_public($s) : null,
        'open'    => $open ? deposit_public($open) : null,
        'recent'  => array_map('deposit_public', $recent),
    ];
}

function a_deposit_info(): never
{
    $u = require_user();
    ok(['deposit' => deposit_state($u)]);
}

function a_deposit_create(): never
{
    $u = require_user();
    $s = settings();
    if (!deposits_ready($s)) fail('Цэнэглэлт түр хаалттай байна.', 403);
    $amount = in_int('amount');
    if ($amount < (int)$s['deposit_min']) fail('Хамгийн багадаа ' . number_format((int)$s['deposit_min']) . '₮ цэнэглэнэ.', 422);
    if ($amount > (int)$s['deposit_max']) fail('Нэг удаад хамгийн ихдээ ' . number_format((int)$s['deposit_max']) . '₮ цэнэглэнэ.', 422);

    tx(function () use ($u, $amount): void {
        row("SELECT id FROM users WHERE id = ? FOR UPDATE", [$u['id']]);
        $open = row("SELECT id FROM deposits WHERE user_id = ? AND status = 'created' LIMIT 1", [$u['id']]);
        if ($open) {
            q("UPDATE deposits SET amount = ?, created_at = NOW() WHERE id = ?", [$amount, $open['id']]);
            return;
        }
        if (num("SELECT COUNT(*) FROM deposits WHERE user_id = ? AND status = 'submitted'", [$u['id']]) >= 3) {
            fail('Шалгагдаж буй 3 хүсэлт байна. Админ баталгаажуулсны дараа дахин цэнэглэнэ үү.', 429);
        }
        if (num("SELECT COUNT(*) FROM deposits WHERE user_id = ? AND created_at >= ?", [$u['id'], today() . ' 00:00:00']) >= 15) {
            fail('Өнөөдөр хэт олон хүсэлт үүсгэсэн байна. Маргааш дахин оролдоно уу.', 429);
        }
        q("INSERT INTO deposits (user_id, amount, reference, status, created_at) VALUES (?, ?, ?, 'created', NOW())",
            [$u['id'], $amount, deposit_reference((int)$u['id'])]);
    });
    ok(['deposit' => deposit_state($u)]);
}

function a_deposit_submit(): never
{
    $u  = require_user();
    $id = in_int('id');
    $d = tx(function () use ($u, $id): array {
        $d = row("SELECT * FROM deposits WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE", [$id, $u['id']]);
        if (!$d) fail('Хүсэлт олдсонгүй.', 404);
        if ($d['status'] !== 'created') fail('Энэ хүсэлтийг аль хэдийн илгээсэн байна.', 409);
        q("UPDATE deposits SET status = 'submitted', submitted_at = NOW() WHERE id = ?", [$id]);
        return $d;
    });

    $d   = row("SELECT * FROM deposits WHERE id = ? LIMIT 1", [$d['id']]) ?? $d;
    $mid = telegram_notify(tg_deposit_text($d, $u), tg_markup('d', (int)$d['id'], true));
    if ($mid) q("UPDATE deposits SET notified = 1, tg_message_id = ? WHERE id = ?", [$mid, $d['id']]);

    ok([
        'message' => 'Хүсэлт илгээгдлээ! Админ шилжүүлгийг шалгаж баталгаажуулмагц хэтэвчинд тань орно.',
        'deposit' => deposit_state($u),
    ]);
}

function a_deposit_cancel(): never
{
    $u  = require_user();
    $id = in_int('id');
    $st = q("UPDATE deposits SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'created'", [$id, $u['id']]);
    if ($st->rowCount() !== 1) fail('Цуцлах боломжгүй хүсэлт байна.', 409);
    ok(['deposit' => deposit_state($u)]);
}

function a_referrals(): never
{
    $u = require_user();
    $list = rows(
        "SELECT r.id, r.is_verified, r.created_at, u.username, u.avatar_url
         FROM referrals r JOIN users u ON u.id = r.referred_id
         WHERE r.referrer_id = ? ORDER BY r.id DESC LIMIT 200",
        [$u['id']]
    );
    $verified = 0;
    foreach ($list as &$r) {
        $r['is_verified'] = (int)$r['is_verified'] === 1;
        if ($r['is_verified']) $verified++;
    }
    unset($r);
    ok([
        'code'      => (string)$u['referral_code'],
        'link'      => rtrim(APP_URL, '/') . '/?ref=' . rawurlencode((string)$u['referral_code']),
        'verified'  => $verified,
        'total'     => count($list),
        'unlock'    => REFERRAL_UNLOCK,
        'bonus'     => REFERRAL_BONUS,
        'referrals' => $list,
    ]);
}

function a_premium_buy(): never
{
    $u = require_user();
    $r = tx(function () use ($u): array {
        $me = row("SELECT * FROM users WHERE id = ? FOR UPDATE", [$u['id']]);
        $from = is_premium($me) && !empty($me['premium_expires_at'])
            ? max(time(), (int)strtotime((string)$me['premium_expires_at']))
            : time();
        $expires = date('Y-m-d H:i:s', $from + PREMIUM_DAYS * 86400);
        $balance = credit((int)$me['id'], -PREMIUM_PRICE, 'premium', 'Premium ' . PREMIUM_DAYS . ' хоног (' . substr($expires, 0, 10) . ' хүртэл)');
        q("UPDATE users SET is_premium = 1, premium_expires_at = ? WHERE id = ?", [$expires, $me['id']]);
        return ['balance' => $balance, 'expires' => $expires, 'renewed' => is_premium($me)];
    });
    $u = row("SELECT * FROM users WHERE id = ? LIMIT 1", [$u['id']]) ?? $u;
    ok([
        'message' => $r['renewed'] ? 'Premium амжилттай сунгагдлаа! ⭐' : 'Premium идэвхжлээ! ⭐',
        'user'    => user_public($u),
    ]);
}

/* ============================================================
   HANDLERS — тэмцээн
   ============================================================ */
function a_tournament(): never
{
    $u = require_user();
    finalize_due_tournaments();
    $today = today();

    $t = row("SELECT * FROM tournaments WHERE tournament_date = ? LIMIT 1", [$today]);
    $current = null;
    if ($t) {
        $entries = rows(
            "SELECT te.id, te.user_id, te.score, te.fee_paid, u.username, u.avatar_url,
                    gs.is_completed, gs.is_won, gs.attempts_count, gs.completed_at
             FROM tournament_entries te
             JOIN users u ON u.id = te.user_id
             LEFT JOIN game_sessions gs ON gs.user_id = te.user_id AND gs.game_date = ?
             WHERE te.tournament_id = ?
             ORDER BY te.score DESC, te.id ASC LIMIT 200",
            [$today, $t['id']]
        );
        $joined = false;
        $list = [];
        foreach ($entries as $i => $e) {
            $state = 'waiting';
            if ((int)($e['is_completed'] ?? 0) === 1) $state = (int)$e['is_won'] === 1 ? 'won' : 'lost';
            elseif ((int)($e['attempts_count'] ?? 0) > 0) $state = 'playing';
            if ((int)$e['user_id'] === (int)$u['id']) $joined = true;
            $list[] = [
                'rank'       => $state === 'won' ? $i + 1 : null,
                'user_id'    => (int)$e['user_id'],
                'username'   => (string)$e['username'],
                'avatar_url' => (string)$e['avatar_url'],
                'state'      => $state,
                'attempts'   => (int)($e['attempts_count'] ?? 0),
                'time'       => $state === 'won' && $e['completed_at'] ? substr((string)$e['completed_at'], 11, 5) : null,
            ];
        }
        $started = num("SELECT COUNT(*) FROM game_sessions WHERE user_id = ? AND game_date = ? AND attempts_count > 0", [$u['id'], $today]) > 0;
        $pool = (int)$t['prize_pool'];
        $current = [
            'id'           => (int)$t['id'],
            'date'         => (string)$t['tournament_date'],
            'status'       => (string)$t['status'],
            'entry_fee'    => (int)$t['entry_fee'],
            'your_fee'     => is_premium($u) ? 0 : (int)$t['entry_fee'],
            'prize_pool'   => $pool,
            'prizes'       => split_prizes($pool, count(array_filter(array_map('intval', TOURNAMENT_SPLIT), fn(int $x): bool => $x > 0))),
            'participants' => (int)$t['participant_count'],
            'joined'       => $joined,
            'started'      => $started,
            'can_join'     => $t['status'] === 'open' && !$joined && !$started,
            'entries'      => array_slice($list, 0, 100),
        ];
    }

    $recent = [];
    foreach (rows("SELECT * FROM tournaments WHERE status = 'finished' ORDER BY tournament_date DESC LIMIT 5") as $ft) {
        $recent[] = [
            'date'         => (string)$ft['tournament_date'],
            'prize_pool'   => (int)$ft['prize_pool'],
            'participants' => (int)$ft['participant_count'],
            'winners'      => rows(
                "SELECT te.`rank`, te.prize_won, u.username, u.avatar_url
                 FROM tournament_entries te JOIN users u ON u.id = te.user_id
                 WHERE te.tournament_id = ? AND te.prize_won > 0 ORDER BY te.`rank` ASC LIMIT 3",
                [$ft['id']]
            ),
        ];
    }
    $upcoming = row("SELECT tournament_date, entry_fee FROM tournaments WHERE tournament_date > ? AND status = 'open' ORDER BY tournament_date ASC LIMIT 1", [$today]);

    ok(['current' => $current, 'recent' => $recent, 'upcoming' => $upcoming, 'split' => TOURNAMENT_SPLIT, 'max_attempts' => MAX_ATTEMPTS]);
}

function a_tournament_join(): never
{
    $u = require_user();
    $today = today();
    $r = tx(function () use ($u, $today): array {
        $me = row("SELECT * FROM users WHERE id = ? FOR UPDATE", [$u['id']]);
        $t  = row("SELECT * FROM tournaments WHERE tournament_date = ? LIMIT 1 FOR UPDATE", [$today]);
        if (!$t || $t['status'] !== 'open') fail('Өнөөдөр бүртгэл нээлттэй тэмцээн алга.', 404);
        if (val("SELECT 1 FROM tournament_entries WHERE tournament_id = ? AND user_id = ? LIMIT 1", [$t['id'], $me['id']])) {
            fail('Та энэ тэмцээнд аль хэдийн бүртгүүлсэн байна.', 409);
        }
        if (num("SELECT COUNT(*) FROM game_sessions WHERE user_id = ? AND game_date = ? AND attempts_count > 0", [$me['id'], $today]) > 0) {
            fail('Өнөөдрийн үгийг таах эхэлсэн тул нэгдэх боломжгүй. Тэмцээнд тоглож эхлэхээсээ өмнө нэгддэг.', 409);
        }
        $fee = is_premium($me) ? 0 : (int)$t['entry_fee'];
        $balance = (int)$me['balance'];
        if ($fee > 0) {
            $balance = credit((int)$me['id'], -$fee, 'tournament_fee', 'Тэмцээний хураамж (' . $today . ')', (int)$t['id']);
        }
        q("INSERT INTO tournament_entries (tournament_id, user_id, fee_paid, score, joined_at) VALUES (?, ?, ?, 0, NOW())", [$t['id'], $me['id'], $fee]);
        $toPool = $fee - intdiv($fee * max(0, min(100, (int)TOURNAMENT_RAKE)), 100);
        q("UPDATE tournaments SET participant_count = participant_count + 1, prize_pool = prize_pool + ? WHERE id = ?", [$toPool, $t['id']]);
        $pool = (int)$t['prize_pool'] + $toPool;
        $p = split_prizes($pool, 3);
        q("UPDATE tournaments SET first_prize = ?, second_prize = ?, third_prize = ? WHERE id = ?", [$p[0] ?? 0, $p[1] ?? 0, $p[2] ?? 0, $t['id']]);
        return ['balance' => $balance, 'fee' => $fee];
    });
    ok([
        'message' => $r['fee'] > 0 ? 'Тэмцээнд бүртгүүллээ! Амжилт хүсье 🎯' : 'Premium эрхээр үнэгүй бүртгүүллээ! 🎯',
        'balance' => $r['balance'],
    ]);
}

/* ============================================================
   HANDLERS — админ
   ============================================================ */
function a_admin_overview(): never
{
    require_admin();
    finalize_due_tournaments();
    $today = today();
    $start = $today . ' 00:00:00';

    $stats = [
        'users_total'    => num("SELECT COUNT(*) FROM users"),
        'users_today'    => num("SELECT COUNT(*) FROM users WHERE created_at >= ?", [$start]),
        'active_today'   => num("SELECT COUNT(*) FROM users WHERE last_seen_at >= ?", [$start]),
        'games_today'    => num("SELECT COUNT(*) FROM game_sessions WHERE game_date = ? AND attempts_count > 0", [$today]),
        'wins_today'     => num("SELECT COUNT(*) FROM game_sessions WHERE game_date = ? AND is_won = 1", [$today]),
        'rewards_today'  => num("SELECT COALESCE(SUM(reward_amount), 0) FROM game_sessions WHERE game_date = ?", [$today]),
        'premium_users'  => num("SELECT COUNT(*) FROM users WHERE is_premium = 1 AND (premium_expires_at IS NULL OR premium_expires_at > NOW())"),
        'liability'      => num("SELECT COALESCE(SUM(balance), 0) FROM users"),
        'pending_count'  => num("SELECT COUNT(*) FROM withdrawals WHERE status = 'pending'"),
        'pending_sum'    => num("SELECT COALESCE(SUM(amount), 0) FROM withdrawals WHERE status = 'pending'"),
        'paid_total'     => num("SELECT COALESCE(SUM(amount), 0) FROM withdrawals WHERE status = 'approved'"),
        'premium_30d'    => -num("SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE (type = 'premium' OR (type = 'deposit' AND amount < 0)) AND created_at >= ?", [day_shift($today, -29) . ' 00:00:00']),
        'words_answers'  => num("SELECT COUNT(*) FROM words WHERE is_active = 1 AND is_answer = 1"),
        'words_unused'   => num("SELECT COUNT(*) FROM words WHERE is_active = 1 AND is_answer = 1 AND used_count = 0"),
        'banned'         => num("SELECT COUNT(*) FROM users WHERE is_banned = 1"),
        'deposit_pending'     => num("SELECT COUNT(*) FROM deposits WHERE status = 'submitted'"),
        'deposit_pending_sum' => num("SELECT COALESCE(SUM(amount), 0) FROM deposits WHERE status = 'submitted'"),
        'deposits_30d'        => num("SELECT COALESCE(SUM(amount), 0) FROM deposits WHERE status = 'approved' AND processed_at >= ?", [day_shift($today, -29) . ' 00:00:00']),
    ];
    $days = rows(
        "SELECT game_date, COUNT(*) AS games, COALESCE(SUM(is_won), 0) AS wins, COALESCE(SUM(reward_amount), 0) AS paid
         FROM game_sessions WHERE game_date >= ? AND attempts_count > 0 GROUP BY game_date ORDER BY game_date ASC",
        [day_shift($today, -13)]
    );
    $byDate = [];
    foreach ($days as $d) $byDate[(string)$d['game_date']] = $d;
    $series = [];
    for ($i = 13; $i >= 0; $i--) {
        $d = day_shift($today, -$i);
        $series[] = [
            'date'  => $d,
            'games' => (int)($byDate[$d]['games'] ?? 0),
            'wins'  => (int)($byDate[$d]['wins'] ?? 0),
            'paid'  => (int)($byDate[$d]['paid'] ?? 0),
        ];
    }
    $fx = fixed_word($today);
    ok([
        'stats'  => $stats,
        'series' => $series,
        'today'  => [
            'number' => game_number($today),
            'length' => day_length($today),
            'fixed'  => $fx ? ['word' => (string)$fx['word'], 'definition' => (string)$fx['definition']] : null,
        ],
    ]);
}

function a_admin_users(): never
{
    require_admin();
    $search = mb_substr(qs('q'), 0, 100);
    $page   = max(1, (int)qs('page', '1'));
    $per    = 30;
    $off    = ($page - 1) * $per;
    $where  = '';
    $p      = [];
    if ($search !== '') {
        if (ctype_digit($search)) {
            $where = 'WHERE u.id = ?';
            $p = [(int)$search];
        } else {
            $like  = '%' . addcslashes($search, '%_\\') . '%';
            $where = 'WHERE u.username LIKE ? OR u.email LIKE ? OR u.referral_code = ? OR u.signup_ip = ?';
            $p = [$like, $like, strtoupper($search), $search];
        }
    }
    $total = num("SELECT COUNT(*) FROM users u $where", $p);
    $list  = rows(
        "SELECT u.id, u.username, u.email, u.avatar_url, u.balance, u.won_balance, u.referral_balance,
                u.is_premium, u.premium_expires_at, u.is_admin, u.is_banned, u.extra_plays,
                u.referral_code, u.signup_ip, u.last_seen_at, u.created_at,
                (SELECT COUNT(*) FROM game_sessions g WHERE g.user_id = u.id AND g.is_won = 1) AS wins,
                (SELECT COUNT(*) FROM referrals r WHERE r.referrer_id = u.id AND r.is_verified = 1) AS refs,
                (SELECT COUNT(*) FROM users u2 WHERE u.signup_ip IS NOT NULL AND u.signup_ip <> '' AND u2.signup_ip = u.signup_ip) AS same_ip
         FROM users u $where ORDER BY u.id DESC LIMIT $per OFFSET $off",
        $p
    );
    foreach ($list as &$r) {
        $r['is_premium'] = is_premium($r);
        foreach (['is_admin', 'is_banned'] as $k) $r[$k] = (int)$r[$k] === 1;
    }
    unset($r);
    ok(['users' => $list, 'total' => $total, 'page' => $page, 'pages' => max(1, (int)ceil($total / $per))]);
}

function a_admin_user(): never
{
    $admin = require_admin();
    $id    = in_int('id');
    $op    = in_str('op', 20);
    $u     = row("SELECT * FROM users WHERE id = ? LIMIT 1", [$id]);
    if (!$u) fail('Хэрэглэгч олдсонгүй.', 404);

    switch ($op) {
        case 'ban':
        case 'unban':
            if ($id === (int)$admin['id']) fail('Өөрийгөө хориглох боломжгүй.');
            q("UPDATE users SET is_banned = ? WHERE id = ?", [$op === 'ban' ? 1 : 0, $id]);
            $msg = $op === 'ban' ? 'Хэрэглэгчийг хориглолоо.' : 'Хориг цуцлагдлаа.';
            break;
        case 'premium':
            $days = in_int('days', PREMIUM_DAYS);
            if ($days < 1 || $days > 366) fail('Хоногийн тоо 1–366 байна.');
            $from = is_premium($u) && !empty($u['premium_expires_at']) ? max(time(), (int)strtotime((string)$u['premium_expires_at'])) : time();
            q("UPDATE users SET is_premium = 1, premium_expires_at = ? WHERE id = ?", [date('Y-m-d H:i:s', $from + $days * 86400), $id]);
            $msg = "Premium {$days} хоног олголоо.";
            break;
        case 'unpremium':
            q("UPDATE users SET is_premium = 0, premium_expires_at = NULL WHERE id = ?", [$id]);
            $msg = 'Premium цуцаллаа.';
            break;
        case 'adjust':
            $amount = in_int('amount');
            $note   = in_str('note', 150);
            if ($amount === 0 || abs($amount) > 10000000) fail('Дүн буруу байна.');
            if (mb_strlen($note) < 3) fail('Шалтгаанаа бичнэ үү.');
            tx(fn() => credit($id, $amount, 'admin_adjust', 'Админ: ' . $note));
            $msg = 'Баланс шинэчлэгдлээ.';
            break;
        case 'extra_plays':
            $n = in_int('value');
            if ($n < 0 || $n > 100) fail('0–100 хооронд байна.');
            q("UPDATE users SET extra_plays = ? WHERE id = ?", [$n, $id]);
            $msg = 'Нэмэлт архив эрх шинэчлэгдлээ.';
            break;
        default:
            fail('Үйлдэл тодорхойгүй.');
    }
    ok(['message' => $msg]);
}

function a_admin_withdrawals(): never
{
    require_admin();
    try { telegram_poll(true); } catch (Throwable) { /* Telegram-гүйгээр ч жагсаалт харагдана */ }
    $status = qs('status', 'pending');
    $where  = in_array($status, ['pending', 'approved', 'rejected'], true) ? 'WHERE w.status = ?' : '';
    $list   = rows(
        "SELECT w.*, u.username, u.email, u.balance, u.signup_ip,
                (SELECT COUNT(*) FROM referrals r WHERE r.referrer_id = w.user_id AND r.is_verified = 1) AS refs,
                (SELECT COUNT(*) FROM game_sessions g WHERE g.user_id = w.user_id AND g.is_won = 1) AS wins,
                (SELECT COUNT(*) FROM users u2 WHERE u.signup_ip IS NOT NULL AND u.signup_ip <> '' AND u2.signup_ip = u.signup_ip) AS same_ip
         FROM withdrawals w JOIN users u ON u.id = w.user_id
         $where
         ORDER BY CASE w.status WHEN 'pending' THEN 0 ELSE 1 END, w.id DESC
         LIMIT 150",
        $where ? [$status] : []
    );
    foreach ($list as &$w) $w['bank_label'] = BANKS[$w['bank_name']] ?? (string)$w['bank_name'];
    unset($w);
    ok(['withdrawals' => $list]);
}

function a_admin_withdrawal(): never
{
    require_admin();
    $op = in_str('op', 10);
    if (!in_array($op, ['approve', 'reject'], true)) fail('Үйлдэл тодорхойгүй.');
    $r = withdrawal_decide(in_int('id'), $op, in_str('note', 200));
    tg_sync('w', $r['row']);
    ok(['message' => $r['message']]);
}

function a_admin_words(): never
{
    require_admin();
    $search = normalize_word(mb_substr(qs('q'), 0, 30));
    $filter = qs('filter', 'all');
    $page   = max(1, (int)qs('page', '1'));
    $per    = 50;
    $off    = ($page - 1) * $per;
    $cond   = [];
    $p      = [];
    switch ($filter) {
        case 'answers':  $cond[] = 'is_answer = 1 AND is_active = 1'; break;
        case 'unused':   $cond[] = 'is_answer = 1 AND is_active = 1 AND used_count = 0'; break;
        case 'dict':     $cond[] = 'is_answer = 0'; break;
        case 'inactive': $cond[] = 'is_active = 0'; break;
    }
    if ($search !== '') {
        $cond[] = 'word LIKE ?';
        $p[] = '%' . addcslashes($search, '%_\\') . '%';
    }
    $where = $cond ? 'WHERE ' . implode(' AND ', $cond) : '';
    $total = num("SELECT COUNT(*) FROM words $where", $p);
    $list  = rows("SELECT id, word, CHAR_LENGTH(word) AS length, definition, is_answer, is_active, used_count, last_used_date, created_at FROM words $where ORDER BY id DESC LIMIT $per OFFSET $off", $p);
    foreach ($list as &$w) {
        $w['is_answer'] = (int)$w['is_answer'] === 1;
        $w['is_active'] = (int)$w['is_active'] === 1;
    }
    unset($w);
    $counts = row(
        "SELECT COUNT(*) AS total,
                COALESCE(SUM(is_answer = 1 AND is_active = 1), 0) AS answers,
                COALESCE(SUM(is_answer = 1 AND is_active = 1 AND used_count = 0), 0) AS unused,
                COALESCE(SUM(is_answer = 0), 0) AS dict,
                COALESCE(SUM(is_active = 0), 0) AS inactive
         FROM words"
    );
    $upcoming = rows(
        "SELECT dw.game_date, w.id AS word_id, w.word FROM daily_words dw JOIN words w ON w.id = dw.word_id
         WHERE dw.game_date >= ? AND dw.is_fixed = 1 AND dw.is_active = 1 ORDER BY dw.game_date ASC LIMIT 14",
        [today()]
    );
    ok([
        'words'    => $list,
        'total'    => $total,
        'page'     => $page,
        'pages'    => max(1, (int)ceil($total / $per)),
        'counts'   => array_map('intval', $counts ?? []),
        'upcoming' => $upcoming,
    ]);
}

function a_admin_words_add(): never
{
    require_admin();
    $text     = input()['text'] ?? '';
    $isAnswer = in_bool('is_answer') ? 1 : 0;
    if (!is_string($text) || trim($text) === '') fail('Үгсээ оруулна уу.');
    if (mb_strlen($text) > 100000) fail('Хэт урт байна. Хэсэгчлэн оруулна уу.');

    $added = 0;
    $dupes = 0;
    $bad   = [];
    $sep = '/\s*(?:—|–|:|\|)\s*|\s+-\s+/u';
    foreach (preg_split('/\r\n|\r|\n/u', $text) ?: [] as $line) {
        $line = trim($line);
        if ($line === '') continue;
        // "ҮГ - тайлбар" мөр эсвэл "ҮГ1, ҮГ2, ҮГ3" жагсаалт
        $entries = preg_match($sep, $line) ? [$line] : (preg_split('/[,;]/u', $line) ?: [$line]);
        foreach ($entries as $entry) {
            $entry = trim($entry);
            if ($entry === '') continue;
            $parts = preg_split($sep, $entry, 2) ?: [$entry];
            $word  = normalize_word($parts[0]);
            $def   = isset($parts[1]) ? clean_text($parts[1], 500) : '';
            $len   = wlen($word);
            if (!is_mn_word($word) || $len < 2 || $len > 12) {
                if (count($bad) < 30) $bad[] = mb_substr($entry, 0, 40);
                continue;
            }
            $st = q(
                "INSERT IGNORE INTO words (word, length, definition, is_answer, is_active, created_at) VALUES (?, ?, ?, ?, 1, NOW())",
                [$word, $len, $def, $isAnswer]
            );
            if ($st->rowCount() === 1) {
                $added++;
            } else {
                $dupes++;
                if ($def !== '') q("UPDATE words SET definition = ? WHERE word = ? AND definition = ''", [$def, $word]);
            }
        }
    }
    $msg = "{$added} үг нэмэгдлээ" . ($dupes ? ", {$dupes} давхардсан" : '') . ($bad ? ', ' . count($bad) . ' буруу' : '') . '.';
    ok(['message' => $msg, 'added' => $added, 'duplicates' => $dupes, 'invalid' => $bad]);
}

function a_admin_word(): never
{
    require_admin();
    $id = in_int('id');
    $op = in_str('op', 20);
    $w  = row("SELECT * FROM words WHERE id = ? LIMIT 1", [$id]);
    if (!$w) fail('Үг олдсонгүй.', 404);

    switch ($op) {
        case 'update':
            $in = input();
            $sets = [];
            $p = [];
            if (array_key_exists('is_active', $in)) { $sets[] = 'is_active = ?'; $p[] = in_bool('is_active') ? 1 : 0; }
            if (array_key_exists('is_answer', $in)) { $sets[] = 'is_answer = ?'; $p[] = in_bool('is_answer') ? 1 : 0; }
            if (array_key_exists('definition', $in)) { $sets[] = 'definition = ?'; $p[] = in_str('definition', 500); }
            if (!$sets) fail('Өөрчлөх зүйл алга.');
            $p[] = $id;
            q('UPDATE words SET ' . implode(', ', $sets) . ' WHERE id = ?', $p);
            ok(['message' => 'Хадгаллаа.']);
        case 'delete':
            if (val("SELECT 1 FROM daily_words WHERE word_id = ? LIMIT 1", [$id])
                || val("SELECT 1 FROM game_sessions WHERE word_id = ? LIMIT 1", [$id])
                || val("SELECT 1 FROM practice_sessions WHERE word_id = ? LIMIT 1", [$id])) {
                fail('Энэ үгийг хэрэглэгчид тоглосон тул устгах боломжгүй. Идэвхгүй болгоно уу.', 409);
            }
            q("DELETE FROM words WHERE id = ?", [$id]);
            ok(['message' => 'Устгалаа.']);
        case 'schedule':
            $date = in_str('date', 10);
            if (!valid_date($date) || $date < today()) fail('Өнөөдөр эсвэл ирээдүйн огноо сонгоно уу.');
            if ($date === today() && num("SELECT COUNT(*) FROM game_sessions WHERE game_date = ?", [$date]) > 0) {
                fail('Өнөөдөр хэрэглэгчдэд үг аль хэдийн оноогдсон тул маргаашаас эхлэн товлоно уу.', 409);
            }
            if ((int)$w['is_active'] !== 1) fail('Идэвхгүй үгийг товлох боломжгүй.');
            q(
                "INSERT INTO daily_words (word_id, game_date, is_active, is_fixed) VALUES (?, ?, 1, 1)
                 ON DUPLICATE KEY UPDATE word_id = VALUES(word_id), is_active = 1, is_fixed = 1",
                [$id, $date]
            );
            ok(['message' => "{$date}-нд БҮХ хэрэглэгчид «{$w['word']}» үг ирнэ."]);
        case 'unschedule':
            $date = in_str('date', 10);
            q("UPDATE daily_words SET is_fixed = 0, is_active = 0 WHERE game_date = ? AND word_id = ? AND game_date > ?", [$date, $id, today()]);
            ok(['message' => 'Товлолт цуцлагдлаа — тэр өдөр хүн бүрт санамсаргүй үг ирнэ.']);
        default:
            fail('Үйлдэл тодорхойгүй.');
    }
}

function a_admin_tournaments(): never
{
    require_admin();
    finalize_due_tournaments();
    $list = rows(
        "SELECT t.*, (SELECT COUNT(*) FROM tournament_entries te WHERE te.tournament_id = t.id AND te.score > 0) AS winners_count
         FROM tournaments t ORDER BY t.tournament_date DESC LIMIT 40"
    );
    ok(['tournaments' => $list, 'today' => today(), 'default_fee' => TOURNAMENT_FEE]);
}

function a_admin_tournament(): never
{
    require_admin();
    $op = in_str('op', 20);
    switch ($op) {
        case 'create':
            $date = in_str('date', 10);
            $fee  = in_int('fee', TOURNAMENT_FEE);
            if (!valid_date($date) || $date < today()) fail('Өнөөдөр эсвэл ирээдүйн огноо сонгоно уу.');
            if ($fee < 0 || $fee > 1000000) fail('Хураамж буруу байна.');
            $ex = row("SELECT * FROM tournaments WHERE tournament_date = ? LIMIT 1", [$date]);
            if ($ex) {
                if ($ex['status'] === 'finished') fail('Энэ өдрийн тэмцээн дууссан байна.', 409);
                if ((int)$ex['participant_count'] > 0 && (int)$ex['entry_fee'] !== $fee) fail('Оролцогчтой тэмцээний хураамжийг өөрчлөх боломжгүй.', 409);
                q("UPDATE tournaments SET entry_fee = ?, status = 'open' WHERE id = ?", [$fee, $ex['id']]);
                ok(['message' => 'Тэмцээн шинэчлэгдлээ.']);
            }
            q("INSERT INTO tournaments (tournament_date, entry_fee, status, created_at) VALUES (?, ?, 'open', NOW())", [$date, $fee]);
            ok(['message' => "{$date}-ний тэмцээн үүслээ."]);
        case 'finalize':
            $t = row("SELECT * FROM tournaments WHERE id = ? LIMIT 1", [in_int('id')]);
            if (!$t) fail('Тэмцээн олдсонгүй.', 404);
            if ((string)$t['tournament_date'] >= today()) fail('Тэмцээн өдөр нь дуусаагүй байна.', 409);
            finalize_tournament((int)$t['id']);
            ok(['message' => 'Тэмцээн дүгнэгдэж, шагнал олгогдлоо.']);
        case 'cancel':
            $t = row("SELECT * FROM tournaments WHERE id = ? LIMIT 1", [in_int('id')]);
            if (!$t) fail('Тэмцээн олдсонгүй.', 404);
            finalize_tournament((int)$t['id'], true);
            ok(['message' => 'Тэмцээн цуцлагдаж, хураамжууд буцаагдлаа.']);
        default:
            fail('Үйлдэл тодорхойгүй.');
    }
}

function a_admin_deposits(): never
{
    require_admin();
    try { telegram_poll(true); } catch (Throwable) { /* Telegram-гүйгээр ч жагсаалт харагдана */ }
    $status = qs('status', 'submitted');
    $where  = in_array($status, ['submitted', 'created', 'approved', 'rejected'], true) ? 'WHERE d.status = ?' : "WHERE d.status <> 'cancelled'";
    $list   = rows(
        "SELECT d.*, u.username, u.email, u.avatar_url, u.balance,
                (SELECT COALESCE(SUM(d2.amount), 0) FROM deposits d2 WHERE d2.user_id = d.user_id AND d2.status = 'approved') AS approved_total
         FROM deposits d JOIN users u ON u.id = d.user_id
         $where
         ORDER BY CASE d.status WHEN 'submitted' THEN 0 WHEN 'created' THEN 1 ELSE 2 END, d.id DESC
         LIMIT 150",
        str_contains($where, '?') ? [$status] : []
    );
    ok(['deposits' => $list]);
}

function a_admin_deposit(): never
{
    require_admin();
    $op = in_str('op', 10);
    if (!in_array($op, ['approve', 'reject'], true)) fail('Үйлдэл тодорхойгүй.');
    $amount = array_key_exists('amount', input()) ? in_int('amount') : null;
    $r = deposit_decide(in_int('id'), $op, $amount, in_str('note', 200));
    tg_sync('d', $r['row']);
    ok(['message' => $r['message']]);
}

function settings_admin_view(array $s): array
{
    $tok = (string)$s['telegram_bot_token'];
    $s['telegram_bot_token'] = '';
    $s['telegram_token_hint'] = $tok !== '' ? '••••' . substr($tok, -4) : '';
    $s['telegram_webhook_secret'] = '';
    $s['webhook_possible'] = str_starts_with(APP_URL, 'https://');
    $s['platform'] = PLATFORM;
    return $s;
}

function a_admin_settings(): never
{
    require_admin();
    ok(['settings' => settings_admin_view(settings(true)), 'banks' => BANKS, 'ready' => deposits_ready()]);
}

function a_admin_settings_save(): never
{
    require_admin();
    $in = input();
    $patch = [];
    if (array_key_exists('deposit_enabled', $in)) $patch['deposit_enabled'] = in_bool('deposit_enabled');
    if (array_key_exists('notify_withdrawals', $in)) $patch['notify_withdrawals'] = in_bool('notify_withdrawals');
    if (array_key_exists('deposit_bank', $in)) {
        $b = in_str('deposit_bank', 32);
        if ($b !== '' && !isset(BANKS[$b])) fail('Банк буруу байна.', 422);
        $patch['deposit_bank'] = $b;
    }
    if (array_key_exists('deposit_account_name', $in)) $patch['deposit_account_name'] = in_str('deposit_account_name', 100);
    if (array_key_exists('deposit_account_number', $in)) {
        $acc = preg_replace('/[\s\-]/', '', in_str('deposit_account_number', 40)) ?? '';
        if ($acc !== '' && !preg_match('/^\d{6,20}$/', $acc)) fail('Дансны дугаар зөвхөн тоо байна.', 422);
        $patch['deposit_account_number'] = $acc;
    }
    if (array_key_exists('deposit_iban', $in)) {
        $iban = strtoupper(preg_replace('/\s+/', '', in_str('deposit_iban', 40)) ?? '');
        if ($iban !== '' && !preg_match('/^MN\d{18}$/', $iban)) fail('IBAN буруу байна (MN + 18 оронтой тоо).', 422);
        $patch['deposit_iban'] = $iban;
    }
    if (array_key_exists('deposit_min', $in)) $patch['deposit_min'] = max(100, in_int('deposit_min', 1000));
    if (array_key_exists('deposit_max', $in)) $patch['deposit_max'] = max(1000, in_int('deposit_max', 1000000));
    if (isset($patch['deposit_min'], $patch['deposit_max']) && $patch['deposit_min'] > $patch['deposit_max']) {
        fail('Хамгийн бага дүн хамгийн их дүнгээс их байж болохгүй.', 422);
    }
    // Хоосон ирвэл хуучин token хэвээр үлдэнэ (UI-д token харагдахгүй)
    $tok = in_str('telegram_bot_token', 100);
    if ($tok !== '') {
        if (!preg_match('/^\d{5,15}:[A-Za-z0-9_-]{30,60}$/', $tok)) fail('Telegram bot token буруу хэлбэртэй байна.', 422);
        $patch['telegram_bot_token'] = $tok;
    }
    if (in_bool('telegram_clear')) $patch['telegram_bot_token'] = '';
    if (array_key_exists('telegram_admin_ids', $in)) {
        $ids = preg_replace('/\s+/', '', in_str('telegram_admin_ids', 200)) ?? '';
        if ($ids !== '' && !preg_match('/^\d{3,20}(,\d{3,20})*$/', $ids)) fail('Админы Telegram ID нь тоо байна (олон бол таслалаар).', 422);
        $patch['telegram_admin_ids'] = $ids;
    }
    if (array_key_exists('telegram_chat_id', $in)) {
        $chat = in_str('telegram_chat_id', 64);
        if ($chat !== '' && !preg_match('/^(-?\d{3,20}|@[A-Za-z0-9_]{5,64})$/', $chat)) fail('Chat ID буруу байна.', 422);
        $patch['telegram_chat_id'] = $chat;
    }
    $s = settings_save($patch);
    $warn = !empty($s['deposit_enabled']) && !deposits_ready($s) ? ' Цэнэглэлт идэвхжихийн тулд банк, эзэмшигчийн нэр, дансны дугаараа бөглөнө үү.' : '';
    ok(['message' => 'Тохиргоо хадгалагдлаа.' . $warn, 'settings' => settings_admin_view($s), 'ready' => deposits_ready($s)]);
}

function a_admin_telegram(): never
{
    require_admin();
    $op = in_str('op', 20);
    $s  = settings(true);
    switch ($op) {
        case 'find_chat':
            $chat = null;
            if ($s['telegram_mode'] !== 'webhook') {
                $r = telegram_call('getUpdates', ['limit' => 50, 'timeout' => 0, 'allowed_updates' => ['message', 'callback_query']]);
                if (empty($r['ok'])) fail('Telegram: ' . ($r['description'] ?? 'алдаа'), 502);
                foreach (array_reverse($r['result'] ?? []) as $upd) {
                    $m = $upd['message'] ?? null;
                    if (is_array($m) && isset($m['chat']['id']) && ($m['chat']['type'] ?? '') === 'private') {
                        $f = $m['from'] ?? [];
                        $chat = ['id' => (string)$m['chat']['id'], 'from' => (string)($f['id'] ?? $m['chat']['id']), 'name' => trim(($f['first_name'] ?? '') . ' ' . ($f['last_name'] ?? ''))];
                        break;
                    }
                }
            }
            if (!$chat) {
                $k = kv_get('tg_last_chat');
                $chat = $k ? json_decode($k, true) : null;
            }
            if (!is_array($chat) || empty($chat['id'])) fail('Мессеж олдсонгүй. Telegram-д өөрийн бот руугаа /start гэж бичээд дахин оролдоно уу.', 404);
            settings_save(['telegram_chat_id' => (string)$chat['id'], 'telegram_admin_ids' => (string)$chat['from']]);
            ok([
                'message'   => 'Chat ID олдлоо: ' . (($chat['name'] ?? '') !== '' ? $chat['name'] . ' · ' : '') . $chat['id'],
                'chat_id'   => (string)$chat['id'],
                'admin_ids' => (string)$chat['from'],
            ]);
        case 'test':
            if ($s['telegram_bot_token'] === '' || $s['telegram_chat_id'] === '') fail('Эхлээд bot token болон Chat ID-г тохируулна уу.', 422);
            $r = telegram_call('sendMessage', [
                'chat_id'    => $s['telegram_chat_id'],
                'text'       => "✅ <b>Үг Таа</b> — Telegram мэдэгдэл амжилттай тохируулагдлаа!\n🕒 " . date('Y-m-d H:i'),
                'parse_mode' => 'HTML',
            ]);
            if (empty($r['ok'])) fail('Telegram: ' . ($r['description'] ?? 'илгээж чадсангүй'), 502);
            ok(['message' => 'Тест мессеж илгээгдлээ. Telegram-аа шалгаарай!']);
        case 'webhook_on':
            if (!str_starts_with(APP_URL, 'https://')) fail('Webhook нь https хаягтай (жишээ нь Render) сервер дээр л ажиллана.', 422);
            if ($s['telegram_bot_token'] === '') fail('Эхлээд bot token-оо хадгална уу.', 422);
            $secret = bin2hex(random_bytes(24));
            $r = telegram_call('setWebhook', [
                'url'             => APP_URL . '/api.php?action=telegram_webhook',
                'secret_token'    => $secret,
                'allowed_updates' => ['message', 'callback_query'],
            ]);
            if (empty($r['ok'])) fail('Telegram: ' . ($r['description'] ?? 'webhook тохируулж чадсангүй'), 502);
            settings_save(['telegram_mode' => 'webhook', 'telegram_webhook_secret' => $secret]);
            ok(['message' => 'Webhook идэвхжлээ — Telegram-ийн товч шууд ажиллана.', 'mode' => 'webhook']);
        case 'webhook_off':
            if ($s['telegram_bot_token'] !== '') telegram_call('deleteWebhook', ['drop_pending_updates' => false]);
            settings_save(['telegram_mode' => 'poll', 'telegram_webhook_secret' => '']);
            ok(['message' => 'Автомат шалгалтын горимд шилжлээ.', 'mode' => 'poll']);
        case 'status':
            $info = $s['telegram_bot_token'] !== '' ? telegram_call('getWebhookInfo') : ['ok' => false];
            $w = is_array($info['result'] ?? null) ? $info['result'] : [];
            ok([
                'mode'          => $s['telegram_mode'],
                'webhook_url'   => (string)($w['url'] ?? ''),
                'pending'       => (int)($w['pending_update_count'] ?? 0),
                'last_error'    => (string)($w['last_error_message'] ?? ''),
                'last_error_at' => isset($w['last_error_date']) ? date('Y-m-d H:i', (int)$w['last_error_date']) : null,
            ]);
        default:
            fail('Үйлдэл тодорхойгүй.');
    }
}

/** Telegram webhook — Render мэт https сервер дээр товч дармагц шууд ажиллана */
function a_telegram_webhook(): never
{
    $s   = settings();
    $hdr = $_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? '';
    if ($s['telegram_webhook_secret'] === '' || !is_string($hdr) || !hash_equals((string)$s['telegram_webhook_secret'], $hdr)) {
        respond(['ok' => false], 403);
    }
    $upd = input();
    if ($upd) {
        try {
            telegram_handle_update($upd);
        } catch (Throwable $e) {
            error_log('[vgtaa] webhook: ' . $e->getMessage());
        }
    }
    respond(['ok' => true]);
}

function expected_columns(): array
{
    return [
        'users'              => ['id', 'google_id', 'email', 'username', 'avatar_url', 'balance', 'won_balance', 'referral_balance', 'referral_code', 'referred_by', 'is_premium', 'premium_expires_at', 'is_admin', 'is_banned', 'extra_plays', 'signup_ip', 'last_ip', 'last_seen_at', 'created_at'],
        'words'              => ['id', 'word', 'length', 'definition', 'is_answer', 'is_active', 'used_count', 'last_used_date'],
        'daily_words'        => ['id', 'word_id', 'game_date', 'is_active', 'is_fixed'],
        'practice_sessions'  => ['id', 'user_id', 'word_id', 'attempts', 'attempts_count', 'is_won', 'is_completed', 'created_at', 'completed_at'],
        'game_sessions'      => ['id', 'user_id', 'word_id', 'game_date', 'attempts', 'attempts_count', 'is_won', 'is_completed', 'reward_amount', 'reward_paid', 'created_at', 'completed_at'],
        'archive_sessions'   => ['id', 'user_id', 'game_date', 'word_id', 'attempts', 'attempts_count', 'is_won', 'is_completed', 'created_at', 'completed_at'],
        'transactions'       => ['id', 'user_id', 'type', 'amount', 'balance_before', 'balance_after', 'description', 'reference_id', 'created_at'],
        'referrals'          => ['id', 'referrer_id', 'referred_id', 'is_verified', 'bonus_paid', 'created_at'],
        'withdrawals'        => ['id', 'user_id', 'amount', 'bank_name', 'account_number', 'account_name', 'status', 'admin_note', 'tg_message_id', 'requested_at', 'processed_at'],
        'tournaments'        => ['id', 'tournament_date', 'entry_fee', 'status', 'participant_count', 'prize_pool', 'first_prize', 'second_prize', 'third_prize', 'finished_at'],
        'tournament_entries' => ['id', 'tournament_id', 'user_id', 'fee_paid', 'score', 'rank', 'prize_won', 'joined_at'],
        'app_kv'             => ['k', 'v', 'expires_at'],
        'deposits'           => ['id', 'user_id', 'amount', 'reference', 'status', 'admin_note', 'notified', 'tg_message_id', 'created_at', 'submitted_at', 'processed_at'],
    ];
}

function a_admin_health(): never
{
    require_admin();
    $checks = [];
    $add = function (string $label, string $value, bool $good) use (&$checks): void {
        $checks[] = ['label' => $label, 'value' => $value, 'ok' => $good];
    };
    $add('Апп хувилбар', APP_VERSION, true);
    $add('Платформ', ['vercel' => 'Vercel', 'render' => 'Render', 'shared' => 'Энгийн хостинг (InfinityFree г.м.)'][PLATFORM] . ' · ' . APP_URL, true);
    $add('JWT_SECRET', strlen(JWT_SECRET) >= 32 ? 'Тохируулсан' : 'Хэт богино / тохируулаагүй!', strlen(JWT_SECRET) >= 32);
    $add('PHP', PHP_VERSION, version_compare(PHP_VERSION, '8.1.0', '>='));
    foreach (['pdo_mysql', 'mbstring', 'openssl', 'curl'] as $ext) {
        $has = extension_loaded($ext);
        $add('PHP өргөтгөл: ' . $ext, $has ? 'байна' : 'алга', $has || $ext === 'curl');
    }
    $add('Цагийн бүс', date_default_timezone_get() . ' (UTC' . date('P') . ')', true);
    $dbNow = (string)val("SELECT NOW()");
    $add('MySQL цаг', $dbNow, abs((int)strtotime($dbNow) - time()) < 120);
    $add('MySQL хувилбар', (string)val("SELECT VERSION()"), true);
    $hasHeader = !empty($_SERVER['HTTP_AUTHORIZATION']) || !empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
    $add('Authorization header', $hasHeader ? 'PHP-д ирж байна' : 'хасагдаж байна (_token нөөц ашиглана)', true);

    $t0 = microtime(true);
    $certs = google_certs(true);
    $ms = (int)((microtime(true) - $t0) * 1000);
    $insecure = !empty($GLOBALS['http_insecure_fallback']);
    $add('Google түлхүүр татах', $certs ? count($certs) . " түлхүүр, {$ms}ms" . ($insecure ? ' (TLS шалгалтгүй)' : '') : 'амжилтгүй — нэвтрэлт tokeninfo-оор явна', (bool)$certs);

    $missing = [];
    $have = [];
    foreach (rows("SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()") as $r) {
        $have[strtolower((string)$r['t'])][strtolower((string)$r['c'])] = true;
    }
    foreach (expected_columns() as $table => $cols) {
        if (!isset($have[$table])) { $missing[] = $table; continue; }
        foreach ($cols as $c) if (!isset($have[$table][$c])) $missing[] = "$table.$c";
    }
    $st = settings(true);
    $add('Цэнэглэх данс', deposits_ready($st) ? (BANKS[$st['deposit_bank']] ?? $st['deposit_bank']) . ' · ' . $st['deposit_account_number'] : ($st['deposit_enabled'] ? 'Дутуу бөглөсөн' : 'Унтраалттай'), deposits_ready($st) || !$st['deposit_enabled']);
    $tgOk = $st['telegram_bot_token'] !== '' && $st['telegram_chat_id'] !== '';
    if ($tgOk && PLATFORM !== 'shared' && $st['telegram_mode'] !== 'webhook') {
        $add('Telegram горим', 'Энэ сервер дээр «Webhook» горимыг асаана уу (Тохиргоо таб)', false);
    }
    $add('Telegram мэдэгдэл', $tgOk ? 'Тохируулсан' : 'Тохируулаагүй (Тохиргоо таб)', $tgOk);
    if ($tgOk && $st['telegram_mode'] === 'webhook') {
        $info = telegram_call('getWebhookInfo')['result'] ?? [];
        $recentErr = isset($info['last_error_date']) && (int)$info['last_error_date'] > time() - 3600;
        $add('Telegram webhook', $recentErr ? 'Алдаа: ' . ($info['last_error_message'] ?? '?') . ' → «Автомат шалгалт» горимд шилжүүлнэ үү' : 'Хэвийн', !$recentErr);
    } elseif ($tgOk) {
        $add('Telegram товч', 'Автомат шалгалт (сайтад хандалт орох бүрт ' . TG_POLL_EVERY . ' сек тутам)', true);
    }
    $add('Мэдээллийн сангийн бүтэц', $missing ? 'Дутуу: ' . implode(', ', array_slice($missing, 0, 12)) . ' → setup.php ажиллуул' : 'Бүрэн', !$missing);
    ok(['checks' => $checks]);
}

/* ============================================================
   ROUTER
   ============================================================ */
$routes = [
    // нийтийн
    'config'            => ['GET',  'a_config'],
    'ping'              => ['GET',  'a_ping'],
    'google_login'      => ['POST', 'a_google_login'],
    // хэрэглэгч
    'me'                => ['GET',  'a_me'],
    'check_session'     => ['GET',  'a_me'],
    'daily'             => ['GET',  'a_daily'],
    'guess'             => ['POST', 'a_guess'],
    'stats'             => ['GET',  'a_stats'],
    'archive'           => ['GET',  'a_archive'],
    'archive_game'      => ['GET',  'a_archive_game'],
    'practice'          => ['GET',  'a_practice'],
    'practice_new'      => ['POST', 'a_practice_new'],
    'practice_guess'    => ['POST', 'a_practice_guess'],
    'leaderboard'       => ['GET',  'a_leaderboard'],
    'profile'           => ['GET',  'a_profile'],
    'wallet'            => ['GET',  'a_wallet'],
    'withdraw'          => ['POST', 'a_withdraw'],
    'referrals'         => ['GET',  'a_referrals'],
    'premium_buy'       => ['POST', 'a_premium_buy'],
    'deposit_info'      => ['GET',  'a_deposit_info'],
    'deposit_create'    => ['POST', 'a_deposit_create'],
    'deposit_submit'    => ['POST', 'a_deposit_submit'],
    'deposit_cancel'    => ['POST', 'a_deposit_cancel'],
    'tournament'        => ['GET',  'a_tournament'],
    'tournament_join'   => ['POST', 'a_tournament_join'],
    // админ
    'admin_overview'    => ['GET',  'a_admin_overview'],
    'admin_users'       => ['GET',  'a_admin_users'],
    'admin_user'        => ['POST', 'a_admin_user'],
    'admin_withdrawals' => ['GET',  'a_admin_withdrawals'],
    'admin_withdrawal'  => ['POST', 'a_admin_withdrawal'],
    'admin_words'       => ['GET',  'a_admin_words'],
    'admin_words_add'   => ['POST', 'a_admin_words_add'],
    'admin_word'        => ['POST', 'a_admin_word'],
    'admin_tournaments' => ['GET',  'a_admin_tournaments'],
    'admin_tournament'  => ['POST', 'a_admin_tournament'],
    'admin_health'      => ['GET',  'a_admin_health'],
    'admin_deposits'    => ['GET',  'a_admin_deposits'],
    'admin_deposit'     => ['POST', 'a_admin_deposit'],
    'admin_settings'    => ['GET',  'a_admin_settings'],
    'admin_settings_save' => ['POST', 'a_admin_settings_save'],
    'admin_telegram'    => ['POST', 'a_admin_telegram'],
    'telegram_webhook'  => ['POST', 'a_telegram_webhook'],
];

try {
    $action = $_GET['action'] ?? '';
    if (!is_string($action) || !isset($routes[$action])) fail('Тодорхойгүй үйлдэл.', 404);
    // Шинэ сервер дээр нууц түлхүүр тохируулаагүй бол token хуурамчаар үүсгэх боломжтой болно → ажиллахгүй
    if (strlen(JWT_SECRET) < 32 && !in_array($action, ['ping', 'config'], true)) {
        fail('Сервер тохируулагдаагүй байна: JWT_SECRET орчны хувьсагч (32+ тэмдэгт) шаардлагатай.', 503, ['code' => 'server_not_configured']);
    }
    [$method, $handler] = $routes[$action];
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== $method) fail('Хүсэлтийн төрөл буруу.', 405);
    // Telegram-д дарагдсан товчнуудыг ар талд шалгана (poll горим)
    if (!in_array($action, ['telegram_webhook', 'admin_telegram', 'ping'], true)) {
        after_response(function (): void { telegram_poll(); });
    }
    $handler();
} catch (ApiError $e) {
    respond(['success' => false, 'message' => $e->getMessage()] + $e->extra, $e->status);
} catch (PDOException $e) {
    error_log('[vgtaa] DB: ' . $e->getMessage());
    $code = (int)($e->errorInfo[1] ?? 0);
    if (in_array($code, [1054, 1146], true)) {
        respond(['success' => false, 'message' => 'Мэдээллийн сангийн шинэчлэлт хийгдээгүй байна. Админ setup.php-г ажиллуулна уу.', 'code' => 'schema_outdated'], 503);
    }
    respond(['success' => false, 'message' => 'Серверийн алдаа гарлаа. Дараа дахин оролдоно уу.'], 500);
} catch (Throwable $e) {
    error_log('[vgtaa] ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    respond(['success' => false, 'message' => 'Серверийн алдаа гарлаа. Дараа дахин оролдоно уу.'], 500);
}
