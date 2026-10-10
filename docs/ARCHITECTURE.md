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

## Veri akışı (Faz 0)

Henüz sunucu çağrısı yok. Uygulama yalnızca yerel görünüm tercihlerini (tema, dil, hareket) tutar.
