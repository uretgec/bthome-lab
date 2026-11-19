# BTHome Lab

Educational **BTHome v2** BLE advertisement generator that runs entirely in your browser.

**▶ Live demo:** <https://uretgec.github.io/bthome-lab/>

Build a complete Bluetooth Low Energy advertising packet step by step and watch
every byte change as you type:

`link layer → AD elements → BTHome v2 service data → measurements → AES-CCM → CRC-24`

## Features

- Full packet anatomy: PDU header, public/random MAC, Flags, Local Name, TX power, custom AD
- Every BTHome v2 object (sensors, binary, events, text/raw, firmware) with live byte breakdown
- AES-CCM encryption with nonce visualization, verified against bthome.io test vectors
- Hex · annotated pretty-print · hexdump outputs with byte-change highlighting
- 31-byte budget meter · TR/EN interface · 6 built-in self-tests
- Zero dependencies · 4 files · works offline — just open `index.html`

> This is a generator/learning tool. Browsers cannot transmit BLE advertisements.

## Specs

[BTHome format](https://bthome.io/format/) ·
[BTHome encryption](https://bthome.io/encryption/) ·
[Bluetooth Assigned Numbers](https://www.bluetooth.com/specifications/assigned-numbers/) ·
[RFC 3610](https://datatracker.ietf.org/doc/html/rfc3610)

---

## Türkçe

Tamamen tarayıcıda çalışan, eğitim amaçlı **BTHome v2** BLE reklam paketi üreticisi.

**▶ Canlı demo:** <https://uretgec.github.io/bthome-lab/>

Bir BLE reklam paketini adım adım kurun; siz yazdıkça her baytın değişimini canlı izleyin:

`link katmanı → AD yapıları → BTHome v2 service data → ölçümler → AES-CCM → CRC-24`

### Özellikler

- Eksiksiz paket anatomisi: PDU başlığı, public/random MAC, Flags, Local Name, TX power, özel AD
- Tüm BTHome v2 objeleri (sensör, ikili, event, text/raw, firmware) canlı bayt dökümüyle
- Nonce görselleştirmeli AES-CCM şifreleme; bthome.io test vektörleriyle doğrulanmış
- Hex · açıklamalı pretty-print · hexdump çıktıları ve değişen bayt vurgusu
- 31 bayt bütçe göstergesi · TR/EN arayüz · 6 yerleşik self-test
- Sıfır bağımlılık · 4 dosya · çevrimdışı çalışır — `index.html`'i açmanız yeterli

> Bu bir üretici/öğrenme aracıdır; tarayıcılar BLE reklamı yayınlayamaz.

MIT © [Uretgec](https://github.com/uretgec)