<?php
/**
 * Үг Таа — мэдээллийн сангийн бүтцийг автоматаар шинэчлэх (migrate.php)
 *
 * api.php шинэ хувилбар анх ажиллахад (эсвэл дутуу хүснэгт/багана илэрвэл)
 * үүнийг өөрөө дуудна. setup.php мөн адил ашиглана. Олон удаа ажиллуулахад аюулгүй:
 * зөвхөн дутууг нэмнэ, хуучин өгөгдөлд хүрэхгүй.
 */
if (!defined('VGTAA')) { http_response_code(403); exit; }

/*
 * information_schema-г нэг удаа бөөнөөр уншиж санана. TiDB мэт гадны сан дээр
 * information_schema-ийн асуулт бүр удаан (100мс+) тул хүснэгт/багана бүрээр асуувал
 * шинэчлэлт 15+ секунд үргэлжилдэг байсан. DDL ажилласны дараа санг шинэчилнэ.
 */
function mg_info(PDO $pdo, bool $reset = false): array
{
    static $info = null;
    if ($reset) { $info = null; return []; }
    if ($info !== null) return $info;
    $info = ['tables' => [], 'cols' => [], 'idx' => []];
    foreach ($pdo->query("SELECT LOWER(TABLE_NAME) AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()")->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $info['tables'][$r['t']] = true;
    }
    foreach ($pdo->query("SELECT LOWER(TABLE_NAME) AS t, LOWER(COLUMN_NAME) AS c, DATA_TYPE, COLUMN_TYPE, COLLATION_NAME, IS_NULLABLE
                          FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()")->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $info['cols'][$r['t']][$r['c']] = $r;
    }
    foreach ($pdo->query("SELECT LOWER(TABLE_NAME) AS t, INDEX_NAME, NON_UNIQUE, LOWER(COLUMN_NAME) AS c, SEQ_IN_INDEX
                          FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX")->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $info['idx'][$r['t']][$r['INDEX_NAME']]['unique'] = (int)$r['NON_UNIQUE'] === 0;
        $info['idx'][$r['t']][$r['INDEX_NAME']]['cols'][] = (string)$r['c'];
    }
    return $info;
}

function mg_table_exists(PDO $pdo, string $t): bool
{
    return isset(mg_info($pdo)['tables'][strtolower($t)]);
}

function mg_column_info(PDO $pdo, string $t, string $c): ?array
{
    return mg_info($pdo)['cols'][strtolower($t)][strtolower($c)] ?? null;
}

/** Тухайн баганууд дээр индекс байгаа эсэх (нэрээс үл хамааран) */
function mg_has_index(PDO $pdo, string $t, array $cols, bool $unique): bool
{
    foreach (mg_info($pdo)['idx'][strtolower($t)] ?? [] as $i) {
        if ($unique && !$i['unique']) continue;
        if ($unique ? $i['cols'] === $cols : array_slice($i['cols'], 0, count($cols)) === $cols) return true;
    }
    return false;
}

/** Хуучин хувилбараас дутуу байж болох баганууд */
function mg_columns(): array
{
    return [
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
}

/** [хүснэгт, баганууд, unique, нэр] */
function mg_indexes(): array
{
    return [
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
}

const MG_TABLES = ['users', 'words', 'daily_words', 'game_sessions', 'archive_sessions', 'transactions', 'referrals', 'withdrawals',
                   'tournaments', 'tournament_entries', 'app_kv', 'deposits', 'practice_sessions', 'mini_sessions', 'blitz_runs', 'duels'];

/** Дутуу байгаа хүснэгт/баганын жагсаалт (хоосон бол бүтэц бүрэн) */
function mg_missing(PDO $pdo): array
{
    mg_info($pdo, true);
    $missing = [];
    $cols = mg_columns();
    foreach (MG_TABLES as $t) {
        if (!mg_table_exists($pdo, $t)) { $missing[] = $t . ' (хүснэгт)'; continue; }
        foreach (array_keys($cols[$t] ?? []) as $c) if (!mg_column_info($pdo, $t, $c)) $missing[] = "$t.$c";
    }
    return $missing;
}

/**
 * Бүтцийг шинэчилнэ. $say(kind, message) — kind: ok | warn | err.
 * @return bool бүтэц бүрэн болсон эсэх
 */
function vgtaa_migrate(PDO $pdo, callable $say): bool
{
    mg_info($pdo, true);
    $run = function (string $sql, string $okMsg, string $failMsg = '') use ($pdo, $say): bool {
        try {
            $pdo->exec($sql);
            mg_info($pdo, true);
            $say('ok', $okMsg);
            return true;
        } catch (PDOException $e) {
            $say('warn', ($failMsg ?: $okMsg) . ' — ' . $e->getMessage());
            return false;
        }
    };

    /* 1. Хүснэгтүүд (schema.sql-ээс) */
    $schema = @file_get_contents(__DIR__ . '/schema.sql');
    if (!is_string($schema) || $schema === '') {
        $say('err', 'schema.sql файл олдсонгүй — api.php-тэй нэг хавтсанд байршуулна уу.');
    } else {
        $schema = preg_replace('/^\s*--.*$/m', '', $schema) ?? '';
        foreach (array_filter(array_map('trim', explode(';', $schema))) as $stmt) {
            if (!preg_match('/CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?/i', $stmt, $m)) continue;
            if (mg_table_exists($pdo, $m[1])) continue;   // Байгаа хүснэгтэд DDL илгээхгүй (хурд)
            try {
                $pdo->exec($stmt);
                mg_info($pdo, true);
                $say('ok', "Хүснэгт үүслээ: {$m[1]}");
            } catch (PDOException $e) {
                $say('err', "Хүснэгт {$m[1]}: " . $e->getMessage());
            }
        }
    }

    /* 2. Дутуу баганууд */
    foreach (mg_columns() as $t => $cols) {
        if (!mg_table_exists($pdo, $t)) continue;
        foreach ($cols as $c => $def) {
            if (mg_column_info($pdo, $t, $c)) continue;
            $run("ALTER TABLE `$t` ADD COLUMN `$c` $def", "Багана нэмэгдлээ: $t.$c");
        }
    }

    /* 3. Төрөл засах */
    foreach ([
        ['transactions', 'type',   "VARCHAR(32) NOT NULL DEFAULT ''"],
        ['withdrawals',  'status', "VARCHAR(16) NOT NULL DEFAULT 'pending'"],
        ['tournaments',  'status', "VARCHAR(16) NOT NULL DEFAULT 'open'"],
    ] as [$t, $c, $def]) {
        $ci = mg_table_exists($pdo, $t) ? mg_column_info($pdo, $t, $c) : null;
        if ($ci && strtolower((string)$ci['DATA_TYPE']) === 'enum') {
            $run("ALTER TABLE `$t` MODIFY `$c` $def", "$t.$c → VARCHAR (шинэ төрлүүдийг хадгална)");
        }
    }
    $wc = mg_table_exists($pdo, 'words') ? mg_column_info($pdo, 'words', 'word') : null;
    if ($wc && (string)$wc['COLLATION_NAME'] !== 'utf8mb4_bin') {
        $run("ALTER TABLE words MODIFY word VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL",
            'words.word → utf8mb4_bin (Е/Ё, И/Й-г ялгана)');
    }

    /* 4. Индексүүд */
    foreach (mg_indexes() as [$t, $cols, $unique, $name]) {
        if (!mg_table_exists($pdo, $t)) continue;
        foreach ($cols as $c) if (!mg_column_info($pdo, $t, $c)) continue 2;
        if (mg_has_index($pdo, $t, $cols, $unique)) continue;
        $colSql = implode(', ', array_map(fn(string $c): string => "`$c`", $cols));
        $run("ALTER TABLE `$t` ADD " . ($unique ? 'UNIQUE ' : '') . "INDEX `$name` ($colSql)",
            "Индекс нэмэгдлээ: $t($colSql)",
            "Индекс нэмж чадсангүй $t($colSql) — давхардсан өгөгдөл байж магадгүй");
    }

    return !mg_missing($pdo);
}

/** Эхлэлийн 140 монгол үг (тайлбартай). Үгийн сан хоосон бол автоматаар нэмэгдэнэ. */
function mg_seed(): array
{
    return [
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
}

/** Үгийн сан хоосон бол эхлэлийн үгсийг нэмнэ */
function mg_seed_if_empty(PDO $pdo, callable $say): void
{
    if (!mg_table_exists($pdo, 'words') || (int)$pdo->query("SELECT COUNT(*) FROM words")->fetchColumn() > 0) return;
    $st = $pdo->prepare("INSERT IGNORE INTO words (word, length, definition, is_answer, is_active, created_at) VALUES (?, ?, ?, 1, 1, NOW())");
    $n = 0;
    foreach (mg_seed() as $w => $d) {
        $st->execute([$w, mb_strlen($w, 'UTF-8'), $d]);
        $n += $st->rowCount();
    }
    $say('ok', "Үгийн сан хоосон байсан тул $n үг нэмэгдлээ.");
}
