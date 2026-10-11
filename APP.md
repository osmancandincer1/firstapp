# DOKUZ — Nihai Ürün ve Teknik Şartname (APP.md, v2)

> **Çalışma adı:** Dokuz (İng. "Nine"). *Her akşam dokuzda, dokuz kişi.*
> **Seçilen ürün adı (2026-10-11):** Nokuzo — ayrıntı ve yapılan ön araştırma `docs/DECISIONS.md` D-019. Aşağıdaki metinde "Dokuz" geçen yerler ürün adı olarak Nokuzo okunur.
> İsim yer tutucudur: marka tescili (TÜRKPATENT), App Store / Play Store ad çakışması ve alan adı uygunluğu **kontrol edilmedi**; yayından önce doğrula.
> **Hedef:** iOS (App Store) + Android (Play Store), tek kod tabanı.
> **Belge tarihi:** 10 Ekim 2026 · **Sürüm:** v2 (dört taslağın birleştirilmiş hâli; önceki tüm taslakların yerine geçer)

---

## 0. Claude için çalışma talimatı

Bu dosya ürünün tek doğruluk kaynağıdır. Kodlamaya başlamadan önce tamamını oku.

1. **Sırayla ilerle.** Bölüm 21'deki fazları sırayla uygula. Bir fazın kabul kriterleri geçmeden sonrakine başlama.
2. **Uydurma.** API anahtarı, fiyat, hukuki metin, mağaza politikası gibi bilmediğin şeyleri uydurma. `.env.example` içine yer tutucu koy, `TODO(owner):` notu bırak.
3. **Sır yönetimi.** Hiçbir gizli anahtar istemci koduna girmez. `service_role` anahtarı yalnızca Edge Function ve admin sunucusunda kullanılır.
4. **Varsayılan güvenli.** Her tabloda RLS açık başlar; politika yazılmadan tablo kullanılmaz.
5. **Her özellik için:** tip güvenli kod (TypeScript strict), en az bir birim testi, boş/yükleniyor/hata durumları, TR + EN metinleri, erişilebilirlik etiketi, "hareketi azalt" alternatifi.
6. **Belirsizlikte sor.** Bu belgeyle çelişen ya da belgede olmayan bir ürün kararı gerekiyorsa dur ve sor.
7. **Kopyalama yasağı.** Tinder/Bumble/Hinge'in ekran düzenini, ikonlarını, metinlerini, renklerini veya sağa-sola kaydırma mekaniğini taklit etme. Apple bunu 4.3(b) kapsamında reddeder (bkz. Bölüm 18).

8. **Test etmeden "bitti" deme.** Her fazın sonunda Bölüm 16'daki ilgili testleri çalıştır; çalıştırdığın komutları ve sonuçlarını `docs/TEST_REPORT.md` dosyasına yaz. Çalıştıramadığın testi "çalıştırılamadı: neden" diye işaretle; geçmiş gibi gösterme.
9. **Kurulum gerektiren her şey `NEEDS_SETUP`.** Hesap, anahtar, hukuki onay ya da ödeme gerektiren servisleri bağlıymış gibi gösterme. `docs/SETUP.md` içine panel adımlarını ve ortam değişkeni adlarını yaz. Anahtar yokken özellik güvenli biçimde kapalı kalır; sahte "doğrulandı" sonucu asla üretilmez.
10. **Sahte veri yalnızca geliştirmede.** Demo profilleri `APP_ENV != production` iken ve ekranda "DEMO" etiketiyle görünür. Üretimde sahte profil, sahte beğeni, sahte sayaç olmaz.
11. **Belgeler:** `docs/ARCHITECTURE.md`, `docs/SECURITY.md` (tehdit modeli dahil), `docs/PRIVACY_DATA_MAP.md`, `docs/MODERATION_RUNBOOK.md`, `docs/RELEASE_CHECKLIST.md`, `docs/DECISIONS.md` (tarihli karar ve varsayım günlüğü), `docs/TEST_REPORT.md`.
12. **Ortamlar:** `local`, `staging`, `production`; her birinin ayrı veritabanı, kovası, anahtarı ve mağaza ürünü olur. Üretim verisi geliştirmede kullanılmaz.

**Bu belgedeki varsayımlar (sahibi değiştirebilir):**

| Konu | Varsayım |
|---|---|
| İlk pazar | Türkiye, tek şehirle başlanır, şehir şehir açılır |
| Diller | Türkçe (varsayılan) + İngilizce |
| Yaş | Yalnızca 18+ |
| Yönelim | Tüm cinsiyet ve yönelimler desteklenir |
| Ekip | Tek kurucu + Claude; tam zamanlı moderasyon ekibi yok (bu yüzden otomasyon ağırlıklı) |
| Yığın | Expo (React Native) + Supabase (Bölüm 13) |

---

## 0A. Dört taslağın karşılaştırması ve verilen kararlar

Karşılaştırılan taslaklar: **Spark** (DeepSeek), **Aura** (Gemini), **Kıvılcım** (ChatGPT), **Dokuz** (Claude, v1).

### 0A.1 Genel değerlendirme

| Ölçüt | Spark | Aura | Kıvılcım | Dokuz v1 |
|---|---|---|---|---|
| Kapsam | Kısa istem (34 satır) | Kısa PRD (75 satır) | Uzun, yönetişim ağırlıklı | Uzun, uygulanabilir ayrıntı |
| Özgünlük | Düşük: günlük 3 eşleşme + kaydırma kartı | Düşük: klasik kart destesi, Super-Vibe, Gold/Platinum | Orta: Niyet Kartı, Bağlantı Özeti, buluşma planı | Yüksek: Tur, Kapı Sorusu, Masa, Şeffaflık Paneli |
| Rakip şikâyetlerine cevap | Kısmen (otomatik yenileme yok) | Zayıf (şikâyet edilen paralı geri alma ve katmanları tekrarlıyor) | Güçlü ama sayısal veri yok | Güçlü, sayısal veriye dayalı |
| Güvenlik ve ban | Yüzeysel | İyi fikirler, ayrıntı az | En olgun süreç tasarımı | Ayrıntılı tanımlayıcı tablosu |
| Hukuk / mağaza uyumu | Yok; ödeme seçimi mağaza kurallarıyla çelişiyor | Çok az | En güçlü | Güçlü, Türkiye'ye özel |
| Test planı | Yok | Yok | Kabul kriterleri iyi | Var ama kısa |
| Ayarlar / filtreler | Yok | Başlık düzeyinde | İyi gruplanmış | Ayrıntılı |
| Tek kişilik ekibe uygunluk | Orta | Düşük (NestJS + Redis + AWS işletmesi ağır) | Yüksek | Yüksek |

**Sonuç:** Çekirdek ürün ve teknik iskelet Dokuz v1'den; süreç, yönetişim ve kabul kriterleri Kıvılcım'dan; ban atlatma sinyalleri ve sohbet canlandırma fikri Aura'dan; otomatik yenilenmeyen ödeme seçeneği Spark'tan alındı.

### 0A.2 Alınanlar

| Kaynak | Alınan fikir | Bu belgede |
|---|---|---|
| Kıvılcım | Güven merdiveni: her rozet neyi doğruladığını açıkça söyler | 6.5 |
| Kıvılcım | Niyet Kartı: niyet + tempo + olmazsa olmazlar | 6.4 |
| Kıvılcım | Uyum notunda bir de dürüst "farklılık" gösterme | 4.6 |
| Kıvılcım | Banlı e-postayla kayıtta hesap varlığını sızdırmayan genel mesaj | 7.5 |
| Kıvılcım | Şikâyet ve destek için vaka numarası ve durum takibi | 7.4, 10 |
| Kıvılcım | Aktif oturumlar/cihazlar listesi, rıza geçmişi | 10 |
| Kıvılcım | "Sonraya sakla" (özel) ve "bunun gibileri daha az göster" | 4.1 |
| Kıvılcım | "Biriyle görüşüyorum" mola nedeni; suçluluk yaratmayan çıkış | 10 |
| Kıvılcım | Kilit ekranında varsayılan gizli bildirim metni | 11 |
| Kıvılcım | Ortam ayrımı, `NEEDS_SETUP`, karar günlüğü, eşzamanlı karşılık yarış testi, silmenin yayılımı, yedekten dönme tatbikatı | 0, 16 |
| Kıvılcım | Kod öncesi doğrulama fazı ve yayın öncesi git/gitme listesi | 21, 23 |
| Aura | IP/alt ağ ve e-posta alan adı itibarı risk sinyali | 7.3 |
| Aura | Sohbet 24 saat durunca konu önerisi (yapay zekâ yazmadan, ortak cevaplardan) | 4.4 |
| Aura | Dokunsal geri bildirim, ses kartı; cam efekti yalnızca çubuklarda ve ölçülü | 12 |
| Spark | Otomatik yenilenmeyen ödeme seçeneği (30 günlük geçiş) | 9.3 |
| Spark | Başlangıç fiyat adayı: 149 ₺/ay | 9.3 |

### 0A.3 Reddedilenler ve nedeni

| Kaynak | Öneri | Neden alınmadı |
|---|---|---|
| Spark | Stripe ile abonelik | Uygulama içi dijital abonelikte mağaza faturalandırması temel kuraldır; harici ödeme istisnaları ülkeye göre değişir (Türkiye için doğrula). RevenueCat + mağaza faturalandırması kullanılır |
| Spark | `google_ml_kit` / `firebase_ml_vision` ile selfie doğrulama | Yüz algılama canlılık kanıtı değildir; fotoğrafı, ekranı ve deepfake'i ayırt etmez. `firebase_ml_vision` ayrıca kullanımdan kalkmış bir pakettir. Canlılık için uzman sağlayıcı şart |
| Spark | Yapay zekâyla 5 dakikalık sohbetten profil metni üretme | Araştırma: genç kullanıcılar yapay zekânın kendi yerine yazmasına mesafeli; profiller tek tipleşir ve sahicilik iddiası bozulur |
| Spark, Aura | Kaydırmalı kart destesi | Şikâyetlerin kaynağı ve Apple 4.3(b) ret riski |
| Spark, Aura | İki ücretli katman (Plus/Premium, Gold/Platinum) | "Paketin üstüne paket" en çok pişmanlık yaratan fiyat kalıbı |
| Aura | Paralı geri alma, Super-Vibe | Şikâyet listesinin 1. maddesi; görünürlük satmak ilkeye aykırı |
| Aura | Uçtan uca şifreli sohbet | Sunucu tarafı dolandırıcılık/taciz tespitini ve şikâyet incelemesini imkânsız kılar. Tercih: aktarımda ve depoda şifreleme + mesajlara yalnızca şikâyet kapsamında, kayıt altında erişim. Uygulama "uçtan uca şifreli" olduğunu **iddia etmez** |
| Aura | Cihaz parmak iziyle doğrudan kayıt engeli | İkinci el/ortak cihazda masum kullanıcıyı engeller; cihaz güçlü risk sinyalidir, tek başına hüküm değildir |
| Aura | NestJS + Redis + AWS ECS | Tek kişilik ekip için işletme yükü fazla; Supabase aynı işi yönetilen hizmetle görür. Ölçek gerektirdiğinde taşınabilir |
| Aura | Hikâyeler şeridi, "Aura Skoru" | Dikkat dağıtıcı; sayısal uyum puanı sahte kesinlik hissi verir |
| Spark, Aura, Kıvılcım | Flutter | İkisi de olur. Expo/React Native seçildi: mobil, Edge Function ve admin paneli tek dilde (TypeScript) ve ortak doğrulama şemalarıyla yazılır; küçük düzeltmeler mağaza incelemesi beklemeden gönderilebilir (OTA) |
| Kıvılcım | Canlılık doğrulamasını isteğe bağlı bırakma | "Herkes doğrulanmış" ana vaat; zorunlu kalır. Hukuki inceleme engel çıkarırsa `verification_required` bayrağıyla isteğe bağlıya çevrilebilir |
| Kıvılcım | Rehber erişiminden tamamen kaçınma | "Tanıdıklarıma görünme" Türkiye'de gerçek talep; isteğe bağlı ve yalnızca cihazda karmalanmış hâliyle kalır |
| Kıvılcım | Sohbette yapay zekâ taslak önerisi | 4.4'teki insan cevaplarından türeyen konu önerisi yeterli |
| Kıvılcım | Ayrı "Planlar" sekmesi | Plan sohbetin içinde doğar; ayrı sekme boş kalır. Planlar Masalar sekmesinde görünür |

---

## 1. Pazar araştırması özeti

### 1.1 Sektörün durumu (2026)

- Kullanıcı yorgunluğu yaygın: Forbes Health anketinde katılımcıların ~%78'i flört uygulaması tükenmişliği bildiriyor; Z kuşağında oran benzer.
- 2024'te indirilen flört uygulamalarının %65'i bir ay içinde silinmiş (AppsFlyer).
- Ücretli kullanıcı: Tinder ~%8 düşüş, Bumble ~%16 düşüş, Hinge ~%17 artış. Büyüyen tek büyük oyuncu "ciddi niyet + az ama anlamlı etkileşim" konumundaki Hinge.
- Kullanıcı tabanı erkek ağırlıklı (SSRS: %57 erkek, %38 kadın). Kadınlar "seçeneklerden rahatsız", erkekler "eşleşme alamıyor" diye tükeniyor.
- Kaydırma (swipe) modeli terk ediliyor: Bumble CEO'su Mayıs 2026'da kaydırmayı kaldıracaklarını açıkladı; Match Group CEO'su eski modellerin öldüğünü kabul etti; Hinge kurucusu ayrılıp yeni bir platform kurdu.
- Z kuşağı yapay zekânın kendi yerine yazmasına mesafeli; sahicilik istiyor. Büyük uygulamaların "AI wingman" özellikleri ilgi görmüyor.
- Yeni dalga: sesle mülakat + tek eşleşme (Known), ses öncelikli ve aşamalı açılan (Reev), yolu kesişenlere bildirim (Left Field), etkinlik/aktivite temelli (Sitch, Lunge, Thursday, GRASS).

### 1.2 Kullanıcılar neden 1 yıldız veriyor?

8 büyük uygulamanın 1–3 yıldızlı yorumlarının dağılımı (Unstar, 2026):

| # | Şikâyet | Pay | Somut örnekler | Dokuz'un cevabı |
|---|---|---|---|---|
| 1 | Temel özelliklerin paralı olması | %31 | "Beni beğeneni görmek için ayda 30$", beğeni limiti, geri alma paralı, boost şart gibi | Bölüm 9: gelen cevaplar ücretsiz, geri alma kavramı yok, görünürlük satılmaz |
| 2 | Sahte profil, bot, dolandırıcı | %21 | Hemen WhatsApp/Telegram'a çekme, çalıntı fotoğraf, kripto dolandırıcılığı, "şikâyet ettim hiçbir şey olmadı" | Bölüm 6–7: zorunlu canlılık doğrulaması, şikâyete geri bildirim |
| 3 | Algoritma ve eşleşme kalitesi | %17 | "Sıfır eşleşme", filtre dışı profiller, aynı profillerin tekrar gelmesi, "ödemeyince gizleniyorum" şüphesi | Bölüm 4.6: Şeffaflık Paneli, adil gösterim garantisi |
| 4 | Hata ve teknik sorun | %12 | Kaybolan mesajlar, görünmeyen eşleşme, güncellenmeyen konum, kaydedilmeyen profil | Bölüm 16: mesaj/eşleşme bütünlüğü birinci öncelik |
| 5 | Ghosting / sessiz eşleşme kaldırma | %8 | Açıklamasız kaybolan sohbet, 24 saatte sona eren eşleşme | Bölüm 4.4: Masa sistemi + Nazik Veda |
| 6 | Tutarsız moderasyon | %6 | Normal selfie reddi, gölge ban korkusu | Bölüm 7: her kararın gerekçesi gösterilir, gölge ban yok |
| 7 | Hesap sorunları | %5 | Açıklamasız ban, hesap silememe, iptal karmaşası | Bölüm 7.5 ve 9.4: gerekçeli ban + itiraz, tek dokunuşla silme |

Ücretli üyelik yorumlarında ayrıca: iptalden sonra yenileme (%24), "beni beğenenler" listesinin bot dolu olması (%19), iade reddi (%14), üyelik bitince eşleşmelerin düşmesi (%11), özelliklerin üst pakete taşınması (%9), yaşa/cinsiyete göre farklı fiyat (%8), boost/süper beğeninin işe yaramaması (%7).

### 1.3 Rakip karşılaştırması

| Uygulama | Olumsuz yorum oranı | Güçlü yanı | Zayıf yanı / kaçınılacak |
|---|---|---|---|
| Tinder | %48 | En büyük havuz, marka | Sömürücü bulunan fiyat, algoritmaya güvensizlik, bot; dinamik fiyat |
| Badoo | %45 | Küresel kitle | En yüksek sahte profil şikâyeti (%29) |
| The League | %43 | "Seçkin" konum | Pahalı, bekleme listesi hissi |
| OkCupid | %39 | Detaylı uyum soruları | Bakımsız, hatalı |
| Bumble | %36 | Güvenlik, kadın odaklılık | 24 saatlik süre, iptal akışı zor, Spotlight ek ücreti |
| Coffee Meets Bagel | %33 | Günlük küratörlü seçki | Küçük şehirde çok az eşleşme |
| Happn | %31 | Konum bazlı tesadüf | Sahte hesap, şantaj şikâyetleri |
| Hinge | %28 | Soru kartları sohbet başlatıyor, cömert ücretsiz katman | Ücretsiz beğeni sınırı, HingeX'in değeri belirsiz |
| Siberalem / Connected2.me (TR) | — | Yerel bilinirlik | Eski arayüz, güven algısı |

Fiyat referansı (ABD, aylık; kaynaklar arasında fark var ve uygulamalar dinamik fiyat uyguluyor): Tinder Gold ~29,99$, Platinum ~39,99$, Bumble Premium ~32,99$, Hinge+ ~19,99–32,99$, HingeX ~49,99$.

### 1.4 İşe yaradığı kanıtlanan şeyler (ilham al, kopyalama)

- **Zorunlu canlılık doğrulaması:** Tinder Face Check kötü niyetli hesaplara maruz kalmayı %60, bunlara dair şikâyeti %40 azalttığını açıkladı.
- **Az sohbet = hızlı yanıt:** Hinge'de ilk mesaja 24 saat içinde yanıt alan eşleşmelerin buluşmaya dönme ihtimali %72 daha yüksek; yanıtsız sohbet sınırı yanıt verme oranını %20 artırdı. Hinge kullanıcılarının %44'ü yanıtsızlığı en büyük sorun sayıyor.
- **Küratörlü, sınırlı seçki** kaydırma yorgunluğunu azaltıyor (CMB), ama havuz küçükse boş hissettiriyor → şehir şehir açılış şart.

### 1.5 Türkiye'ye özel notlar

- Kaspersky araştırmasında Türkiye'deki kullanıcıların %53'ü başkası gibi davranan biriyle karşılaştığını söylüyor.
- Şantaj (sextortion) vakaları artıyor; dolandırıcılar yabancı ve IP (VoIP) hatları kullanıyor → VoIP numara engeli ve sohbette fotoğraf kısıtı (Bölüm 6.3, 7.3).
- BTK, Ağustos 2025'te Azar, LivU ve Tango dahil en az 29 görüntülü sohbet/flört uygulamasına erişim engeli getirdi. **Ders:** rastgele görüntülü sohbet yok, müstehcen içerik yok, güçlü moderasyon, yetişkin doğrulaması ve yerel hukuka uyum şart.
- Flört uygulaması kayıtları boşanma davalarında delil olarak kullanılıyor → gizlilik özellikleri (rehberi engelle, gizli mod) gerçek bir talep.

---

## 2. Konumlandırma

**Tek cümle:** Dokuz, sonsuz kaydırma yerine her gün 12:00 ve 21:00'de 9'ar doğrulanmış kişi sunan, beğeni yerine cevap isteyen ve aynı anda en fazla 3 sohbete izin vererek insanları buluşmaya götüren flört uygulamasıdır.

**Neden farklı (App Store incelemesine de bu yazılacak):**

1. **Tur:** Kaydırma destesi yok. Günde bir kez, herkese aynı saatte açılan 9 kişilik seçki.
2. **Kapı Sorusu:** Beğeni butonu yok. Birine ilgi göstermek için onun seçtiği soruya cevap yazarsın.
3. **Masa:** Aynı anda en fazla 3 aktif sohbet. Yeni sohbet için birini kibarca kapatırsın; sessizce kaybolmak yok.
4. **Şeffaflık Paneli:** Profilinin kaç kişiye gösterildiğini ve bir kişinin sana neden gösterildiğini görürsün.
5. **Herkes doğrulanmış:** Canlılık kontrolünden geçmeyen kimse görünmez.
6. **Adil fiyat:** Tek paket, herkese aynı fiyat, görünürlük satılmaz.

**Marka sesi:** Sıcak, kısa, hafif esprili, asla alaycı ya da baskıcı değil. "Kaçırma!", "Son şans!" gibi aciliyet dili yasak.

**Yapay zekâ ilkesi:** Yapay zekâ kullanıcının yerine yazmaz, profil üretmez, sahte sohbet etmez. Yalnızca arka planda güvenlik (moderasyon, dolandırıcılık tespiti) ve sıralama için kullanılır.

**Hedef kitle:** 22–35 yaş, büyük şehirde yaşayan, mevcut uygulamalardan yorulmuş, gerçekten buluşmak isteyenler.

---

## 3. Sözlük

| Terim | Anlamı |
|---|---|
| Tur | Her gün 12:00 ve 21:00'de açılan 9 profillik seçki (sahibin kararı, D-062) |
| Kapı Sorusu | Kullanıcının profilinde seçtiği/yazdığı, kendisine ulaşmak isteyenlerin cevaplaması gereken soru |
| Cevap | Bir Kapı Sorusuna verilen yanıt (klasik "beğeni"nin karşılığı) |
| Cevaplar kutusu | Sana gelen cevapların listesi (ücretsiz) |
| Masa | İki kişi arasındaki aktif sohbet. Ücretsiz kullanıcıda 3 masa |
| Nazik Veda | Masayı kısa bir veda mesajıyla kapatma |
| Plan | Sohbet içinden yapılan buluşma teklifi (gün, saat, mekân türü) |
| Günün Sorusu | Herkese aynı gün sorulan tek soru; cevaplar profilde görünür |
| Canlı Saat | 21:00–22:00 arası; o an çevrimiçi olanlar işaretlenir |
| Mola | Hesabı dondurmadan Tur'dan ve bildirimlerden çıkma modu |

---

## 4. Çekirdek mekanikler

### 4.1 Tur

- Günde iki Tur: **12:00** ve **21:00** (İstanbul saati). Her Tur bir sonrakine kadar erişilebilir. *(Sahibin kararı, 2026-10-12, D-062; önceki hâli: günde bir, 21:00.)*
- **9 kart.** Kartlar arasında serbestçe ileri-geri gezilir; karar geri alınamaz bir hareketle verilmez.
- Her kartta iki eylem: **Cevapla** (Kapı Sorusunu yanıtla) ve **Geç**.
  - Geç → bu kişi 60 gün gösterilmez.
  - Hiçbir şey yapılmadıysa → kişi 14 gün sonra tekrar gelebilir.
  - Cevapladığın kişi karşılık verene ya da 14 gün dolana kadar tekrar gösterilmez.
- **Sonraya sakla:** Kart özel bir listeye alınır (en fazla 9 kişi, 7 gün). Karşı taraf bilmez; süre dolunca kart "hiçbir şey yapılmadı" sayılır.
- **Bunun gibileri daha az göster:** "Neden bu kişi?" yüzünden seçilir; hangi nedenin ağırlığının düşürüleceği sorulur (ör. "bu ilgi alanı", "bu niyet").
- Tur bitince "Tur bitti" ekranı: bir sonraki Tur'a geri sayım, Günün Sorusu, profil tamamlama önerisi. **Daha fazla kart satın alma baskısı yok.**
- Havuz 9 kişiyi doldurmuyorsa eldeki kadar gösterilir ve dürüstçe söylenir: "Bugün kriterlerine uyan 5 kişi var. Mesafeyi 10 km artırırsan 3 kişi daha çıkıyor." Asla filtre dışı profille doldurma.

### 4.2 Kapı Sorusu ve Cevap

- Her profilin **tam 1** Kapı Sorusu vardır. Hazır havuzdan (en az 80 soru, TR/EN) seçilir ya da kullanıcı kendisi yazar (en fazla 90 karakter, moderasyondan geçer).
  - Örnek: "Pazar kahvaltısı: serpme mi, simit-çay mı?", "En son neye kahkahayla güldün?", "Beni hangi konsere götürürdün?"
- Cevap: metin (10–200 karakter) **veya** ses (3–20 sn). Emoji tek başına yetmez.
- Aynı cevabı kopyala-yapıştır tespiti: bir kullanıcı 24 saatte %80+ benzer 3 cevap gönderirse uyarılır, 4.'sü engellenir.
- Cevap gönderildiğinde karşı tarafın **Cevaplar kutusuna** düşer. Gönderen "bekliyor" durumunu görür.
- Alıcı üç şey yapabilir: **Karşılık ver** (kendi mesajını yazar → Masa açılır), **Geç** (gönderene bildirim gitmez, 14 gün sonra sessizce düşer), **Şikâyet et**.
- Cevaplar kutusunda bulanık fotoğraf, sayaçla kışkırtma, "görmek için öde" **yok.** Tam profil ücretsiz görünür.
- Bekleyen giden cevap sınırı: 15. Dolunca en eskisi düşene kadar yeni cevap gönderilemez (spam freni).

### 4.3 Canlı Saat

- 21:00–22:00 arası çevrimiçi olanların avatarında ince halka görünür ve Cevaplar kutusunda üste çıkarlar.
- Amaç: küçük kullanıcı tabanında herkesi aynı saatte toplayıp yanıt hızını artırmak.
- Çevrimiçi durumu Ayarlar'dan kapatılabilir.

### 4.4 Masa (sohbet yuvaları)

- Ücretsiz: **3 masa**, Plus: **5 masa**.
- Masa doluyken Tur'a bakmaya ve cevap göndermeye devam edilir. Dolu birine karşılık verilirse eşleşme "Masa bekliyor" durumuna girer; 72 saat içinde yer açılmazsa nazikçe düşer ve iki tarafa da neden düştüğü söylenir.
- **Sıra sende:** Son mesaja 24 saat yanıt yoksa yanıt borcu olan tarafa bildirim. 72 saatte hâlâ yanıt yoksa masa "Soğudu" olur: yuva boşalır, sohbet salt-okunur arşive iner, 7 gün içinde iki taraf da isterse yeniden açılabilir.
- **Konu önerisi:** Sohbet 24 saat durduysa yanıt sırası olan tarafa, iki kişinin profil ve Günün Sorusu cevaplarından türetilen 2 konu başlığı gösterilir ("İkiniz de 'en son izlediğin film' sorusunu cevapladınız"). Bunlar hazır mesaj değildir; mesajı kullanıcı kendisi yazar.
- **Mola istisnası:** Kullanıcı "birkaç gün yokum" (1–7 gün) diyebilir; karşı tarafa "X, Cuma'ya kadar molada" görünür ve sayaç durur. Ayda en fazla 2 kez.
- **Nazik Veda:** Masa kapatmanın tek yolu. Hazır cümlelerden biri seçilir ya da kısa not yazılır ("Sohbet güzeldi ama devam etmek istemiyorum, iyi şanslar."). Karşı taraf bunu görür, cevap yazamaz. Güvenlik gerekçesiyle kapatmada (Engelle / Şikâyet et) veda gönderilmez ve karşı tarafa yalnızca "sohbet sona erdi" görünür.
- **Yanıt güvenilirliği:** Her profilde "Genelde X saat içinde yanıtlar" rozeti (son 30 gün medyanı; en az 5 sohbet verisi varsa). Soğumaya bırakılan masalar bu ölçütü düşürür ve Tur sıralamasına yansır. Hesaplama kuralı Şeffaflık Paneli'nde açıkça yazar.

### 4.5 Plan (buluşmaya geçiş)

- İki taraf da en az 6'şar mesaj yazdıktan sonra sohbetin üstünde "Plan yap" çubuğu belirir.
- Plan kartı: gün (önümüzdeki 14 gün), saat aralığı, mekân türü (kahve, yürüyüş, yemek, sergi, konser, diğer), ilçe. **Tam adres uygulamada saklanmaz**; kullanıcılar sohbette anlaşır.
- Karşı taraf: Kabul / Başka zaman öner / Şimdilik değil.
- Kabul edilince: takvime ekle, **Güvenli Buluşma** (Bölüm 7.6) önerisi, buluşmadan 2 saat önce hatırlatma.
- Ertesi gün iki tarafa özel **"Nasıldı?"** sorusu (Bölüm 7.6).
- İlk mesajdan 7 gün geçtiyse ve plan yoksa tek seferlik, kapatılabilir ipucu: "Bir hafta oldu. Buluşmak ister misiniz?"

### 4.6 Şeffaflık Paneli

Profil sekmesinde, ücretsiz:

- Bu hafta profilin kaç kişinin Tur'unda yer aldı, kaç cevap aldın, kaç karşılık verdin.
- Yanıt güvenilirliğin ve nasıl hesaplandığı.
- Tur sıralamasını etkileyen etkenlerin açık listesi (Bölüm 5).
- "**Ödeme sıralamanı değiştirmez**" beyanı. Bu bir ürün kuralıdır; kodda ücretli durumun sıralama girdisi olmadığını doğrulayan test yazılır.
- Her kartta **"Neden bu kişi?"**: en güçlü 2 neden ("İkiniz de uzun ilişki arıyorsunuz", "Günün Sorusu'na benzer cevap verdiniz") ve varsa 1 dürüst farklılık ("O sigara içiyor, sen içmiyorsun"). Yüzde ya da puan gösterilmez. Yüzden, fotoğraftan ya da hassas özelliklerden çıkarım yapılmaz.

### 4.7 Günün Sorusu

- Her gün 09:00'da tek soru (içerik takvimi admin panelinden; en az 120 soru hazır).
- Cevap (en fazla 140 karakter) profilde "Son cevaplar" şeridinde 7 gün kalır.
- Uyum sinyali ve sohbet malzemesi olarak kullanılır; profil tazeliğini korur.

---

## 5. Tur algoritması

Her Tur için kullanıcı başına bir kez, açılıştan yarım saat önce (11:30 ve 20:30, İstanbul) toplu iş olarak çalışır.

**Adım 1 — Aday filtresi (tamamı zorunlu, iki yönlü):**
- İkisi de doğrulanmış, aktif (son 7 günde giriş), Mola'da değil, askıda/banlı değil.
- Cinsiyet/yönelim tercihleri karşılıklı uyuyor.
- Yaş aralığı ve mesafe karşılıklı uyuyor.
- Engel, şikâyet, "rehberimdekileri gizle", önceki Nazik Veda (180 gün) ilişkisi yok.
- Son 60 gün içinde Geç denmemiş, son 14 günde gösterilmemiş.

**Adım 2 — Puan (0–100):**

| Etken | Ağırlık | Açıklama |
|---|---|---|
| Niyet uyumu | 25 | "Ne arıyorum" alanı aynı ya da komşu |
| Ortak zemin | 20 | Ortak ilgi alanı, Günün Sorusu benzerliği, yaşam tarzı tercihleri |
| Adil gösterim | 20 | Son 7 günde az gösterilen profillere artı puan (sıfır eşleşme sorununu hafifletir) |
| Yanıt güvenilirliği | 15 | Karşı tarafın yanıt hızı ve masa kapatma düzgünlüğü |
| Aktiflik | 10 | Son giriş, Canlı Saat katılımı |
| Profil doluluğu | 10 | Fotoğraf sayısı, ses kartı, güncel cevaplar |

**Adım 3 — Seçim:** En yüksek puanlılardan 9; çeşitlilik kuralı (aynı tek etkenden gelen en fazla 4 kişi). Sana cevap göndermiş kişiler Tur'a girmez, Cevaplar kutusundadır.

**Kurallar:**
- Ödeme durumu, harcama, cihaz modeli puana **girmez**.
- Gölge ban yok: kısıtlanan kullanıcıya kısıt ve nedeni açıkça gösterilir.
- Her kullanıcıya haftada asgari gösterim tabanı (şehir yoğunluğuna göre ayarlanabilir, başlangıç: 30).
- Tüm ağırlıklar `feature_flags` tablosundan ayarlanabilir; değişiklikler `audit_log`'a yazılır.

---

## 6. Kayıt, doğrulama ve profil

### 6.1 Kayıt akışı (ekran ekran)

1. **Karşılama** — 3 kartlık kısa tanıtım (Tur, Kapı Sorusu, Masa), atlanabilir.
2. **Giriş yöntemi** — Apple ile giriş (iOS'ta zorunlu sunulur), Google ile giriş, e-posta.
3. **E-posta doğrulama** — 6 haneli kod, 10 dk geçerli, 5 yanlış denemede 15 dk kilit. Apple "e-postamı gizle" adresi kabul edilir.
4. **Telefon doğrulama (zorunlu)** — SMS ile 6 haneli kod. VoIP/sanal numara reddedilir (numara türü sorgusu). Bir numara = bir hesap.
5. **Doğum tarihi** — 18 yaş altı kayıt olamaz; cihazda 24 saat tekrar deneme kilidi.
6. **Yasal onaylar** — Kullanım Koşulları + Topluluk Kuralları (zorunlu), KVKK Aydınlatma Metni (gösterim), biyometrik veri açık rızası (zorunlu, ayrı onay kutusu), yurt dışına aktarım açık rızası (zorunlu, ayrı), pazarlama izni (isteğe bağlı, ayrı). Önceden işaretli kutu olmaz. Her onay `consents` tablosuna sürüm numarasıyla yazılır.
7. **Ad, cinsiyet, kimi görmek istediği.**
8. **Canlılık doğrulaması (zorunlu)** — Bölüm 6.2.
9. **Fotoğraflar** — en az 3, en fazla 6. En az birinde yüz net olmalı ve canlılık selfiesiyle eşleşmeli.
10. **Niyet** — Uzun ilişki / Ciddi ama acelesiz / Henüz bilmiyorum / Arkadaşlık. (Tek seçim, profilde görünür.)
11. **Kapı Sorusu seçimi.**
12. **İlgi alanları** (5–10) ve isteğe bağlı alanlar.
13. **Konum izni** — yalnızca "uygulamayı kullanırken", yaklaşık konum yeterli. Reddederse şehir/ilçe elle seçilir.
14. **Bildirim izni** — nedenini anlatan ön ekranla ("Turun açıldığında ve cevap geldiğinde haber verelim").
15. **Bitti** — Hoş geldin Tur'u hemen açılır; sıradaki Tur onu yeniler (D-053, D-062).

Her adımda ilerleme çubuğu; uygulama kapanırsa kaldığı adımdan devam eder. Hedef süre: 4 dakikanın altı.

### 6.2 Canlılık ve yüz doğrulaması

- Sağlayıcı: AWS Rekognition Face Liveness (yerel modül köprüsü gerekir; Bölüm 13). Alternatifler: FaceTec, Persona, Veriff, Sumsub.
- Akış: kısa video selfie → canlılık skoru eşiğin üstündeyse geçer → referans kare çıkarılır.
- **Fotoğraf eşleşmesi:** Profil fotoğraflarından en az biri referans kareyle eşleşmeli (benzerlik eşiği ayarlanabilir, başlangıç %90).
- **Mükerrer ve banlı yüz kontrolü:** Referans kare yüz koleksiyonunda aranır. Aktif başka hesapla eşleşirse kayıt durur; banlı yüzle eşleşirse kayıt reddedilir (Bölüm 7.5).
- **Yaş tahmini:** Sağlayıcının yaş aralığı tahmini 21'in altını gösteriyorsa kimlik belgesiyle ek doğrulama istenir (sağlayıcı: Bölüm 13). Belge görüntüsü doğrulama sonrası silinir, yalnızca sonuç saklanır.
- **Saklama:** Video hemen silinir. Yalnızca geri döndürülemez yüz vektörü ve doğrulama sonucu saklanır. Hesap silinince vektör de silinir; **istisna:** hesap ban nedeniyle kapandıysa vektör ban kaydında tutulur (aydınlatma metninde açıkça yazılır).
- **Yeniden doğrulama:** Ana fotoğraf değişince, 12 ayda bir, ya da "fotoğrafına benzemiyor" geri bildirimi 2 kez gelince.
- 3 başarısız denemeden sonra 24 saat bekleme + destek bağlantısı. Erişilebilirlik için elle inceleme yolu (destek üzerinden).

### 6.3 Numara ve e-posta kuralları

- E-posta normalizasyonu: küçük harf, baştaki/sondaki boşluk silinir, Gmail için nokta ve `+etiket` kaldırılır. Tek kullanımlık e-posta alan adları reddedilir (açık kaynak liste, haftalık güncelleme).
- Telefon E.164 biçiminde saklanır. VoIP reddi. Başlangıçta yalnızca +90; ülke listesi `feature_flags` ile genişler.
- Numara değişikliği: yeni numaraya kod + eski numaraya bilgilendirme + 24 saat bekleme.

### 6.4 Profil alanları

**Zorunlu alanlar**

| Alan | Kural |
|---|---|
| Ad | 2–20 karakter; 30 günde 1 değişiklik; moderasyondan geçer |
| Doğum tarihi | Yalnızca yaş gösterilir; kullanıcı değiştiremez (destek + kimlik ile) |
| Cinsiyet | Kadın / Erkek / Non-binary / Kendi tanımım (serbest metin); profilde gösterme anahtarı |
| Kimi görmek istiyorum | Kadınlar / Erkekler / Non-binary kişiler / Herkes (çoklu) |
| Fotoğraflar | 3–6; sıralanabilir, kırpılabilir; ilki ana fotoğraf; her birine isteğe bağlı 40 karakter açıklama |
| Kapı Sorusu | 1 adet; 7 günde 1 değişiklik |
| Konum | Şehir + ilçe; başkalarına yalnızca ilçe adı görünür |
| İlgi alanları | 5–10; ~120 etiketlik, kategorili listeden |

**Niyet Kartı (zorunlu, profilde görünür)**

| Alan | Seçenekler |
|---|---|
| Ne arıyorum | Uzun ilişki / Ciddi ama acelesiz / Henüz bilmiyorum / Arkadaşlık |
| Tempo | Hemen buluşalım / Önce biraz yazışalım / Yavaş ilerlemeyi severim |
| Olmazsa olmazlarım | Aşağıdaki yaşam tarzı alanlarından en fazla 3'ü seçilir; Tur'da zorunlu filtre gibi çalışır |

**İsteğe bağlı alanlar** (her birinde "profilde göster" anahtarı; boş bırakılabilir)

| Alan | Seçenekler |
|---|---|
| Hakkımda | En fazla 300 karakter |
| Ses kartı | 5–20 sn; hazır yönlendirmelerden biri |
| Boy | 140–220 cm |
| Eğitim | Lise / Ön lisans / Lisans / Yüksek lisans / Doktora / Söylemek istemiyorum |
| Okul, meslek, iş yeri | Serbest metin, 40 karakter |
| Sigara | İçmem / Sosyal içici / İçerim / Bırakmaya çalışıyorum |
| Alkol | İçmem / Nadiren / Sosyal ortamda / Sık |
| Çocuk | Var / Yok |
| Çocuk isteği | İstiyorum / İstemiyorum / Emin değilim / Olabilir |
| Evcil hayvan | Kedi / Köpek / Diğer / Yok ama severim / Alerjim var |
| Spor | Hiç / Ara sıra / Düzenli |
| Beslenme | Her şey / Vejetaryen / Vegan / Diğer |
| Uyku düzeni | Sabah insanı / Gece kuşu / Değişir |
| Diller | Çoklu seçim |
| Memleket | Şehir listesinden |
| Burç | 12 burç |
| İlk buluşma tercihi | Kahve / Yürüyüş / Yemek / Sergi-konser / Fark etmez |
| Müzik, film, kitap | Her biri için 3 serbest giriş |
| Günün Sorusu cevapları | Son 7 gün; tek tek gizlenebilir |

**Toplanmayan veriler:** din/inanç, siyasi görüş, etnik köken, sağlık durumu, gelir. Bunlar özel nitelikli veridir ve ayrımcı filtrelemeye kapı açar; alan olarak sunulmaz ve filtrelenemez.

**Profil araçları**
- "Başkası nasıl görüyor?" önizlemesi (Tur kartı ve tam profil).
- Profil doluluk göstergesi ve tek tek öneriler. Öneri metninde sayı yalnızca gerçek veriden geliyorsa kullanılır.
- Taslak otomatik kaydedilir; değişiklikler moderasyondan geçene kadar eski sürüm yayında kalır.
- Fotoğraf başına durum: yayında / inceleniyor / reddedildi (gerekçe).

**Fotoğraf kuralları (otomatik + elle):** yüz net; çıplaklık/müstehcenlik, silah, uyuşturucu, başkasının yalnız fotoğrafı, çocukla yalnız fotoğraf, ekran görüntüsü, metin/iletişim bilgisi/sosyal medya adı içeren görsel, yapay zekâ üretimi yüz kabul edilmez. Ret gerekçesi her zaman gösterilir ("Bu fotoğrafta yüzün görünmüyor") ve yeniden yükleme sunulur. Biçim: JPEG/PNG/HEIC, en fazla 15 MB, kısa kenar en az 800 px.

### 6.5 Doğrulama merkezi (güven merdiveni)

Her basamak ayrı gösterilir ve **neyi kanıtladığı** yazılır. "Güvenli kişi" ya da "kimliği onaylı" gibi abartılı ifade kullanılmaz.

| Basamak | Zorunlu mu | Profilde görünen | Kullanıcıya açıklama |
|---|---|---|---|
| 1. E-posta | Evet | — | "Bu e-postaya erişimin var." |
| 2. Telefon | Evet | — | "Bu numara sende ve sanal hat değil." |
| 3. Canlılık + fotoğraf eşleşmesi | Evet | ✓ Doğrulandı | "Fotoğraflardaki kişi kamera karşısında canlı olarak görüldü. Bu, kişinin niyetini ya da güvenilirliğini garanti etmez." |
| 4. Yaş (kimlik belgesi) | Yalnızca yaş şüphesinde ya da gönüllü | 18+ onaylı | "Resmî belgeyle 18 yaşından büyük olduğu doğrulandı." |
| 5. Buluşma teyidi | Otomatik | Gerçek hayatta buluştu (sayı gösterilmez) | "En az bir kişi bu kullanıcıyla buluştuğunu ve fotoğraflarına benzediğini bildirdi." |

Doğrulama merkezinde ayrıca: her basamağın tarihi, yenileme zamanı, başarısızlık nedeni ve yeniden deneme, sağlayıcının veriyi nasıl işlediğinin özeti, biyometrik rızayı geri çekme (sonucu: hesap Tur'dan çıkar, yüz vektörü silinir).

Sağlayıcı geri bildirimleri (webhook) imzalı ve tekrara dayanıklı (idempotent) işlenir; doğrulama durumu yalnızca sunucuda yazılır. Doğrulanmış kullanıcı da şikâyet edilebilir; rozet moderasyonu engellemez.

### 6.6 Keşif tercihleri ve filtreler

**Temel filtreler (ücretsiz)**

| Filtre | Aralık / seçenek | Varsayılan |
|---|---|---|
| Kimi görmek istiyorum | 6.4'teki seçenekler | Kayıtta seçilen |
| Yaş aralığı | 18–99; en az 4 yıllık aralık | Kendi yaşı ±5 |
| Mesafe | 5 / 10 / 25 / 50 / 100 km ya da "tüm şehir" | Tüm şehir |
| Niyet | Çoklu seçim | Kendi niyeti + komşusu |
| Yalnızca ses kartı olanlar | Aç/kapa | Kapalı |
| Olmazsa olmazlar | Niyet Kartı'ndaki en fazla 3 alan | Boş |

**Gelişmiş filtreler (Plus)** — her biri için "tercih" (sıralamayı etkiler) ya da "şart" (zorunlu) seçilir:

Boy aralığı · Eğitim · Sigara · Alkol · Çocuk durumu · Çocuk isteği · Evcil hayvan · Spor · Beslenme · Diller · Tempo · Son 3 günde aktif · Buluşma teyidi olanlar.

**Kurallar**
- Filtre her zaman iki yönlüdür ve hiçbir ücretli özellik karşı tarafın filtresini aşamaz.
- Her filtre değişikliğinde canlı tahmin: "Bu ayarlarla havuzunda yaklaşık X kişi var." X < 30 ise uyarı.
- "Şart" seçilen filtre yüzünden Tur 9'un altına düşerse dürüstçe söylenir; filtre kendiliğinden gevşetilmez.
- Güvenlik kuralları (engel, şikâyet, doğrulama) filtre değildir; herkese uygulanır.
- Tercihler `preferences` tablosunda saklanır; değişiklik bir sonraki Tur'da geçerli olur.

---

## 7. Güvenlik, moderasyon ve ban sistemi

### 7.1 İlkeler

- Kullanıcıya her kararın **nedeni** söylenir. Gölge ban yok.
- Her şikâyete **sonuç bildirimi** gider ("İncelendi, işlem yapıldı" / "İncelendi, kural ihlali bulunmadı").
- Kadın ve LGBTQ+ kullanıcı güvenliği tasarımın merkezindedir.

### 7.2 Otomatik moderasyon hattı

| İçerik | Kontrol | Sonuç |
|---|---|---|
| Fotoğraf | Müstehcenlik/şiddet etiketleri, yüz var mı, yüz eşleşmesi, metin tespiti (OCR), bilinen CSAM karması, EXIF temizliği | Geçer / otomatik ret (gerekçeli) / elle inceleme kuyruğu |
| Metin (ad, bio, Kapı Sorusu, cevaplar) | Küfür/nefret, iletişim bilgisi, bağlantı, reklam, fiyat/escort kalıpları | Engelle / uyar / kuyruğa al |
| Sohbet mesajı | Aşağıdaki dolandırıcılık kalıpları, taciz sınıflandırması | Gönderene "Bunu göndermek istediğine emin misin?" ya da alıcıya uyarı bandı |
| Ses | Süre, sessizlik kontrolü; şikâyet gelirse yazıya döküp metin kontrolü | Kuyruk |

Fotoğraflar önce `quarantine` kovasına yüklenir; kontrolden geçince `public-photos` kovasına taşınır. Kontrolden geçmemiş hiçbir görsel başka kullanıcıya servis edilmez.

### 7.3 Dolandırıcılık ve şantaj önlemleri

- **Platform dışına çekme:** İlk 48 saatte "WhatsApp, Telegram, Instagram, numara, link" içeren mesajlarda alıcıya bant: "Dolandırıcılar genelde hemen başka uygulamaya geçmek ister. Acele etme." Engellenmez, uyarılır.
- **Para/kripto/yatırım/gümrük/hediye kartı** kalıpları: alıcıya uyarı + hesap risk puanına ek.
- **Bağlantı:** 7 günden yeni hesaplar bağlantı gönderemez. Tüm bağlantılar güvenli önizleme sayfasından açılır.
- **Sohbette fotoğraf:** Masa açıldıktan 24 saat sonra ve iki taraf da "fotoğraf paylaşımına izin ver" dediyse açılır. Gelen her görsel bulanık gelir, dokununca açılır. Müstehcen tespit edilen görsel gönderilmez, gönderene kural hatırlatılır. Görseller tek seferlik değil ama alıcı tarafında "kaydet" düğmesi yoktur.
- **Risk puanı (0–100):** yeni hesap + çok hızlı çok cevap + kopya metin + platform dışı yönlendirme + şikâyet + cihaz/ağ sinyalleri. 60+ → cevap gönderimi yavaşlar ve elle incelemeye düşer; 85+ → geçici askı + yeniden doğrulama.
- **Ekran görüntüsü:** Android'de sohbet ve profil ekranlarında `FLAG_SECURE`. iOS'ta engellenemez; ekran görüntüsü alındığında karşı tarafa bilgi satırı düşer.
- **Ağ sinyalleri:** Aynı IP/alt ağdan kısa sürede çok kayıt, bilinen veri merkezi/VPN çıkışları, kötü itibarlı e-posta alan adları risk puanına eklenir; tek başına ret sebebi değildir.
- **Hız sınırları:** OTP isteği 3/saat, cevap gönderme 15/gün, şikâyet 20/gün, giriş denemesi 10/saat (IP + cihaz).
- **Cihaz bütünlüğü:** iOS App Attest, Android Play Integrity. Emülatör/root/jailbreak → kayıt engellenmez ama risk puanına eklenir ve canlılık eşiği yükselir.

### 7.4 Şikâyet ve engelleme

- Her profil, cevap, mesaj ve fotoğraftan 2 dokunuşla **Şikâyet et**.
- Kategoriler: Sahte profil / başkasının fotoğrafı, Dolandırıcılık ya da para isteme, Taciz ya da tehdit, Uygunsuz içerik, Reşit değil gibi görünüyor, Buluşmada kötü davranış, Spam / reklam, Diğer.
- İsteğe bağlı açıklama + son 20 mesaj kanıt olarak otomatik eklenir (şikâyet eden onaylar).
- Her şikâyet bir **vaka numarası** alır; durumu (alındı / inceleniyor / sonuçlandı) Ayarlar → Şikâyetlerim'den izlenir. Destek saatleri dürüstçe yazılır; 7/24 inceleme yoksa öyle denmez.
- **Engelle:** anında, karşılıklı görünmezlik, masa varsa sessizce kapanır, karşı tarafa bildirim gitmez. Engel listesi Ayarlar'dan yönetilir.
- **Rehberimdekileri gizle:** Rehberdeki numaralar cihazda karmalanır (SHA-256 + uygulama tuzu), yalnızca karmalar yüklenir; eşleşen kullanıcılar karşılıklı gizlenir. Rehber ham hâliyle asla sunucuya gitmez.
- "Reşit değil" ve "tehdit" şikâyetleri en yüksek öncelikli kuyruğa düşer; hedef ilk yanıt 1 saat (diğerleri 24 saat).

### 7.5 Yaptırımlar ve ban sistemi

**Kademeler:** Uyarı → içerik kaldırma → geçici kısıt (cevap gönderememe, 24 saat–7 gün) → askı (7–30 gün) → kalıcı ban. Doğrudan kalıcı ban: reşit olmayan kullanıcı, reşit olmayanlara yönelik içerik, dolandırıcılık, şantaj, tehdit, rıza dışı mahrem görüntü, ticari cinsel hizmet, ban atlatma.

**Ban kaydı (`ban_identifiers`)** — ban anında aşağıdakilerin tamamı yazılır ve kayıt/giriş sırasında kontrol edilir:

| Tanımlayıcı | Nasıl saklanır | Kontrol anı |
|---|---|---|
| E-posta | Normalize edilmiş e-postanın HMAC-SHA256 karması | E-posta girildiğinde |
| Apple/Google hesap kimliği (`sub`) | Karma | Sosyal girişte |
| Telefon | E.164 karması | Telefon girildiğinde |
| Yüz | Yüz koleksiyonunda `banned` etiketi | Canlılık sonrası |
| Cihaz | iOS: DeviceCheck bitleri + `identifierForVendor` karması; Android: Play Integrity cihaz sinyali + `ANDROID_ID` karması | Uygulama açılışı ve kayıt |
| Ödeme | Mağaza `originalTransactionId` / satın alma belirteci karması | Satın almada |
| Kimlik belgesi | Belge numarası karması (yalnızca kimlikle doğrulama yapıldıysa) | Kimlik doğrulamada |

- **Tek eşleşme yeterlidir:** banlı e-posta, telefon ya da yüz ile yeni hesap açılamaz. Cihaz eşleşmesi tek başına ret sebebi değildir (ikinci el telefon); risk puanını 85'e çıkarır ve elle incelemeye düşürür.
- **Kayıt sırasında sızdırmama:** Banlı e-posta/telefonla *yeni kayıt* denemesinde ekranda yalnızca genel mesaj gösterilir ("Bu bilgilerle hesap oluşturulamıyor. Yardım için destek@…"); bir e-postanın banlı olup olmadığı üçüncü kişilere belli edilmez. Ayrıntı ve itiraz bağlantısı o e-posta adresine gönderilir.
- Banlı kullanıcı *kendi hesabına* giriş yapınca **Ban ekranı** görür: gerekçe kategorisi, tarih, itiraz düğmesi, veri indirme/silme talebi bağlantısı. Başka hiçbir ekrana geçemez.
- **İtiraz:** 30 gün içinde 1 kez, serbest metin + isteğe bağlı kimlik doğrulama. İnsan incelemesi, 7 gün içinde sonuç, sonuç e-postayla ve uygulama içinde bildirilir. Kabul edilirse tüm tanımlayıcılar ban kaydından çıkarılır.
- **Hesap silme ban'ı silmez:** Banlı kullanıcı verisinin silinmesini isteyebilir; profil verisi silinir, ban tanımlayıcı karmaları meşru menfaat/hukuki yükümlülük gerekçesiyle tutulur (süre: 5 yıl, hukukçuya doğrulat).
- **Ban atlatma:** Yeni hesap banlı bir tanımlayıcıyla ilişkilendirilirse yeni hesap da banlanır, yeni tanımlayıcılar kayda eklenir.
- **Kendi isteğiyle silme sonrası:** Aynı e-posta/telefonla yeniden kayıt serbesttir ancak 30 gün içinde yeniden kayıt olanın "Geç" geçmişi ve engel listesi geri yüklenir (profil sıfırlayarak havuzu yenileme suistimalini önler). Bunun için silinen hesabın e-posta/telefon karması ve engel ilişkileri 30 gün tutulur.
- Aktif aboneliği olan kullanıcı banlandığında: abonelik mağaza üzerinden kullanıcı tarafından iptal edilir; Ban ekranında nasıl iptal edileceği adım adım gösterilir. Dolandırıcılık dışı banlarda kalan süre için iade talebine yönlendirme yapılır.

### 7.6 Buluşma güvenliği

- **Güvenli Buluşma:** Plan kabul edilince kullanıcı güvendiği bir kişiye (rehberden seçer) SMS/bağlantı ile "kiminle (ad + ana fotoğraf), ne zaman, hangi ilçede" bilgisini paylaşabilir. Bağlantı 24 saat geçerli.
- **Kontrol bildirimi:** Buluşma saatinden 90 dk sonra "Her şey yolunda mı?" bildirimi. "Yardıma ihtiyacım var" → 112 arama kısayolu + güvendiği kişiye otomatik mesaj.
- **"Nasıldı?"** (ertesi gün, yalnızca kullanıcı ve sistem görür): Buluştunuz mu? / Fotoğraflarına benziyor muydu? / Kendini güvende hissettin mi? / Tekrar görüşmek ister misin? "Güvende hissetmedim" → şikâyet akışı. "Benzemiyordu" 2 farklı kişiden gelirse yeniden doğrulama tetiklenir.
- **Güvenlik Merkezi** (Ayarlar): ilk buluşma ipuçları, dolandırıcılık türleri, şantaja uğrarsan ne yapmalı, acil numaralar (112; KADES bilgisi), topluluk kuralları.

### 7.7 Çocuk güvenliği

- 18 yaş altı kesinlikle yasak; yaş kapısı + yüz yaş tahmini + şüphede kimlik.
- Google Play Çocuk Güvenliği Standartları gereği: CSAE'yi yasaklayan herkese açık standartlar sayfası, uygulama içi bildirim mekanizması, CSAM tespitinde derhal kaldırma ve yetkili mercilere bildirim süreci, atanmış çocuk güvenliği irtibat kişisi (`safety@alanadi`).
- Profil fotoğrafında çocuk tespit edilirse (yetişkinle birlikte bile olsa) elle incelemeye düşer.

---

## 8. Bilgi mimarisi ve ekranlar

**Alt gezinme (4 sekme):** Tur · Cevaplar · Masalar · Ben

### 8.1 Ekran listesi

| # | Ekran | İçerik ve durumlar |
|---|---|---|
| 1 | Açılış (splash) | Logo animasyonu, oturum/ban/sürüm kontrolü. Zorunlu güncelleme ve bakım ekranı |
| 2 | Karşılama | 3 tanıtım kartı, Giriş / Kayıt |
| 3–17 | Kayıt adımları | Bölüm 6.1 |
| 18 | **Tur** | 9 kart, üstte konum göstergesi (9 nokta), "Neden bu kişi?", Cevapla / Geç. Durumlar: Tur henüz açılmadı (geri sayım), Tur bitti, havuz az, çevrimdışı |
| 19 | Profil detayı | Fotoğraflar, Kapı Sorusu, niyet, ses kartı, ilgi alanları, Günün Sorusu cevapları, ilçe, yanıt güvenilirliği, doğrulandı rozeti, ⋯ menü (Şikâyet / Engelle / Paylaşma yok) |
| 20 | Cevap yazma | Soru üstte, metin/ses sekmesi, karakter sayacı, gönder |
| 21 | **Cevaplar kutusu** | Gelenler (tam profil önizlemeli) ve Gönderdiklerim (durum: bekliyor/karşılık geldi/düştü). Boş durum |
| 22 | Cevap detayı | Kişinin cevabı + profili, Karşılık ver / Geç / Şikâyet |
| 23 | **Masalar** | 3 (ya da 5) yuva görseli, aktif sohbetler, "Sıra sende" etiketi, "Masa bekliyor" kuyruğu, Soğuyanlar arşivi |
| 24 | Sohbet | Mesajlar, yazıyor göstergesi, okundu (isteğe bağlı, karşılıklı), ses mesajı, fotoğraf (kısıtlı), tepki, yanıtla, Plan çubuğu, uyarı bantları, ⋯ menü (Nazik Veda / Engelle / Şikâyet / Sessize al) |
| 25 | Plan oluştur / Plan kartı | Bölüm 4.5 |
| 26 | Nazik Veda | Hazır cümleler + kısa not |
| 27 | Eşleşme anı | "Masa açıldı" animasyonu |
| 28 | **Ben** | Profil önizleme, düzenle, Şeffaflık Paneli, Günün Sorusu, Plus kartı, Ayarlar |
| 29 | Profil düzenle | Bölüm 6.4 alanları, fotoğraf sırala/kırp |
| 30 | Şeffaflık Paneli | Bölüm 4.6 |
| 31 | Günün Sorusu | Soru, cevap alanı, başkalarının cevapları yok (yalnızca profillerde görünür) |
| 32 | Plus | Ne var / ne yok tablosu, fiyat, satın al, geri yükle, iptal nasıl yapılır |
| 33 | Ayarlar | Bölüm 10 |
| 34 | Güvenlik Merkezi | Bölüm 7.6 |
| 35 | Şikâyet akışı | Kategori → açıklama → kanıt onayı → teşekkür |
| 36 | Ban / Askı ekranı | Gerekçe, süre, itiraz |
| 37 | İtiraz formu | |
| 38 | Bildirim merkezi | Uygulama içi bildirim geçmişi |
| 39 | Şehir bekleme ekranı | "Şehrin açılmasına %X kaldı", davet et |
| 40 | Yeniden doğrulama | |
| 41 | Mola modu | Süre seçimi, masalara ne olacağı |
| 42 | Hesap silme | Neden soruyor (isteğe bağlı), sonuçları anlatır, onay |
| 43 | Doğrulama merkezi | Bölüm 6.5 |
| 44 | Filtreler | Bölüm 6.6; canlı havuz tahmini |
| 45 | Sonraya sakladıklarım | En fazla 9 kart, kalan süre |
| 46 | Şikâyetlerim / Taleplerim | Vaka numarası, durum |
| 47 | Aktif oturumlar | Cihaz listesi, oturum kapatma |
| 48 | Gizli kelimeler | Sözcük listesi, filtrelenen mesajlar klasörü |

### 8.2 Her ekranda zorunlu durumlar

Yükleniyor (iskelet), boş, hata (yeniden dene), çevrimdışı (önbellekten göster + bant), izin reddedildi (ayarlara götür).

---

## 9. Gelir modeli

### 9.1 İlkeler (kodla ve testle güvenceye alınır)

1. Görünürlük satılmaz: boost, süper beğeni, öncelikli cevap **yok**.
2. Gelen cevapları görmek ücretsizdir.
3. Tek ücretli paket. Paketin üstüne paket çıkarılmaz.
4. Aynı ülkede herkese aynı fiyat. Yaşa, cinsiyete, cihaza göre fiyat **yok**.
5. Ücretsizken var olan bir özellik sonradan paralı yapılmaz.
6. Üyelik bitince sıralama değişmez (zaten girdi değil).

### 9.2 Ücretsiz ve Plus

| Özellik | Ücretsiz | Plus |
|---|---|---|
| Günlük Tur (9 kişi) | ✓ | ✓ |
| Gelen cevapları görme | ✓ | ✓ |
| Sınırsız karşılık verme | ✓ | ✓ |
| Temel filtreler (yaş, mesafe, cinsiyet, niyet) | ✓ | ✓ |
| Şeffaflık Paneli | ✓ | ✓ |
| Masa sayısı | 3 | 5 |
| Gelişmiş filtreler (boy, eğitim, sigara, alkol, çocuk, diller) | — | ✓ |
| İkinci şehir (seyahat öncesi Tur'u o şehirden al) | — | ✓ |
| Gizli mod (yalnızca cevap gönderdiklerine görün) | — | ✓ |
| Öğle Turu (12:30'da 3 ek kişi) | — | ✓ |
| Okundu bilgisi (karşı taraf da açtıysa) | — | ✓ |
| Tema ve uygulama simgesi seçenekleri | — | ✓ |

Tek kullanımlık ek satın alma (boost, ek cevap, süper beğeni vb.): **yok**. Tek istisna Plus'ın 30 günlük, yenilenmeyen geçişidir (9.3). İleride değerlendirilebilecek tek aday: etkinlik bileti.

### 9.3 Fiyat

- **30 günlük geçiş (otomatik yenilenmez):** Tek ödeme, süre bitince kendiliğinden sona erer. Satın alma ekranında ilk ve varsayılan seçenek budur.
- Otomatik yenilenen seçenekler: aylık, 3 aylık, yıllık (indirimli).
- Fiyat `TODO(owner)`: başlangıç adayı 149 ₺/ay; mağaza fiyat kademesi ve güncel kurla doğrula. Rakiplerin giriş paketinin belirgin altında kalmalı.
- 7 günlük ücretsiz deneme **yok** (iptalden sonra tahsilat şikâyetlerinin ana kaynağı). Onun yerine: ilk kayıtta 3 gün Plus hediye, kart bilgisi istenmeden.
- Gelir beklentisi notu: bu kadar cömert bir ücretsiz katman dönüşümü düşürür. Bilinçli tercih: önce güven ve büyüme.

### 9.4 Abonelik dürüstlüğü

- Satın alma ekranında: fiyat, dönem, yenileme tarihi, "istediğin zaman iptal" ve **iptalin nereden yapılacağı** açıkça yazar.
- Ayarlar → Abonelik: "İptal et" düğmesi doğrudan mağazanın abonelik yönetim sayfasını açar (iOS: `showManageSubscriptions`, Android: Play abonelik derin bağlantısı). Uygulama içi sahte "iptal" yok.
- Yenilemeden 3 gün önce bildirim + e-posta (yıllık pakette 7 gün önce).
- İade: mağaza iade bağlantıları Ayarlar'da; destek ekibi iade talebini engellemeye çalışmaz.
- Hesap silinirken aktif abonelik varsa: "Hesabını silmek aboneliğini iptal etmez" uyarısı + iptal bağlantısı.
- iOS ↔ Android geçişi: yetki (entitlement) hesap bazlıdır, platform değişince Plus sürer.

---

## 10. Ayarlar ekranı (tam liste)

Üstte arama kutusu. Her satırda kısa açıklama. Değişiklikler anında kaydedilir ve "kaydedildi" geri bildirimi verilir. (P) = Plus.

**Hesap**
- E-posta (değiştir, yeniden doğrula)
- Telefon (değiştir; 24 saat bekleme)
- Giriş yöntemleri (Apple, Google, e-posta; en az biri kalmalı)
- Aktif oturumlar ve cihazlar (cihaz, şehir, son görülme; tek tek ya da tümünü kapat)
- Yeni cihazdan girişte e-posta uyarısı (kapatılamaz)
- Uygulama kilidi (Face ID / parmak izi / cihaz şifresi; hemen / 1 dk / 5 dk sonra)
- Abonelik (plan, bitiş ya da yenileme tarihi, yönet/iptal, satın alımları geri yükle, iade nasıl istenir, fatura yardımı)

**Doğrulama** → Bölüm 6.5 (Doğrulama merkezi)

**Profil**
- Profili düzenle, önizle
- Niyet Kartı
- Kapı Sorusu
- Alan görünürlükleri (yaş, cinsiyet, ilçe ve tüm isteğe bağlı alanlar için tek ekranda anahtarlar)

**Keşif tercihleri** → Bölüm 6.6
- Temel filtreler, olmazsa olmazlar
- Gelişmiş filtreler (P)
- İkinci şehir (P)
- Öğle Turu (P; aç/kapa)
- Geçtiklerimi sıfırla (90 günde 1 kez)
- "Daha az göster" tercihlerim (listele, kaldır)

**Gizlilik**
- Gizli mod: yalnızca cevap gönderdiklerime görün (P)
- Çevrimiçi durumumu göster
- Canlı Saat halkamı göster
- Okundu bilgisi (karşılıklı; P)
- Yanıt güvenilirliği rozetini göster (kapatırsan başkalarınınkini de göremezsin)
- Rehberimdekilere görünme (eşitle, son eşitleme tarihi, karmaları sunucudan sil)
- Engellenenler
- Gizli kelimeler: listedeki sözcükleri içeren cevap ve mesajlar ayrı klasöre düşer (en fazla 50 sözcük)
- Sohbette fotoğraf: Kimseden alma / Her masada sor / İzin ver
- Ekran görüntüsü bilgisi (Android'de engellenir, iOS'ta bildirilir; "tamamen engellenemez" açıklaması)
- Nötr uygulama simgesi ve adı (ücretsiz)
- Analitik izni, kişiselleştirme izni
- Açık rızalarım ve rıza geçmişi (görüntüle, geri çek; sonucu açıklanır)

**Sohbet**
- Enter ile gönder
- Bağlantı önizlemesi
- Ses mesajı oynatma hızı; kulaklıkta otomatik oynat
- Medyayı yalnızca Wi-Fi'da indir
- Konu önerilerini göster
- Dolandırıcılık uyarı bantları (kapatılamaz; açıklaması var)

**Bildirimler** (her biri için push / e-posta ayrı)
- Tur açıldı · Yeni cevap · Karşılık / masa açıldı · Yeni mesaj · Sıra sende · Masa soğumak üzere · Plan ve buluşma · Günün Sorusu
- Güvenlik ve hesap (kapatılamaz) · Abonelik hatırlatmaları (kapatılamaz)
- Kampanya ve duyurular (varsayılan kapalı, ayrı izin)
- Kilit ekranında içerik: Gizle (varsayılan) / Yalnızca ad / Ad + önizleme
- Sessiz saatler (varsayılan 23:00–08:00)
- Bildirim sesi ve titreşim
- Tümünü duraklat (1 saat / bu gece / 1 hafta)

**Görünüm ve erişilebilirlik**
- Tema: Sistem / Gece / Gündüz; ek temalar (P)
- Dil: Türkçe / English
- Yazı boyutu (sistemi izle ya da elle)
- Yüksek kontrast
- Hareketi azalt (sistemi izle ya da elle)
- Dokunsal geri bildirim · Arayüz sesleri
- Ses içeriklerinde yazıya döküm göster (v1.1)
- Süslü uygulama simgeleri (P)

**Güvenlik**
- Güvenlik Merkezi
- Güvendiğim kişiler (en fazla 3)
- Buluşma kontrol bildirimi (aç/kapa; süre 60 / 90 / 120 dk)
- Şikâyetlerim (vaka numarası, durum)
- Hakkımdaki kararlar (uyarı, kısıt, askı; gerekçe ve itiraz)

**Mola ve hesap**
- Mola: süre (1 gün–süresiz) ve isteğe bağlı neden (Yoğunum / Ara veriyorum / Biriyle görüşüyorum / Diğer). Neden kimseye gösterilmez. Açık masalara ne olacağı anlatılır.
- Çıkış yap
- Verilerimi indir (JSON + medya; 48 saat içinde e-posta bağlantısı; durum takibi)
- Hesabımı sil

**Depolama**
- Önbelleği temizle (boyut gösterilir)

**Destek**
- Yardım / SSS (aranabilir)
- Bize yaz (kategori + metin + otomatik cihaz/sürüm bilgisi; vaka numarası)
- Taleplerim
- Sorun bildir (ekran görüntüsü eklenebilir)
- Fikir öner
- Beta programı (aç/kapa)

**Yasal ve hakkında**
- Kullanım Koşulları · Gizlilik Politikası · KVKK Aydınlatma Metni · Topluluk Kuralları · Çocuk Güvenliği Standartları · Abonelik ve İade Koşulları · Veri saklama özeti
- Açık kaynak lisansları
- Sürüm ve derleme numarası

**Ayar kuralları**
- Güvenlik, engelleme, şikâyet, silme ve iptal yolları en fazla 3 dokunuş uzaklıktadır ve hiçbiri Plus'a bağlı değildir.
- Her ayarın sunucu karşılığı vardır; yeni cihazda aynen gelir (cihaza özel olanlar: uygulama kilidi, önbellek, bildirim sesi).
- Varsayılanlar gizlilik lehinedir.

### 10.1 Hesap silme

- Yol: Ayarlar → Hesabımı sil → sonuçların özeti → yeniden kimlik doğrulama (OTP) → onay.
- Hemen: profil görünmez olur, masalar "kullanıcı ayrıldı" notuyla kapanır.
- 30 gün "geri alma" süresi (giriş yapınca iptal edilir); süre sonunda kalıcı silme: profil, fotoğraflar, mesaj içerikleri (karşı tarafın görünümünde "silinmiş kullanıcı" + mesajlar kaldırılır), yüz vektörü, konum, rızalar hariç yasal saklama gerekenler.
- Web üzerinden silme talebi sayfası da olmalı (Google Play şartı): `alanadi/hesap-sil`.

---

## 11. Bildirimler

| Tetikleyici | Metin örneği (TR) | Not |
|---|---|---|
| Tur açıldı (12:00, 21:00) | "Turun hazır: 9 yeni kişi." | Günde 2 |
| Yeni cevap | "Ece sorunu cevapladı." | 3'ten fazlaysa gruplanır |
| Karşılık / masa açıldı | "Mert karşılık verdi. Masanız hazır." | |
| Yeni mesaj | Ad + önizleme (önizleme kapatılabilir) | |
| Sıra sende (24 saat) | "Deniz senden haber bekliyor." | Masa başına 1 |
| Masa soğumak üzere (60. saat) | "Deniz'le masanız 12 saat sonra kapanacak." | |
| Masa bekliyor | "Yer açarsan Ali'yle sohbet başlayacak." | |
| Plan teklifi / kabulü / hatırlatma | | |
| Buluşma kontrolü | "Her şey yolunda mı?" | |
| Günün Sorusu (09:00) | | Varsayılan açık, haftada en fazla 3 push |
| Abonelik yenileme hatırlatması | | Kapatılamaz |
| Güvenlik / moderasyon sonucu | | Kapatılamaz |

Kilit ekranı metni varsayılan olarak içerik göstermez ("Dokuz'da yeni bir bildirimin var"); kullanıcı Ayarlar'dan ad ya da önizleme açabilir. Push en iyi çabayla iletilir; doğruluk kaynağı uygulama içi durumdur.

Kurallar: günde en fazla 6 push (mesaj hariç); sessiz saatlere uy; 14 gün girmeyen kullanıcıya en fazla 2 geri çağırma bildirimi, sonra sus. Suçluluk/aciliyet dili yok.

---

## 12. Tasarım sistemi ve animasyonlar

### 12.1 Görsel kimlik

**Fikir:** Alacakaranlık. Uygulama akşam 9'u bekleyen bir gökyüzü gibi; arka plan günün saatine göre çok hafif renk değiştirir (sabah soluk, 21:00'e yaklaşırken ısınır, Tur açılınca gece).

**Renkler (Gece teması — varsayılan):**

| Belirteç | Değer | Kullanım |
|---|---|---|
| `bg/base` | `#0F1021` | Ana arka plan |
| `bg/raised` | `#1A1B33` | Kart, sayfa |
| `bg/sunken` | `#0A0B18` | Girdi alanı |
| `accent/primary` | `#FFB37A` (kayısı) | Ana eylem, vurgu |
| `accent/secondary` | `#B9A5FF` (leylak) | İkincil vurgu, Canlı Saat halkası |
| `text/primary` | `#F5F3FF` | |
| `text/secondary` | `#A9A8C7` | |
| `success` | `#7EE0B5` | Doğrulandı |
| `warning` | `#FFD166` | Uyarı bandı |
| `danger` | `#FF6B7A` | Şikâyet, sil |
| `sky/gradient` | saate göre 5 duraklı geçiş | Tur arka planı |

Gündüz teması aynı belirteçlerin açık karşılıkları (`bg/base #FBF8F4`, `text/primary #171830`, `accent/primary #E8843C`). Tüm metin/arka plan çiftleri WCAG AA (4.5:1) sağlamalı; testle doğrula.

**Tipografi:** Başlıklar için karakterli bir serif (öneri: Fraunces, OFL), gövde için Inter (OFL). Türkçe karakterleri (ğ, ş, ı, İ, ö, ü, ç) cihazda doğrula. Ölçek: 12 / 14 / 16 / 20 / 28 / 40. Dinamik yazı boyutu desteklenir.

**Biçim:** Köşe yarıçapı 12 / 20 / 28. 8'lik boşluk ızgarası. Kartlarda fotoğraf tam kenar, yumuşak iç gölge. İkon seti: Phosphor (tek ağırlık). Emoji arayüz ikonunun yerine kullanılmaz.

**Cam efekti:** Yalnızca üst çubuk, alt gezinme ve açılır sayfa tutamaçlarında, ölçülü bulanıklık. İçerik kartlarında kullanılmaz (okunabilirlik ve performans).

**Kimlik öğesi:** 9 nokta (3×3). Logo, Tur ilerleme göstergesi, yükleme animasyonu ve masa yuvaları (3 nokta) aynı motiften türer.

### 12.2 Hareket ilkeleri

- Her animasyonun bir işi var: yön göstermek, sonucu onaylamak ya da bir anı kutlamak. Süs için animasyon yok.
- Arayüz geçişleri 180–280 ms; kutlama anları 600–1200 ms ve her zaman dokunuşla atlanabilir.
- Varsayılan yay: `damping 18, stiffness 180, mass 1`. Çıkışlar girişlerden %20 hızlı.
- 60 fps hedefi (120 Hz ekranlarda 120). Animasyonlar UI iş parçacığında (Reanimated worklet); JS iş parçacığında animasyon yok.
- **Hareketi azalt** açıkken: ölçek/kaydırma yerine 150 ms çapraz geçiş; parçacık ve paralaks kapalı.
- Dokunsal geri bildirim: hafif (seçim), orta (gönder), başarı (masa açıldı). Ayarlardan kapatılabilir.

### 12.3 Animasyon envanteri

| An | Tanım | Araç |
|---|---|---|
| Açılış | 9 nokta tek tek yanar, logoya toplanır (≤900 ms) | Rive |
| Tur açılışı | Gökyüzü geçişi geceye döner; 9 kart yelpaze gibi dağılıp desteye oturur (kademeli yay, 40 ms aralık) | Reanimated + Skia |
| Kartlar arası geçiş | Yatay sayfalama; öndeki kart %4 küçülüp arkaya düşer, fotoğrafta hafif paralaks | Reanimated + Gesture Handler |
| Fotoğraf geçişi | Kart içinde dokunarak; üstte ince ilerleme çizgileri | Reanimated |
| "Neden bu kişi?" | Kart arkasını çevirme (3B dönüş, 320 ms) | Reanimated |
| Cevapla | Soru balonu büyüyüp yazma alanına dönüşür (paylaşılan öğe geçişi) | Reanimated layout |
| Cevap gönderildi | Balon küçülüp kıvılcıma dönüşür, Cevaplar sekmesine uçar; sekme ikonu bir kez nabız atar | Skia |
| Geç | Kart aşağı doğru solarak iner; 9 noktadan biri söner | Reanimated |
| Tur bitti | 9 nokta halka olup geri sayım saatine dönüşür | Rive |
| Masa açıldı | İki avatar karşılıklı kayar, aralarında bir nokta yanar ve masa yuvasına oturur; başarı titreşimi | Rive + Skia |
| Masa yuvaları | Dolu yuva dolgun, boş yuva kesik çizgili; soğuyan masa yavaşça solar | Reanimated |
| Yazıyor | 3 nokta dalga | Reanimated |
| Mesaj gönder | Balon girdiden yukarı yay ile çıkar | Reanimated layout |
| Ses kaydı | Canlı dalga formu, bırakınca gönder, sola kaydırınca iptal | Skia |
| Nazik Veda | Masa noktası yavaşça söner; sakin, kutlama yok | Reanimated |
| Plan kabul | Kart üzerinde tik çizilir, takvim ikonu bir kez zıplar | Lottie/Rive |
| Canlılık başarılı | Yüz çerçevesi yeşil halka ile tamamlanır | Rive |
| Yenile (aşağı çek) | 9 nokta sırayla yanar | Reanimated |
| Yükleniyor | İçeriğin biçiminde iskelet + yumuşak parıltı | Reanimated |
| Sekme değişimi | İkon dolgu geçişi + 2 pt zıplama | Reanimated |
| Boş durumlar | Tek, sakin döngülü çizim | Rive |
| Hata | Yatay 6 pt sallanma + uyarı titreşimi | Reanimated |

Konfeti, kalp yağmuru, ekran sarsıntısı kullanılmaz.

### 12.4 Ses

İsteğe bağlı, varsayılan kapalı. 4 kısa ses: Tur açıldı, cevap gönderildi, masa açıldı, mesaj geldi. Telifsiz ya da özel üretim (`TODO(owner)`).

### 12.5 Erişilebilirlik

- Tüm etkileşimli öğelerde `accessibilityLabel` / rol; dokunma alanı en az 44×44 pt.
- VoiceOver/TalkBack ile Tur'da gezinme: kart özeti okunur ("Ece, 27, Kadıköy. Kapı sorusu: …").
- Renk tek başına anlam taşımaz (ikon + metin).
- Dinamik yazı boyutunda %200'e kadar bozulmayan düzen.
- Ses kartları için isteğe bağlı otomatik yazıya döküm (v1.1).

---

## 13. Teknik mimari

### 13.1 Yığın

| Katman | Seçim | Not |
|---|---|---|
| Mobil | Expo (güncel SDK, New Architecture), React Native, TypeScript strict | Canlılık modülü için özel geliştirme istemcisi (dev client) gerekir; Expo Go yetmez |
| Gezinme | Expo Router | Derin bağlantı ve evrensel bağlantılar |
| Durum | TanStack Query (sunucu), Zustand (yerel) | |
| Form/doğrulama | react-hook-form + zod | Şemalar istemci ve Edge Function arasında paylaşılır |
| Animasyon | Reanimated, Gesture Handler, Skia, Rive (ya da Lottie), expo-haptics | |
| Liste/görsel | FlashList, expo-image (önbellek, blurhash) | |
| Çeviri | i18next + expo-localization | Anahtarlar `tr.json` / `en.json` |
| Yerel depolama | expo-secure-store (belirteçler), MMKV (önbellek) | |
| Arka uç | Supabase: Postgres + PostGIS, Auth, Realtime, Storage, Edge Functions (Deno), pg_cron | Bölge: AB (Frankfurt) |
| Ödeme | RevenueCat (`react-native-purchases`) + webhook → Supabase | |
| Push | expo-notifications → APNs / FCM | |
| Canlılık ve yüz | AWS Rekognition (Face Liveness, CompareFaces, yüz koleksiyonu, moderasyon etiketleri) | Amplify Liveness iOS/Android bileşenleri için yerel modül sarmalayıcı yazılacak. Desteklenen AWS bölgesini doğrula |
| SMS OTP | Twilio Verify ya da yerel sağlayıcı (Netgsm, İleti Merkezi vb.) + numara türü sorgusu | Supabase "Send SMS Hook" ile bağlanır |
| E-posta | Resend ya da Postmark | SPF, DKIM, DMARC ayarlı |
| Metin moderasyonu | Moderasyon API'si + kural tabanlı Türkçe kalıp listesi | Sağlayıcıdan bağımsız arayüz (`ModerationProvider`) |
| CSAM karması | Sağlayıcı başvurusu gerekir (ör. PhotoDNA, Cloudflare CSAM Scanning Tool) | `TODO(owner)`: başvur |
| Hata izleme | Sentry | Kişisel veri temizleme açık |
| Ürün analitiği | PostHog (AB bölgesi) | Bölüm 15 |
| Admin paneli | Next.js (App Router) + Supabase, Vercel | Bölüm 14 |
| Tanıtım sitesi | Aynı Next.js projesinde: ana sayfa, yasal sayfalar, hesap silme, çocuk güvenliği standartları, `apple-app-site-association`, `assetlinks.json` | |
| DNS/WAF | Cloudflare | Turnstile (web formları) |
| CI/CD | GitHub Actions + EAS Build / Submit / Update | |

### 13.2 Depo yapısı

```
dokuz/
├─ apps/
│  ├─ mobile/            # Expo uygulaması
│  │  ├─ app/            # Expo Router rotaları
│  │  ├─ src/{features,components,design,lib,i18n,hooks,stores}
│  │  └─ modules/liveness/   # yerel modül (Swift + Kotlin)
│  └─ web/               # tanıtım + yasal + admin (Next.js)
├─ packages/
│  ├─ shared/            # zod şemaları, tipler, sabitler
│  └─ design-tokens/
├─ supabase/
│  ├─ migrations/
│  ├─ functions/         # Edge Functions
│  ├─ seed/              # sorular, ilgi alanları, şehir/ilçe
│  └─ tests/             # RLS testleri (pgTAP)
├─ docs/
├─ .env.example
└─ APP.md
```

### 13.3 Veri modeli (özet)

Tüm tablolarda `id uuid`, `created_at`, `updated_at`. Tüm tablolarda RLS açık.

| Tablo | Önemli sütunlar |
|---|---|
| `profiles` | `user_id`, `name`, `birth_date`, `gender`, `seeking[]`, `intent`, `bio`, `city_id`, `district_id`, `geo` (yaklaşık, 1 km ızgara), `status` (onboarding/active/paused/suspended/banned/deleted), `verified_at`, `last_active_at`, `reply_median_minutes`, `risk_score`, `locale` |
| `profile_photos` | `profile_id`, `storage_path`, `position`, `blurhash`, `moderation_status`, `reject_reason`, `face_match_score` |
| `profile_details` | boy, eğitim, meslek, sigara, alkol vb. + her biri için `visible` |
| `door_questions` | `profile_id`, `preset_id` ya da `custom_text`, `moderation_status` |
| `question_presets` | `text_tr`, `text_en`, `category`, `active` |
| `voice_cards` | `profile_id`, `storage_path`, `duration_ms`, `prompt_id` |
| `interests`, `profile_interests` | |
| `preferences` | `age_min`, `age_max`, `distance_km`, `intents[]`, gelişmiş filtreler, `second_city_id` |
| `daily_questions`, `daily_answers` | `date`, `text_*`; `profile_id`, `answer`, `expires_at` |
| `tur_batches` | `profile_id`, `tur_date`, `kind` (evening/noon/welcome), `generated_at` |
| `tur_cards` | `batch_id`, `candidate_id`, `position`, `reasons jsonb`, `action` (none/answered/passed), `acted_at` |
| `answers` | `from_id`, `to_id`, `question_snapshot`, `text` / `voice_path`, `status` (pending/reciprocated/passed/expired/reported), `expires_at` |
| `tables` | `a_id`, `b_id`, `status` (waiting_slot/active/cooled/closed/blocked), `turn_of`, `last_message_at`, `closed_by`, `farewell_text`, `photos_allowed_a/b` |
| `messages` | `table_id`, `sender_id`, `kind` (text/voice/photo/plan/system), `body`, `media_path`, `reply_to`, `read_at`, `flags jsonb`, `deleted_at` |
| `plans` | `table_id`, `proposer_id`, `date`, `time_window`, `venue_type`, `district_id`, `status` |
| `plan_feedback` | `plan_id`, `profile_id`, `met`, `looked_like_photos`, `felt_safe`, `see_again` |
| `trusted_contacts` | `profile_id`, `name`, `phone_encrypted` |
| `blocks` | `blocker_id`, `blocked_id` |
| `contact_hashes` | `profile_id`, `hash` |
| `reports` | `reporter_id`, `target_id`, `target_type`, `category`, `note`, `evidence jsonb`, `status`, `priority`, `resolved_by`, `resolution` |
| `moderation_actions` | `profile_id`, `action`, `reason_code`, `note`, `actor`, `expires_at` |
| `bans` | `profile_id`, `reason_code`, `banned_at`, `appeal_status` |
| `ban_identifiers` | `ban_id`, `type` (email/phone/face/device/oauth_sub/payment/id_doc), `hash` — `(type, hash)` benzersiz dizin |
| `appeals` | `ban_id`, `text`, `status`, `decided_by`, `decision_note` |
| `verifications` | `profile_id`, `kind` (liveness/id), `provider_ref`, `result`, `age_estimate_low/high`, `face_id` |
| `devices` | `profile_id`, `platform`, `device_hash`, `push_token`, `attest_status`, `app_version`, `last_seen_at` |
| `consents` | `profile_id`, `type`, `version`, `granted`, `at`, `ip_hash` |
| `subscriptions` | `profile_id`, `rc_customer_id`, `product`, `status`, `expires_at`, `platform` |
| `notification_prefs` | tür bazında push/e-posta, sessiz saatler |
| `notifications` | uygulama içi bildirim geçmişi |
| `deleted_accounts` | `email_hash`, `phone_hash`, `block_snapshot`, `purge_at` |
| `cities`, `districts` | `tz`, `status` (waitlist/open), `open_threshold` |
| `waitlist` | `profile_id`, `city_id`, `referred_by` |
| `feature_flags` | `key`, `value jsonb` |
| `audit_log` | `actor`, `action`, `target`, `diff`, `at` (yalnızca ekleme) |
| `saved_cards` | `profile_id`, `candidate_id`, `expires_at` |
| `less_like_this` | `profile_id`, `reason_key`, `weight_delta` |
| `hidden_words` | `profile_id`, `word` |
| `support_tickets` | `case_no`, `profile_id`, `category`, `status`, `messages jsonb` |
| `sessions_view` | oturum/cihaz listesi için kimlik sağlayıcı oturumlarının görünümü |
| `transparency_weekly` | `profile_id`, `week`, `impressions`, `answers_in`, `reciprocated` |

**RLS özeti:**
- Kullanıcı yalnızca kendi `profiles` satırını yazar. Başkasının profilini yalnızca şu durumlarda okur: güncel Tur'unda, kendisine cevap göndermiş, ya da ortak masası var. Okuma, hassas sütunları (`birth_date`, `geo`, `risk_score`) dışarıda bırakan bir görünüm (`public_profiles`) üzerinden yapılır.
- `messages`: yalnızca masanın iki tarafı; masa `active` değilse ekleme yok.
- `answers`: gönderen ve alıcı; ekleme yalnızca hedef güncel Tur'daysa.
- `bans`, `ban_identifiers`, `reports`, `moderation_actions`, `audit_log`, `risk_score`: istemciden erişim yok.
- Engellenen çift için tüm okuma politikaları boş döner.
- Her politika için pgTAP testi: "A, B'nin mesajını okuyamaz", "banlı kullanıcı hiçbir şey yazamaz" vb.

### 13.4 Edge Functions

| Fonksiyon | İş |
|---|---|
| `auth-precheck` | E-posta/telefon/cihaz karmasını ban kaydında arar; tek kullanımlık e-posta ve VoIP kontrolü |
| `liveness-start` / `liveness-complete` | Oturum oluşturur; sonucu doğrular, yüz eşleşmesi, mükerrer/banlı yüz araması, yaş tahmini |
| `photo-process` | Karantinadan al, EXIF sil, yeniden boyutlandır (3 boy), moderasyon, yüz eşleşmesi, yayınla/reddet |
| `text-moderate` | Bio, Kapı Sorusu, cevap, mesaj kontrolü |
| `tur-generate` | pg_cron ile şehir saat dilimine göre; Bölüm 5 |
| `answer-send` / `answer-reciprocate` | İş kuralları, sınırlar, masa açma, yuva kontrolü |
| `table-farewell` / `table-cooldown` | Nazik Veda; 24/60/72 saat zamanlayıcıları |
| `plan-*` | Teklif, kabul, hatırlatma, kontrol bildirimi |
| `report-create` / `moderation-apply` | Kuyruk, öncelik, yaptırım, ban tanımlayıcı yazımı |
| `push-dispatch` | Tercih, sessiz saat, günlük sınır, gruplama |
| `revenuecat-webhook` | İmza doğrulama, `subscriptions` güncelleme |
| `account-export` / `account-delete` / `account-purge` | Veri dışa aktarma, silme, 30 gün sonra kalıcı temizlik |
| `contacts-sync` | Rehber karmalarını eşler |
| `risk-score` | Olay bazlı risk puanı güncelleme |

Tüm iş kuralları sunucuda uygulanır; istemci yalnızca görünümdür. İstemciden doğrudan `answers`, `tables`, `tur_cards.action` yazımı yoktur; hepsi fonksiyon üzerinden.

### 13.5 Gerçek zamanlı ve çevrimdışı

- Sohbet: Supabase Realtime (masa başına kanal) + yazıyor göstergesi (broadcast) + çevrimiçi durumu (presence).
- Mesaj gönderimi iyimser: yerel kuyruk, benzersiz istemci kimliğiyle (idempotent), başarısızsa "tekrar dene". **Mesaj asla sessizce kaybolmaz.**
- Tur ve masalar yerelde önbelleklenir; çevrimdışı okunabilir, eylemler kuyruğa girer.

### 13.6 Konum gizliliği

- Cihazdan gelen konum sunucuda ~1 km ızgaraya yuvarlanır; ham koordinat saklanmaz.
- Başka kullanıcıya yalnızca ilçe adı gösterilir; sayısal mesafe gösterilmez (üçgenleme saldırısına karşı).
- Konum yalnızca uygulama açıkken ve en fazla günde birkaç kez güncellenir. Arka plan konumu istenmez.

### 13.7 Güvenlik

- TLS zorunlu; iOS ATS ve Android ağ güvenlik yapılandırması varsayılan sıkı.
- Belirteçler güvenli depoda; yenileme belirteci döndürme açık; şüpheli girişte tüm oturumlar kapatılır.
- Medya özel kovalarda, kısa ömürlü imzalı URL ile servis edilir.
- Telefon, güvenilen kişi numarası gibi alanlar sütun düzeyinde şifreli (pgsodium/Vault).
- Karmalar için sunucu tarafı gizli anahtarla HMAC (düz SHA değil).
- Girdi doğrulama her fonksiyonda zod ile; SQL yalnızca parametreli.
- Günlüklerde kişisel veri yok (e-posta, telefon, mesaj içeriği maskelenir).
- Bağımlılık taraması CI'da; gizli anahtar taraması (gitleaks).
- Yayın öncesi bağımsız sızma testi önerilir (`TODO(owner)`).

### 13.8 Performans hedefleri

| Ölçüt | Hedef |
|---|---|
| Soğuk açılış (orta sınıf Android) | < 2,5 sn |
| Tur ilk kartının görünmesi | < 800 ms (önbellekten) |
| Mesaj gönder → karşıda görünme | < 500 ms (p50) |
| Animasyonlarda kare düşüşü | < %1 |
| Çökmesiz oturum oranı | > %99,7 |
| Uygulama boyutu | < 60 MB |

---

## 14. Admin paneli (web)

Roller: `admin`, `moderator`, `support`, `viewer`. Giriş: SSO + iki adımlı doğrulama. Her işlem `audit_log`'a yazılır.

- **Moderasyon kuyruğu:** fotoğraf, metin, ses; onayla / reddet (gerekçe kodu zorunlu); klavye kısayolları.
- **Şikâyetler:** önceliğe göre; kanıt görüntüleme; kullanıcı geçmişi; yaptırım uygula; şikâyet edene sonuç bildirimi otomatik.
- **Kullanıcı kartı:** profil, doğrulamalar, cihazlar, risk puanı ve bileşenleri, yaptırım geçmişi, abonelik. Mesaj içerikleri yalnızca ilgili şikâyet kapsamında görüntülenir ve her görüntüleme kaydedilir.
- **Banlar ve itirazlar:** tanımlayıcı listesi, itiraz kararı, ban kaldırma.
- **İçerik:** Kapı Sorusu havuzu, Günün Sorusu takvimi, ilgi alanları, SSS.
- **Şehirler:** bekleme listesi, cinsiyet dengesi, şehir açma.
- **Bayraklar:** algoritma ağırlıkları, eşikler, sınırlar.
- **Metrikler:** Bölüm 15.
- **Destek gelen kutusu:** "Bize yaz" talepleri.

---

## 15. Analitik ve başarı ölçütleri

**Kuzey yıldızı:** Haftalık "Plan kabul edilen" kullanıcı sayısı (buluşmaya giden insan).

| Ölçüt | Tanım | İlk hedef |
|---|---|---|
| Kayıt tamamlama | Karşılama → ilk Tur | > %60 |
| Doğrulama geçme | Canlılık başarı oranı | > %90 |
| Tur açma oranı | Aktiflerin Tur'u açtığı gün oranı | > %55 |
| Cevap oranı | Tur başına gönderilen cevap | 1,5–3 |
| Karşılık oranı | Cevapların karşılık bulma oranı | > %25 |
| 24 saat içinde ilk yanıt | Masalarda | > %70 |
| Masa → Plan | Plan kabul edilen masa oranı | > %20 |
| Soğuyan masa oranı | | < %30 |
| G7 / G30 elde tutma | | > %35 / > %18 |
| Şikâyet oranı | 1000 aktif kullanıcı başına | izlenir |
| Sahte hesap yakalama süresi | Kayıt → kapatma | < 24 saat |
| Cinsiyet dengesi | Şehir bazında | 60/40'tan dengeli |
| Plus dönüşümü | | %3–5 |

Olay adlandırma: `nesne_eylem` (`tur_opened`, `card_viewed`, `answer_sent`, `answer_reciprocated`, `table_opened`, `table_cooled`, `farewell_sent`, `plan_proposed`, `plan_accepted`, `report_created`, `paywall_viewed`, `purchase_completed` …). Mesaj içeriği, konum, hassas profil alanları analitiğe gönderilmez. Analitik izni reddedilirse yalnızca zorunlu operasyonel olaylar.

---

## 16. Test planı (Claude uygular ve çalıştırır)

### 16.1 Kurallar

- Her özellik testleriyle birlikte teslim edilir. Testi yazılmamış özellik "bitti" sayılmaz.
- Her fazın sonunda ilgili paketler çalıştırılır; komutlar, sonuç sayıları ve başarısız/atlanan testler `docs/TEST_REPORT.md` dosyasına tarihle yazılır.
- Ortam izin vermediği için çalıştırılamayan test (ör. gerçek cihaz, mağaza sandbox'ı, canlılık sağlayıcısı) `ÇALIŞTIRILAMADI — neden — sahibi nasıl çalıştırır` biçiminde raporlanır.
- Kararsız (flaky) test silinmez ya da atlanmaz; nedeni bulunur.
- Dış servisler testte sahtelenir (mock); her servis için ayrıca elle yapılacak bir "duman testi" adımı yazılır.

### 16.2 Katmanlar ve araçlar

| Katman | Araç | Kapsam | Geçme eşiği |
|---|---|---|---|
| Statik | TypeScript strict, ESLint, Prettier | Tüm kod | 0 hata |
| Birim | Jest (mobil, paylaşılan), Deno test (Edge Functions) | İş kuralları, yardımcılar, şemalar | Satır kapsamı ≥ %80; iş kuralı modüllerinde ≥ %95 |
| Bileşen | React Native Testing Library | Ekran durumları, form doğrulama, erişilebilirlik etiketleri | Her ekranın 5 durumu |
| Veritabanı | pgTAP | RLS, kısıtlar, tetikleyiciler, göçler | Her tablo için izin + ret |
| Entegrasyon | Yerel Supabase + Deno test | Fonksiyon ↔ veritabanı ↔ sahte dış servis | Tüm fonksiyonlar |
| Uçtan uca | Maestro (iOS simülatör + Android emülatör) | Kritik kullanıcı yolculukları | 16.4'teki akışların tamamı |
| Görsel | Storybook + ekran görüntüsü karşılaştırma | Bileşenler, iki tema, TR/EN, büyük yazı | Onaylanmamış fark yok |
| Erişilebilirlik | Otomatik denetim + elle ekran okuyucu turu | Tüm ana akışlar | 16.7 |
| Performans | Flashlight / Reassure, k6 | 13.8 hedefleri | Hedefler tutuyor |
| Güvenlik | 16.6 | | Kritik/yüksek bulgu yok |

### 16.3 Otomatik test kataloğu (asgari)

**Kimlik ve kayıt (AUTH)**
- AUTH-01 18 yaşından küçük doğum tarihi sunucuda reddedilir; istemci atlanarak yapılan istek de reddedilir.
- AUTH-02 E-posta kodu: süresi dolmuş, yanlış, yeniden kullanılmış kod reddedilir; 5 yanlışta kilit.
- AUTH-03 OTP isteği saatte 3'ü aşınca reddedilir (IP ve cihaz bazında ayrı ayrı).
- AUTH-04 VoIP numara ve tek kullanımlık e-posta reddedilir.
- AUTH-05 Bir telefon numarası ikinci hesaba bağlanamaz.
- AUTH-06 Kayıt yarıda kalınca aynı adımdan devam eder.
- AUTH-07 Zorunlu rızalar verilmeden ilerlenemez; isteğe bağlılar önceden işaretli değildir; her rıza sürümle kaydedilir.
- AUTH-08 Yenileme belirteci döndürme; "tüm cihazlardan çık" diğer oturumları geçersiz kılar.
- AUTH-09 Doğrulanmamış kullanıcı hiçbir profil, Tur ya da sohbet verisi okuyamaz.

**Doğrulama (VER)**
- VER-01 Canlılık skoru eşik altı → ret, gerekçe, yeniden deneme; 3 başarısızlıkta 24 saat bekleme.
- VER-02 Profil fotoğrafı referans kareyle eşleşmiyorsa yayına alınmaz.
- VER-03 Aynı yüz ikinci aktif hesapta → kayıt durur.
- VER-04 Yaş tahmini 21 altı → kimlik adımı tetiklenir.
- VER-05 İstemciden `verified_at` yazma girişimi reddedilir.
- VER-06 Sağlayıcı webhook'u: geçersiz imza reddedilir; aynı olay iki kez gelirse tek kez işlenir.
- VER-07 Ana fotoğraf değişince yeniden doğrulama istenir.
- VER-08 Biyometrik rıza geri çekilince yüz vektörü silinir ve hesap Tur'dan çıkar.

**Ban ve kötüye kullanım (BAN)**
- BAN-01 Banlı e-posta ile kayıt reddedilir: büyük/küçük harf, boşluk, Gmail nokta ve `+etiket` varyasyonları dahil.
- BAN-02 Banlı telefonla kayıt reddedilir (farklı yazım biçimleri E.164'e indirgenir).
- BAN-03 Banlı yüzle kayıt reddedilir (yeni e-posta ve telefon olsa bile).
- BAN-04 Banlı Apple/Google hesap kimliğiyle giriş reddedilir.
- BAN-05 Yalnızca cihaz eşleşmesi kaydı reddetmez; risk puanı 85 olur ve inceleme kuyruğuna düşer.
- BAN-06 Kayıt ekranındaki mesaj, e-postanın banlı olup olmadığını ele vermez (iki durumda aynı yanıt gövdesi ve benzer yanıt süresi).
- BAN-07 Banlı kullanıcı hiçbir tabloya yazamaz, Ban ekranı dışına çıkamaz.
- BAN-08 İtiraz kabul edilince tüm tanımlayıcılar kayıttan çıkar ve hesap açılır; işlem denetim günlüğünde.
- BAN-09 Banlı hesap silinse de tanımlayıcı karmaları kalır; profil verisi silinir.
- BAN-10 Ban atlatma: yeni hesap banlı tanımlayıcıyla ilişkilenince o da banlanır.
- BAN-11 Kendi isteğiyle silip 30 gün içinde dönen kullanıcının engel listesi ve Geç geçmişi geri yüklenir.
- BAN-12 Karmalar düz SHA değil, gizli anahtarlı HMAC'tir.

**Profil ve medya (PRO)**
- PRO-01 Karantinadaki görsel başka kullanıcıya hiçbir yoldan servis edilmez (doğrudan URL denemesi dahil).
- PRO-02 Yüklenen görselde EXIF/GPS kalmaz.
- PRO-03 Desteklenmeyen tür, aşırı boyut, bozuk dosya reddedilir.
- PRO-04 Müstehcen etiketli görsel reddedilir ve gerekçe gösterilir.
- PRO-05 İmzalı URL süresi dolunca çalışmaz.
- PRO-06 "Profilde gösterme" işaretli alan hiçbir API yanıtında dönmez.
- PRO-07 Doğum tarihi, e-posta, telefon, koordinat, risk puanı herkese açık profil görünümünde yoktur.
- PRO-08 Düzenleme moderasyondan geçene kadar eski sürüm yayında kalır.
- PRO-09 Alan sınırları: ad, hakkımda, Kapı Sorusu, fotoğraf sayısı (3–6), ilgi alanı sayısı (5–10).

**Filtre ve Tur (TUR)**
- TUR-01 Tur kullanıcı başına günde tam bir kez üretilir; iş iki kez tetiklenirse ikinci Tur oluşmaz.
- TUR-02 Saat dilimi ve yaz saati değişiminde Tur atlanmaz, çiftlenmez.
- TUR-03 Hiçbir kart karşılıklı filtreleri ihlal etmez (yaş, mesafe, cinsiyet, niyet, "şart" filtreleri, olmazsa olmazlar) — özellik tabanlı (property-based) testle.
- TUR-04 Engellenen, şikâyet edilen, rehberde gizlenen, molada, askıda, banlı, doğrulanmamış kullanıcı Tur'a girmez.
- TUR-05 Geç denen kişi 60 gün, işlem yapılmayan 14 gün gelmez.
- TUR-06 Havuz 9'dan azsa filtre dışı profille doldurulmaz.
- TUR-07 Abonelik durumu puan fonksiyonunun girdisi değildir (aynı girdiyle Plus ve ücretsiz kullanıcıda aynı puan).
- TUR-08 Asgari gösterim tabanı sağlanır.
- TUR-09 Filtre değişikliği bir sonraki Tur'da geçerlidir; havuz tahmini gerçek sayıyla ±%10 uyumludur.
- TUR-10 Plus filtresi karşı tarafın filtresini aşamaz.
- TUR-11 "Sonraya sakla" 9 kartla sınırlıdır ve 7 günde düşer; "daha az göster" ağırlığı değiştirir.

**Cevap ve Masa (MAS)**
- MAS-01 10 karakterden kısa ya da yalnızca emoji cevap reddedilir.
- MAS-02 Günlük 15 cevap ve 15 bekleyen cevap sınırı uygulanır.
- MAS-03 Kopya cevap tespiti: 3'te uyarı, 4'te engel.
- MAS-04 İki taraf aynı anda karşılık verirse tek masa oluşur (eşzamanlılık testi).
- MAS-05 Ücretsiz kullanıcı 4. aktif masayı açamaz; "Masa bekliyor" durumu oluşur ve 72 saatte düşer.
- MAS-06 24 / 60 / 72 saat zamanlayıcıları doğru anda tetiklenir; Mola'da durur.
- MAS-07 Nazik Veda sonrası kimse mesaj yazamaz; yuva boşalır; aynı çift 180 gün Tur'da buluşmaz.
- MAS-08 Engelleme: masa iki tarafta da kapanır, veda metni gitmez, bildirim gitmez.
- MAS-09 Plus bitince 4. ve 5. masa kapanmaz; masa sayısı 3'ün altına inene kadar yeni masa açılamaz.
- MAS-10 Yanıt güvenilirliği medyanı doğru hesaplanır; 5'ten az veriyle rozet görünmez.

**Sohbet (SOH)**
- SOH-01 Uçak modunda yazılan mesaj bağlantı gelince tam bir kez iletilir, sırası bozulmaz.
- SOH-02 Uygulama gönderim sırasında kapatılırsa mesaj kaybolmaz.
- SOH-03 Masanın tarafı olmayan kullanıcı mesaj okuyamaz/yazamaz.
- SOH-04 7 günden yeni hesap bağlantı gönderemez.
- SOH-05 İlk 48 saatte platform dışı yönlendirme → alıcıda uyarı bandı.
- SOH-06 Para/kripto kalıbı → uyarı + risk puanı artışı.
- SOH-07 Fotoğraf yalnızca 24 saat sonra ve iki taraf izin verdiyse gönderilebilir; bulanık gelir.
- SOH-08 Gizli kelime içeren mesaj ayrı klasöre düşer.
- SOH-09 Okundu bilgisi yalnızca iki tarafta da açıksa görünür.
- SOH-10 Ses mesajı süre sınırları; bozuk dosya reddi.
- SOH-11 Konu önerisi yalnızca 24 saat sessizlikten sonra ve yanıt sırası olan tarafa görünür.

**Plan ve buluşma (PLN)**
- PLN-01 6'şar mesajdan önce Plan çubuğu görünmez.
- PLN-02 Kabul / başka zaman / şimdilik değil durum geçişleri.
- PLN-03 Tam adres hiçbir tabloda saklanmaz.
- PLN-04 Güvenli Buluşma bağlantısı 24 saat sonra geçersizdir.
- PLN-05 Kontrol bildirimi seçilen sürede gelir; "yardım" akışı güvenilen kişiye mesaj gönderir.
- PLN-06 "Benzemiyordu" iki ayrı kişiden gelince yeniden doğrulama tetiklenir.

**Şikâyet ve moderasyon (MOD)**
- MOD-01 Şikâyet vaka numarası üretir; şikâyet edene sonuç bildirimi gider.
- MOD-02 "Reşit değil" ve "tehdit" en yüksek öncelikli kuyruğa düşer.
- MOD-03 Şikâyet edenin kimliği şikâyet edilene hiçbir yanıtta dönmez.
- MOD-04 Yaptırım kademeleri ve süre bitiminde otomatik kalkma.
- MOD-05 Her moderatör işlemi ve her mesaj görüntülemesi denetim günlüğüne yazılır; günlük değiştirilemez.
- MOD-06 `support` rolü ban kaldıramaz; `moderator` bayrak değiştiremez (rol matrisi).
- MOD-07 Risk puanı eşikleri: 60'ta yavaşlatma, 85'te askı.

**Ayarlar ve tercihler (AYR)**
- AYR-01 Her ayar kaydedilir, uygulama yeniden açılınca ve ikinci cihazda aynen gelir.
- AYR-02 Gizli mod: kullanıcı yalnızca cevap gönderdiklerinin görünümünde yer alır.
- AYR-03 Çevrimiçi durumu kapalıyken presence yayını yapılmaz.
- AYR-04 Rehber eşitleme yalnızca karma gönderir (ağ trafiği denetimi); "karmaları sil" sunucudan siler.
- AYR-05 Sessiz saatlerde ve "tümünü duraklat"ta push gitmez; güvenlik bildirimleri hariç.
- AYR-06 Kilit ekranı varsayılan metni içerik barındırmaz.
- AYR-07 Uygulama kilidi arka plandan dönüşte seçilen sürede devreye girer.
- AYR-08 Dil değişimi tüm ekranlarda uygulanır; eksik çeviri anahtarı yoktur (CI denetimi).
- AYR-09 Alan görünürlük anahtarları anında etki eder.
- AYR-10 Rıza geri çekmenin sonucu uygulanır.
- AYR-11 "Geçtiklerimi sıfırla" 90 günde bir kez çalışır.
- AYR-12 Plus'a bağlı ayarlar ücretsiz kullanıcıda sunucuda da reddedilir; güvenlik ayarlarının hiçbiri Plus'a bağlı değildir.

**Abonelik (ABN)**
- ABN-01 Webhook imzası doğrulanır; aynı olay iki kez işlenmez.
- ABN-02 Satın alma, yenileme, iptal, iade, ödeme sorunu durumlarında yetki doğru güncellenir.
- ABN-03 30 günlük geçiş süre sonunda kendiliğinden biter, yenilenmez.
- ABN-04 İstemci kendi yetkisini yazamaz.
- ABN-05 Satın alımları geri yükle çalışır; iOS'ta alınan Plus Android'de geçerlidir.
- ABN-06 Fiyat ekranında dönem, yenileme tarihi ve iptal yolu metni vardır (bileşen testi).
- ABN-07 Hesap silme akışı aktif abonelikte uyarı gösterir.

**Hesap yaşam döngüsü (HSP)**
- HSP-01 Silme talebinde profil anında görünmez olur; 30 gün içinde girişle geri alınır.
- HSP-02 Kalıcı temizlik: veritabanı satırları, depolama nesneleri, yüz vektörü, push belirteçleri, analitik kimliği silinir (yayılım testi).
- HSP-03 Veri dışa aktarımı yalnızca talep edenin verisini içerir.
- HSP-04 Web silme sayfası uygulama olmadan çalışır.
- HSP-05 Mola'da kullanıcı Tur'lara girmez; dönünce durum geri gelir.

**Bildirim (BLD)**
- BLD-01 Tercihi kapalı türde push gitmez.
- BLD-02 Günlük 6 push sınırı; 3'ten fazla cevap gruplanır.
- BLD-03 Geçersiz belirteç temizlenir.
- BLD-04 Bildirime dokunmak doğru ekrana götürür (derin bağlantı).

### 16.4 Uçtan uca akışlar (Maestro)

1. Kayıt (sahte canlılık sağlayıcısıyla) → ilk Tur.
2. Tur'da gezin → "Neden bu kişi?" → cevap gönder → Cevaplar kutusunda "bekliyor".
3. İkinci kullanıcı karşılık verir → masa açılır → karşılıklı mesaj → ses mesajı.
4. Plan teklif et → kabul → hatırlatma → "Nasıldı?".
5. Nazik Veda ile masa kapat.
6. Şikâyet et → vaka numarası → engelle → görünmezlik.
7. Admin panelinden ban → kullanıcıda Ban ekranı → aynı e-posta/telefon ile yeniden kayıt reddi → itiraz → kabul.
8. Filtre değiştir → havuz tahmini → sonraki Tur'da etkisi.
9. Ayarların her grubunda bir değişiklik → yeniden açılışta kalıcılık.
10. Plus satın al (sandbox) → 5 masa → geri yükle → süre bitimi.
11. Mola → dönüş. Hesap sil → geri al → sil → kalıcı temizlik.
12. Çevrimdışı: Tur önbellekten açılır, mesaj kuyruğa girer, bağlantı gelince gider.
13. Dil ve tema değişimi; hareketi azalt açıkken tüm akış.

### 16.5 Elle test matrisi

| Eksen | Değerler |
|---|---|
| iOS | Desteklenen en eski sürüm + güncel; küçük ekran, büyük ekran |
| Android | API 26, 30, güncel; düşük RAM (3 GB), orta sınıf, üst sınıf; en az 2 üretici arayüzü |
| Ağ | Wi-Fi, zayıf 3G benzetimi, uçak modu, bağlantı kopup gelme |
| İzinler | Kamera, mikrofon, konum, bildirim, rehber: verildi / reddedildi / sonradan kapatıldı |
| Görünüm | Gece / Gündüz, TR / EN, %200 yazı, yüksek kontrast, hareketi azalt |
| Kesintiler | Gelen arama, arka plana alma, düşük pil modu, depolama dolu |
| Gerçek servis | Canlılık (gerçek yüz; basılı fotoğraf ve ekrandaki videoyla kandırma denemesi), SMS teslimi (3 operatör), push (iOS/Android), mağaza sandbox'ı |

### 16.6 Güvenlik testleri

- İki kullanıcılı yetki testleri: A, B'nin kimliğiyle her uç noktayı dener (IDOR).
- İstemcinin yazamaması gereken alanlar: `verified_at`, `status`, `risk_score`, abonelik, rol, masa durumu.
- Kayıt ve girişte hesap varlığı sızıntısı (yanıt gövdesi ve süresi).
- OTP bombardımanı ve maliyet koruması; SMS harcama tavanı.
- Hız sınırlarının tamamı.
- Webhook sahteciliği.
- Derin bağlantı ve belirteç sızıntısı.
- Yükleme hattı: zararlı dosya, çok büyük dosya, tür sahteciliği.
- Uygulama paketinde ve git geçmişinde gizli anahtar taraması.
- Bağımlılık zafiyet taraması (CI'da; kritik bulgu derlemeyi durdurur).
- Admin paneli: iki adımlı doğrulama zorunluluğu, rol matrisi, oturum süresi.
- Kazıma (scraping) direnci: bir hesabın günde görebileceği profil sayısı sınırlı.
- Tehdit modeli `docs/SECURITY.md` içinde; her tehdit bir teste ya da kabul edilmiş riske bağlanır.
- Yayın öncesi bağımsız sızma testi (`TODO(owner)`).

### 16.7 Erişilebilirlik testleri

- VoiceOver ve TalkBack ile uçtan uca: kayıt, Tur, cevap, sohbet, şikâyet, ayarlar, silme.
- Tüm etkileşimli öğelerde etiket ve rol; odak sırası mantıklı; dokunma alanı ≥ 44 pt / 48 dp.
- Kontrast: tüm belirteç çiftleri için otomatik WCAG AA denetimi.
- %200 yazıda kırpılma/taşma yok.
- Hareketi azalt açıkken paralaks, parçacık, 3B dönüş çalışmaz.
- Yalnızca renkle iletilen durum yok.

### 16.8 Performans ve yük

- 13.8'deki hedeflerin her biri ölçülür ve raporlanır.
- Tur üretimi: 100 bin sentetik kullanıcı için < 20 dk.
- Sohbet: 5 bin eşzamanlı bağlantı, p95 teslim < 1,5 sn.
- Fotoğraf hattı: 50 eşzamanlı yükleme.
- Bellek: 30 dakikalık Tur + sohbet oturumunda sızıntı yok.
- 60 dakikalık kullanımda pil ve veri tüketimi ölçülür.

### 16.9 Sürekli tümleştirme kapıları

Her çekme isteğinde: tip denetimi → lint → birim → pgTAP → entegrasyon → çeviri anahtarı denetimi → gizli anahtar taraması → bağımlılık taraması. Ana dala birleşince: Maestro (iki platform) → görsel karşılaştırma → iç test derlemesi. Herhangi biri kırmızıysa birleştirme ve yayın durur.

### 16.10 Operasyonel tatbikatlar (yayından önce bir kez)

- Yedekten geri yükleme.
- Olay müdahalesi masa başı tatbikatı (veri ihlali senaryosu).
- Geri alma: hatalı OTA güncellemesini geri çekme.
- Moderasyon kuyruğu: 100 sentetik şikâyetle süre ölçümü.

---

## 17. Hukuk ve uyum

> Bu bölüm hukuki tavsiye değildir. Yayından önce bir KVKK/bilişim hukuku avukatına danış.

**Hazırlanacak metinler (TR + EN):** Kullanım Koşulları, Gizlilik Politikası, KVKK Aydınlatma Metni, Açık Rıza Metinleri (biyometrik veri; cinsel yönelim gibi özel nitelikli veri; yurt dışına aktarım; ticari ileti), Topluluk Kuralları, Çocuk Güvenliği Standartları, Çerez Politikası (web), Güvenlik İpuçları, Abonelik ve İade Koşulları.

**KVKK başlıkları:**
- Yüz verisi ve cinsel yönelim **özel nitelikli kişisel veridir**; açık rıza ve ek güvenlik önlemleri gerekir.
- Sunucular yurt dışında olacağı için **yurt dışına aktarım** kuralları uygulanır (standart sözleşme / açık rıza; güncel mevzuatı avukata doğrulat).
- **VERBİS** kaydı yükümlülüğünü kontrol et.
- Veri sahibi başvuruları için kanal (`kvkk@alanadi`) ve 30 gün içinde yanıt süreci.
- Veri saklama ve imha politikası; veri ihlali bildirim planı (72 saat).
- Ticari SMS/e-posta için **İYS** kaydı ve izin yönetimi.
- 5651 sayılı Kanun kapsamındaki yükümlülükleri (yer/içerik sağlayıcı, kaldırma talepleri) avukata sor.
- Adli makam taleplerini karşılama prosedürü.

**AB'ye açılırsa:** GDPR (özel kategori veri, DPIA, AB temsilcisi), DSA; Birleşik Krallık'ta Online Safety Act yaş güvencesi şartları.

**Şirket:** Uygulama içi satış, sözleşmeler ve yerel SMS sağlayıcıları için şirket (şahıs ya da limited) gerekir. Apple'da kuruluş hesabı için D-U-N-S numarası istenir.

---

## 18. Mağaza gereksinimleri

### 18.1 App Store

- **4.3(b) riski (en büyük risk):** Apple, Haziran 2026 güncellemesiyle flört uygulamalarını doymuş kategori sayıyor ve "anlamlı biçimde farklı ya da daha iyi bir deneyim" sunmayan yeni başvuruları kabul etmiyor. Geliştirici forumlarında gerçekten farklı özelliklere sahip uygulamaların bile defalarca reddedildiği örnekler var. Yapılacaklar:
  - İnceleme notunda Bölüm 2'deki 6 farkı ekran kaydıyla anlat; "kaydırma yok, beğeni yok, 3 sohbet sınırı, şeffaflık paneli" vurgusu.
  - Mağaza metni ve ekran görüntüleri farkı ilk karede göstersin.
  - Yarım, şablon görünümlü, hatalı sürüm gönderme. Reddedilirse App Review ile görüşme talep et.
  - Kuruluş hesabıyla başvur.
- **1.2 Kullanıcı içeriği:** içerik filtresi, şikâyet, engelleme, 24 saat içinde işlem, iletişim bilgisi.
- **4.8:** Google ile giriş sunuluyorsa Apple ile giriş de sunulmalı.
- **5.1.1(v):** Uygulama içinden hesap silme.
- **3.1.1 / 3.1.2:** Abonelikler uygulama içi satın alma ile; koşullar satın alma ekranında açık.
- **Yaş derecelendirme:** anketi dürüst doldur (18+); mağaza görselleri 4+ ölçütüne uygun.
- **Gizlilik etiketi** ve gizlilik bildirimi (privacy manifest); kullanılan SDK'ların beyanı.
- **İzin metinleri (Info.plist):** kamera (doğrulama ve fotoğraf), mikrofon (ses kartı/mesaj), fotoğraf arşivi, konum (kullanırken), rehber (isteğe bağlı gizleme), bildirim. Her biri açık ve dürüst gerekçeyle.
- İnceleme ekibi için demo hesap + canlılık adımını geçmenin yolu (inceleme bayrağı).

### 18.2 Google Play

- Uygulamayı **Flört** kategorisinde beyan et; Hedef kitle: yalnızca **18+** → "Restrict Minor Access" etkin.
- **Çocuk Güvenliği Standartları** beyanı: yayımlanmış standartlar sayfası, uygulama içi bildirim mekanizması, CSAM süreci, irtibat kişisi.
- **Veri güvenliği formu**; **hesap silme** için uygulama içi yol + web bağlantısı.
- **Kullanıcı içeriği politikası:** şikâyet, engelleme, moderasyon.
- Abonelikler Play Faturalandırma ile.
- Yeni kişisel geliştirici hesaplarında üretime çıkmadan önce kapalı test şartı (en az 12 test kullanıcısı, 14 gün) olabilir; kuruluş hesabında D-U-N-S istenir. Güncel şartı Play Console'da doğrula.
- Hedef API düzeyi güncel şartı karşılamalı.

### 18.3 Mağaza sayfası

Ad: "Dokuz: Her Akşam 9 Kişi" (30 karakter sınırına dikkat). Alt başlık: "Kaydırma yok. Cevap var." 6 ekran görüntüsü: Tur · Kapı Sorusu · Masalar · Şeffaflık Paneli · Doğrulama · Plan. 20 sn tanıtım videosu. Rakip adı kullanma.

---

## 19. Büyüme ve açılış planı

- **Şehir şehir açılış:** Bir şehir, bekleme listesinde eşik sayıda doğrulanmış kullanıcı ve dengeli cinsiyet dağılımı olunca açılır. Bekleme ekranında "şehrin açılmasına %X" çubuğu ve davet bağlantısı (davet, şehri hızlandırır; kişisel avantaj satmaz).
- **Denge yönetimi:** Bir şehirde oran 60/40'ı aşarsa fazla olan taraf için kabul sırası yavaşlar; kullanıcıya dürüstçe söylenir.
- **İlk kitle:** Üniversite kulüpleri, koşu/kitap/seramik toplulukları, mekân ortaklıkları ("Dokuz'da tanışanlara ikinci kahve bizden").
- **İçerik:** Günün Sorusu'nun anonim, toplu sonuçları sosyal medyada ("İstanbul'un %63'ü serpme kahvaltı dedi"). Kişisel veri paylaşılmaz.
- **Paylaşılabilir anlar:** Kullanıcının kendi Kapı Sorusunu görsel kart olarak paylaşması ("Bana ulaşmak için bunu cevapla").
- **Yapılmayacaklar:** sahte profil, bot mesajı, ücretli "model" hesaplar, yanıltıcı bildirim. Tespit edilirse marka biter.

---

## 20. Satın alınacak / açılacak her şey

Fiyatlar yaklaşıktır ve değişir; satın almadan önce sağlayıcının güncel fiyat sayfasını kontrol et.

| # | Kalem | Ne için | Yaklaşık maliyet |
|---|---|---|---|
| 1 | Şirket kuruluşu + mali müşavir | Satış, sözleşme, SMS başlığı | Değişken |
| 2 | Marka tescili (TÜRKPATENT; 9, 38, 42, 45. sınıflar) | İsim ve logo koruması | Değişken |
| 3 | D-U-N-S numarası | Apple/Google kuruluş hesabı | Ücretsiz |
| 4 | Apple Developer Program | App Store | 99 $/yıl |
| 5 | Google Play Console | Play Store | 25 $ tek sefer |
| 6 | Alan adı (.com ya da .app, isteğe bağlı .com.tr) | Site, e-posta, evrensel bağlantılar | ~10–20 $/yıl |
| 7 | Cloudflare | DNS, WAF, Turnstile | Ücretsiz başlar |
| 8 | Kurumsal e-posta (Google Workspace / Zoho) | `destek@`, `safety@`, `kvkk@`, `hukuk@`, `noreply@` | ~6 $/kullanıcı/ay |
| 9 | Supabase Pro | Veritabanı, kimlik, depolama, gerçek zamanlı, fonksiyonlar | 25 $/ay + kullanım |
| 10 | AWS hesabı (Rekognition) | Canlılık, yüz eşleşmesi, görsel moderasyon | Canlılık ~0,015 $/kontrol; görsel ~0,001 $/adet |
| 11 | SMS OTP sağlayıcısı + numara türü sorgusu | Telefon doğrulama, VoIP engeli | TR'ye SMS başına birkaç sent; yerel sağlayıcı genelde daha ucuz |
| 12 | İşlemsel e-posta (Resend / Postmark) | Doğrulama kodu, bildirim | Ücretsiz katman → ~15–20 $/ay |
| 13 | RevenueCat | Abonelik yönetimi | Aylık 2.500 $ gelire kadar ücretsiz, sonra ~%1 |
| 14 | Expo EAS | Derleme, gönderim, OTA güncelleme | Ücretsiz katman → ücretli plan |
| 15 | Firebase projesi | Android push (FCM) | Ücretsiz |
| 16 | Apple anahtarları | APNs anahtarı, Sign in with Apple, App Attest | Dahil |
| 17 | Google Cloud OAuth istemcisi | Google ile giriş, Play Integrity | Ücretsiz |
| 18 | Vercel Pro | Site + admin paneli | ~20 $/ay |
| 19 | Sentry | Hata izleme | Ücretsiz katman → ~26 $/ay |
| 20 | PostHog | Analitik, bayraklar | Ücretsiz katman |
| 21 | Metin moderasyon API'si | Küfür/taciz/dolandırıcılık tespiti | Düşük / kullanım bazlı |
| 22 | CSAM karma eşleştirme erişimi | Yasal ve mağaza yükümlülüğü | Başvuruyla, genelde ücretsiz |
| 23 | Kimlik belgesi doğrulama (Sumsub / Veriff / Persona) | Yaş şüphesi, itirazlar | Kontrol başına ~1 $ civarı; yalnızca gerektiğinde |
| 24 | Rive | Animasyon üretimi | Ücretsiz katman → ücretli |
| 25 | Yazı tipleri (Fraunces, Inter), ikonlar (Phosphor) | Tasarım | Ücretsiz (açık lisans) |
| 26 | Ses tasarımı | 4 arayüz sesi | Tek seferlik |
| 27 | Avukat | KVKK metinleri, sözleşmeler, VERBİS | Tek seferlik + danışmanlık |
| 28 | İYS kaydı | Ticari ileti izni | Düşük |
| 29 | Sızma testi | Yayın öncesi güvenlik | Tek seferlik |
| 30 | GitHub | Kod, CI | Ücretsiz → ekip planı |
| 31 | Test cihazları | 1 eski Android, 1 küçük iPhone | Tek seferlik |
| 32 | Destek aracı (başlangıçta admin paneli yeter) | Kullanıcı talepleri | Sonra |

**Kaba aylık sabit gider (açılışta):** ~100–200 $. **Kayıt başına değişken:** SMS + canlılık + görsel moderasyon ≈ 0,05–0,15 $. Bu tahmindir; gerçek fiyatlarla yeniden hesapla.

**Gereken ortam değişkenleri (`.env.example`):**
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `HASH_HMAC_SECRET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `REKOGNITION_COLLECTION_ID`, `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_SENDER_ID`, `EMAIL_API_KEY`, `EMAIL_FROM`, `REVENUECAT_IOS_KEY`, `REVENUECAT_ANDROID_KEY`, `REVENUECAT_WEBHOOK_SECRET`, `SENTRY_DSN`, `POSTHOG_KEY`, `POSTHOG_HOST`, `MODERATION_API_KEY`, `APPLE_TEAM_ID`, `APPLE_SERVICE_ID`, `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`, `EXPO_PROJECT_ID`, `APP_ENV`.

---

## 21. Yol haritası ve kabul kriterleri

Her fazın kabulü ayrıca şunu gerektirir: Bölüm 16.3'teki ilgili test grupları yazılmış ve geçmiş, sonuçlar `docs/TEST_REPORT.md` içinde.

### Faz −1 — Doğrulama (kod yazmadan, sahibi yapar)
İsim/marka/alan adı kontrolü; avukatla KVKK ön görüşmesi (yüz verisi, yurt dışı aktarım); canlılık ve SMS sağlayıcılarından fiyat; hedef şehirde 10–15 kişiyle görüşme (Tur, Kapı Sorusu ve 3 masa fikrine tepki); tıklanabilir prototiple 5 kişilik kullanılabilirlik testi.
**Kabul:** Engel çıkaran hukuki/isim sorunu yok; mekanikler anlaşılır bulunuyor.

### Faz 0 — Temel (1. hafta)
Monorepo, Expo + Next.js iskeleti, Supabase projesi (yerel + uzak), CI, tasarım belirteçleri, temel bileşenler (Düğme, Girdi, Kart, Sayfa, Bant, İskelet), i18n, Sentry.
**Kabul:** iOS ve Android'de boş uygulama derlenir; tema ve dil değişir; CI yeşil.

### Faz 1 — Kimlik ve doğrulama
Giriş yöntemleri, e-posta ve telefon OTP, yaş kapısı, rızalar, `auth-precheck`, canlılık modülü, mükerrer/banlı yüz kontrolü.
**Kabul:** Doğrulanmamış kullanıcı hiçbir profili göremez; VoIP numara ve tek kullanımlık e-posta reddedilir; banlı e-posta/telefon/yüz ile kayıt reddedilir (testli).

### Faz 2 — Profil
Fotoğraf yükleme hattı (karantina → moderasyon → yayın), profil alanları, Kapı Sorusu, ses kartı, profil önizleme ve düzenleme.
**Kabul:** Moderasyondan geçmemiş görsel başka kullanıcıya servis edilmez; ret gerekçesi görünür.

### Faz 3 — Tur ve Cevap
`tur-generate`, Tur ekranı ve animasyonları, cevap yazma, Cevaplar kutusu, karşılık verme, "Neden bu kişi?".
**Kabul:** Tur günde tam bir kez üretilir; filtre dışı profil gelmez; cevap sınırları çalışır.

### Faz 4 — Masa ve sohbet
Yuva mantığı, gerçek zamanlı sohbet, ses mesajı, Sıra sende, soğuma, Nazik Veda, Mola, çevrimdışı kuyruk.
**Kabul:** 4. masa açılamaz; mesaj kaybı testi geçer; zamanlayıcılar doğru.

### Faz 5 — Güvenlik
Şikâyet, engelleme, rehber gizleme, metin moderasyonu ve uyarı bantları, risk puanı, yaptırımlar, ban ekranı, itiraz, admin paneli (kuyruk, şikâyet, ban).
**Kabul:** BAN, MOD ve SOH test gruplarının tamamı geçer; 16.6 güvenlik testleri temiz.

### Faz 6 — Plan ve buluşma güvenliği
Plan kartı, takvim, Güvenli Buluşma, kontrol bildirimi, "Nasıldı?".
**Kabul:** PLN testleri geçer.

### Faz 7 — Ayarlar, bildirimler, hesap yaşam döngüsü
Bölüm 6.5, 6.6 ve 10'un tamamı, push altyapısı, veri indirme, hesap silme ve kalıcı temizlik, Şeffaflık Paneli.
**Kabul:** AYR, HSP ve BLD testleri geçer; her ayar satırı için en az bir test vardır.

### Faz 8 — Plus
RevenueCat, satın alma ekranı, 30 günlük geçiş, yetkiler, webhook, geri yükleme, iptal bağlantıları.
**Kabul:** ABN testleri geçer; sandbox satın alması iki platformda elle doğrulanır.

### Faz 9 — Cila ve yayın
Animasyon envanterinin tamamı, erişilebilirlik denetimi, performans, boş/hata durumları, mağaza varlıkları, yasal sayfalar, kapalı beta (TestFlight + Play kapalı test), mağaza başvurusu.
**Kabul:** 16.4 akışlarının tamamı iki platformda geçer; 16.5 elle matris, 16.7 erişilebilirlik, 16.8 performans ve 16.10 tatbikatlar tamam; Bölüm 23 listesi işaretli.

### Sonrası (v1.1+)
Etkinlikler ("Dokuz Masası": mekânda küçük grup buluşmaları), sesli arama, ses kartı yazıya döküm, arkadaş onayı ("arkadaşım kefil"), ek diller ve şehirler, web sürümü.

---

## 22. Bilinen riskler

| Risk | Etki | Önlem |
|---|---|---|
| Apple 4.3(b) reddi | Yayın gecikir ya da olmaz | Bölüm 18.1; Android'de önce yayınlayıp veri toplamak; reddedilirse görüşme |
| Soğuk başlangıç (boş havuz) | İlk kullanıcılar gider | Şehir eşiği, Canlı Saat, bekleme listesi |
| Cinsiyet dengesizliği | Kadınlar bunalır, erkekler eşleşemez | Kabul dengesi, adil gösterim, güvenlik özellikleri |
| Ağır kayıt akışı | Terk | Akıcı tasarım, kaldığı yerden devam, 4 dk hedefi |
| "9 kişi az" algısı | Sıkılma | Günün Sorusu, Cevaplar kutusu, dürüst iletişim; veriyle 9 → 12 denenebilir |
| Yüz verisi hukuki riski | Ceza | Açık rıza, asgari saklama, avukat incelemesi |
| Erişim engeli (BTK) | Türkiye'de kapanma | Sıkı moderasyon, 18+ doğrulama, rastgele görüntülü sohbet yok, resmî taleplere yanıt süreci |
| Canlılığı deepfake ile aşma | Sahte hesap | Sağlayıcının enjeksiyon saldırısı koruması, cihaz bütünlüğü, davranışsal risk puanı, yeniden doğrulama |
| Tek kişilik moderasyon | Geciken yanıt | Otomasyon, öncelik kuyruğu; büyüdükçe dış kaynak |
| Düşük gelir | Sürdürülebilirlik | Maliyetleri kayıt başına izlemek; Plus değerini veriyle ayarlamak; etkinlik geliri |

---

## 23. Yayın öncesi git / gitme listesi

- [ ] İsim, marka ve alan adı temiz.
- [ ] Şirket, destek iletişimi, tüm yasal metinler yayında.
- [ ] KVKK incelemesi tamam; veri haritası ve saklama süreleri onaylı; sağlayıcılarla veri işleme sözleşmeleri imzalı.
- [ ] Canlılık, SMS, e-posta, push, ödeme gerçek ortamda elle doğrulandı; hiçbir `NEEDS_SETUP` kalmadı.
- [ ] Reşit olmayan kullanıcı ve yüksek riskli şikâyet prosedürü denendi; moderasyon ve itiraz için sorumlu kişi ve süreler belli.
- [ ] Banlı e-posta, telefon ve yüz ile yeniden kayıt engeli gerçek cihazda denendi.
- [ ] Hesap silme uygulama içinden ve web sayfasından uçtan uca çalışıyor.
- [ ] Mağaza gizlilik beyanları, yaş derecelendirmesi ve çocuk güvenliği beyanı doğru.
- [ ] `docs/TEST_REPORT.md`: tüm paketler yeşil; açık kritik/yüksek hata yok.
- [ ] Erişilebilirlik ve hareketi azalt denetimleri geçti.
- [ ] Yük testi, yedekten dönme ve olay müdahalesi tatbikatı yapıldı.
- [ ] Harcama uyarıları (SMS, canlılık, veritabanı) ve izleme panoları kurulu.
- [ ] Mağaza ekran görüntüleri gerçek uygulamayı gösteriyor; üretimde demo verisi yok.
- [ ] Kapalı beta geri bildirimleri değerlendirildi; güvenlik sorunları kapatıldı.

---

## 24. Kaynaklar

- Unstar — 8 flört uygulamasının olumsuz yorum analizi (2026): https://unstar.app/blog/best-dating-apps-ranked-by-negative-reviews-2026
- Unstar — Ücretli paket şikâyetleri (2026): https://unstar.app/blog/tinder-gold-bumble-premium-hinge-plus-dating-paywalls-2026
- Indie Hackers — 730+ kullanıcı şikâyeti analizi: https://www.indiehackers.com/post/dating-app-what-730-user-complaints-reveal-about-the-market-8b861346e8
- Global Dating Insights — Portekiz şikâyet verisi: https://www.globaldatinginsights.com/featured/200-complaints-filed-against-portuguese-dating-apps-since-2019/
- SwipeStats — Kullanıcı istatistikleri 2026: https://www.swipestats.io/blog/dating-app-user-statistics
- Fast Company — Z kuşağı ve yapay zekâ: https://fastcompany.co.za/tech/2025-11-30-why-gen-z-is-abandoning-dating-apps-and-how-ai-might-bring-them-back/
- Fortune — Uygulamalar kaydırmadan vazgeçiyor (Ağustos 2026): https://fortune.com/2026/08/14/gen-z-dating-apps-swiping-irl/
- Fitt Insider — Flört uygulamalarında yeni dalga: https://insider.fitt.co/dating-apps-redesign-for-wellness/
- Global Dating Insights — Known ve yeni alternatifler: https://www.globaldatinginsights.com/featured/tech-heavy-singles-turn-to-tech-heavy-dating-app-alternatives/
- Macquarie University — Reev: https://lighthouse.mq.edu.au/article/2026/april-2026/is-swiping-right-dead-why-gen-z-is-swapping-tinder-for-talk
- Global Dating Insights — Left Field: https://www.globaldatinginsights.com/featured/anti-swipe-dating-app-left-field-launches-in-nyc/
- Axios özeti — Bumble kaydırmayı kaldırıyor: https://www.axios.com/2026/05/07/bumble-removes-swipe-hinge-tinder
- Match Group — Tinder Face Check sonuçları: https://mtch.com/?p=3758
- Biometric Update — Face Check teknik ayrıntı: https://biometricupdate.com/202510/match-group-making-face-liveness-mandatory-for-us-tinder-users
- Global Dating Insights — Hinge Your Turn Limits: https://www.globaldatinginsights.com/featured/hinge-launches-turn-your-limits-feature-to-combat-burnout/
- MacRumors — App Store 4.3(b) güncellemesi (Haziran 2026): https://www.macrumors.com/2026/06/09/app-store-guidelines-low-quality-apps/
- Apple Developer Forums — 4.3(b) ret örnekleri: https://developer.apple.com/forums/thread/823323 , https://developer.apple.com/forums/thread/844231
- Google Play — Çocuk Güvenliği Standartları: https://support.google.com/googleplay/android-developer/answer/14747720
- Google Play — Flört özellikleri ve yaş kısıtı: https://support.google.com/googleplay/android-developer/answer/16838200
- CNN Türk — Kaspersky flört uygulaması araştırması: https://www.cnnturk.com/teknoloji/sahte-profiller-buyuk-tehdit-olusturuyorlar-1708338
- Halk TV — Şantaj vakaları: https://halktv.com.tr/turkiye/flort-uygulamasi-kabusu-yasatti-babaannesine-mustehcen-fotograflari-gitti-896135h
- DonanımHaber — BTK'dan 29 platforma erişim engeli: https://www.donanimhaber.com/29-goruntulu-sohbet-ve-flort-platformuna-erisim-engeli--195556
