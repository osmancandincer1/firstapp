# Test raporu

Biçim (APP.md §16.1): her fazın sonunda çalıştırılan komutlar, sonuç sayıları ve çalıştırılamayan testler. Çalıştırılamayan test geçmiş gibi gösterilmez: `ÇALIŞTIRILAMADI — neden — sahibi nasıl çalıştırır`.

---

## Faz 3 — Tur ve Cevap · 2026-10-11

**Ortam:** önceki fazlarla aynı makine; Docker hâlâ çalışmıyor (BIOS sanallaştırma kapalı).

### Özet

| Katman                              | Komut                                                               | Sonuç                                                                  |
| ----------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Statik + çeviri                     | `npm run typecheck`, `lint`, `format:check`, `i18n:check`           | **0 hata** · TR 532 = EN 532 anahtar                                   |
| Birim: iş kuralları                 | `npm test -w @nokuzo/shared`                                        | **146/146** · satır kapsamı **%100**                                   |
| Birim: tasarım belirteçleri         | `npm test -w @nokuzo/design-tokens`                                 | **38/38**                                                              |
| Birim + bileşen: mobil              | `npm test -w @nokuzo/mobile`                                        | **151/151** · satır kapsamı %88,6 (eşik %80)                           |
| Edge Functions                      | `npm run functions:check` (17 fonksiyon) + `npm run functions:test` | **0 tip hatası · 99/99**                                               |
| Veritabanı (pgTAP), PGlite          | göçler + içerik + yerel tohum + 4 test dosyası                      | **176/176** (Faz 0: 13, Faz 1: 57, Faz 2: 55, Faz 3: 51)               |
| Veritabanı (pgTAP), gerçek Supabase | `npx supabase test db` (yerel Docker) ve CI `database` işi          | **176/176** — hem bu makinede hem GitHub Actions'ta geçti (tüm fazlar) |
| Mobil paketleme                     | `expo export --platform android`                                    | **başarılı** (7,4 MB)                                                  |
| Hepsi bir arada                     | `npm run ci`                                                        | **çıkış kodu 0**                                                       |

### Faz 3 kabul kriterleri (APP.md §21)

| Kriter                         | Durum     | Kanıt                                                                                                                                                                                     |
| ------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tur günde tam bir kez üretilir | **Geçti** | `03_tur.test.sql` TUR-01: aynı gün ikinci çağrı aynı Tur'u döndürüyor, tek kayıt var; `(profil, tarih, tür)` benzersiz ve eşzamanlı ikinci çalıştırma `on conflict` ile aynı kaydı alıyor |
| Filtre dışı profil gelmez      | **Geçti** | TUR-03: 40 kişilik rastgele nüfusta (sabit tohum) hiçbir kart karşılıklı filtreyi bozmuyor ve test boş geçmiyor (kart üretildiği de denetleniyor); TUR-06: küçük havuz doldurulmuyor      |
| Cevap sınırları çalışır        | **Geçti** | MAS-01 (`tur.test.ts`, `tur_test.ts`, mobil), MAS-02 günlük 15 ve bekleyen 15 (`03_tur.test.sql`), MAS-03 3'te uyarı 4'te engel (`tur.test.ts`, `tur_test.ts`, mobil)                     |

### Test kataloğu eşlemesi (§16.3)

| Test                                                              | Durum      | Nerede                                                                                                                                                                                     |
| ----------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TUR-01 Günde tam bir kez                                          | Geçti      | `03_tur.test.sql`                                                                                                                                                                          |
| TUR-02 Saat dilimi / yaz saati                                    | Kısmen     | 21:00 sınırı SQL'de (`03_tur.test.sql` 1–3) ve TypeScript'te (`tur.test.ts`, gün dönümü dahil) test edildi. Türkiye'de yaz saati yok (D-056); başka saat dilimi desteklenmiyor             |
| TUR-03 Karşılıklı filtreler (özellik tabanlı)                     | Geçti      | `03_tur.test.sql` (rastgele nüfus + 12 adaylı elle kurulu senaryo + olmazsa olmazlar)                                                                                                      |
| TUR-04 Engelli, askıda, banlı, doğrulanmamış Tur'a girmez         | Kısmen     | Engelleme (iki yönlü), doğrulanmamış, aktif olmayan, yeniden doğrulama bekleyen: geçti. Şikâyet edilen, rehberde gizlenen, molada: **Faz 5 / Faz 4'te** (veri henüz yok)                   |
| TUR-05 Geç 60 gün, işlemsiz 14 gün                                | Geçti      | `03_tur.test.sql`                                                                                                                                                                          |
| TUR-06 Küçük havuz doldurulmaz                                    | Geçti      | `03_tur.test.sql`, mobil (dürüst "bugün N kişi" mesajı)                                                                                                                                    |
| TUR-07 Abonelik puan girdisi değil                                | Geçti      | `03_tur.test.sql` (fonksiyon gövdesi abonelik/ödeme/cihaz okumuyor). Plus Faz 8'de; o zaman "aynı girdi, aynı puan" testi de eklenecek                                                     |
| TUR-08 Asgari gösterim tabanı                                     | Kısmen     | Az gösterilen kişinin öne çıktığı test edildi (adil görünürlük puanı). Haftalık 30 gösterimin her koşulda **garanti** edildiği gösterilmedi; büyük nüfusla simülasyon gerekir              |
| TUR-09 Filtre sonraki Tur'da geçerli; tahmin ±%10                 | Geçti      | Tahmin ve Tur aynı `eligible_pool` fonksiyonunu kullanıyor; tahmin gerçek havuza eşit ve filtre değişikliğini izliyor (`03_tur.test.sql`), filtre ekranı (`tur.test.tsx`)                  |
| TUR-10 Plus filtresi karşı tarafı aşamaz                          | Uygulanmaz | Plus gelişmiş filtreleri Faz 8'de                                                                                                                                                          |
| TUR-11 Sakla 9 kart / 7 gün; "daha az göster" ağırlığı değiştirir | Geçti      | `03_tur.test.sql`, `tur_test.ts`, `tur.test.tsx`                                                                                                                                           |
| MAS-01 Kısa ya da yalnız emoji cevap reddedilir                   | Geçti      | `tur.test.ts`, `tur_test.ts`, `tur.test.tsx`                                                                                                                                               |
| MAS-02 15 günlük / 15 bekleyen sınırı                             | Geçti      | `03_tur.test.sql`, `tur_test.ts` (hata eşlemesi), `tur.test.tsx` (mesaj)                                                                                                                   |
| MAS-03 Kopya cevap: 3 uyarı, 4 engel                              | Geçti      | `tur.test.ts`, `tur_test.ts`, `tur.test.tsx`                                                                                                                                               |
| MAS-04 Aynı anda karşılık → tek masa                              | Kısmen     | Sıralı iki karşılıkla tek masa açıldığı test edildi; kod danışma kilidi + benzersiz dizinle korunuyor. **Gerçek eşzamanlı** test (iki bağlantı) PGlite'ta yapılamıyor — Docker/CI bekliyor |
| MAS-05 4. masa açılmaz; "Masa bekliyor" 72 saatte düşer           | Geçti      | `03_tur.test.sql` (bekleyen masa, 72 saatlik süre, saatlik işle düşme), mobil (bekleme kuyruğu)                                                                                            |
| MAS-06…10                                                         | Faz 4      | Zamanlayıcılar, Nazik Veda, engelleme, Plus bitişi, yanıt güvenilirliği                                                                                                                    |

### ÇALIŞTIRILAMAYAN / EKSİK

- **pgTAP, gerçek Supabase'de: sonradan çalıştırıldı, 176/176 geçti.** Docker kurulduktan sonra bu makinede (`npx supabase test db`, Supabase CLI 2.120.0) ve GitHub Actions'taki `database` işinde. Faz 0–2'deki "ÇALIŞTIRILAMADI" notları da bununla kapanıyor.
- **pg_cron zamanlaması: kuruldu.** Yerel Supabase'de `cron.job` üç işi gösteriyor: `tur-generate-noon` (`30 8 * * *` = 11:30 İstanbul), `tur-generate` (`30 17 * * *` = 20:30) ve `daily-expiry` (`15 * * * *`) — D-062 sonrası. İşin gerçekten zamanında çalıştığı henüz gözlenmedi.
- **MAS-04 gerçek eşzamanlılık: ÇALIŞTIRILAMADI** (yukarıda).
- **Ses cevabının gerçek kaydı ve yüklemesi: ÇALIŞTIRILAMADI.** Mikrofon ve Supabase Storage testlerde sahtelendi; gerçek cihazda elle denenmeli (§16.5).
- **"Neden bu kişi?" çevirme animasyonu gerçek cihazda: ÇALIŞTIRILAMADI.** Hareket azaltma açıkken kısa geçişe düştüğü kodda; görsel kontrol elle yapılmalı.
- **Entegrasyon testi (fonksiyon ↔ veritabanı ↔ depolama): YAZILMADI.** Docker bekliyor.

---

## Faz 2 — Profil · 2026-10-12

**Ortam:** önceki fazlarla aynı makine; Docker hâlâ çalışmıyor.

### Özet

| Katman                              | Komut                                                               | Sonuç                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Statik + çeviri                     | `npm run typecheck`, `lint`, `format:check`, `i18n:check`           | **0 hata** · TR 394 = EN 394 anahtar                                                   |
| Birim: iş kuralları                 | `npm test -w @nokuzo/shared`                                        | **128/128** · satır kapsamı **%100**                                                   |
| Birim: tasarım belirteçleri         | `npm test -w @nokuzo/design-tokens`                                 | **38/38**                                                                              |
| Birim + bileşen: mobil              | `npm test -w @nokuzo/mobile`                                        | **109/109** · satır kapsamı %88 (eşik %80)                                             |
| Edge Functions                      | `npm run functions:check` (18 fonksiyon) + `npm run functions:test` | **0 tip hatası · 86/86** · servis satır kapsamı: media %95, profile %91+, liveness %99 |
| Veritabanı (pgTAP), PGlite          | göçler + içerik + yerel tohum + 3 test dosyası                      | **125/125** (Faz 0: 13, Faz 1: 57, Faz 2: 55)                                          |
| Veritabanı (pgTAP), gerçek Supabase | `npx supabase test db`                                              | **ÇALIŞTIRILAMADI** (Docker; CI'daki `database` işi çalıştıracak)                      |
| Mobil paketleme                     | `expo export --platform android --platform web`                     | **başarılı** (Android 7,2 MB, web 4,3 MB)                                              |
| Expo yapılandırması                 | `expo-doctor`                                                       | **21/21**                                                                              |
| Hepsi bir arada                     | `npm run ci`                                                        | **çıkış kodu 0**                                                                       |

### Faz 2 kabul kriterleri (APP.md §21)

| Kriter                                                         | Durum     | Kanıt                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Moderasyondan geçmemiş görsel başka kullanıcıya servis edilmez | **Geçti** | `02_profile.test.sql`: kovalar özel; karantinadaki nesne sahibine bile listelenmiyor; herkese açık profilde yalnızca onaylı fotoğraflar var. `profile_test.ts`: incelemedeki ve reddedilen fotoğraf `public-photos`'a hiç yazılmıyor; moderasyon sağlayıcısı yokken hiçbir şey kendiliğinden yayına girmiyor |
| Ret gerekçesi görünür                                          | **Geçti** | `02_profile.test.sql` (gerekçe saklanıyor), `profile.test.tsx` (ekranda "Ana fotoğrafta yüzün net görünmüyor." vb.), metin retlerinde alan ve gerekçe (`text_blocked`)                                                                                                                                       |

### Test kataloğu eşlemesi (§16.3)

| Test                                                                                    | Durum                            | Nerede                                                                                                                                                                             |
| --------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRO-01 Karantinadaki görsel hiçbir yoldan servis edilmez                                | Geçti                            | `02_profile.test.sql`, `profile_test.ts`                                                                                                                                           |
| PRO-02 EXIF/GPS kalmaz                                                                  | Geçti                            | `media_test.ts` (JPEG: EXIF, GPS, XMP, IPTC, yorum; PNG: tEXt, eXIf), `profile_test.ts` (yayınlanan ve incelemedeki kopya)                                                         |
| PRO-03 Desteklenmeyen tür, aşırı boyut, bozuk dosya                                     | Geçti                            | `media_test.ts`, `profile_test.ts`                                                                                                                                                 |
| PRO-04 Müstehcen etiketli görsel reddedilir, gerekçe gösterilir                         | Geçti                            | `moderation.test.ts`, `profile_test.ts`, `profile.test.tsx`                                                                                                                        |
| PRO-05 İmzalı URL süresi dolunca çalışmaz                                               | Kısmen                           | URL'lerin 10 dakikalık süreyle istendiği test edildi (`profile_test.ts`). Sürenin dolunca gerçekten reddedildiği Supabase Storage'ın davranışı; gerçek ortamda **ÇALIŞTIRILAMADI** |
| PRO-06 "Profilde gösterme" alanı hiçbir yanıtta dönmez                                  | Geçti                            | `02_profile.test.sql` (gizli boy, gizli cinsiyet)                                                                                                                                  |
| PRO-07 Doğum tarihi, e-posta, telefon, koordinat, risk puanı herkese açık görünümde yok | Geçti                            | `02_profile.test.sql`                                                                                                                                                              |
| PRO-08 Düzenleme onaylanana kadar eski sürüm yayında                                    | Geçti                            | `02_profile.test.sql`, `profile_test.ts`, `profile.test.tsx`                                                                                                                       |
| PRO-09 Alan sınırları (ad, hakkımda, Kapı Sorusu, 3–6 fotoğraf, 5–10 ilgi)              | Geçti                            | `profile.test.ts`, `02_profile.test.sql`, `profile.test.tsx`                                                                                                                       |
| VER-02 Fotoğraf canlılık yüzüyle eşleşmezse yayınlanmaz                                 | Geçti (ana fotoğraf için, D-036) | `moderation.test.ts`, `profile_test.ts`                                                                                                                                            |
| VER-07 Ana fotoğraf değişince yeniden doğrulama                                         | Geçti                            | `02_profile.test.sql`, `rules.test.ts`, `liveness_test.ts`                                                                                                                         |

### ÇALIŞTIRILAMAYAN / EKSİK

- **pgTAP, gerçek Supabase'de: ÇALIŞTIRILAMADI.** Docker yok. PGlite'ta `storage` şeması taklit edildi; gerçek Supabase Storage'ın kendi tetikleyicileri ve politikaları farklı olabilir. **Nasıl çalıştırılır:** CI'daki `database` işi ya da `npx supabase start` + `npx supabase test db`.
- **Gerçek yükleme ve indirme: ÇALIŞTIRILAMADI.** İmzalı URL ile yükleme ve süresi dolmuş URL'nin reddedilmesi yalnızca gerçek Supabase Storage'da denenebilir.
- **AWS görüntü moderasyonu, gerçek hesapla: ÇALIŞTIRILAMADI** (NEEDS_SETUP). Bağdaştırıcı sahte istemciyle test edildi.
- **CSAM karma eşleştirmesi: YOK** (D-047, yayın engelleyici).
- **Kamera, mikrofon, konum izinleri gerçek cihazda: ÇALIŞTIRILAMADI.** Testlerde sahtelendi; elle denenmeli (§16.5).
- **Entegrasyon testi (fonksiyon ↔ veritabanı ↔ depolama): YAZILMADI.** Faz 1'deki gibi Docker bekliyor.

---

## Faz 1 — Kimlik ve doğrulama · 2026-10-11

**Ortam:** Faz 0 ile aynı makine. Docker daemon hâlâ çalışmıyor (BIOS'ta sanallaştırma kapalı). Deno 2.9.6 projeye npm paketi olarak eklendi.

### Özet

| Katman                              | Komut                                                               | Sonuç                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Statik                              | `npm run typecheck`, `npm run lint`, `npm run format:check`         | **0 hata, 0 uyarı**                                                                              |
| Çeviri anahtarları                  | `npm run i18n:check`                                                | **geçti**: TR 155 = EN 155; kodda bilinmeyen anahtar yok                                         |
| Birim: iş kuralları                 | `npm test -w @nokuzo/shared`                                        | **67/67** · satır kapsamı **%100** (eşik: iş kuralı modüllerinde %95)                            |
| Birim: tasarım belirteçleri         | `npm test -w @nokuzo/design-tokens`                                 | **38/38**                                                                                        |
| Birim + bileşen: mobil              | `npm test -w @nokuzo/mobile`                                        | **88/88** · satır kapsamı **%93,5** (eşik %80)                                                   |
| Edge Functions tip denetimi         | `npm run functions:check` (`deno check`, 10 fonksiyon)              | **0 hata**                                                                                       |
| Edge Functions birim                | `npm run functions:test` (`deno test`)                              | **60/60** · servis dosyalarında satır kapsamı: auth %97, phone %96, onboarding %98, liveness %99 |
| Veritabanı (pgTAP), yedek ortam     | PGlite (Postgres 17) + pgTAP; göçler + yerel tohum + 2 test dosyası | **70/70** (Faz 0: 13, Faz 1: 57)                                                                 |
| Veritabanı (pgTAP), gerçek Supabase | `npx supabase test db`                                              | **ÇALIŞTIRILAMADI** (aşağıda)                                                                    |
| Mobil paketleme                     | `npx expo export --platform android --platform web`                 | **başarılı**: Android Hermes paketi 7 MB, web 4,1 MB                                             |
| Expo yapılandırması                 | `npx expo-doctor`                                                   | **21/21**                                                                                        |
| Web derlemesi                       | `next build`                                                        | **başarılı**                                                                                     |
| Hepsi bir arada                     | `npm run ci`                                                        | **çıkış kodu 0**                                                                                 |

### Faz 1 kabul kriterleri (APP.md §21)

| Kriter                                         | Durum                     | Kanıt                                                                                                                    |
| ---------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Doğrulanmamış kullanıcı hiçbir profili göremez | **Geçti** (pgTAP, PGlite) | `01_identity.test.sql`: "a user sees exactly one profile: their own", "anonymous users cannot read profiles"             |
| VoIP numara reddedilir                         | **Geçti**                 | `phone_test.ts` "VoIP numbers are refused (AUTH-04)"; `identity.test.ts` hat politikası                                  |
| Tek kullanımlık e-posta reddedilir             | **Geçti**                 | `auth_test.ts` "malformed and disposable addresses are refused (AUTH-04)"; Auth kancası testi; 9222 alan adlı açık liste |
| Banlı e-posta ile kayıt reddedilir             | **Geçti**                 | `auth_test.ts` BAN-01 (büyük/küçük harf, boşluk, Gmail nokta ve `+etiket` varyantları), kanca testi                      |
| Banlı telefon ile kayıt reddedilir             | **Geçti**                 | `phone_test.ts` BAN-02 (farklı yazımlar E.164'e indirgenir)                                                              |
| Banlı yüz ile kayıt reddedilir                 | **Geçti**                 | `liveness_test.ts` BAN-03; `01_identity.test.sql` ban atlatma (BAN-10)                                                   |

**Sonuç:** Faz 1'in kabul kriterleri otomatik testlerle karşılandı. Ancak "Faz 1 bitti" demek için şu eksikler var: gerçek Supabase'de pgTAP ve entegrasyon testi çalıştırılmadı, gerçek kamera canlılık modülü yok (D-028), Apple/Google düğmeleri yok (D-032). Hepsi hesap ya da Docker bekliyor.

### Test kataloğu eşlemesi (§16.3)

| Test                                                                       | Durum     | Nerede                                                                                                                                               |
| -------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUTH-01 18 yaş altı sunucuda ret; istemci atlansa da                       | Geçti     | `onboarding_test.ts`, `01_identity.test.sql`, `rules.test.ts`, `onboarding.test.tsx`                                                                 |
| AUTH-02 Süresi dolmuş / yanlış / yeniden kullanılmış kod; 5 yanlışta kilit | Geçti     | `01_identity.test.sql` (SQL'in kendisi), `auth_test.ts`                                                                                              |
| AUTH-03 Saatte 3 OTP, IP ve cihaz ayrı                                     | Geçti     | `auth_test.ts`, `phone_test.ts`, `01_identity.test.sql`                                                                                              |
| AUTH-04 VoIP ve tek kullanımlık e-posta                                    | Geçti     | yukarıda                                                                                                                                             |
| AUTH-05 Bir numara ikinci hesaba bağlanamaz                                | Geçti     | `01_identity.test.sql`, `phone_test.ts`                                                                                                              |
| AUTH-06 Kaldığı adımdan devam                                              | Geçti     | `rules.test.ts` (adım sırası), `gate.test.ts`, `GateScreen.test.tsx`                                                                                 |
| AUTH-07 Zorunlu rızalar, önceden işaretsiz, sürümle kayıt                  | Geçti     | `rules.test.ts`, `onboarding_test.ts`, `onboarding.test.tsx`, `01_identity.test.sql`                                                                 |
| AUTH-08 Yenileme belirteci döndürme; tüm cihazlardan çıkış                 | Kısmen    | Döndürme `config.toml`'da açık (Supabase'in özelliği, ayrıca test edilmedi). "Tüm cihazlardan çık" Faz 7 (Ayarlar)                                   |
| AUTH-09 Doğrulanmamış kullanıcı veri okuyamaz                              | Geçti     | `01_identity.test.sql`                                                                                                                               |
| VER-01 Eşik altı → ret; 3 başarısızlıkta 24 saat                           | Geçti     | `liveness_test.ts`, `rules.test.ts`, `onboarding.test.tsx`                                                                                           |
| VER-02 Profil fotoğrafı eşleşmesi                                          | Faz 2     | Fotoğraf hattıyla gelecek                                                                                                                            |
| VER-03 Aynı yüz ikinci hesapta → kayıt durur                               | Geçti     | `liveness_test.ts`, `01_identity.test.sql`                                                                                                           |
| VER-04 Yaş tahmini 21 altı → kimlik adımı                                  | Geçti     | `liveness_test.ts`, `rules.test.ts`                                                                                                                  |
| VER-05 İstemci `verified_at` yazamaz                                       | Geçti     | `01_identity.test.sql`                                                                                                                               |
| VER-06 Webhook imzası ve tek işleme                                        | Kısmen    | Tek işleme: `01_identity.test.sql`; imza: Auth kancası (`infra_test.ts`). Kimlik doğrulama sağlayıcısı seçilmediği için sağlayıcıya özgü webhook yok |
| VER-07 Ana fotoğraf değişince yeniden doğrulama                            | Faz 2     |                                                                                                                                                      |
| VER-08 Biyometrik rızanın geri çekilmesi                                   | Faz 7     | Ayarlar ve rıza geçmişiyle                                                                                                                           |
| BAN-01..05, BAN-10, BAN-12                                                 | Geçti     | `auth_test.ts`, `phone_test.ts`, `liveness_test.ts`, `infra_test.ts`, `01_identity.test.sql`                                                         |
| BAN-06 Yanıt gövdesi ve süresi aynı                                        | Geçti     | `auth_test.ts` (aynı gövde; ikisi de en az 150 ms'ye dolduruldu, fark < 60 ms)                                                                       |
| BAN-07 Banlı kullanıcı hiçbir tabloya yazamaz                              | Kısmen    | Faz 1'de istemcinin yazabildiği tablo yok (pgTAP). Ban ekranı Faz 5                                                                                  |
| BAN-08, 09, 11 (itiraz, silme, 30 gün geri dönüş)                          | Faz 5 / 7 |                                                                                                                                                      |

### ÇALIŞTIRILAMAYAN / EKSİK

- **pgTAP, gerçek Supabase'de: ÇALIŞTIRILAMADI.** Docker çalışmıyor. Aynı testler PGlite'ta (gerçek Postgres 17, WASM) geçti; Supabase rolleri ve `auth.uid()` taklit edildi. **Sahibi nasıl çalıştırır:** GitHub'a gönderince CI'daki `database` işi gerçek Supabase'de çalıştırır, ya da sanallaştırma açıldıktan sonra `npx supabase start` ve `npx supabase test db`.
- **Entegrasyon testi (fonksiyon ↔ veritabanı ↔ sahte dış servis, §16.2): YAZILMADI.** `db.ts` ve `app.ts` (gerçek Supabase bağdaştırıcıları) birim testlerinde yok; servisler sahte veritabanıyla test edildi. Bu, Docker ya da CI'da yerel Supabase gerektiriyor. Sıradaki iş olarak önerilir.
- **Gerçek servis duman testleri (§16.1): ÇALIŞTIRILAMADI.** Resend, Twilio (SMS ve hat türü) ve AWS Rekognition hesapları yok (NEEDS_SETUP). Bağdaştırıcılar sahte `fetch` ve sahte AWS istemcisiyle test edildi. API biçimleri sağlayıcı belgelerine göre yazıldı ama gerçek hesapla doğrulanmadı. Adımlar `docs/SETUP.md`'de.
- **Gerçek kamera canlılık modülü: YAPILMADI** (D-028).
- **Uçtan uca (Maestro) akış 1, "kayıt → ilk Tur": ÇALIŞTIRILAMADI.** Emülatör (sanallaştırma) yok; Tur da henüz yok (Faz 3).
- **CI (GitHub Actions): ÇALIŞTIRILAMADI.** Commit'ler hazır ama gönderim senin kimlik bilgilerinle yapılmalı.

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
