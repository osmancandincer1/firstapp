# Mimari

Ayrıntılı hedef mimari APP.md §13'tedir. Bu belge **şu an kodda olanı** anlatır ve her fazda güncellenir.

## Depo yapısı (Faz 0)

```
firstapp/                    (APP.md §13.2'deki dokuz/ kökü)
├─ apps/
│  ├─ mobile/                Expo SDK 57 + Expo Router, TypeScript strict
│  │  └─ src/
│  │     ├─ app/             rotalar (_layout.tsx, index.tsx)
│  │     ├─ components/      AppText, Button, Input, Card, Sheet, Banner, Skeleton, SegmentedControl, Icon
│  │     ├─ design/          ThemeProvider (Gece/Gündüz/Sistem), hareketi azalt
│  │     ├─ features/        foundation/ (Faz 0 gösterim ekranı)
│  │     ├─ i18n/            i18next + tr.json / en.json
│  │     ├─ lib/             env (zod ile doğrulanan EXPO_PUBLIC_* değişkenleri), sentry
│  │     ├─ stores/          zustand: görünüm tercihleri
│  │     └─ test/            test yardımcıları
│  └─ web/                   Next.js 16 (App Router): tanıtım; ileride yasal sayfalar + admin
├─ packages/
│  ├─ design-tokens/         renk, tipografi, boşluk, köşe, hareket belirteçleri + WCAG kontrast denetimi
│  └─ shared/                zod şemaları (ortam yapılandırması), ortak kurallar
├─ supabase/
│  ├─ config.toml            yerel Supabase
│  ├─ migrations/            SQL göçleri
│  ├─ tests/database/        pgTAP testleri
│  ├─ functions/             Edge Functions (Faz 1+)
│  └─ seed/                  tohum verisi (Faz 1+)
├─ scripts/check-i18n.mjs    çeviri anahtarı denetimi (CI)
├─ .github/workflows/ci.yml
└─ docs/
```

## İlkeler

- **Paylaşılan paketler TypeScript kaynağı olarak** tüketilir (`main: src/index.ts`). Metro ve Next.js (`transpilePackages`) bunları derler.
- **Tek React sürümü:** kök `package.json > overrides`. Yeni paket eklerken `npm ls react` ile tek kopya olduğunu doğrula.
- **Yerel klasörler üretilir:** `apps/mobile/android` ve `ios` git'e girmez; `npx expo prebuild` ile `app.json`'dan üretilir (Continuous Native Generation).
- **Sırlar:** istemciye yalnızca `EXPO_PUBLIC_*` gider. `@nokuzo/shared > parsePublicEnv` gizli anahtar adlarını görürse hata verir.
- **Veritabanı:** her tabloda RLS açık; politika yazılmadan istemci erişemez. pgTAP testi bunu her tablo için denetler.

## Kayıt akışı (Faz 1)

```
Uygulama ekranı      Edge Function                  Veritabanı (srv_* SQL, yalnızca servis rolü)
E-posta          ->  email-otp-request          ->  srv_rate_limit_hit, srv_ban_lookup, srv_otp_create
Kod              ->  email-otp-verify           ->  srv_otp_verify, srv_register_device, srv_bind_identifier
(Kapı)           ->  my_onboarding_state()      ->  hangi adım? (istemcinin doğrudan çağırdığı tek fonksiyon)
Telefon          ->  phone-otp-request          ->  ülke + hat türü + ban, srv_otp_create (hesaba bağlı)
Kod              ->  phone-otp-verify           ->  srv_mark_phone_verified
Doğum tarihi     ->  onboarding-birth-date      ->  srv_set_birth_date (İstanbul takvimi)
Rızalar          ->  onboarding-consents        ->  consents (+ IP HMAC), current_legal_documents()
Canlılık         ->  liveness-start / complete  ->  AWS oturumu, yüz arama, yaş; srv_face_owners, srv_liveness_finish
Apple/Google     ->  session-register           ->  cihaz + OAuth kimliği ban denetimi
(Supabase Auth)  ->  auth-hook-before-user-created -> banlı / tek kullanımlık e-postayı reddet
```

- **Kapı (`GateScreen`)** uygulamanın tek karar noktası: sunucudaki durumu okur ve kullanıcıyı ilk bitmemiş adıma yönlendirir. Uygulama kapanıp açılınca kaldığı yerden devam edilir (AUTH-06).
- **İş kuralları** `packages/shared` içinde saf fonksiyonlar: e-posta/telefon normalizasyonu, yaş, rızalar, OTP politikası, canlılık kararı, adım sırası. Aynı dosyalar uygulamada (anlık geri bildirim) ve Edge Function'larda (son söz) kullanılır.
- **Atomik kurallar** SQL'de (`public.srv_*`): OTP kilidi, hız sınırı, tanımlayıcı bağlama, yaş kapısı, ban atlatma.
- **Edge Function katmanları:** `index.ts` → `_shared/http.ts` (yöntem, JSON, IP, en kısa yanıt süresi) → `_shared/services/*` (iş akışı; bağımlılıkları dışarıdan alır, sahtelerle test edilir) → `_shared/db.ts` ve `_shared/providers/*` (Supabase, Resend, Twilio, AWS).
- **Sağlayıcı yoksa özellik kapalı:** anahtarı girilmemiş servis `null` olur ve ilgili adım `service_unavailable` döner (§0.9).

## Profil ve medya (Faz 2)

```
Uygulama                          Edge Function               Depolama / SQL
Fotoğraf seç → JPEG ≤2048 px  ->  profile-photo upload_url -> srv_photo_create, imzalı yükleme URL'si (quarantine)
Doğrudan yükleme              ->  (Supabase Storage)        -> quarantine/<profil>/photos/<id>.jpg
                                  profile-photo process     -> tür/boyut denetimi, meta veri silme, AWS sinyalleri,
                                                               decidePhoto → public-photos | ret | inceleme
Profil alanları               ->  profile-update            -> moderateText → srv_update_* | profile_edits (inceleme)
Önizleme / kendi medyası      ->  profile-view              -> srv_my_public_profile + 10 dk'lık imzalı URL'ler
Ses kartı                     ->  profile-voice             -> M4A süresi (moov/mvhd), public-voice
```

- **Herkese açık profil** tek yerden üretilir: `srv_public_profile()`. Önizleme de aynısını gösterir; "başkası nasıl görüyor?" ekranı bu yüzden yanılmaz.
- **Kayıt tamamlanınca** (`srv_try_complete_onboarding`) hesap `active` olur; ana fotoğraf sonradan değişirse `reverify_required` açılır ve kapı kullanıcıyı canlılığa gönderir.
- **İçerik** (sorular, ilgi alanları, iller) `supabase/content/*.json` dosyalarından `scripts/build-content-sql.mjs` ile göçe dönüştürülür.

## Tur, cevap ve masa (Faz 3)

```
pg_cron 11:30 / 20:30   -> srv_generate_all_turs(noon|evening) -> srv_generate_tur (kullanıcı başına, Tur başına bir kez; D-062)
                                                  eligible_pool (karşılıklı filtreler) − recently_seen
                                                  → puan (§5 ağırlıkları, bayraklardan) → çeşitlilik → 9 kart
pg_cron saat başı       -> srv_expire_daily      -> 14 günlük cevaplar, 7 günlük saklananlar, 72 saatlik bekleyen masalar

Uygulama                          Edge Function             SQL
Tur sekmesi                   ->  tur  view|saved|pass|save|unsave|less -> srv_current_tur, srv_tur_action, ...
Cevap yaz (metin / ses)       ->  answer send           -> denetimler (TS) → srv_answer_create (sınırlar, Tur'da mı?)
Cevaplar kutusu               ->  answer inbox          -> srv_inbox (imzalı foto/ses URL'leri)
Karşılık ver / Geç            ->  answer reciprocate|pass -> srv_answer_respond (kilit, masa ya da "Masa bekliyor")
Masalar                       ->  tables list           -> srv_my_tables
Filtreler                     ->  profile-update preferences ; my_preferences(), my_pool_estimate() (RLS ile doğrudan)
Uygulama açılınca             ->  touch_activity()  ("son 7 günde aktif")
```

- **Kural nerede?** Kimin kime görüneceği, sınırlar ve masa açılışı SQL'de (`srv_*`, yalnızca servis rolü). Metin biçimi, moderasyon ve kopya tespiti TypeScript'te (`packages/shared/src/tur.ts`), hem uygulamada hem Edge Function'da aynı kodla.
- **Medya:** kartlar, cevaplar ve masalardaki profiller `services/sign.ts` ile 10 dakikalık imzalı URL'lere çevrilir; ham depolama yolları ve iç profil kimlikleri yanıtta yoktur.
- **"Neden bu kişi?"** `tur_reasons()` en güçlü iki neden ve bir dürüst fark üretir; yalnızca karşı tarafın görünür alanlarını kullanır, fotoğraf/yüz/özel nitelikli veri kullanmaz. Uygulama anahtarları çevirir.
- **Mobil:** alt sekmeler `src/app/(tabs)` (Tur · Cevaplar · Masalar · Ben); ekranlar `features/tur`, `features/answers`, `features/tables`.
