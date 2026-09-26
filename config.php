<?php
/**
 * Үг Таа — тохиргоо
 *
 * Нууц мэдээлэл (DB нууц үг, JWT түлхүүр) энд БИЧИГДЭХГҮЙ. Дараах дарааллаар уншина:
 *   1. Орчны хувьсагч (Render → Dashboard → Environment)
 *   2. config.secret.php (InfinityFree — энэ файлтай хамт хуулна)
 * Иймээс энэ файлыг GitHub-т хийхэд аюулгүй.
 */
if (!defined('VGTAA')) { http_response_code(403); exit; }

$__secret = is_file(__DIR__ . '/config.secret.php') ? (require __DIR__ . '/config.secret.php') : [];
$__env = static function (string $key, string $default = '') use ($__secret): string {
    $v = getenv($key);
    if (is_string($v) && $v !== '') return $v;
    return isset($__secret[$key]) ? (string)$__secret[$key] : $default;
};

/* ── Мэдээллийн сан ───────────────────────────────────────────────
 * InfinityFree: MySQL Databases хэсгийн мэдээлэл.
 * Render: гадны MySQL (Aiven, TiDB Cloud...) — ихэвчлэн DB_SSL=1, өөр порт.
 * DB_SSL_CA_PEM — CA сертификатын агуулгыг шууд орчны хувьсагчаар өгч болно. */
define('DB_HOST', $__env('DB_HOST', 'localhost'));
define('DB_PORT', (int)$__env('DB_PORT', '3306'));
define('DB_NAME', $__env('DB_NAME'));
define('DB_USER', $__env('DB_USER'));
define('DB_PASS', $__env('DB_PASS'));
define('DB_SSL', in_array(strtolower($__env('DB_SSL', '0')), ['1', 'true', 'yes', 'on'], true));
define('DB_SSL_CA', $__env('DB_SSL_CA'));
define('DB_SSL_CA_PEM', $__env('DB_SSL_CA_PEM'));

/* ── Google нэвтрэлт ─────────────────────────────────────────────── */
define('GOOGLE_CLIENT_ID', $__env('GOOGLE_CLIENT_ID', '399324970310-96ddmej2nge9r0qij35dr5eum2cll6g5.apps.googleusercontent.com'));

/* ── Нууц түлхүүрүүд ─────────────────────────────────────────────────
 * JWT_SECRET  — нэвтрэлтийн token гарын үсэг. Солих юм бол бүх хэрэглэгч
 *               дахин нэвтэрнэ (өөр асуудалгүй).
 * SETUP_KEY   — setup.php-г ажиллуулах түлхүүр:
 *               https://таны-домэйн/setup.php?key=ЭНЭ_ТҮЛХҮҮР
 */
define('JWT_SECRET', $__env('JWT_SECRET'));
define('SETUP_KEY',  $__env('SETUP_KEY'));

/* ── Ерөнхий ──────────────────────────────────────────────────────── */
/* Аль платформ дээр ажиллаж байгааг автоматаар танина */
define('PLATFORM', getenv('VERCEL') ? 'vercel' : (getenv('RENDER') ? 'render' : 'shared'));
$__autoUrl = (string)(getenv('RENDER_EXTERNAL_URL') ?: '');
if ($__autoUrl === '' && getenv('VERCEL_PROJECT_PRODUCTION_URL')) $__autoUrl = 'https://' . getenv('VERCEL_PROJECT_PRODUCTION_URL');
/* Хуваалцах холбоос, Telegram webhook-д ашиглана. Render/Vercel дээр тохируулаагүй бол автоматаар олно. */
define('APP_URL',      rtrim($__env('APP_URL', $__autoUrl !== '' ? $__autoUrl : 'https://vgtaa.fwh.is'), '/'));
define('APP_TIMEZONE', 'Asia/Ulaanbaatar');       // Өдрийн үг Монголын 00:00-д солигдоно
/* Proxy-ийн ард (Render, Vercel) хэрэглэгчийн жинхэнэ IP-г X-Forwarded-For-оос авна */
define('BEHIND_PROXY', in_array(strtolower($__env('BEHIND_PROXY', PLATFORM === 'shared' ? '0' : '1')), ['1', 'true', 'yes', 'on'], true));
unset($__autoUrl);
define('ALLOWED_ORIGINS', array_values(array_unique(array_filter(array_merge(
    [APP_URL, 'https://vgtaa.fwh.is', 'http://vgtaa.fwh.is'],
    array_map('trim', explode(',', $__env('EXTRA_ORIGINS')))   // Өөр домэйнээс API дуудах бол
)))));
define('TOKEN_TTL_DAYS', 30);
unset($__secret, $__env);

/** MySQL холболтын DSN (api.php, setup.php хоёулаа ашиглана) */
function vgtaa_dsn(): string
{
    return 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4';
}

/** SSL шаардсан гадны MySQL-д (Aiven, TiDB Cloud) зориулсан PDO тохиргоо */
function vgtaa_ssl_options(): array
{
    if (!DB_SSL) return [];
    $ca = DB_SSL_CA;
    if ($ca === '' && DB_SSL_CA_PEM !== '') {
        $ca = sys_get_temp_dir() . '/vgtaa-db-ca.pem';
        if (!is_file($ca) || md5_file($ca) !== md5(DB_SSL_CA_PEM)) @file_put_contents($ca, DB_SSL_CA_PEM);
    }
    if ($ca === '') {
        foreach (['/etc/ssl/certs/ca-certificates.crt', '/etc/pki/tls/certs/ca-bundle.crt', '/etc/ssl/cert.pem'] as $f) {
            if (is_file($f)) { $ca = $f; break; }
        }
    }
    $o = [PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT => true];
    if ($ca !== '') $o[PDO::MYSQL_ATTR_SSL_CA] = $ca;
    return $o;
}

/* ── Тоглоом ──────────────────────────────────────────────────────── */
define('MAX_ATTEMPTS', 5);          // Нэг үгэнд оролдох тоо
define('REQUIRE_VALID_WORD', false);// true бол зөвхөн толь бичигт (words хүснэгт) байгаа үгээр таана
define('PRACTICE_DAILY_FREE', 3);   // Энгийн хэрэглэгч өдөрт хэдэн дасгал тоглох вэ (Premium = хязгааргүй)

/* ── Мөнгөн шагнал ────────────────────────────────────────────────── */
define('REWARD_AMOUNT', 500);       // Өдрийн үгийг таасан шагнал (₮)
/* Оролдлогоос хамаарсан шагнал. Хоосон бол бүгд REWARD_AMOUNT.
 * Жишээ: [1 => 8000, 2 => 6000, 3 => 5000, 4 => 3000, 5 => 2000] */
define('REWARD_BY_ATTEMPT', [1 => 2000, 2 => 1000]);
define('PREMIUM_MULTIPLIER', 1);    // Premium хэрэглэгчийн шагналын үржвэр (1 = үржүүлэхгүй)
/* Өдөрт мөнгөн шагнал авах хүний дээд тоо (0 = хязгааргүй).
 * Хэн нэгэн хариултыг олон нийтэд тараавал зардал хэт өсөхөөс хамгаална. */
define('DAILY_WINNER_CAP', 10);

define('PREMIUM_PRICE', 20000);
define('PREMIUM_DAYS', 30);
define('PREMIUM_WEEK_PRICE', 6000);         // Туршиж үзэх 7 хоногийн Premium
define('PREMIUM_WEEK_DAYS', 7);
define('TOURNAMENT_FEE', 5000);
define('TOURNAMENT_SPLIT', [50, 30, 20]);   // 1, 2, 3-р байрны хувь (%)
define('TOURNAMENT_RAKE', 20);              // Хураамжийн хэдэн хувь сайтад үлдэх вэ (%). Үлдсэн нь шагналын санд
define('REFERRAL_BONUS', 2000);             // Урьсан найз анх удаа таахад өгөх урамшуулал
define('REFERRAL_UNLOCK', 15);              // Мөнгө татахад шаардлагатай баталгаажсан найз
/* ── v7: Тоглоомын төв ────────────────────────────────────────────
 * Мини тоглоомууд (Дүүжлүүр, Үг холих, Тайлбар таах, Blitz дасгал) мөнгөн шагналгүй —
 * зөвхөн оноо. Өдөрт MINI_DAILY_FREE үнэгүй, дараа нь тоглолт бүр MINI_PLAY_PRICE. Premium хязгааргүй. */
define('MINI_DAILY_FREE', 8);
define('MINI_PLAY_PRICE', 200);
define('HANGMAN_LIVES', 7);
define('ANAGRAM_TRIES', 3);
define('QUIZ_QUESTIONS', 10);
/* Сэжүүр: өдрийн үг / дасгалд нэг үсэг нээнэ. Өдрийн үгэнд ашиглавал мөнгөн шагнал, оноо авахгүй. */
define('HINT_PRICE', 500);
define('HINT_PRICE_PREMIUM', 250);
/* Blitz арена: 60 секундэд аль болох олон холимог үг тайлна. Оноотой тоглолтын хураамжаас
 * BLITZ_RAKE% сайтад үлдэж, үлдсэн нь маргааш нь шилдэг 3-т хуваарилагдана (үргэлж ашигтай). */
define('BLITZ_SECONDS', 60);
define('BLITZ_FEE', 1000);
define('BLITZ_RAKE', 25);
define('BLITZ_SPLIT', [50, 30, 20]);
define('BLITZ_PREMIUM_FREE', 1);            // Premium хэрэглэгч өдөрт хэдэн оноотой тоглолт үнэгүй
/* Дуэль: 1 vs 1 мөрийтэй Blitz. Ялагч хоёр мөрийн нийлбэрээс DUEL_RAKE%-ийг хасаад авна.
 * 24 цагт хэн ч хүлээж авахгүй бол мөрийг бүтнээр буцаана. */
define('DUEL_STAKES', [500, 1000, 2000, 5000, 10000]);
define('DUEL_RAKE', 10);
define('DUEL_EXPIRE_HOURS', 24);
define('DUEL_MAX_OPEN', 3);                 // Нэг хүн зэрэг хэдэн нээлттэй дуэль үүсгэж болох
/* Сэргээх: Дүүжлүүрт +2 амь, Үг холихт +1 оролдлого, Хос үгэнд +2 оролдлого (тоглоом бүрт нэг удаа) */
define('REVIVE_PRICE', 300);

define('MIN_WITHDRAWAL', 20000);
define('MAX_WITHDRAWAL', 2000000);

define('BANKS', [
    'Khan'     => 'Хаан банк',
    'Golomt'   => 'Голомт банк',
    'TDB'      => 'Худалдаа хөгжлийн банк',
    'State'    => 'Төрийн банк',
    'Xac'      => 'Хас банк',
    'Bogd'     => 'Богд банк',
    'Capitron' => 'Капитрон банк',
    'MBank'    => 'М банк',
    'Arig'     => 'Ариг банк',
    'TransDev' => 'Тээвэр хөгжлийн банк',
    'NIBank'   => 'Үндэсний хөрөнгө оруулалтын банк',
    'Chinggis' => 'Чингис хаан банк',
]);
