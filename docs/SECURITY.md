# Güvenlik ve tehdit modeli

APP.md §7, §13.7 ve §16.6 hedefleri tanımlar. Bu belge her tehdidi bir teste ya da kabul edilmiş bir riske bağlar (§16.6). Her fazda genişler.

## Faz 0'da yürürlükte olan önlemler

| #    | Tehdit                                                       | Önlem                                                                                        | Kanıt (test / dosya)                                              |
| ---- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| T-01 | Gizli anahtarın uygulama paketine girmesi                    | İstemciye yalnızca `EXPO_PUBLIC_*`; `parsePublicEnv` bilinen gizli anahtar adlarını reddeder | `packages/shared/src/env.test.ts` ("refuses secret keys")         |
| T-02 | Gizli anahtarın git'e girmesi                                | `.env*` git'te yok sayılır (yalnız `.env.example` hariç); CI'da gitleaks                     | `.gitignore`, `.github/workflows/ci.yml > security`               |
| T-03 | İstemcinin sunucu tablosunu okuması/yazması                  | Tüm tablolarda RLS; politika yoksa erişim yok; `anon`/`authenticated` yetkileri geri alındı  | `supabase/tests/database/00_foundation.test.sql` (testler 1, 5–8) |
| T-04 | Denetim kaydının sonradan değiştirilmesi                     | `audit_log` UPDATE/DELETE/TRUNCATE tetikleyiciyle engellenir (yetkili roller dahil)          | aynı dosya (testler 11–13)                                        |
| T-05 | Algoritma ağırlıklarının iz bırakmadan değiştirilmesi        | `feature_flags` değişikliği önce/sonra değeriyle `audit_log`'a yazılır                       | aynı dosya (test 9)                                               |
| T-06 | Kritik zafiyetli bağımlılık                                  | CI'da `npm audit --omit=dev --audit-level=critical`                                          | `ci.yml > security`                                               |
| T-07 | Hata raporlarında kişisel veri                               | Sentry `sendDefaultPii: false`, konsol izleri gönderilmez; DSN yoksa Sentry kapalı           | `apps/mobile/src/lib/sentry.test.ts`                              |
| T-08 | Web sitesinin başka sitede çerçevelenmesi / MIME karışıklığı | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`                | `apps/web/next.config.ts`                                         |

## Bilinen açıklar ve sonraki fazlar

- `npm audit` geliştirme bağımlılıklarında orta/yüksek bulgular gösterebilir (Expo/React Native araç zinciri). Gönderilen pakette kritik bulgu yok; ayrıntı `docs/TEST_REPORT.md`.
- Kimlik doğrulama, OTP hız sınırları, ban tanımlayıcıları (HMAC), webhook imzaları: Faz 1.
- Yükleme hattı ve imzalı URL'ler: Faz 2. Moderasyon ve risk puanı: Faz 5.
- Yayın öncesi bağımsız sızma testi: TODO(owner).
