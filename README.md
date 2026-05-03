# NosCode Ticket Sistemi

Discord üzerinde çalışan ve localhost paneli bulunan ticket botu.

## Özellikler

- `/kurulum-ticket` ile aktif kategori, arşiv kategori, log kanalı ve sorumlu rol kurulumu
- `/ayarlar` ile kategori ekleme, kategori silme ve temel ayarları güncelleme
- `/kurulum` ile NosCode Ticket Sistemi panel mesajı yayını
- Select menu ile ticket oluşturma
- Ticket sahiplenme, kullanıcı ekleme/çıkarma, devretme ve isim değiştirme
- 5 dakikalık kapatma onayı akışı
- Transcript oluşturma, DM bilgilendirmesi ve yıldız puanlama
- Mor-siyah temalı localhost panelinde aktif ticketler, tüm ticket geçmişi, sunucu durumu ve yetkili istatistikleri
- `.env` içindeki `VOICE_CHANNEL_ID` ile seçilen ses kanalına otomatik bağlanma

## Kurulum

1. `.env.example` dosyasını `.env` olarak kopyalayın.
2. `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID` ve gerekiyorsa `VOICE_CHANNEL_ID` alanlarını doldurun.
3. Bağımlılıkları yükleyin:

```bash
npm install
```

4. Botu başlatın:

```bash
npm start
```

5. Panel adresi:

```text
http://localhost:3001
```

## Notlar

- Proje varsayılan olarak verileri `data/store.json` içinde saklar.
- Tüm mesajlar embed yerine düz mesaj + component mantığıyla tasarlandı.
- Discord'un component yapısı nedeniyle gerçek embed footer alanı birebir uygulanamaz; bunun yerine mesaj metni içinde footer satırı kullanılır.
- Detaylı çevrimiçi ve çevrimdışı istatistikler için Discord Developer Portal üzerinde `Server Members Intent` ve `Presence Intent` açık olmalıdır.
- `.env` içindeki mevcut bot tokenı güvenlik için Discord Developer Portal üzerinden yenilemeniz önerilir.
