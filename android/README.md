# Үг Таа — Android апп

Kotlin, нэг Activity. Тоглоом, хэтэвч, админ зэрэг бүх боломж сайтын кодоор (`index.html/js`) ажилладаг тул сайтаа шинэчлэхэд апп давхар шинэчлэгдэнэ. Апп нь дараах натив хэсгүүдийг нэмнэ:

| Хэсэг | Юу хийдэг вэ | Файл |
|---|---|---|
| Google-ээр нэвтрэх | WebView дотор Google-ийн вэб нэвтрэлт хоригдсон. Иймээс Credential Manager ID token авч сайт руу дамжуулна. Сервер хөтчийн нэвтрэлттэй адил шалгадаг. | `auth/GoogleAuth.kt` |
| 3D «Таа» дүр | Ачааллын болон офлайн дэлгэцэд OpenGL ES 3 дүр гарна. Нүдээ ирмэж, гараа даллана. Чирвэл эргэж, товшвол үсэрнэ. | `mascot/` |
| Сайт ↔ апп гүүр | `window.UgTaaAndroid`: нэвтрэх, гарах, хуваалцах, гэрэл/харанхуй горим. Зөвхөн сайтын origin-д суулгагдана. | `web/NativeBridge.kt`, `index.js` → `Native` |
| Холбоос | Сайтын холбоос (дуэлийн урилга `#/g/duel/КОД`, `?ref=`) апп-д нээгдэнэ. Гадны холбоос Custom Tab-д нээгдэнэ. | `MainActivity.kt`, `web/SiteWeb.kt` |
| Офлайн | Интернэт тасарвал 3D дүртэй дэлгэц гарна. Холболт эргэж ирмэгц өөрөө дахин ачаална. | `MainActivity.kt` |
| Өдрийн сануулга | Өдрийн үгээ таагаагүй бол Монголын цагаар 20:00-д мэдэгдэл ирнэ. Зөвшөөрлийг эхний үгээ таасны дараа асууна. Гарахад сануулга зогсоно. | `reminder/Reminders.kt` |
| Буцах товч | Эхлээд нээлттэй цонхыг хааж, дараа нь сайт дотор буцна. Буцах зүйл үлдээгүй бол системийн predictive back ажиллана. | `MainActivity.kt`, `index.js` → `Native.modal` |

## Android Studio-д нээх

1. **File → Open** → `vgtaa/android` хавтсыг сонгоно (repo-гийн үндсийг биш).
2. Gradle sync дуусмагц төхөөрөмж/эмулятороо сонгоод **Run ▶**.

Шаардлага: Android Studio (JDK 17), SDK 36. minSdk 26 (Android 8.0).

## ⚠️ Эхлээд хийх 2 алхам

### 1. Сайтаа deploy хий (v7.7)

Натив нэвтрэх товч `index.js` v7.7-д орсон. Хуучин сайт апп дотор «энэ хөтчөөс Google-ээр нэвтрэх боломжгүй» гэж харуулна.

### 2. Google Cloud-д Android client бүртгэ

Үүнийг хийхгүй бол данс сонгосны дараа «Апп Google Cloud-д бүртгэгдээгүй байна» гэсэн алдаа гарна.

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials?project=399324970310) → вэб client ID (`399324970310-…`) байгаа **тэр project** → **Create credentials → OAuth client ID → Android**.
   - Энэ project-ийг **эзэмшдэг Google дансаар** нэвтэрнэ. saylosnn1@gmail.com-д энэ project-д хандах эрх алга (2026-09-27-нд шалгасан).
   - Google Cloud 2026-09-01-ээс эхлэн **2 шаттай баталгаажуулалт (2SV)** шаарддаг. Асаагаагүй бол «Google Cloud access blocked» гэж гарна.
2. **Package name:** `mn.ugtaa.app`
3. **SHA-1:** Түлхүүр бүрт тус тусдаа Android client үүсгэнэ:

   | Түлхүүр | SHA-1 |
   |---|---|
   | Release (upload) — `ugtaa-upload.jks` | `08:6F:E0:57:A2:F7:2B:87:35:2D:C1:C5:AE:90:B4:FA:C6:39:14:F8` |
   | Debug (энэ компьютер) | `61:3B:43:EC:0F:54:67:1D:A0:05:C9:40:42:D8:BE:56:37:EC:30:75` |

   Өөр компьютер дээрх debug түлхүүрийн хээг Android Studio → Gradle → `app › Tasks › android › signingReport`-оос авна. Google Play-д гаргасан бол **Play Console → Test and release → App integrity → App signing key certificate**-ийн SHA-1-ийг бас нэмнэ. Play апп-ыг өөрийн түлхүүрээр дахин гарын үсэг зурдаг.

Кодыг өөрчлөх шаардлагагүй. Апп `gradle.properties` доторх **вэб** client ID-гаар token авдаг тул `api.php` өөрчлөлтгүй хүлээн авна.

## Холбоос шууд апп-д нээгдэх (App Links)

✅ Vercel-д тохируулсан (2026-09-27), Google-ийн шалгалтаар `linked: true`. Render эсвэл өөр хостинг ашиглавал орчны хувьсагчид гарын үсгийн **SHA-256** хээг нэмнэ:

| Хувьсагч | Утга |
|---|---|
| `ANDROID_CERT_SHA256` | `6D:42:9D:A1:D5:9B:53:CF:34:49:46:DF:8C:BC:23:F1:E3:EC:52:81:9D:03:76:46:C2:9B:A1:D3:6F:D7:0E:42` (upload түлхүүр). Play-д гаргасны дараа Play signing-ийн SHA-256-г таслалаар нэмнэ. |
| `ANDROID_PACKAGE` | `mn.ugtaa.app` (анхдагч) |

Сервер `https://vgtaa.vercel.app/.well-known/assetlinks.json`-ийг өөрөө гаргана. Шалгах:
```bash
adb shell pm verify-app-links --re-verify mn.ugtaa.app
```
```bash
adb shell pm get-app-links mn.ugtaa.app
```

## Google Play-д гаргах

1. Upload түлхүүр аль хэдийн үүссэн: `android/ugtaa-upload.jks` болон нууц үг нь `android/keystore.properties`-д байна. Хоёулаа git-д орохгүй. **Энэ хоёр файлыг аюулгүй газар нөөцөл.** Алдвал Play Console-оос upload түлхүүрээ шинэчлүүлэх хүсэлт гаргах шаардлагатай болно. Шинээр үүсгэх бол `keystore.properties.example`-г үзнэ үү.
2. `./gradlew bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`
3. Play Console-д оруулахдаа 512×512 дүрсэнд `app/src/main/ic_launcher-playstore.png`-г ашиглана.
4. Хувилбар бүрт `app/build.gradle.kts` доторх `versionCode`-г нэгээр нэмнэ.

> Мөнгөн шагналтай тоглоом тул Google Play-ийн **Real-money gambling / games with cash rewards** бодлогыг шалгаарай. Зарим улсад тусгай зөвшөөрөл, 18+ насны хязгаарлалт шаардлагатай.

## Тохиргоо (`gradle.properties`)

| Түлхүүр | Утга |
|---|---|
| `ugtaa.siteUrl` | Апп нээх сайт (анхдагч `https://vgtaa.vercel.app/`). Release-д заавал https. |
| `ugtaa.googleWebClientId` | `config.php`-ийн `GOOGLE_CLIENT_ID`-тэй ижил вэб client ID |

## 3D дүрийг өөрчлөх

Дүр Blender-ийн скриптээс үүсдэг: `design/blender/build_taa.py`. Өөрчлөөд repo-гийн үндсээс дараах командыг ажиллуулна:
```bash
python design/build_assets.py
```
Энэ команд `assets/taa.glb` (вэб), `app/src/main/assets/models/taa.glb`, апп-ын дүрс, splash, Play Store-ийн зургийг бүгдийг дахин үүсгэнэ.

`MascotRenderer` доторх хөдөлгөөн нь зангилааны нэрсийг ашигладаг: `Taa`, `Arm_R`, `Eye_L`, `Pupil_L`, `Hat`, `Tile_1` г.м. Нэрийг нь өөрчилбөл `app/src/test/…/GltfTest.kt` тест анхааруулна.

## Локал сервертэй турших (эмулятор)

Deploy хийхээс өмнө өөрчлөлтөө турших бол сайтаа компьютер дээрээ `127.0.0.1:8765`-д ажиллуулна. Дараа нь:
```bash
./gradlew installDebug -Pugtaa.siteUrl=http://10.0.2.2:8765/
```
Зөвхөн debug build `10.0.2.2` / `localhost` руу http-ээр хандаж чадна (`app/src/debug/res/xml/network_security_config.xml`).
