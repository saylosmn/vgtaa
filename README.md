# Үг Таа v6.3

Монгол үг таах тоглоом. PHP 8.1+ болон MySQL/MariaDB дээр ажиллана. Нэг кодоор **InfinityFree**, **Render**, **Vercel** гурвын аль нэгэнд байршуулна.

| | InfinityFree | Render | Vercel |
|---|---|---|---|
| PHP | ✅ шууд | ✅ Docker (`Dockerfile`) | ✅ `vercel-php` runtime (`vercel.json`) |
| MySQL | ✅ хамт ирнэ | ❌ гадны MySQL | ❌ гадны MySQL |
| Нууц мэдээлэл | `config.secret.php` | Environment | Environment Variables |
| Telegram товч | Автомат шалгалт | Webhook | Webhook |
| Үнэгүй хувилбар | Хурд удаан | 15 минут хандалтгүй бол унтана | Hobby — **арилжааны зориулалтаар хориотой** |

> ⚠️ Vercel-ийн үнэгүй Hobby төлөвлөгөө зөвхөн хувийн, арилжааны бус төсөлд зориулагдсан. Мөнгөн шагнал, төлбөртэй апп тул Vercel-д **Pro** ($20/сар) хэрэгтэй. Үнэгүй байршуулах бол Render эсвэл InfinityFree-г сонго.

## Юу шинэ вэ

- **Хэрэглэгч бүрт өөр санамсаргүй үг.** Тухайн өдөр бүгдэд ижил **урттай** боловч өөр үг ирнэ. Админ тодорхой өдөр **бүгдэд нэг үг** товлож болно.
- **Дасгал горим.** Хүссэн үедээ шинэ санамсаргүй үг тоглоно. Өдөрт 3, Premium бол хязгааргүй.
- **Telegram-аас шууд «✅ Орсон / ❌ Татгалзах».**
- **Render, Vercel-д бэлэн.** Платформ болон сайтын хаягийг автоматаар танина. Тохиргоо дутуу бол сайт ажиллахаас татгалзаж, юу дутууг зааж өгнө.

## 1. Гадны MySQL бэлдэх (Render, Vercel-д)

**TiDB Cloud Serverless**-ийг зөвлөж байна: үнэгүй 5GB, MySQL-тэй нийцтэй.
1. <https://tidbcloud.com> → Cluster үүсгэх → Region: **Singapore (ap-southeast-1)**.
2. **Connect** → «General» сонгож host, port (4000), user, password-оо авна. Database нэрийг `ugtaa` гэж өгч үүсгэнэ.
3. Хуучин өгөгдлөө шилжүүлэх бол InfinityFree phpMyAdmin → Export (SQL) → TiDB-д Import хийнэ.

Aiven MySQL ашиглавал **CA certificate**-ийг хуулж `DB_SSL_CA_PEM` хувьсагчид хийнэ.

## 2. GitHub руу push хийх

`config.secret.php` `.gitignore`-д орсон тул GitHub руу орохгүй. **Private** repo ашигла.

Хуучин commit-уудад нууц үг үлдсэн тул `release` нэртэй, түүхгүй цэвэр branch бэлдсэн. GitHub руу зөвхөн түүнийг хийнэ:
```bash
git remote add origin https://github.com/<нэр>/ugtaa.git
git push -u origin release:main
```

## 3a. Render

1. Render → **New → Blueprint** → repo-гоо сонгоно (`render.yaml`: Docker, Singapore, free).
2. Асуусан утгуудыг бөглөнө: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`. Aiven бол `DB_SSL_CA_PEM`-ийг ч бөглөнө. `JWT_SECRET`, `SETUP_KEY`-г Render өөрөө үүсгэнэ.
3. Deploy дууссаны дараа: Render → Environment хэсгээс `SETUP_KEY`-г хуулаад `https://<сервис>.onrender.com/setup.php?key=<SETUP_KEY>` → **Шинэчлэлт ажиллуулах**.

## 3b. Vercel

1. Vercel → **Add New → Project** → repo-гоо сонгоно. Framework: **Other**. Build тохиргоог хөндөх шаардлагагүй, `vercel.json` бүгдийг тохируулна.
2. **Settings → Environment Variables** хэсэгт нэмэх утгууд:

   | Хувьсагч | Утга |
   |---|---|
   | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` | MySQL-ийн мэдээлэл |
   | `DB_SSL` | `1` |
   | `JWT_SECRET` | 40+ тэмдэгттэй санамсаргүй мөр |
   | `SETUP_KEY` | 24+ тэмдэгттэй санамсаргүй мөр |

   Санамсаргүй утга хэрэгтэй бол эхлээд deploy хийгээд `/setup.php`-г нээ. Тэнд бэлэн утга санал болгоно.
3. **Redeploy** → `https://<төсөл>.vercel.app/setup.php?key=<SETUP_KEY>` → **Шинэчлэлт ажиллуулах**.

Functions нь DB-тэй ойр байхын тулд **Singapore (sin1)** бүсэд ажиллана. Vercel `.php` файлыг анхдагчаар текст болгож харуулдаг ч `vercel.json` бүх PHP/SQL файлыг хаадаг.

## 4. Deploy-ийн дараа (Render, Vercel)

1. Google Cloud Console → OAuth client → **Authorized JavaScript origins**-д шинэ домэйнээ нэмнэ.
2. Админ → **Тохиргоо** → Telegram → **«Webhook»**-ийг асаана. Товч дармагц шууд ажиллана.
3. Админ → **Систем** табын бүх мөр ✓ байхыг шалгана.
4. Өөрийн домэйн холбовол `APP_URL` хувьсагчийг тэр хаягаар тохируулна. Тохируулаагүй бол Render/Vercel-ийн хаягийг автоматаар ашиглана.

## InfinityFree дээр байршуулах

> ⚠️ Эхлээд phpMyAdmin → Export-оор өгөгдлөө нөөцөл.

1. `htdocs` руу хуулах файлууд:
   ```
   .htaccess  index.html  index.css  index.js  sw.js  manifest.webmanifest
   api.php  config.php  config.secret.php  setup.php  schema.sql  icons/
   ```
   `api/`, `deploy/`, `Dockerfile`, `render.yaml`, `vercel.json` нь Render/Vercel-д зориулсан тул хуулах шаардлагагүй.
2. `https://vgtaa.fwh.is/setup.php?key=<SETUP_KEY>` → **«Шинэчлэлт ажиллуулах»**.
3. Админ → **Систем** табын бүх мөр ✓ байхыг шалга.

## Хэтэвч цэнэглэх + Telegram

**Урсгал:**
1. Хэрэглэгч дүнгээ сонгоно.
2. Систем таны данс болон автоматаар үүссэн **гүйлгээний утгыг** харуулна.
3. Хэрэглэгч мөнгөө шилжүүлээд «Баталгаажуулах» дарна.
4. Танд **товчтой Telegram мессеж** очно.
5. Та «✅ Орсон» дарахад мөнгө хэтэвчинд орно.

**Тохируулах:** Админ → **Тохиргоо**
- **Данс:** банк, эзэмшигчийн нэр, дансны дугаар, IBAN → «Цэнэглэлт идэвхтэй»-г асаана.
- **Telegram:**
  1. **@BotFather** → `/newbot` → token-оо хуулж оруулна.
  2. Бот руугаа `/start` гэж бичнэ.
  3. **«Олох»** → **«Тест мессеж»** дарна.

**Telegram товчны горим:**

| Горим | Хаана | Хэрхэн ажиллах |
|---|---|---|
| **Автомат шалгалт** (анхдагч) | InfinityFree | Сайтад хэн нэгэн орох бүрт (5 секунд тутам) Telegram-ийг ар талд шалгана. Админ самбарын Цэнэглэлт/Таталт хэсгийг нээхэд шууд шалгагдана. Сайтад хандалт огт байхгүй үед товчны үр дүн хоцорч магадгүй. |
| **Webhook** | Render, Vercel (https) | Товч дармагц Telegram шууд сайт руу илгээнэ, хоцрохгүй. InfinityFree-ийн бот хамгаалалт webhook-ийг хаадаг тул тэнд бүү асаа. |

«Орсон» товчийг зөвхөн **«Орсон» дарах эрхтэй Telegram ID**-д бүртгэлтэй хүн дарж чадна. «Олох» дарахад энэ ID автоматаар бөглөгдөнө. Хэрэглэгч өөр дүн шилжүүлсэн бол админ самбараас бодит дүнгээр нь баталгаажуулна.

## Тохиргоо (`config.php`)

| Тохиргоо | Анхны утга | Тайлбар |
|---|---|---|
| `REWARD_AMOUNT` | 5000 | Өдрийн үгийг таасны шагнал |
| `REWARD_BY_ATTEMPT` | `[]` | Оролдлогоос хамаарсан шагнал |
| `DAILY_WINNER_CAP` | 0 | Өдөрт мөнгөн шагнал авах хүний дээд тоо (0 = хязгааргүй) |
| `MAX_ATTEMPTS` | 5 | Нэг үгэнд оролдох тоо |
| `PRACTICE_DAILY_FREE` | 3 | Өдөрт үнэгүй дасгалын тоо |
| `TOURNAMENT_SPLIT` | 50/30/20 | Тэмцээний шагналын хуваарь |
| `REFERRAL_UNLOCK` | 15 | Мөнгө татахад шаардлагатай баталгаажсан найзын тоо |

## ⚠️ Зөвлөмж

- **Нууц мэдээллээ шинэчил.** DB нууц үг өмнө нь олон файлд ил бичигдэж байсан тул сольж, `config.secret.php`-г (Render дээр бол Environment) шинэчил. Энэ repo-гийн хуучин commit-уудад нууц үг байгаа тул нийтийн (public) repo руу бүү push хий.
- **Үгийн сан.** Хэрэглэгч бүрт өөр үг ирдэг тул үг их байх тусмаа сайн. Хариулт болох үг 30-аас цөөн болбол админ самбар анхааруулна.
- **Олон бүртгэл.** Таталтын хүсэлт бүрийн хажууд «Ижил IP-с N бүртгэл» анхааруулга гарна. Render дээр `BEHIND_PROXY=1` тул жинхэнэ IP зөв тодорхойлогдоно.
