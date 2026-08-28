# Alan Çıkarımını İyileştirme Yöntemi

Bu belge, gold veri setinde zayıf çıkan bir alanın nasıl düzeltileceğini
anlatır. Yöntem `kar_payi_orani` alanında uygulandı ve F1'i **%57,1'den
%94,7'ye** çıkardı; aşağıdaki adımlar o çalışmanın birebir tekrarıdır.

Amaç sayıyı yükseltmek değil, **hatanın gerçek nedenini bulmak**. İkisi
karışırsa veri setine ezberlemiş olursunuz ve saklı test kümesinde
kazanç görünmez.

---

## Döngü

```
1. ÖLÇ      → hangi alan zayıf?
2. TEŞHİS   → o alan hangi kayıtlarda, nasıl hata yapıyor?
3. GRUPLA   → bu hatalar kaç ayrı nedene iniyor?
4. DÜZELT   → nedeni düzelt, belirtiyi değil
5. ÖLÇ      → kazanç gerçek mi, saklı testte de var mı?
6. KİLİTLE  → birim testi + eşik yaz
```

---

## 1. ÖLÇ — zayıf alanı bul

```bash
npm run eval:gold
```

Rapor: `docs/gold-degerlendirme-raporu.md`

Alan tablosunda üç sütuna bakın:

| Sütun | Düşükse ne demek |
|---|---|
| **Recall** | Değer metinde var, sistem bulamıyor. Desen eksik veya bir kapı yanlış eliyor. |
| **Precision** | Sistem yanlış değer üretiyor ya da olmayan alanı uyduruyor. **Bu daha ciddi.** |
| **Doğru susma** | Kaynakta olmayan alanda değer uyduruyor. Projenin "veri yoksa uydurma" ilkesini doğrudan çürütür. |

> **Öncelik kuralı:** precision kaybı recall kaybından önce gelir. Yanlış
> bilgi vermek, bilgi vermemekten kötüdür — jüri de böyle bakar.

---

## 2. TEŞHİS — hataları tek tek oku

```bash
npm run eval:diagnose -- <alan>
```

Örnekler:

```bash
npm run eval:diagnose -- hedef_kitle
npm run eval:diagnose -- finansman_tutari --tur=uydurma
npm run eval:diagnose -- vade_ay --set=set_round1 --limit=30
```

Her hata için şunu basar:

```
[KACIRMA] kuveyt-turk--kampanya-arsivi-...
  küme      : set_v2, zor, format_varyant
  gold      : ["belirli_segment"]
  gold span : Kampanyadan tüzel ve şahıs firmasına sahip eczaneler faydalanabilir.
  bizim kanıt: ...
```

**En kritik satır `gold span`.** İnsan etiketçi değeri metnin tam olarak
neresinden okumuş, orada yazıyor. Sistemin neyi görmesi gerektiğini
tartışmaya gerek kalmıyor.

### Hata türleri

| Tür | Anlamı | Nereye bakılır |
|---|---|---|
| `kacirma` | Gold'da değer var, sistem sustu | Desen span'i yakalıyor mu? Yakalıyorsa hangi kapı eliyor? |
| `yanlis` | Değer üretildi ama farklı | Birden fazla aday var, yanlışı seçiliyor → puanlama |
| `uydurma` | Gold "yok" demiş, sistem üretti | Bağlam kontrolü zayıf |

---

## 3. GRUPLA — belirtiyi değil nedeni ara

Bu adım yöntemin kalbi. Altı ayrı hata, altı ayrı düzeltme demek değildir.

`kar_payi_orani` çalışmasında altı kaçırma vardı ve ilk bakışta hepsi
farklı görünüyordu: biri `2,99%` biçimindeydi, biri tabloydu, biri
`%0`'dı, ikisi bilgilendirme formuydu. Her birine ayrı yama yazmak
mümkündü — ve yanlış olurdu.

Nedeni görmek için her adayın **hangi kapıda elendiğini** yazdıran geçici
bir betik yazıldı:

```ts
// Her regex eşleşmesi için: hangi kontrol reddetti?
const red: string[] = [];
if (!/(kar\s*pay|kar\s*orani|faiz)/.test(baglam)) red.push("karPayiAnilmadi");
if (!/(konut|tasit|ihtiyac|finansman)/.test(baglam)) red.push("urunBaglamiYok");
const dis = baglam.match(ORAN_DISLAMA);
if (dis) red.push(`DISLAMA:${dis[0]}`);
console.log(`aday "${ham}" -> ${deger}  red: ${red.join(", ")}  cümle uzunluk: ${cumle?.metin.length}`);
```

Çıktı deseni hemen gösterdi:

```
aday "%1,20"  red: DISLAMA:kkdf     cümle uzunluk: 1732
aday "2,99%"  red: urunBaglamiYok   cümle uzunluk: 312
```

**Cümle uzunlukları 300–2500 karakterdi.** Altı hatanın beşi tek bir
nedene iniyordu: bağlam olarak cümlenin tamamı kullanılıyordu, ama bu
sayfalarda "cümle" koca bir blok. Blokta bir yerde geçen `KKDF`, hemen
yanında etiketlenmiş doğru oranı eliyordu.

> **Kural:** düzeltmeye başlamadan önce "bu hataların kaçı aynı nedene
> iniyor?" sorusunu cevaplayın. Cevap genelde "çoğu"dur.

---

## 4. DÜZELT — nedeni düzelt

Nedeni bulduktan sonra düzeltme küçük olur. `kar_payi_orani` için:

1. **Bağlam penceresi**: karar, oranın ±140 karakterlik çevresine göre
   verilir; cümlenin tamamına değil.
2. **En yakın etiket kazanır**: `"Aylık kâr payı oranı : %1,20"` biçiminde
   doğrudan etiketlenmiş değer, dışlama kapılarını aşar. Sayı zaten o
   etikete aittir; ardından gelen vergi satırları onu geçersiz kılmaz.
3. **Kavram ayrımı**: kâr *paylaşım* oranı (%99/%1) kâr payı oranı
   değildir → dışlama listesine eklendi. Bu, bir yanlış pozitifi kapattı.

Üçüncü madde önemli bir örnek: veri setine bakarken bulunan hata, aslında
şartname 5.5'teki terminoloji ayrımının kodda eksik olmasıydı. **İyi bir
düzeltme, gold setin dışında da doğru olandır.**

### Ezberlemeden kaçınmak

- Düzeltmeyi `set_round1` (geliştirme kümesi) üzerinde tasarlayın.
- `set_v2` saklı test kümesine bakmayın; oradaki kazanç düzeltmenin
  gerçekten genellendiğinin kanıtıdır.
- Tek bir kaydı geçirmek için yazılan koşul (`if (id === ...)`, bankaya
  özel istisna) ezberdir. Yazdığınız kuralı bir cümleyle
  gerekçelendiremiyorsanız yazmayın.

---

## 5. ÖLÇ — kazancı doğrula

```bash
npm run eval:gold
```

Üç şeyi birlikte kontrol edin:

| Kontrol | Beklenen |
|---|---|
| Hedef alanın F1'i | Arttı |
| Hedef alanın **precision**'ı | Düşmedi |
| **Saklı test** (`set_v2`) mikro F1 | Arttı ya da sabit |
| Diğer alanlar | Bozulmadı |

`kar_payi_orani` çalışmasının sonucu:

| | Önce | Sonra |
|---|---:|---:|
| `kar_payi_orani` precision | %100 | %100 |
| `kar_payi_orani` recall | %40 | %90 |
| `kar_payi_orani` F1 | %57,1 | %94,7 |
| Mikro F1 (tümü) | %68,5 | %70,0 |
| Mikro F1 (saklı test) | %68,8 | %69,6 |

Saklı testin de yükselmesi, kazancın gerçek olduğunu gösterir. Yalnızca
geliştirme kümesi yükselseydi ezber olurdu.

---

## 6. KİLİTLE — testle sabitle

İki yere yazın:

**a) Davranış testi** — `src/nlp/__tests__/sartnameAlanlari.unit.test.ts`

Düzeltilen davranışı, gold kaydını kopyalamadan, temsili bir metinle test
edin. Test kuralın *neden* var olduğunu anlatmalı:

```ts
it('oranı bloğun tamamına değil, yakın çevresine göre değerlendirir', () => {
  // Bilgilendirme formları tek bir dev "cümle" olarak ayrışıyor. Blokta
  // geçen KKDF/BSMV, hemen yanında etiketlenmiş oranı elememeli.
  const form =
    'Aylık Kar payı oranı : %1,20 Efektif Yıllık Kar Payı Oranı : %23,52 ' +
    'KKDF ve BSMV oranları %15 olarak uygulanır...';
  expect(kuralTabanliCikar(form).kar_payi_orani.deger).toBeCloseTo(0.012, 6);
});
```

Karşıt durumu da test edin (etiketsiz `%0` hâlâ elenmeli) — yoksa
düzeltme sessizce fazla geniş kalır.

**b) Eşik** — `src/server/services/eval/__tests__/goldEval.unit.test.ts`

```ts
const esikler = {
  kampanya_suresi: 0.85,
  kar_payi_orani: 0.85,   // ölçülen değerin biraz altına
};
```

Eşiği ölçülen değerin **biraz altına** koyun. Amaç bugünkü sayıyı
dondurmak değil, gerilemeyi yakalamak.

---

## Sıradaki iki hedef

Ölçümün bugünkü hâline göre en zayıf iki alan:

### `finansman_tutari` — precision %34

```bash
npm run eval:diagnose -- finansman_tutari --tur=uydurma
```

Bilinen sorun: kampanya metnindeki **harcama eşikleri** finansman tutarı
sanılıyor. `"10.000 TL ve üzeri ilk harcamaya"` bir finansman tutarı
değildir; `"250.000 TL'ye kadar finansman"` öyledir. Gold setin `notes`
sütununda etiketçiler bu ayrımı açıkça yazmış — okuyun:

```
"finansman_tutari": "250.000 TL SGK hak ediş ödemesi ve 10.000 TL harcama
eşiğidir; ikisi de finansman tutarı değildir."
```

Muhtemel yön: tutarın yakın çevresinde `harcama|alisveris|fatura|hak edis`
geçiyorsa finansman tutarı sayma. Aynı pencere yöntemi.

### `hedef_kitle` — F1 %43

```bash
npm run eval:diagnose -- hedef_kitle
```

Bugünkü durum: 8 doğru, 8 kaçırma, 3 yanlış, 7 uydurma. Veri seti üç
etiket kullanıyor (`yeni_musteri`, `mevcut_musteri`, `belirli_segment`);
biz sekiz segment kodu üretip eşliyoruz. Kaçırmaların çoğu meslek/ürün
grubu kısıtı ("eczaneler faydalanabilir", "Paraf kredi kartına sahip
müşterilerimiz") — bunlar `belirli_segment` sayılmalı ama desenlerimizde
karşılığı yok.

Uydurmalara ayrıca bakın: sigorta sayfası gibi kampanya olmayan
metinlerde segment üretiliyor.

---

## Özet

```bash
npm run eval:gold                          # 1. hangi alan zayıf
npm run eval:diagnose -- <alan>            # 2. hangi kayıtlarda, nasıl
# 3. hataları grupla — kaç ayrı neden var?
# 4. nedeni düzelt (src/nlp/extract.ts)
npm run eval:gold                          # 5. kazanç saklı testte de var mı
npm test                                   # 6. testler + eşikler
```

İlgili belgeler:

- `docs/gold-degerlendirme-raporu.md` — güncel ölçüm
- `src/server/services/eval/goldEvaluator.ts` — alan eşleme ve karşılaştırma
  kuralları (yeni alan eklerken burası)
- `Finansman_Kampanyalari_Referans_Veri_Seti.csv` — gold veri seti;
  `notes` sütunu etiketçilerin gerekçelerini içerir, düzeltme yazmadan
  önce okunmalı
