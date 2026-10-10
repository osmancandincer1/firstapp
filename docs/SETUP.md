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
npm run ci                # tip denetimi + lint + biçim + i18n + birim testleri
npx supabase start        # yerel Supabase (Docker gerekir)
npx supabase test db      # pgTAP testleri (Docker gerekir)
```

## 3. Servis durumu

| Servis                                | Durum           | Ortam değişkenleri                                                                                                            | Ne zaman gerekir                                     | Sahibin yapacağı                                                                                                                                                                                                    |
| ------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase (uzak: staging + production) | NEEDS_SETUP     | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Faz 1                                                | supabase.com'da hesap → iki proje (staging, production), bölge **Frankfurt (eu-central-1)** → Project Settings → API'den URL ve anahtarlar. Sonra `npx supabase link --project-ref <ref>` ve `npx supabase db push` |
| Supabase (yerel)                      | Docker bekliyor | (yerelde otomatik)                                                                                                            | Şimdi                                                | Docker Desktop'ın çalışması (bkz. §1)                                                                                                                                                                               |
| GitHub deposu + Actions               | NEEDS_SETUP     | — (`GITLEAKS_LICENSE` yalnızca depo bir organizasyondaysa)                                                                    | Faz 0 kabulü (CI yeşil)                              | GitHub'da özel depo aç, bana adını söyle; `git remote add origin …` ve ilk gönderimi birlikte yaparız                                                                                                               |
| Sentry                                | NEEDS_SETUP     | `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`                                                                                        | İsteğe bağlı, yayından önce şart                     | sentry.io → React Native projesi → DSN. Kaynak haritası için ileride `SENTRY_AUTH_TOKEN`, organizasyon ve proje adı                                                                                                 |
| Expo / EAS                            | NEEDS_SETUP     | `EXPO_PROJECT_ID`                                                                                                             | Telefona kurulabilir derleme, mağaza                 | expo.dev hesabı → `npx eas-cli login` → `npx eas-cli init`                                                                                                                                                          |
| Apple Developer Program               | NEEDS_SETUP     | `APPLE_TEAM_ID`, `APPLE_SERVICE_ID`                                                                                           | Gerçek iPhone'a kurulum, TestFlight, Apple ile giriş | 99 $/yıl; kuruluş hesabı için D-U-N-S                                                                                                                                                                               |
| Google Play Console                   | NEEDS_SETUP     | —                                                                                                                             | Play kapalı test                                     | 25 $ tek sefer                                                                                                                                                                                                      |
| AWS Rekognition                       | NEEDS_SETUP     | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `REKOGNITION_COLLECTION_ID`                                       | Faz 1                                                | AWS hesabı; Face Liveness'ın desteklendiği bölgeyi doğrula                                                                                                                                                          |
| SMS OTP sağlayıcısı                   | NEEDS_SETUP     | `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_SENDER_ID`                                                                                | Faz 1                                                | Twilio Verify ya da yerel sağlayıcı seçimi (sahip kararı)                                                                                                                                                           |
| E-posta (Resend/Postmark)             | NEEDS_SETUP     | `EMAIL_API_KEY`, `EMAIL_FROM`                                                                                                 | Faz 1                                                | Alan adı + SPF/DKIM/DMARC                                                                                                                                                                                           |
| Google Cloud OAuth                    | NEEDS_SETUP     | `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`                                                    | Faz 1                                                | OAuth istemcileri                                                                                                                                                                                                   |
| `HASH_HMAC_SECRET`                    | NEEDS_SETUP     | `HASH_HMAC_SECRET`                                                                                                            | Faz 1                                                | Her ortam için ayrı, en az 32 rastgele bayt; yalnızca Supabase sırlarına girilir                                                                                                                                    |
| RevenueCat                            | NEEDS_SETUP     | `REVENUECAT_*`                                                                                                                | Faz 8                                                | —                                                                                                                                                                                                                   |
| PostHog                               | NEEDS_SETUP     | `POSTHOG_KEY`, `POSTHOG_HOST`                                                                                                 | Faz 7+                                               | AB bölgesi                                                                                                                                                                                                          |
| Moderasyon API'si                     | NEEDS_SETUP     | `MODERATION_API_KEY`                                                                                                          | Faz 5                                                | Sağlayıcı seçimi                                                                                                                                                                                                    |
| Vercel                                | NEEDS_SETUP     | —                                                                                                                             | Site yayını                                          | —                                                                                                                                                                                                                   |

Ortam değişkenleri `.env.example` dosyasında listelidir. Gerçek değerler `.env.local` dosyasına yazılır; bu dosya git'e girmez.
