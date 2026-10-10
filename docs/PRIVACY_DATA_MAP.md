# Kişisel veri haritası

> Hukuki tavsiye değildir. Saklama süreleri ve hukuki dayanaklar avukat onayından geçmeden kesinleşmez (APP.md §17).

## Faz 0 itibarıyla

Uygulama henüz **hiçbir kişisel veri toplamıyor ve sunucuya göndermiyor.**

| Veri                              | Nerede                                              | Neden                  | Süre   |
| --------------------------------- | --------------------------------------------------- | ---------------------- | ------ |
| Tema, dil, hareketi azalt tercihi | Yalnızca cihaz belleği (uygulama kapanınca silinir) | Görünüm                | Oturum |
| Cihaz dili                        | Cihazda okunur, gönderilmez                         | Varsayılan dili seçmek | —      |
| Hata raporları                    | Sentry — **kapalı** (DSN yok)                       | Hata izleme            | —      |

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
