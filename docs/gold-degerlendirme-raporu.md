# Gold Veri Seti Değerlendirme Raporu

Otomatik üretilmiştir: `npm run eval:gold`. Ölçüm yalnızca deterministik
kural katmanını çalıştırır (dil modeli çağrısı yok), bu yüzden sonuçlar
tekrar üretilebilir.

## Veri seti

| | |
|---|---|
| Kayıt | 182 |
| Banka | 10 |
| Birden fazla etiketçi gören kayıt | 63 |
| Uzlaştırma (adjudication) yapılan kayıt | 45 |
| Zor olarak işaretlenen kayıt | 43 |

Veri setinde her alan için üç durum ayrı ayrı etiketli: değer, değerin
metindeki kanıt ifadesi (span) ve "bu alan bu metinde yok" bilgisi. Son
madde ölçüm açısından belirleyici — kaynakta olmayan bir değeri üretmek
yanlış pozitif sayılır, doğru susmak ayrıca puanlanır.

## Geliştirme / saklı test ayrımı

Kural desenleri geliştirilirken yalnızca `set_round1` alt kümesine bakıldı;
`set_v2` saklı test kümesi olarak ayrıldı. İki küme arasındaki fark, ölçümün
veri setine ezberlenip ezberlenmediğini gösterir.

| Küme | Kayıt | Mikro F1 | Precision | Recall | Doğru susma | Tür doğruluğu |
|---|---:|---:|---:|---:|---:|---:|
| Geliştirme (`set_round1`) | 134 | 74.5% | 72.9% | 76.1% | 59.8% | 57.9% |
| **Saklı test (`set_v2`)** | 48 | **71.9%** | 71.4% | 72.4% | 95.0% | 46.2% |

## Alan bazlı sonuçlar

| Alan | Destek | Precision | Recall | F1 | Doğru susma | Kanıt metinde |
|---|---:|---:|---:|---:|---:|---:|
| `kar_payi_orani` | 10 | 100.0% | 90.0% | 94.7% | 100.0% | 100.0% |
| `vade_ay` | 38 | 44.4% | 52.6% | 48.2% | 71.3% | 100.0% |
| `finansman_tutari` | 22 | 71.4% | 68.2% | 69.8% | 90.8% | 100.0% |
| `tahsis_ucreti` | 0 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| `taksit_sayisi` | 21 | 73.1% | 90.5% | 80.9% | 84.8% | 100.0% |
| `kampanya_suresi` | 75 | 93.2% | 92.0% | 92.6% | 84.4% | 100.0% |
| `masraf_durumu` | 10 | 62.5% | 50.0% | 55.6% | 93.0% | 100.0% |
| `alisveris_puani` | 11 | 88.9% | 72.7% | 80.0% | 97.4% | 100.0% |
| `indirim_orani` | 2 | 33.3% | 50.0% | 40.0% | 95.7% | 100.0% |
| `odul_miktari` | 6 | 75.0% | 100.0% | 85.7% | 95.6% | 100.0% |
| `hedef_kitle` | 19 | 44.4% | 42.1% | 43.2% | 70.6% | 100.0% |
| **Mikro ortalama** | **214** | **72.4%** | **74.8%** | **73.6%** | **88.6%** | **100.0%** |

**Doğru susma**: alanın kaynakta bulunmadığı etiketlenmiş kayıtlarda sistemin
değer üretmeme oranı. Uydurma üretimi doğrudan bu sütunu düşürür.

**Kanıt metinde**: üretilen değerin gerekçe cümlesinin kaynak metinde birebir
bulunma oranı (span grounding).

## Kampanya türü sınıflandırması (şartname 5.4)

Etiketli kayıt: **153** · Doğruluk: **54.9%** · Makro F1: **54.7%**

Sınıf dağılımı dengesiz olduğu için makro F1 doğruluktan daha bilgilendirici.

| Gerçek tür | Destek | Precision | Recall | F1 |
|---|---:|---:|---:|---:|
| Kart | 34 | 40.9% | 26.5% | 32.1% |
| Yatırım Ürünü | 31 | 65.7% | 74.2% | 69.7% |
| Finansman | 30 | 48.3% | 46.7% | 47.5% |
| Alışveriş Puanı | 21 | 47.1% | 76.2% | 58.2% |
| İhtiyaç Finansmanı | 17 | 78.6% | 64.7% | 71.0% |
| Konut Finansmanı | 7 | 50.0% | 71.4% | 58.8% |
| Taşıt Finansmanı | 7 | 71.4% | 71.4% | 71.4% |
| Yeni Müşteri | 6 | 100.0% | 16.7% | 28.6% |

En sık karışan sınıflar:

| Gerçek tür | Doğru | En sık hata | Toplam |
|---|---:|---|---:|
| Kart | 9/34 | Alışveriş Puanı (18) | 34 |
| Yatırım Ürünü | 23/31 | Finansman (7) | 31 |
| Finansman | 14/30 | Kart (7) | 30 |
| Alışveriş Puanı | 16/21 | Yatırım Ürünü (4) | 21 |
| İhtiyaç Finansmanı | 11/17 | Kart (3) | 17 |
| Konut Finansmanı | 5/7 | İhtiyaç Finansmanı (1) | 7 |
| Taşıt Finansmanı | 5/7 | Finansman (1) | 7 |
| Yeni Müşteri | 1/6 | Yatırım Ürünü (3) | 6 |

## Zor kayıtlar

Veri setinde `hard` işaretli kayıtlar format varyantı, koşullu aralık,
terminoloji karışıklığı veya çelişkili ifade içeriyor. Bu alt kümedeki düşüş,
sistemin nerede zorlandığını gösterir.

| Alan | Destek (zor) | F1 (zor) | F1 (tümü) |
|---|---:|---:|---:|
| `kar_payi_orani` | 3 | 80.0% | 94.7% |
| `vade_ay` | 7 | 46.2% | 48.2% |
| `finansman_tutari` | 4 | 57.1% | 69.8% |
| `taksit_sayisi` | 6 | 75.0% | 80.9% |
| `kampanya_suresi` | 24 | 100.0% | 92.6% |
| `masraf_durumu` | 5 | 75.0% | 55.6% |
| `alisveris_puani` | 8 | 80.0% | 80.0% |
| `indirim_orani` | 2 | 40.0% | 40.0% |
| `odul_miktari` | 5 | 83.3% | 85.7% |
| `hedef_kitle` | 15 | 37.0% | 43.2% |

## Özet

- Mikro ortalama F1: **73.6%** (precision 72.4%, recall 74.8%)
- Kaynakta olmayan alanda doğru susma: **88.6%**
- Üretilen değerlerin kanıtı kaynak metinde bulunma oranı: **100.0%**
