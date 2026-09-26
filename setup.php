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
require __DIR__ . '/migrate.php';

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

function table_exists(PDO $pdo, string $t): bool { return mg_table_exists($pdo, $t); }
function column_info(PDO $pdo, string $t, string $c): ?array { return mg_column_info($pdo, $t, $c); }

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


/* ── Одоогийн байдал ──────────────────────────────────────── */
function status_summary(PDO $pdo): array
{
    return mg_missing($pdo);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method !== 'POST') {
    $missing = status_summary($pdo);
    $wordCount = table_exists($pdo, 'words') ? (int)$pdo->query("SELECT COUNT(*) FROM words")->fetchColumn() : 0;
    $body = '<h1>🧩 Үг Таа — суулгах / шинэчлэх</h1><p class="sub">Хувилбар 7.4 · ' . h(DB_NAME) . '</p>';
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

/* ── 1–4. Хүснэгт, багана, төрөл, индекс (migrate.php) ────── */
vgtaa_migrate($pdo, 'say');

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
    foreach (mg_seed() as $w => $d) {
        $st->execute([$w, mb_strlen($w), $d]);
        $cnt += $st->rowCount();
    }
    say('ok', "Үгийн сан: $cnt шинэ үг нэмэгдлээ (" . (count(mg_seed()) - $cnt) . ' нь өмнө байсан).');
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
$missing = status_summary($pdo);
$missing
    ? say('err', 'Дутуу хэвээр: ' . implode(', ', $missing))
    : say('ok', 'Бүтэц бүрэн. Бэлэн боллоо! 🎉');

$icons = ['ok' => '✅', 'warn' => '⚠️', 'err' => '❌'];
$list = '';
foreach ($log as [$k, $m]) $list .= '<li class="' . $k . '"><span>' . $icons[$k] . '</span><span>' . h($m) . '</span></li>';
page('Үг Таа — setup', '<h1>🧩 Шинэчлэлтийн үр дүн</h1><p class="sub">' . date('Y-m-d H:i') . '</p><div class="card"><ul>' . $list . '</ul></div>'
    . '<p><a href="./" style="color:#8fb4ff">← Сайт руу буцах</a></p>'
    . '<p class="muted">Аюулгүй байдлын үүднээс setup.php-г серверээс устгах эсвэл config.php дахь SETUP_KEY-г солихыг зөвлөж байна.</p>');
