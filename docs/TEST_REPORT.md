# Test raporu

Biçim (APP.md §16.1): her fazın sonunda çalıştırılan komutlar, sonuç sayıları ve çalıştırılamayan testler. Çalıştırılamayan test geçmiş gibi gösterilmez: `ÇALIŞTIRILAMADI — neden — sahibi nasıl çalıştırır`.

---

## Faz 0 — Temel · 2026-10-10

**Ortam:** Windows 11 Pro (10.0.26200), Node 24.21.0, npm 11.19.0, Git 2.56.0, Docker CLI 29.8.2 (daemon çalışmıyor), Android Studio (JBR = OpenJDK 25.0.3), Android SDK platform 32–34.

### Özet

| Katman                               | Komut                                                                                       | Sonuç                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Statik: tip denetimi                 | `npm run typecheck` (4 çalışma alanı, TS strict)                                            | **0 hata**                                                               |
| Statik: lint                         | `npm run lint` (`eslint . --max-warnings 0`)                                                | **0 hata, 0 uyarı**                                                      |
| Statik: biçim                        | `npm run format:check`                                                                      | **temiz**                                                                |
| Çeviri anahtarı denetimi             | `npm run i18n:check`                                                                        | **geçti** — tr.json 41, en.json 41 anahtar; kodda bilinmeyen anahtar yok |
| Birim + bileşen: mobil               | `npm test -w @dokuz/mobile` (`jest --coverage`)                                             | **39/39 geçti** · satır kapsamı %99,07 (eşik %80)                        |
| Birim: design-tokens                 | `npm test -w @dokuz/design-tokens`                                                          | **38/38 geçti** · kapsam %100                                            |
| Birim: shared                        | `npm test -w @dokuz/shared`                                                                 | **7/7 geçti** · kapsam %100                                              |
| Hepsi bir arada                      | `npm run ci`                                                                                | **çıkış kodu 0**                                                         |
| Web derlemesi                        | `npx next build` (apps/web)                                                                 | **başarılı** — `/` statik                                                |
| Mobil JS paketi                      | `npx expo export --platform web`                                                            | **başarılı** — 3,6 MB (ikon düzeltmesinden önce 9,4 MB, bkz. D-013)      |
| Expo yapılandırması                  | `npx expo-doctor`                                                                           | **21/21 denetim geçti**                                                  |
| Veritabanı (pgTAP) — yedek ortam     | PGlite (Postgres 17, WASM) + `@electric-sql/pglite-pgtap`, Supabase rolleri taklit edilerek | **13/13 geçti** (ayrıntı aşağıda)                                        |
| Veritabanı (pgTAP) — gerçek Supabase | `npx supabase test db`                                                                      | **ÇALIŞTIRILAMADI** (aşağıda)                                            |
| Bağımlılık taraması                  | `npm audit --omit=dev --audit-level=critical`                                               | **geçti (çıkış 0)** — 0 kritik; 46 yüksek + 15 orta (aşağıda)            |
| Android derlemesi                    | `expo prebuild` + `gradlew assembleDebug`                                                   | **ÇALIŞTIRILAMADI / başarısız** (aşağıda)                                |
| iOS derlemesi                        | —                                                                                           | **ÇALIŞTIRILAMADI** (aşağıda)                                            |
| CI (GitHub Actions)                  | `.github/workflows/ci.yml`                                                                  | **ÇALIŞTIRILAMADI** (aşağıda)                                            |
| Gizli anahtar taraması               | gitleaks                                                                                    | **ÇALIŞTIRILAMADI** yerelde (aşağıda)                                    |

### Faz 0 kabul kriterleri (APP.md §21)

| Kriter                           | Durum                      | Kanıt                                                                                                       |
| -------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Tema değişir                     | **Geçti** (otomatik test)  | `FoundationScreen.test.tsx` → "switches to the day theme and back" (arka plan `#0F1021` ↔ `#FBF8F4`)        |
| Dil değişir                      | **Geçti** (otomatik test)  | `FoundationScreen.test.tsx` → "switches the language to English"                                            |
| Android'de boş uygulama derlenir | **Karşılanmadı (yerelde)** | Kod değil, Windows yol uzunluğu sınırı; CI'daki Linux işinde derlenmesi bekleniyor ama henüz çalıştırılmadı |
| iOS'ta boş uygulama derlenir     | **Karşılanmadı**           | Windows'ta mümkün değil; CI'daki macOS işi hazır, çalıştırılmadı                                            |
| CI yeşil                         | **Karşılanmadı**           | Aynı adımlar yerelde yeşil; GitHub'a henüz gönderilmedi                                                     |

**Sonuç:** Faz 0'ın kod tarafı tamam ve yerelde çalışabilen tüm testler geçiyor. Kabulün üç maddesi (Android derlemesi, iOS derlemesi, CI yeşil) sahibin birkaç adımına bağlı.

### Ayrıntılar

**Mobil testlerin kapsadıkları (39):** Button (rol/etiket, devre dışı, yükleniyor/meşgul, 44 pt dokunma alanı, 4 varyant), Input (etiket, yardım → hata, hata ipucu, karakter sayacı ve sesli etiketi), Banner (uyarı/tehlike `alert` rolü, bilgi bandı), Card + AppText (tema yüzey rengi, başlık rolü), SegmentedControl (radyo rolü, seçili durum), Sheet (kapatma düğmesi ve örtü; hareketi azaltta kayma yerine solma), Skeleton (ekran okuyucudan gizli; hareketi azaltta durağan), tema çözümleme (Sistem/Gece/Gündüz), hareketi azalt (sistem + kullanıcı tercihi + canlı değişim), çeviri anahtarları TR = EN ve boş metin yok (AYR-08), varsayılan dil Türkçe, Sentry (DSN yoksa kapalı, PII kapalı, konsol izi gönderilmez), Temel ekranı (tema, dil, hareket, form hatası, açılır sayfa, servisler `NEEDS_SETUP` görünür ve asla "ready" gösterilmez).

**design-tokens (38):** WCAG kontrast hesabının referans değerleri, hatalı renk reddi, APP.md'deki sabit renkler, iki temada aynı belirteç seti, **her iki temada 16 metin/zemin çiftinin hepsi ≥ 4.5:1** (§12.1, §16.7), 8'lik ızgara, çıkışların %20 hızlı olması.

**shared (7):** varsayılan ortam `local`, boş değerin "ayarlanmamış" sayılması, servis durumunun ancak tüm anahtarlar varken `ready` olması, geçersiz ortam ve URL reddi, **gizli anahtarların istemci yapılandırmasına girmesinin reddi** (§0.3), demo verinin üretimde kapalı olması (§0.10).

**pgTAP (13) — `supabase/tests/database/00_foundation.test.sql`:** public şemadaki her tabloda RLS açık; her tabloda `id`/`created_at`/`updated_at`; iki tablo var; `anon` iki tabloyu okuyamaz; `authenticated` iki tabloya yazamaz; bayrak ekleme ve güncelleme önce/sonra değeriyle `audit_log`'a düşer; geçersiz bayrak anahtarı reddedilir; `audit_log` güncellenemez, silinemez, boşaltılamaz.
PGlite ile çalıştırma: Supabase'e özgü `anon`, `authenticated`, `service_role` rolleri, Supabase'in varsayılan tablo yetkileri ve `auth.uid()` taklit edildi; göç ve test dosyası **değiştirilmeden** uygulandı. Bu gerçek Supabase'in yerine geçmez. Supabase'de ek şema, eklenti ve yetki farkları olabilir; bu yüzden aşağıdaki adım ayrıca gerekli.

### ÇALIŞTIRILAMAYAN / BAŞARISIZ

- **pgTAP, gerçek yerel Supabase'de — ÇALIŞTIRILAMADI** — Docker daemon çalışmıyor: BIOS'ta donanım sanallaştırması kapalı ("Virtualization Enabled In Firmware: No") ve WSL kurulu değil. — **Sahibi nasıl çalıştırır:** BIOS'ta SVM Mode'u aç, `wsl --install`, Docker Desktop'ı başlat, sonra `npx supabase start` ve `npx supabase test db`. CI'daki `database` işi de bunu yapar.
- **Android debug derlemesi — BAŞARISIZ (ortam)** — İki ayrı ortam sorunu çıktı:
  1. Android Studio'nun JDK 25'i CMake adımında "restricted method" uyarısı basıyor, Gradle bunu hata sayıyor. `JAVA_TOOL_OPTIONS=--enable-native-access=ALL-UNNAMED` ile aşıldı.
  2. Ardından `ninja: error: … Filename longer than 260 characters`: Windows yol uzunluğu sınırı, proje yolu `C:\Users\oss\Desktop\firstapp` bu sınır için fazla uzun. `subst` ile kısa sürücü harfi denendi; Node gerçek yolu çözdüğü için işe yaramadı ve geri alındı.
  - **Sahibi nasıl çalıştırır (biri yeter):** (a) projeyi `C:\dev\dokuz` gibi kısa bir yola taşı; (b) CI'daki `android` işini çalıştır (Linux, JDK 17; bu sınır yok, APK'yı yapıt olarak yükler); (c) EAS Build.
- **iOS derlemesi — ÇALIŞTIRILAMADI** — Windows'ta Xcode yok. — **Sahibi nasıl çalıştırır:** CI'daki `ios` işi (macOS çalıştırıcısı, imzasız simülatör derlemesi, Apple hesabı gerekmez) ya da EAS Build.
- **CI (GitHub Actions) — ÇALIŞTIRILAMADI** — Depo henüz GitHub'da değil (NEEDS_SETUP). Aynı adımlar (`npm run ci`, web derlemesi) yerelde yeşil. — **Sahibi nasıl çalıştırır:** GitHub'da özel depo aç, `git remote add origin …`, `git push -u origin main`.
- **gitleaks — ÇALIŞTIRILAMADI (yerel)** — gitleaks kurulu değil. CI'daki `security` işinde çalışır. Elle kontrol: depoda yalnızca `.env.example` var, içinde değer yok.
- **Uçtan uca (Maestro), görsel, performans testleri** — Faz 0'da kapsam dışı (ekran akışı yok). Faz 3'ten itibaren eklenecek.
- **Gerçek cihazda görsel kontrol** — Ben yapamadım; adımlar sahibe verildi (Expo Go ya da tarayıcı).

### Bağımlılık taraması ayrıntısı

`npm audit --omit=dev`: 0 kritik, 46 yüksek, 15 orta. Kök nedenler beş pakette ve hepsi Expo/React Native **geliştirme araç zincirinde** (Metro dosya eşleştirici, Expo CLI geliştirme sunucusu, yapılandırma araçları). Uygulamanın JS paketine girmiyorlar, ama npm `expo` paketinin bağımlılığı oldukları için "üretim" sayıyor:

| Paket                        | Önem   | Konu                               |
| ---------------------------- | ------ | ---------------------------------- |
| braces ≤ 3.0.3               | yüksek | iç içe desenle yığın taşması (DoS) |
| node-forge ≤ 1.4.0           | yüksek | RSA PKCS#1 v1.5 imza doğrulama     |
| decode-uri-component ≤ 0.4.2 | orta   | DoS                                |
| sprintf-js ≤ 1.1.3           | orta   | DoS                                |
| uuid < 11.1.1                | orta   | v3/v5/v6 tampon sınırı             |

`npm audit fix --force` Expo SDK'sını bozan sürüm değişiklikleri getirdiği için uygulanmadı. Expo SDK yamaları çıktıkça yeniden bakılacak. CI kapısı §16.6 gereği yalnızca kritikte durur.
