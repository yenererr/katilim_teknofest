# Banka logoları

`BankMark` bileşeni bu klasördeki dosyaları `/logos/<banka-id>.svg` yolundan okur.
Dosya yoksa veya yüklenemezse otomatik olarak marka renkli monogram rozetine düşer,
yani eksik logo arayüzü bozmaz.

Beklenen dosyalar (id'ler `src/data/piyasa.ts` içindeki `BANKALAR` listesinden gelir):

- adil-katilim.svg
- albaraka.svg
- dunya-katilim.svg
- emlak-katilim.svg
- hayat-finans.svg
- kuveyt-turk.svg
- tom-katilim.svg
- turkiye-finans.svg
- vakif-katilim.svg
- ziraat-katilim.svg

Öneriler:
- Tercihen SVG; PNG kullanılacaksa `src/data/piyasa.ts` içindeki `logo` uzantısını güncelleyin.
- Kare veya kareye yakın, şeffaf zeminli "amblem/ikon" versiyonu (yatay yazılı logo 28px rozette okunmaz).
- Logolar bankaların tescilli markalarıdır; yalnızca ilgili bankayı tanımlamak amacıyla,
  bankaların marka kullanım kılavuzlarına uygun biçimde kullanılmalıdır.
