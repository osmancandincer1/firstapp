# Kişisel veri haritası

> Hukuki tavsiye değildir. Saklama süreleri ve hukuki dayanaklar avukat onayından geçmeden kesinleşmez (APP.md §17).

## Faz 1 itibarıyla toplanan veriler

| Veri                           | Nerede                                                      | Biçim                                                                                                  | Neden                        | Saklama                                                                   |
| ------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------- |
| E-posta adresi                 | `auth.users` (Supabase Auth)                                | Açık (giriş için gerekli)                                                                              | Hesap, giriş kodu            | Hesap süresince                                                           |
| E-posta kimliği                | `private.user_identifiers`; ban hâlinde `ban_identifiers`   | HMAC (Gmail varyantları birleştirilmiş)                                                                | Tek hesap, ban kontrolü      | Hesap süresince; ban hâlinde 5 yıl (TODO(owner): avukat)                  |
| Telefon numarası               | `private.user_identifiers` + `profiles.phone_last2`         | HMAC + son 2 hane; **numaranın kendisi saklanmıyor**                                                   | Tek hesap, ban kontrolü      | Hesap süresince                                                           |
| Doğum tarihi                   | `profiles.birth_date`                                       | Açık; başka kullanıcılara hiç gösterilmez                                                              | 18+ kontrolü, yaş            | Hesap süresince                                                           |
| Rızalar                        | `consents`                                                  | Tür, belge sürümü, verildi/verilmedi, zaman, IP'nin HMAC'ı                                             | KVKK ispat yükümlülüğü       | Hesap süresince + yasal süre (TODO(owner))                                |
| Cihaz                          | `devices`, `private.user_identifiers`                       | Cihaz kimliğinin HMAC'ı, platform, uygulama sürümü                                                     | Hız sınırı, ban sinyali      | Hesap süresince                                                           |
| Yüz                            | AWS Rekognition koleksiyonu (yüz vektörü) + `verifications` | Sağlayıcının yüz kimliği HMAC olarak; güven skoru, yaş aralığı. **Video ve referans karesi saklanmaz** | Canlılık, mükerrer/banlı yüz | Hesap süresince; ban hâlinde ban kaydında (§6.2)                          |
| IP adresi                      | `private.rate_limit_events` (kova adında)                   | HMAC                                                                                                   | Hız sınırı                   | 1 saatlik pencere; temizlik bir sonraki istekte (periyodik temizlik TODO) |
| Giriş kodları                  | `private.otp_challenges`                                    | Kodun HMAC'ı                                                                                           | Doğrulama                    | 10 dk geçerli; periyodik silme TODO                                       |
| Tercihler (tema, dil, hareket) | Cihaz belleği                                               | —                                                                                                      | Görünüm                      | Oturum                                                                    |
| 18 yaş altı kilidi             | Cihazın güvenli deposu                                      | Bitiş zamanı                                                                                           | §6.1 cihaz kilidi            | 24 saat                                                                   |

## Faz 2 itibarıyla eklenen veriler

| Veri                                                      | Nerede                                                                 | Kim görür                                                                                    | Saklama                                        |
| --------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Ad, cinsiyet (gösterme anahtarıyla), kimi görmek istediği | `profiles`                                                             | Ad: herkes; cinsiyet: anahtar açıksa; "kimi görmek istiyor": hiç kimse (yalnızca eşleştirme) | Hesap süresince                                |
| Niyet, tempo, olmazsa olmazlar                            | `profiles`                                                             | Niyet ve tempo: herkes; olmazsa olmazlar: hiç kimse                                          | Hesap süresince                                |
| İsteğe bağlı alanlar (boy, eğitim, sigara…)               | `profile_details`                                                      | Yalnızca "profilde göster" açıksa                                                            | Hesap süresince                                |
| Fotoğraflar                                               | Depolama: `quarantine` (bekleyen/incelemede), `public-photos` (onaylı) | Onaylılar: profiline erişebilenler (Faz 3); bekleyenler: yalnızca sahibi                     | Silinene kadar; reddedilen dosya hemen silinir |
| Ses kartı                                                 | `public-voice`                                                         | Profiline erişebilenler                                                                      | Silinene kadar                                 |
| Konum                                                     | `profiles.city_id`, `district_id`, `geo_lat/lng` (0,01° ızgara)        | Başkaları yalnızca ilçe/şehir adını görür                                                    | Hesap süresince                                |
| İnceleme bekleyen düzenlemeler                            | `profile_edits`                                                        | Sahibi ve moderatörler                                                                       | Karar verilene kadar                           |

**AWS Rekognition'a giden ek veri:** her yüklenen fotoğraf (moderasyon etiketleri, yazı tanıma, yüz yaşı ve yüz araması için). Sonuç dışında bir şey saklanmaz.

**Üçüncü taraflara giden veri (yalnızca anahtarlar girildiğinde):** Resend (e-posta adresi + kod), Twilio (telefon numarası + kod; numara türü sorgusu), AWS Rekognition (canlılık videosu ve referans karesi; yüz vektörü). Hepsi yurt dışına aktarımdır; açık rıza ekranında ayrıca soruluyor. Veri işleme sözleşmeleri: TODO(owner).

## Faz 3 itibarıyla eklenen veriler

| Veri                                                    | Nerede                                                    | Kim görür                                            | Saklama                                                                        |
| ------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| Keşif filtreleri (yaş, mesafe, niyet, yalnız ses kartı) | `preferences`                                             | Yalnızca sahibi                                      | Hesap süresince                                                                |
| Son etkinlik zamanı                                     | `profiles.last_active_at` (en sık 5 dakikada bir yazılır) | Hiç kimse; yalnızca Tur seçiminde kullanılır         | Hesap süresince                                                                |
| Kime hangi kart gösterildi, puan ve nedenler            | `tur_batches`, `tur_cards`                                | Yalnızca kartı gören kişi (nedenler); puan hiç kimse | TODO(owner): şu an süresiz; 60 günlük "Geç" kuralı için en az 60 gün gerekiyor |
| Sonraya saklananlar                                     | `saved_cards`                                             | Yalnızca saklayan; karşı taraf bilmez                | 7 gün                                                                          |
| "Bunun gibileri daha az göster"                         | `less_like_this`                                          | Yalnızca sahibi (sıralamaya etki)                    | Hesap süresince                                                                |
| Cevaplar (metin ya da ses) ve sorunun o anki hâli       | `answers`; ses: `public-voice/u_<kullanıcı>/answers/`     | Gönderen ve alıcı                                    | 14 gün bekler; TODO(owner): süresi dolan cevabın silinme süresi                |
| Masalar ve ilk mesajlar                                 | `tables`, `messages`                                      | Yalnızca iki taraf (RLS)                             | Faz 4'te tanımlanacak (sohbet arşivi)                                          |
| Engellemeler                                            | `blocks`                                                  | Hiç kimse; Tur'da iki yönlü uygulanır                | Hesap süresince                                                                |

**Not:** "Geç" bilgisi gönderene hiçbir yanıtta dönmez (D-058). Tur sıralaması abonelik, ödeme ya da cihaz verisi kullanmaz (TUR-07).

## Mod etiketi ve profil oyunu (D-066)

| Veri                                                       | Nerede                                    | Kim görür                                                                        | Saklama                                                                             |
| ---------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Bu haftaki mod                                             | `profiles.mood`, `mood_set_at`            | Profiline erişebilenler, yalnızca o hafta; aynı moddakiler Tur'da nedenini görür | Kişi değiştirene ya da temizleyene kadar (hafta bitince görünmez ama satırda kalır) |
| "İki doğru, bir yalan" cümleleri ve yalanın hangisi olduğu | `profile_games` (doğrudan okuma yok, RLS) | Profiline erişebilenler; tahminler cihazda kalır, sunucuya gitmez                | Kaldırılana ya da hesap silinene kadar                                              |

## Faz 4 itibarıyla eklenen veriler (D-067, D-068)

| Veri                                                           | Nerede                                                                                              | Kim görür                                                                           | Saklama                                             |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| Sohbet mesajları ve işaretleri (bağlantı, platform dışı, para) | `messages`                                                                                          | Yalnızca masanın iki tarafı (RLS); işaretler moderasyon için                        | TODO(owner): şu an süresiz; hesap silinince silinir |
| Ses mesajları                                                  | Depolama: `quarantine` (kısa süre), `public-voice/u_<kullanıcı>/messages/`                          | Yalnızca masanın iki tarafı, 10 dakikalık imzalı bağlantıyla                        | Mesajla birlikte                                    |
| Okundu zamanı                                                  | `messages.read_at`                                                                                  | Şimdilik yalnızca okunmamış sayısı için; karşı tarafa gösterilmiyor (SOH-09, Faz 7) | Mesajla birlikte                                    |
| Mola dönemleri                                                 | `pauses`                                                                                            | Karşı taraf yalnızca bitiş tarihini görür                                           | TODO(owner)                                         |
| Veda cümlesi ve notu                                           | `tables.farewell_key`, `farewell_text`                                                              | Yalnızca vedayı alan taraf                                                          | Masayla birlikte                                    |
| Yanıt süresi medyanı                                           | `profiles.reply_median_minutes`                                                                     | Profilde rozet (en az 5 masa verisiyle); Tur sıralamasında kullanılır               | Her gece yeniden hesaplanır                         |
| Masa oyunları                                                  | `table_games` (açık durum), `private.table_game_secrets` (gizli kelime ve henüz açılmamış cevaplar) | Açık durum: iki taraf; gizli kısım: hiç kimse (yalnızca sunucu)                     | Masayla birlikte                                    |
| Giden mesaj kuyruğu                                            | Cihaz (AsyncStorage)                                                                                | Yalnızca cihaz                                                                      | Sunucu onaylayınca silinir                          |

## Planlanan veri (APP.md'den; her faz eklendikçe bu tablo gerçek uygulamayla güncellenecek)

| Veri sınıfı                              | Örnek            | Özel nitelikli mi | Faz | Not                                               |
| ---------------------------------------- | ---------------- | ----------------- | --- | ------------------------------------------------- |
| Kimlik/iletişim                          | e-posta, telefon | Hayır             | 1   | Ban kaydında yalnızca HMAC karması                |
| Biyometrik                               | yüz vektörü      | **Evet**          | 1   | Ayrı açık rıza; video hemen silinir (§6.2)        |
| Cinsel yönelim / "kimi görmek istiyorum" | —                | **Evet**          | 2   | Açık rıza (§17)                                   |
| Konum                                    | ~1 km ızgara     | Hayır             | 2   | Ham koordinat saklanmaz (§13.6)                   |
| Mesajlar                                 | sohbet içeriği   | Hayır             | 4   | Yalnızca şikâyet kapsamında, kayıt altında erişim |
| Rehber                                   | numara karmaları | Hayır             | 5   | Ham rehber sunucuya gitmez                        |

Toplanmayacak veriler: din/inanç, siyasi görüş, etnik köken, sağlık, gelir (§6.4).
