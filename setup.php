<?php
/**
 * ============================================================
 *  Үг Таа — суулгах / шинэчлэх (setup.php)
 * ============================================================
 *  Нээх:  https://таны-домэйн/setup.php?key=<config.php дахь SETUP_KEY>
 *
 *  • Дутуу хүснэгт, багана, индексийг нэмнэ (хуучин өгөгдөлд хүрэхгүй).
 *  • Хуучин тэмцээний сангийн алдааг засна.
 *  • Хүсвэл 140 монгол үгийг тайлбартай нь нэмнэ.
 *  • Хүсвэл тухайн имэйлтэй хэрэглэгчийг админ болгоно.
 *  Олон удаа ажиллуулж болно — аюулгүй.
 * ============================================================
 */
declare(strict_types=1);

define('VGTAA', true);
require __DIR__ . '/config.php';

error_reporting(E_ALL);
ini_set('display_errors', '0');
mb_internal_encoding('UTF-8');
date_default_timezone_set(APP_TIMEZONE);

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
header('X-Frame-Options: DENY');

function h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

function page(string $title, string $body): never
{
    echo '<!doctype html><html lang="mn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<meta name="robots" content="noindex"><title>' . h($title) . '</title><style>'
        . 'body{font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;background:#0b1020;color:#e8ecfb;margin:0;padding:24px}'
        . 'main{max-width:760px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}p.sub{color:#8f9bc4;margin:0 0 20px}'
        . '.card{background:#151d3b;border:1px solid #26335f;border-radius:14px;padding:18px;margin:14px 0}'
        . 'ul{list-style:none;padding:0;margin:0}li{padding:6px 0;border-bottom:1px solid #1f2a52;display:flex;gap:10px}li:last-child{border:0}'
        . '.ok{color:#4ade80}.warn{color:#fbbf24}.err{color:#f87171}.muted{color:#8f9bc4}'
        . 'label{display:flex;gap:10px;align-items:flex-start;margin:10px 0}input[type=email]{width:100%;padding:10px 12px;border-radius:10px;border:1px solid #334177;background:#0f1630;color:#fff;font:inherit}'
        . 'button{background:#e2394a;color:#fff;border:0;border-radius:12px;padding:12px 20px;font:600 15px system-ui;cursor:pointer}'
        . 'code{background:#0f1630;padding:2px 6px;border-radius:6px}</style></head><body><main>'
        . $body . '</main></body></html>';
    exit;
}

/* ── Хамгаалалт ───────────────────────────────────────────── */
$key = $_POST['key'] ?? $_GET['key'] ?? '';
$missing = [];
if (strlen(SETUP_KEY) < 12) $missing[] = 'SETUP_KEY';
if (strlen(JWT_SECRET) < 32) $missing[] = 'JWT_SECRET';
if (DB_NAME === '' || DB_USER === '') $missing[] = 'DB_HOST, DB_NAME, DB_USER, DB_PASS';
if ($missing) {
    // Шинэ сервер (Render/Vercel): юу тохируулахыг зааж, санамсаргүй утга санал болгоно
    http_response_code(503);
    page('Тохиргоо дутуу', '<h1>⚙️ Серверийн тохиргоо дутуу байна</h1>'
        . '<p class="sub">' . h(['vercel' => 'Vercel → Project → Settings → Environment Variables', 'render' => 'Render → Service → Environment', 'shared' => 'config.secret.php файл'][PLATFORM]) . ' хэсэгт дараахыг нэмээд дахин deploy хийнэ үү:</p>'
        . '<div class="card"><ul>' . implode('', array_map(fn(string $m): string => '<li class="warn">⚠️ ' . h($m) . '</li>', $missing)) . '</ul></div>'
        . '<div class="card"><b>Бэлэн санамсаргүй утгууд (хуулж ашиглаж болно):</b><ul>'
        . '<li><code>JWT_SECRET</code> = <code>' . h(rtrim(strtr(base64_encode(random_bytes(36)), '+/', '-_'), '=')) . '</code></li>'
        . '<li><code>SETUP_KEY</code> = <code>' . h(bin2hex(random_bytes(12))) . '</code></li></ul></div>');
}
if (!is_string($key) || !hash_equals(SETUP_KEY, $key)) {
    http_response_code(403);
    page('Хандах эрхгүй', '<h1>🔒 Хандах эрхгүй</h1><p class="sub">Энэ хуудсыг <code>setup.php?key=...</code> хэлбэрээр <code>SETUP_KEY</code>-ээр нээнэ.</p>');
}

try {
    $pdo = new PDO(
        vgtaa_dsn(),
        DB_USER,
        DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC] + vgtaa_ssl_options()
    );
    $pdo->exec("SET time_zone = '" . date('P') . "'");
} catch (PDOException $e) {
    page('DB алдаа', '<h1>Мэдээллийн сантай холбогдож чадсангүй</h1><div class="card err">' . h($e->getMessage()) . '</div><p class="muted">config.php доторх DB_HOST, DB_NAME, DB_USER, DB_PASS-г шалгана уу.</p>');
}

/* ── Туслах ───────────────────────────────────────────────── */
$log = [];
function say(string $kind, string $msg): void
{
    global $log;
    $log[] = [$kind, $msg];
}

function table_exists(PDO $pdo, string $t): bool
{
    $st = $pdo->prepare("SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?");
    $st->execute([$t]);
    return (bool)$st->fetchColumn();
}

function column_info(PDO $pdo, string $t, string $c): ?array
{
    $st = $pdo->prepare("SELECT DATA_TYPE, COLUMN_TYPE, COLLATION_NAME, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?");
    $st->execute([$t, $c]);
    $r = $st->fetch();
    return $r ?: null;
}

/** Тухайн баганууд дээр unique индекс байгаа эсэх (нэрээс үл хамааран) */
function has_index(PDO $pdo, string $t, array $cols, bool $unique): bool
{
    $st = $pdo->prepare("SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX");
    $st->execute([$t]);
    $idx = [];
    foreach ($st->fetchAll() as $r) {
        $idx[$r['INDEX_NAME']]['unique'] = (int)$r['NON_UNIQUE'] === 0;
        $idx[$r['INDEX_NAME']]['cols'][] = strtolower((string)$r['COLUMN_NAME']);
    }
    foreach ($idx as $i) {
        if ($unique && !$i['unique']) continue;
        if ($unique ? $i['cols'] === $cols : array_slice($i['cols'], 0, count($cols)) === $cols) return true;
    }
    return false;
}

function run(PDO $pdo, string $sql, string $okMsg, string $failMsg = ''): bool
{
    try {
        $pdo->exec($sql);
        say('ok', $okMsg);
        return true;
    } catch (PDOException $e) {
        say('warn', ($failMsg ?: $okMsg) . ' — ' . $e->getMessage());
        return false;
    }
}

/* ── Шинэчлэлтийн тодорхойлолт ────────────────────────────── */
$COLUMNS = [
    'users' => [
        'won_balance'        => 'INT NOT NULL DEFAULT 0',
        'referral_balance'   => 'INT NOT NULL DEFAULT 0',
        'referral_code'      => 'VARCHAR(16) NULL',
        'referred_by'        => 'INT UNSIGNED NULL',
        'is_premium'         => 'TINYINT(1) NOT NULL DEFAULT 0',
        'premium_expires_at' => 'DATETIME NULL',
        'is_admin'           => 'TINYINT(1) NOT NULL DEFAULT 0',
        'is_banned'          => 'TINYINT(1) NOT NULL DEFAULT 0',
        'plays_today'        => 'INT NOT NULL DEFAULT 0',
        'last_play_date'     => 'DATE NULL',
        'extra_plays'        => 'INT NOT NULL DEFAULT 0',
        'signup_ip'          => 'VARCHAR(45) NULL',
        'last_ip'            => 'VARCHAR(45) NULL',
        'last_seen_at'       => 'DATETIME NULL',
        'created_at'         => 'DATETIME NULL DEFAULT CURRENT_TIMESTAMP',
        'updated_at'         => 'DATETIME NULL DEFAULT CURRENT_TIMESTAMP',
    ],
    'words' => [
        'length'         => 'TINYINT UNSIGNED NOT NULL DEFAULT 0',
        'definition'     => "VARCHAR(500) NOT NULL DEFAULT ''",
        'is_answer'      => 'TINYINT(1) NOT NULL DEFAULT 1',
        'is_active'      => 'TINYINT(1) NOT NULL DEFAULT 1',
        'used_count'     => 'INT NOT NULL DEFAULT 0',
        'last_used_date' => 'DATE NULL',
        'created_at'     => 'DATETIME NULL DEFAULT CURRENT_TIMESTAMP',
    ],
    'daily_words' => [
        'is_active' => 'TINYINT(1) NOT NULL DEFAULT 1',
        'is_fixed'  => 'TINYINT(1) NOT NULL DEFAULT 0',
    ],
    'deposits' => [
        'tg_message_id' => 'BIGINT NULL',
    ],
    'game_sessions' => [
        'attempts'       => 'TEXT NULL',
        'attempts_count' => 'TINYINT UNSIGNED NOT NULL DEFAULT 0',
        'is_won'         => 'TINYINT(1) NOT NULL DEFAULT 0',
        'is_completed'   => 'TINYINT(1) NOT NULL DEFAULT 0',
        'reward_amount'  => 'INT NOT NULL DEFAULT 0',
        'reward_paid'    => 'TINYINT(1) NOT NULL DEFAULT 0',
        'hints'          => 'VARCHAR(64) NULL',
        'created_at'     => 'DATETIME NULL DEFAULT CURRENT_TIMESTAMP',
        'completed_at'   => 'DATETIME NULL',
    ],
    'practice_sessions' => [
        'hints' => 'VARCHAR(64) NULL',
    ],
    'transactions' => [
        'balance_before' => 'INT NOT NULL DEFAULT 0',
        'balance_after'  => 'INT NOT NULL DEFAULT 0',
        'description'    => "VARCHAR(255) NOT NULL DEFAULT ''",
        'reference_id'   => 'INT UNSIGNED NULL',
        'created_at'     => 'DATETIME NULL DEFAULT CURRENT_TIMESTAMP',
    ],
    'referrals' => [
        'is_verified' => 'TINYINT(1) NOT NULL DEFAULT 0',
        'bonus_paid'  => 'TINYINT(1) NOT NULL DEFAULT 0',
        'created_at'  => 'DATETIME NULL DEFAULT CURRENT_TIMESTAMP',
    ],
    'withdrawals' => [
        'status'       => "VARCHAR(16) NOT NULL DEFAULT 'pending'",
        'admin_note'   => 'VARCHAR(255) NULL',
        'tg_message_id' => 'BIGINT NULL',
        'requested_at' => 'DATETIME NULL DEFAULT CURRENT_TIMESTAMP',
        'processed_at' => 'DATETIME NULL',
    ],
    'tournaments' => [
        'status'            => "VARCHAR(16) NOT NULL DEFAULT 'open'",
        'participant_count' => 'INT NOT NULL DEFAULT 0',
        'prize_pool'        => 'INT NOT NULL DEFAULT 0',
        'first_prize'       => 'INT NOT NULL DEFAULT 0',
        'second_prize'      => 'INT NOT NULL DEFAULT 0',
        'third_prize'       => 'INT NOT NULL DEFAULT 0',
        'finished_at'       => 'DATETIME NULL',
        'created_at'        => 'DATETIME NULL DEFAULT CURRENT_TIMESTAMP',
    ],
    'tournament_entries' => [
        'fee_paid'  => 'INT NOT NULL DEFAULT 0',
        'score'     => 'INT NOT NULL DEFAULT 0',
        'rank'      => 'INT NULL',
        'prize_won' => 'INT NOT NULL DEFAULT 0',
        'joined_at' => 'DATETIME NULL DEFAULT CURRENT_TIMESTAMP',
    ],
];

$INDEXES = [
    // [хүснэгт, баганууд, unique, нэр]
    ['users',              ['email'],                    true,  'uq_users_email'],
    ['users',              ['google_id'],                true,  'uq_users_google'],
    ['users',              ['referral_code'],            true,  'uq_users_refcode'],
    ['users',              ['referred_by'],              false, 'idx_users_referred_by'],
    ['users',              ['signup_ip'],                false, 'idx_users_signup_ip'],
    ['words',              ['word'],                     true,  'uq_words_word'],
    ['words',              ['is_active', 'is_answer', 'used_count'], false, 'idx_words_pick'],
    ['daily_words',        ['game_date'],                true,  'uq_daily_date'],
    ['game_sessions',      ['user_id', 'game_date'],     true,  'uq_sessions_user_date'],
    ['game_sessions',      ['game_date', 'is_won'],      false, 'idx_sessions_date'],
    ['transactions',       ['user_id', 'created_at'],    false, 'idx_tx_user'],
    ['transactions',       ['type', 'created_at'],       false, 'idx_tx_type'],
    ['referrals',          ['referred_id'],              true,  'uq_referrals_referred'],
    ['referrals',          ['referrer_id', 'is_verified'], false, 'idx_referrals_referrer'],
    ['withdrawals',        ['status', 'requested_at'],   false, 'idx_withdrawals_status'],
    ['withdrawals',        ['user_id'],                  false, 'idx_withdrawals_user'],
    ['tournaments',        ['tournament_date'],          true,  'uq_tournaments_date'],
    ['tournament_entries', ['tournament_id', 'user_id'], true,  'uq_entries_user'],
    ['mini_sessions',      ['user_id', 'game', 'is_completed'], false, 'idx_mini_open'],
    ['blitz_runs',         ['run_date', 'ranked', 'score'], false, 'idx_blitz_day'],
    ['duels',              ['code'],                     true,  'uq_duels_code'],
    ['duels',              ['status', 'created_at'],     false, 'idx_duels_status'],
];

/* ── 140 монгол үг (тайлбартай) ───────────────────────────── */
$SEED = [
    'НОХОЙ' => 'Хүний үнэнч найз, гэрийн тэжээвэр амьтан.',
    'ГЭРЭЛ' => 'Харанхуйг гэрэлтүүлэх туяа.',
    'ЦЭЦЭГ' => 'Ургамлын өнгө өнгийн дэлбээтэй хэсэг.',
    'ШАГАЙ' => 'Хонины шилбэний яс; түүгээр тоглодог ардын тоглоом.',
    'ГУТАЛ' => 'Хөлд өмсдөг өмсгөл.',
    'ТЭМЭЭ' => 'Говийн хоёр бөхт мал.',
    'ЗАГАС' => 'Усанд амьдардаг, хайрстай амьтан.',
    'ШУВУУ' => 'Өд, далавчтай, нисдэг амьтан.',
    'БОРОО' => 'Үүлнээс дусаж унах ус.',
    'САЛХИ' => 'Агаарын хөдөлгөөн, урсгал.',
    'ШОРОО' => 'Газрын хөрс, тоос.',
    'ЧУЛУУ' => 'Хатуу эрдэс биет.',
    'ШИРЭЭ' => 'Дээр нь юм тавьдаг тавилга.',
    'ТАВАГ' => 'Хоол хийдэг хавтгай сав.',
    'ХУТГА' => 'Юм зүсэж огтолдог иртэй багаж.',
    'ХАМАР' => 'Үнэр мэдэрдэг эрхтэн.',
    'ХӨДӨӨ' => 'Хотоос алслагдсан нутаг.',
    'ТАЙГА' => 'Хойд зүгийн шилмүүст ой.',
    'ХАВАР' => 'Өвлийн дараах улирал.',
    'НАМАР' => 'Зуны дараах улирал.',
    'ӨГЛӨӨ' => 'Өдрийн эхэн үе.',
    'ДОЛОО' => 'Зургаагийн дараах тоо.',
    'ГУРАВ' => 'Хоёрын дараах тоо.',
    'ДӨРӨВ' => 'Гурвын дараах тоо.',
    'УЛААН' => 'Цусны өнгө.',
    'ЯГААН' => 'Улаан, цагаан хоёрын холимог өнгө.',
    'АЛТАН' => 'Алтаар хийсэн; алт шиг шаргал.',
    'МӨНГӨ' => 'Үнэт цагаан металл; төлбөрийн хэрэгсэл.',
    'ТӨМӨР' => 'Бат бөх саарал металл.',
    'ИНЭЭД' => 'Баяр хөөрийн илэрхийлэл.',
    'БҮЖИГ' => 'Хөгжмийн хэмнэлээр хөдлөх урлаг.',
    'ЗУРАГ' => 'Зурж, будаж дүрсэлсэн бүтээл.',
    'ТООНО' => 'Гэрийн оройн дугуй цонх.',
    'ТУЛГА' => 'Гэрийн голомт; тогоо тавих тавиур.',
    'АЙРАГ' => 'Гүүний сүүг бүлж исгэсэн ундаа.',
    'ТАРАГ' => 'Исгэсэн сүү.',
    'ГУРИЛ' => 'Үр тарианы нунтаг.',
    'БУДАА' => 'Үр тарианы хальсалсан үр.',
    'ЧИХЭР' => 'Амтат зууш.',
    'ХАДАГ' => 'Хүндэтгэлийн ёслолд барьдаг торгон даавуу.',
    'ЭМЭЭЛ' => 'Морины нуруун дээр тохдог суудал.',
    'ЖОЛОО' => 'Морь залах хазаарын оосор.',
    'ТЭРЭГ' => 'Дугуйтай тээврийн хэрэгсэл.',
    'МАШИН' => 'Хөдөлгүүртэй тээврийн хэрэгсэл.',
    'ОНГОЦ' => 'Агаарт нисдэг тээврийн хэрэгсэл.',
    'ЦЭРЭГ' => 'Эх орноо хамгаалагч.',
    'ХАТАН' => 'Хааны гэргий.',
    'ЭРДЭМ' => 'Сурч мэдсэн мэдлэг.',
    'УХААН' => 'Бодож сэтгэх чадвар.',
    'САНАА' => 'Толгойд төрсөн бодол.',
    'ЗОРИГ' => 'Айдсыг даван туулах чадвар.',
    'ИТГЭЛ' => 'Хэн нэгэнд найдах сэтгэл.',
    'ХУДАЛ' => 'Үнэн биш үг.',
    'ЗАЛУУ' => 'Нас бага, эрч хүчтэй.',
    'ЖИЖИГ' => 'Хэмжээ бага.',
    'ӨНДӨР' => 'Доороос дээш хол.',
    'УДААН' => 'Хурдан биш; их хугацаагаар.',
    'ЦЭВЭР' => 'Бохир биш.',
    'ТАХИА' => 'Өндөг гаргадаг гэрийн шувуу.',
    'НУГАС' => 'Усанд сэлдэг шувуу.',
    'ГАХАЙ' => 'Арван хоёр жилийн сүүлчийнх нь.',
    'МОГОЙ' => 'Хөлгүй мөлхөгч амьтан.',
    'ИЛЖИГ' => 'Урт чихтэй, морьтой төстэй амьтан.',
    'МЯНГА' => 'Арван зуу.',
    'ХАГАС' => 'Бүхлийн тал.',
    'ЭРҮҮЛ' => 'Өвчин зовлонгүй.',
    'НАРАН' => 'Нар (яруу найргийн хэлбэр).',
    'САРАН' => 'Сар (яруу найргийн хэлбэр).',
    'ДОМБО' => 'Цай хийдэг хошуутай сав.',
    'ТОГОО' => 'Хоол чанадаг том сав.',
    'ХУРГА' => 'Хонины төл.',
    'ТУГАЛ' => 'Үхрийн төл.',
    'УНАГА' => 'Адууны төл.',
    'БОТГО' => 'Тэмээний төл.',
    'ИШИГ'  => 'Ямааны төл.',
    'ГОВЬ'  => 'Монголын өмнөд хэсгийн цөлөрхөг нутаг.',
    'МОРЬ'  => 'Монгол хүний хөлөг.',
    'ХОНЬ'  => 'Ноостой гэрийн мал.',
    'ЯМАА'  => 'Ноолуур өгдөг мал.',
    'ҮНЭЭ'  => 'Сүү өгдөг эм үхэр.',
    'ЧОНО'  => 'Тал нутгийн махчин амьтан.',
    'ҮНЭГ'  => 'Зальтай, шар үстэй амьтан.',
    'НУУР'  => 'Эргэн тойрондоо хуурай газартай их ус.',
    'БУУЗ'  => 'Махан дотортой жигнэсэн хоол.',
    'ХУУР'  => 'Чавхдаст хөгжмийн зэмсэг.',
    'ДЭЭЛ'  => 'Монгол үндэсний хувцас.',
    'ТАЛХ'  => 'Гурилаар жигнэсэн хүнс.',
    'НАЙЗ'  => 'Дотно ойр хүн.',
    'ЗҮРХ'  => 'Цус шахдаг эрхтэн.',
    'ХАЙР'  => 'Халуун сэтгэл.',
    'БАЯР'  => 'Баясгалан, баяр ёслол.',
    'ЦОНХ'  => 'Гэрэл оруулах нүх.',
    'ЦААС'  => 'Бичиг бичдэг хуудас.',
    'АЛИМ'  => 'Дугуй хэлбэртэй жимс.',
    'МУУР'  => 'Хулгана барьдаг гэрийн амьтан.',
    'ЗААН'  => 'Хоншоортой том амьтан.',
    'БУГА'  => 'Том эвэртэй ойн амьтан.',
    'БААТАР'  => 'Зоригт эр.',
    'НААДАМ'  => 'Эрийн гурван наадам.',
    'ТЭНГЭР'  => 'Дээр харагдах цэнхэр огторгуй.',
    'АРСЛАН'  => 'Араатан амьтдын хаан.',
    'ТУУЛАЙ'  => 'Урт чихтэй, хурдан амьтан.',
    'БҮРГЭД'  => 'Махчин том шувуу.',
    'МАЛГАЙ'  => 'Толгойд өмсдөг хувцас.',
    'ХААЛГА'  => 'Орох гарах хаалт.',
    'САНДАЛ'  => 'Суудаг тавилга.',
    'ХУВЦАС'  => 'Биеийн өмсгөл.',
    'ТОЛГОЙ'  => 'Биеийн дээд хэсэг.',
    'ХҮҮХЭД'  => 'Бага насны хүн.',
    'ГУДАМЖ'  => 'Хотын зам.',
    'ЭРДЭНЭ'  => 'Үнэт чулуу, эрдэнэс.',
    'ДЭВТЭР'  => 'Бичдэг хуудастай ном.',
    'ХИЧЭЭЛ'  => 'Сургуульд заадаг зүйл.',
    'ОЮУТАН'  => 'Их сургуульд суралцагч.',
    'МАЛЧИН'  => 'Мал маллагч.',
    'ТОГООЧ'  => 'Хоол хийгч.',
    'ЖОЛООЧ'  => 'Машин жолоодогч.',
    'СЭТГЭЛ'  => 'Дотоод ертөнц, мэдрэмж.',
    'ЖАРГАЛ'  => 'Аз жаргал.',
    'ХАЛУУН'  => 'Их дулаан.',
    'ХҮЙТЭН'  => 'Дулаан биш.',
    'ДУЛААН'  => 'Хүйтэн биш.',
    'ХУРДАН'  => 'Удаан биш.',
    'ЛУУВАН'  => 'Улбар шар өнгөтэй хүнсний ногоо.',
    'ААРУУЛ'  => 'Хатаасан ээдэм.',
    'БӨМБӨГ'  => 'Дугуй тоглоом.',
    'НОГООН'  => 'Өвсний өнгө.',
    'ЦАГААН'  => 'Цасны өнгө.',
    'ЦЭНХЭР'  => 'Тэнгэрийн өнгө.',
    'ХӨГЖИМ'  => 'Аялгуу эгшиг.',
    'ГОЛОМТ'  => 'Гэрийн гал; гэр бүлийн төв.',
    'БАГАНА'  => 'Гэрийн тооно тулах тулгуур.',
    'ХАЛБАГА' => 'Хоол хутгадаг хэрэгсэл.',
    'ДЭЛГҮҮР' => 'Бараа худалдах газар.',
    'ЭМНЭЛЭГ' => 'Өвчтөн эмчилдэг газар.',
    'ТОГЛООМ' => 'Хөгжилдөж тоглох зүйл.',
    'ХУУШУУР' => 'Махан дотортой шарсан хоол.',
    'ХУЛГАНА' => 'Жижиг мэрэгч амьтан.',
    'СОНГИНО' => 'Хурц амттай ногоо.',
    'СУРГУУЛЬ' => 'Хүүхэд суралцдаг газар.',
];

/* ── Одоогийн байдал ──────────────────────────────────────── */
function status_summary(PDO $pdo, array $COLUMNS): array
{
    $missing = [];
    foreach (['users', 'words', 'daily_words', 'game_sessions', 'archive_sessions', 'transactions', 'referrals', 'withdrawals', 'tournaments', 'tournament_entries', 'app_kv', 'deposits', 'practice_sessions', 'mini_sessions', 'blitz_runs', 'duels'] as $t) {
        if (!table_exists($pdo, $t)) {
            $missing[] = $t . ' (хүснэгт)';
            continue;
        }
        foreach (array_keys($COLUMNS[$t] ?? []) as $c) {
            if (!column_info($pdo, $t, $c)) $missing[] = "$t.$c";
        }
    }
    return $missing;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method !== 'POST') {
    $missing = status_summary($pdo, $COLUMNS);
    $wordCount = table_exists($pdo, 'words') ? (int)$pdo->query("SELECT COUNT(*) FROM words")->fetchColumn() : 0;
    $body = '<h1>🧩 Үг Таа — суулгах / шинэчлэх</h1><p class="sub">Хувилбар 6.2 · ' . h(DB_NAME) . '</p>';
    $body .= '<div class="card"><b>Одоогийн байдал</b><ul>';
    $body .= $missing
        ? '<li class="warn">⚠️ Дутуу: ' . h(implode(', ', $missing)) . '</li>'
        : '<li class="ok">✅ Бүтэц бүрэн байна</li>';
    $body .= '<li>📚 Үгийн сан: <b>' . $wordCount . '</b> үг</li></ul></div>';
    $body .= '<form method="post" class="card"><input type="hidden" name="key" value="' . h($key) . '">'
        . '<label><input type="checkbox" name="seed" value="1"' . ($wordCount < 30 ? ' checked' : '') . '><span>140 монгол үгийг тайлбартай нь нэмэх <span class="muted">(байгаа үгсийг давхардуулахгүй)</span></span></label>'
        . '<label style="display:block"><span>Админ болгох имэйл <span class="muted">(заавал биш — тухайн хүн нэг удаа нэвтэрсэн байх ёстой)</span></span>'
        . '<input type="email" name="admin_email" placeholder="name@gmail.com"></label>'
        . '<p><button type="submit">Шинэчлэлт ажиллуулах</button></p>'
        . '<p class="muted">Хуучин өгөгдөл устахгүй. Дууссаны дараа setup.php-г серверээс устгахыг зөвлөж байна.</p></form>';
    page('Үг Таа — setup', $body);
}

/* ── 1. Хүснэгтүүд ────────────────────────────────────────── */
$schema = @file_get_contents(__DIR__ . '/schema.sql');
if (!is_string($schema) || $schema === '') {
    say('err', 'schema.sql файл олдсонгүй — setup.php-тэй нэг хавтсанд байршуулна уу.');
} else {
    $schema = preg_replace('/^\s*--.*$/m', '', $schema) ?? '';
    foreach (array_filter(array_map('trim', explode(';', $schema))) as $stmt) {
        if (!preg_match('/CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?/i', $stmt, $m)) continue;
        $existed = table_exists($pdo, $m[1]);
        try {
            $pdo->exec($stmt);
            if (!$existed) say('ok', "Хүснэгт үүслээ: {$m[1]}");
        } catch (PDOException $e) {
            say('err', "Хүснэгт {$m[1]}: " . $e->getMessage());
        }
    }
    say('ok', 'Хүснэгтүүд шалгагдлаа.');
}

/* ── 2. Дутуу баганууд ────────────────────────────────────── */
$added = 0;
foreach ($COLUMNS as $t => $cols) {
    if (!table_exists($pdo, $t)) continue;
    foreach ($cols as $c => $def) {
        if (column_info($pdo, $t, $c)) continue;
        if (run($pdo, "ALTER TABLE `$t` ADD COLUMN `$c` $def", "Багана нэмэгдлээ: $t.$c")) $added++;
    }
}
if (!$added) say('ok', 'Бүх багана байна.');

/* ── 3. Төрөл засах ───────────────────────────────────────── */
$enumFixes = [
    ['transactions', 'type',   "VARCHAR(32) NOT NULL DEFAULT ''"],
    ['withdrawals',  'status', "VARCHAR(16) NOT NULL DEFAULT 'pending'"],
    ['tournaments',  'status', "VARCHAR(16) NOT NULL DEFAULT 'open'"],
];
foreach ($enumFixes as [$t, $c, $def]) {
    $ci = table_exists($pdo, $t) ? column_info($pdo, $t, $c) : null;
    if ($ci && strtolower((string)$ci['DATA_TYPE']) === 'enum') {
        run($pdo, "ALTER TABLE `$t` MODIFY `$c` $def", "$t.$c → VARCHAR (шинэ төрлүүдийг хадгална)");
    }
}
$wc = table_exists($pdo, 'words') ? column_info($pdo, 'words', 'word') : null;
if ($wc && (string)$wc['COLLATION_NAME'] !== 'utf8mb4_bin') {
    run($pdo, "ALTER TABLE words MODIFY word VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL",
        'words.word → utf8mb4_bin (Е/Ё, И/Й-г ялгана)');
}

/* ── 4. Индексүүд ─────────────────────────────────────────── */
foreach ($INDEXES as [$t, $cols, $unique, $name]) {
    if (!table_exists($pdo, $t)) continue;
    foreach ($cols as $c) if (!column_info($pdo, $t, $c)) continue 2;
    if (has_index($pdo, $t, $cols, $unique)) continue;
    $colSql = implode(', ', array_map(fn(string $c): string => "`$c`", $cols));
    run($pdo, "ALTER TABLE `$t` ADD " . ($unique ? 'UNIQUE ' : '') . "INDEX `$name` ($colSql)",
        "Индекс нэмэгдлээ: $t($colSql)",
        "Индекс нэмж чадсангүй $t($colSql) — давхардсан өгөгдөл байж магадгүй");
}

/* ── 5. Өгөгдөл засвар ────────────────────────────────────── */
try {
    $n = $pdo->exec("UPDATE words SET length = CHAR_LENGTH(word) WHERE length = 0 OR length IS NULL");
    if ($n) say('ok', "words.length нөхөгдлөө ($n)");

    $n = $pdo->exec("UPDATE words SET word = UPPER(TRIM(word)) WHERE word <> UPPER(TRIM(word))");
    if ($n) say('ok', "Үгсийг том үсэг болголоо ($n)");

    // Хуучин тэмцээн: хэн хураамж төлснийг гүйлгээнээс сэргээнэ
    $n = $pdo->exec(
        "UPDATE tournament_entries te
         JOIN transactions tr ON tr.user_id = te.user_id AND tr.reference_id = te.tournament_id
                              AND tr.type = 'tournament' AND tr.amount < 0
         SET te.fee_paid = -tr.amount
         WHERE te.fee_paid = 0"
    );
    if ($n) say('ok', "Хуучин тэмцээний хураамж сэргээгдлээ ($n)");

    // Хуучин алдаа: Premium хэрэглэгч төлөөгүй ч сан өсдөг байсан → бодит төлбөрөөр дахин тооцно
    $n = $pdo->exec(
        "UPDATE tournaments t
         SET t.prize_pool = (SELECT COALESCE(SUM(te.fee_paid), 0) FROM tournament_entries te WHERE te.tournament_id = t.id),
             t.participant_count = (SELECT COUNT(*) FROM tournament_entries te WHERE te.tournament_id = t.id)
         WHERE t.status <> 'finished'"
    );
    if ($n) say('ok', "Тэмцээний шагналын санг бодит төлбөрөөр засав ($n)");

    $n = $pdo->exec("UPDATE users SET is_premium = 0 WHERE is_premium = 1 AND premium_expires_at IS NOT NULL AND premium_expires_at < NOW()");
    if ($n) say('ok', "Хугацаа нь дууссан Premium-ийг унтраав ($n)");
} catch (PDOException $e) {
    say('warn', 'Өгөгдөл засвар: ' . $e->getMessage());
}

/* ── 6. Үг нэмэх ──────────────────────────────────────────── */
if (!empty($_POST['seed'])) {
    $st = $pdo->prepare("INSERT IGNORE INTO words (word, length, definition, is_answer, is_active, created_at) VALUES (?, ?, ?, 1, 1, NOW())");
    $cnt = 0;
    foreach ($SEED as $w => $d) {
        $st->execute([$w, mb_strlen($w), $d]);
        $cnt += $st->rowCount();
    }
    say('ok', "Үгийн сан: $cnt шинэ үг нэмэгдлээ (" . (count($SEED) - $cnt) . ' нь өмнө байсан).');
}

/* ── 7. Админ ─────────────────────────────────────────────── */
$email = trim((string)($_POST['admin_email'] ?? ''));
if ($email !== '') {
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        say('warn', 'Имэйл буруу байна.');
    } else {
        $st = $pdo->prepare("UPDATE users SET is_admin = 1 WHERE email = ?");
        $st->execute([mb_strtolower($email)]);
        $st->rowCount()
            ? say('ok', $email . ' админ боллоо.')
            : say('warn', $email . ' хэрэглэгч олдсонгүй (эсвэл аль хэдийн админ). Эхлээд сайтад нэг удаа нэвтэрнэ үү.');
    }
}

/* ── 8. Эцсийн шалгалт ────────────────────────────────────── */
$missing = status_summary($pdo, $COLUMNS);
$missing
    ? say('err', 'Дутуу хэвээр: ' . implode(', ', $missing))
    : say('ok', 'Бүтэц бүрэн. Бэлэн боллоо! 🎉');

$icons = ['ok' => '✅', 'warn' => '⚠️', 'err' => '❌'];
$list = '';
foreach ($log as [$k, $m]) $list .= '<li class="' . $k . '"><span>' . $icons[$k] . '</span><span>' . h($m) . '</span></li>';
page('Үг Таа — setup', '<h1>🧩 Шинэчлэлтийн үр дүн</h1><p class="sub">' . date('Y-m-d H:i') . '</p><div class="card"><ul>' . $list . '</ul></div>'
    . '<p><a href="./" style="color:#8fb4ff">← Сайт руу буцах</a></p>'
    . '<p class="muted">Аюулгүй байдлын үүднээс setup.php-г серверээс устгах эсвэл config.php дахь SETUP_KEY-г солихыг зөвлөж байна.</p>');
