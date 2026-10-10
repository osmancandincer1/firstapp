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

**Üçüncü taraflara giden veri (yalnızca anahtarlar girildiğinde):** Resend (e-posta adresi + kod), Twilio (telefon numarası + kod; numara türü sorgusu), AWS Rekognition (canlılık videosu ve referans karesi; yüz vektörü). Hepsi yurt dışına aktarımdır; açık rıza ekranında ayrıca soruluyor. Veri işleme sözleşmeleri: TODO(owner).

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
