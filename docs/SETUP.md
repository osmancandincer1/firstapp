# Kurulum ve NEEDS_SETUP listesi

Bu belge iki şeyi anlatır: (1) geliştirme makinesinin nasıl hazırlanacağı, (2) hesap/anahtar gerektiren her servisin durumu. Hesabı açılmamış servisler `NEEDS_SETUP` durumundadır; o servise bağlı özellik kapalı kalır, sahte "bağlandı" sonucu üretilmez (APP.md §0.9).

## 1. Geliştirme makinesi

| Araç           | Gerekli sürüm                             | Neden                                                                                                              |
| -------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Node.js        | 22+ (CI: `.nvmrc` → 24)                   | Her şey                                                                                                            |
| Git            | herhangi güncel                           | Sürüm kontrolü                                                                                                     |
| Docker Desktop | güncel                                    | Yerel Supabase (`npx supabase start`, `npx supabase test db`)                                                      |
| Android Studio | güncel; SDK 34+                           | Android derlemesi, emülatör                                                                                        |
| JDK 17+        | Android Studio'nun içindeki `jbr` yeterli | Gradle                                                                                                             |
| macOS + Xcode  | —                                         | iOS'u yerelde derlemek için. Windows'ta yok; iOS derlemesi CI'da (macOS çalıştırıcısı) ya da EAS Build ile yapılır |

Windows ortam değişkenleri (Android için):

```
ANDROID_HOME = %LOCALAPPDATA%\Android\Sdk
JAVA_HOME    = C:\Program Files\Android\Android Studio\jbr
PATH        += %ANDROID_HOME%\platform-tools
```

Docker Desktop ve Android emülatörü için BIOS'ta donanım sanallaştırması (AMD: **SVM Mode**, Intel: **VT-x**) açık olmalı, Windows'ta **WSL 2** kurulu olmalı (`wsl --install`).

### Windows'ta yerel Android derlemesi: bilinen iki engel

1. **Yol uzunluğu (260 karakter):** React Native'in C++ ara dosyaları uzun yollarda `Filename longer than 260 characters` hatası verir. Projeyi kısa bir yola taşı (ör. `C:\dev\dokuz`). Sürücü harfi atamak (`subst`) işe yaramıyor.
2. **JDK 24+ (Android Studio'nun JBR'ı JDK 25):** CMake adımı `A restricted method in java.lang.System has been called` uyarısıyla düşer. Derlemeden önce `JAVA_TOOL_OPTIONS=--enable-native-access=ALL-UNNAMED` ayarla ya da JDK 17/21 kullan. CI JDK 17 kullanır.

## 2. Yerel çalıştırma

```bash
npm install               # kökte, bir kez
npm run mobile            # Expo geliştirme sunucusu (QR kod → Expo Go)
npm run web               # Next.js tanıtım sitesi → http://localhost:3000
npm run ci                # tip denetimi + lint + biçim + i18n + Jest + Deno (Edge Functions)
npx supabase start        # yerel Supabase + Edge Functions (Docker gerekir)
npx supabase test db      # pgTAP testleri (Docker gerekir)
```

### Kayıt akışını yerelde uçtan uca çalıştırmak (Docker gerekir)

1. `supabase/functions/.env.example` dosyasını `supabase/functions/.env` olarak kopyala ve `HASH_HMAC_SECRET` için rastgele bir değer üret (dosyada komutu var). Bu dosya yerelde e-posta/SMS kodlarını göndermek yerine **fonksiyon günlüğüne yazar** ve canlılığı taklit eder.
2. `npx supabase start` → çıktıdaki `API URL` ve `anon key` değerlerini not al. (Tohum dosyası yerel taslak yasal belgeleri ekler.)
3. Telefon bilgisayara `127.0.0.1` ile ulaşamaz. `apps/mobile/.env.local` dosyası oluştur:
   ```
   EXPO_PUBLIC_APP_ENV=local
   EXPO_PUBLIC_SUPABASE_URL=http://<bilgisayarın yerel ağ IP'si>:54321
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   ```
4. `npm run mobile` → Expo Go ile aç. Kodlar Edge Runtime günlüğünde `[DEV EMAIL]` / `[DEV SMS]` satırlarında görünür: `docker logs -f supabase_edge_runtime_nokuzo`.
5. **Yeni bir dosya eklendiyse** (ör. `packages/shared/src` altında) Edge Functions "Module not found" verebilir: çalışma ortamı açıldığı andaki dosyaları bağlar. `npx supabase stop` ve ardından `npx supabase start` yeterli; veriler korunur. **`npx supabase db reset` kullanma** — yerel hesapları siler; yeni göçler için `npx supabase migration up --local`.

### Demo kişiler (yalnızca yerel)

Tur, cevap ve masa akışını denemek için yerel Supabase'e sahte ama doğrulanmış kişiler ekler. Uzak bir adrese bağlıysa çalışmayı reddeder.

```bash
node scripts/demo-people.mjs seed --for <senin test e-postan>   # ~30 kişi; çoğu seninle eşleşir, bir kısmı bilerek filtre dışında; 4'ü sana cevap gönderir
node scripts/demo-people.mjs tur --for <e-posta>                # bugünkü Tur'u şimdi yeniden üretir
node scripts/demo-people.mjs fun                                # var olan demo kişilere bu haftanın modunu ve "İki doğru, bir yalan" oyununu verir (seed bunu zaten yapar)
node scripts/demo-people.mjs chat --for <e-posta>               # masalarındaki demo kişiler birer mesaj yazar (gerçek zamanlı deneme)
node scripts/demo-people.mjs reply                              # cevap gönderdiğin demo kişiler karşılık verir → masa açılır
node scripts/demo-people.mjs clean                              # demo kişileri siler
```

`npx supabase db reset` yerel veritabanındaki **her şeyi** (test hesapları dahil) siler; testler için gerekmez, `npx supabase test db` yeterli.

## 3. Servis durumu

| Servis                                | Durum               | Ortam değişkenleri                                                                                                            | Ne zaman gerekir                                     | Sahibin yapacağı                                                                                                                                                                                                    |
| ------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase (uzak: staging + production) | NEEDS_SETUP         | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Faz 1                                                | supabase.com'da hesap → iki proje (staging, production), bölge **Frankfurt (eu-central-1)** → Project Settings → API'den URL ve anahtarlar. Sonra `npx supabase link --project-ref <ref>` ve `npx supabase db push` |
| Supabase (yerel)                      | Çalışıyor           | (yerelde otomatik) + `supabase/functions/.env`                                                                                | Şimdi                                                | BIOS'ta SVM + WSL 2 + Docker Desktop (bkz. §1)                                                                                                                                                                      |
| GitHub deposu + Actions               | Bağlı; CI çalışıyor | — (`GITLEAKS_LICENSE` yalnızca depo bir organizasyondaysa)                                                                    | Faz 0 kabulü (CI yeşil)                              | `github.com/osmancandincer1/firstapp`. Yapıldı. Push için ince ayarlı token: yalnızca bu depo, **Contents** ve **Workflows** = Read and write                                                                       |
| Sentry                                | NEEDS_SETUP         | `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`                                                                                        | İsteğe bağlı, yayından önce şart                     | sentry.io → React Native projesi → DSN. Kaynak haritası için ileride `SENTRY_AUTH_TOKEN`, organizasyon ve proje adı                                                                                                 |
| Expo / EAS                            | NEEDS_SETUP         | `EXPO_PROJECT_ID`                                                                                                             | Telefona kurulabilir derleme, mağaza                 | expo.dev hesabı → `npx eas-cli login` → `npx eas-cli init`                                                                                                                                                          |
| Apple Developer Program               | NEEDS_SETUP         | `APPLE_TEAM_ID`, `APPLE_SERVICE_ID`                                                                                           | Gerçek iPhone'a kurulum, TestFlight, Apple ile giriş | 99 $/yıl; kuruluş hesabı için D-U-N-S                                                                                                                                                                               |
| Google Play Console                   | NEEDS_SETUP         | —                                                                                                                             | Play kapalı test                                     | 25 $ tek sefer                                                                                                                                                                                                      |
| AWS Rekognition (canlılık + yüz)      | NEEDS_SETUP         | `LIVENESS_PROVIDER=aws`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `REKOGNITION_COLLECTION_ID`              | Faz 1                                                | AWS hesabı; Face Liveness'ın desteklendiği bölgeyi doğrula; yüz koleksiyonunu oluştur (`aws rekognition create-collection`). Uygulama içi kamera modülü için ayrıca Cognito kimlik havuzu (D-028)                   |
| SMS + numara türü sorgusu             | NEEDS_SETUP         | `SMS_PROVIDER=twilio`, `SMS_API_KEY="<AccountSID>:<AuthToken>"`, `SMS_SENDER_ID` (Messaging Service `MG…` ya da gönderici)    | Faz 1                                                | Sağlayıcı kararı (D-029). Twilio: Lookup v2 "Line Type Intelligence" açık olmalı; Türkiye için gönderici adı kaydı gerekebilir — duman testi: kendi numarana kod iste, sanal bir numarayla reddedildiğini gör       |
| E-posta                               | NEEDS_SETUP         | `EMAIL_PROVIDER=resend`, `EMAIL_API_KEY`, `EMAIL_FROM`                                                                        | Faz 1                                                | Resend hesabı + alan adı doğrulaması (SPF/DKIM/DMARC). **Supabase Auth'a SMTP tanımlama** (D-020). Duman testi: kendi adresine kod iste                                                                             |
| Apple / Google ile giriş              | NEEDS_SETUP         | `APPLE_TEAM_ID`, `APPLE_SERVICE_ID`, `GOOGLE_*_CLIENT_ID`                                                                     | Faz 1 (isteğe bağlı)                                 | Sağlayıcıları Supabase Auth'ta etkinleştir; ardından "before user created" kancasını kur (aşağıda). Düğmeler uygulamaya bu adımdan sonra eklenecek (D-032)                                                          |
| `HASH_HMAC_SECRET`                    | NEEDS_SETUP         | `HASH_HMAC_SECRET`                                                                                                            | Faz 1                                                | Her ortam için ayrı, en az 32 rastgele bayt; yalnızca Supabase sırlarına girilir                                                                                                                                    |
| RevenueCat                            | NEEDS_SETUP         | `REVENUECAT_*`                                                                                                                | Faz 8                                                | —                                                                                                                                                                                                                   |
| PostHog                               | NEEDS_SETUP         | `POSTHOG_KEY`, `POSTHOG_HOST`                                                                                                 | Faz 7+                                               | AB bölgesi                                                                                                                                                                                                          |
| Moderasyon API'si                     | NEEDS_SETUP         | `MODERATION_API_KEY`                                                                                                          | Faz 5                                                | Sağlayıcı seçimi                                                                                                                                                                                                    |
| Vercel                                | NEEDS_SETUP         | —                                                                                                                             | Site yayını                                          | —                                                                                                                                                                                                                   |

### Faz 2 notları

- Görüntü moderasyonu canlılıkla aynı AWS hesabını kullanır (`LIVENESS_PROVIDER=aws`); ek anahtar yok. Hesap yokken fotoğraflar "inceleniyor"da bekler (D-038).
- **CSAM karma eşleştirmesi** için sağlayıcı başvurusu gerekiyor (ör. Microsoft PhotoDNA). TODO(owner) — yayın engelleyici (D-047).
- Açılış şehri belli olunca o şehrin resmî ilçe listesi `districts` tablosuna eklenecek (D-040).
- İçeriği değiştirdikten sonra: `node scripts/build-content-sql.mjs` (göç dosyası yeniden üretilir).

### Supabase Auth kancası (uzak proje)

Dashboard → Authentication → Hooks → **Before User Created** → HTTP → `https://<proje>.supabase.co/functions/v1/auth-hook-before-user-created`. Üretilen `v1,whsec_…` sırrını `AUTH_HOOK_SECRET` olarak fonksiyon sırlarına ekle (`npx supabase secrets set AUTH_HOOK_SECRET=…`). Kanca banlı ya da tek kullanımlık e-postayla yeni hesap açılmasını engeller.

### Uzak ortamda olmaması gerekenler

`EMAIL_PROVIDER=log`, `SMS_PROVIDER=log`, `LIVENESS_PROVIDER=mock` yalnızca `APP_ENV=local` iken çalışır; staging/production'da fonksiyonlar bu değerlerle başlamaz. Yerel tohum dosyası (`supabase/seed/`) uzak veritabanına uygulanmaz; orada `legal.allow_draft_documents` kapalı kalmalı.

Ortam değişkenleri `.env.example` dosyasında listelidir. Gerçek değerler `.env.local` dosyasına yazılır; bu dosya git'e girmez.
