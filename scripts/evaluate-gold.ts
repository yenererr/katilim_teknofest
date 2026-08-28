/**
 * Gold veri seti üzerinde alan bazlı başarı raporu üretir.
 *
 *   npm run eval:gold
 *
 * Çıktılar:
 *   docs/gold-degerlendirme-raporu.md  — jüriye sunulabilir tablo
 *   docs/gold-degerlendirme.json       — ham sayılar (regresyon testi okur)
 *
 * Yalnızca deterministik kural katmanı çalışır; dil modeli çağrılmaz, bu
 * yüzden aynı veri setinde her çalıştırmada aynı sonuç üretilir.
 */

import fs from "fs";
import path from "path";
import { loadGoldDataset } from "../src/server/services/eval/goldDataset";
import {
  OLCULEN_ALANLAR,
  degerlendir,
  metrikHesapla,
  mikroOrtalama,
  turSinifMetrikleri,
  type DegerlendirmeSonucu,
} from "../src/server/services/eval/goldEvaluator";

const yuzde = (n: number) => `${(n * 100).toFixed(1)}%`;

function alanTablosu(sonuc: DegerlendirmeSonucu): string {
  const satirlar = [
    "| Alan | Destek | Precision | Recall | F1 | Doğru susma | Kanıt metinde |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ];
  for (const alan of OLCULEN_ALANLAR) {
    const m = metrikHesapla(sonuc.alanlar[alan]);
    satirlar.push(
      `| \`${alan}\` | ${m.destek} | ${yuzde(m.precision)} | ${yuzde(m.recall)} | ${yuzde(m.f1)} | ${yuzde(m.susmaDogrulugu)} | ${yuzde(m.groundingOrani)} |`,
    );
  }
  const mikro = mikroOrtalama(sonuc.alanlar);
  satirlar.push(
    `| **Mikro ortalama** | **${mikro.destek}** | **${yuzde(mikro.precision)}** | **${yuzde(mikro.recall)}** | **${yuzde(mikro.f1)}** | **${yuzde(mikro.susmaDogrulugu)}** | **${yuzde(mikro.groundingOrani)}** |`,
  );
  return satirlar.join("\n");
}

function turTablosu(sonuc: DegerlendirmeSonucu): string {
  const { kampanyaTuru } = sonuc;
  const { siniflar, makroF1 } = turSinifMetrikleri(kampanyaTuru);
  const satirlar = [
    `Etiketli kayıt: **${kampanyaTuru.toplam}** · Doğruluk: **${yuzde(
      kampanyaTuru.toplam === 0 ? 0 : kampanyaTuru.dogru / kampanyaTuru.toplam,
    )}** · Makro F1: **${yuzde(makroF1)}**`,
    "",
    "Sınıf dağılımı dengesiz olduğu için makro F1 doğruluktan daha bilgilendirici.",
    "",
    "| Gerçek tür | Destek | Precision | Recall | F1 |",
    "|---|---:|---:|---:|---:|",
    ...siniflar.map(
      (s) =>
        `| ${s.sinif} | ${s.destek} | ${yuzde(s.precision)} | ${yuzde(s.recall)} | ${yuzde(s.f1)} |`,
    ),
    "",
    "En sık karışan sınıflar:",
    "",
    "| Gerçek tür | Doğru | En sık hata | Toplam |",
    "|---|---:|---|---:|",
  ];
  for (const [gercek, tahminler] of Object.entries(kampanyaTuru.karisiklik).sort(
    (a, b) =>
      Object.values(b[1]).reduce((x, y) => x + y, 0) -
      Object.values(a[1]).reduce((x, y) => x + y, 0),
  )) {
    const toplam = Object.values(tahminler).reduce((x, y) => x + y, 0);
    const dogru = tahminler[gercek] ?? 0;
    const hatalar = Object.entries(tahminler)
      .filter(([t]) => t !== gercek)
      .sort((a, b) => b[1] - a[1]);
    const enSik = hatalar.length ? `${hatalar[0][0]} (${hatalar[0][1]})` : "—";
    satirlar.push(`| ${gercek} | ${dogru}/${toplam} | ${enSik} | ${toplam} |`);
  }
  return satirlar.join("\n");
}

function zorTablosu(sonuc: DegerlendirmeSonucu): string {
  const satirlar = [
    "| Alan | Destek (zor) | F1 (zor) | F1 (tümü) |",
    "|---|---:|---:|---:|",
  ];
  for (const alan of OLCULEN_ALANLAR) {
    const zor = metrikHesapla(sonuc.zorKayitAlanlari[alan]);
    const hepsi = metrikHesapla(sonuc.alanlar[alan]);
    if (zor.destek === 0) continue;
    satirlar.push(
      `| \`${alan}\` | ${zor.destek} | ${yuzde(zor.f1)} | ${yuzde(hepsi.f1)} |`,
    );
  }
  return satirlar.join("\n");
}

function main(): void {
  const kayitlar = loadGoldDataset();
  if (kayitlar.length === 0) {
    console.error("Gold veri seti okunamadı veya boş.");
    process.exit(1);
  }

  const sonuc = degerlendir(kayitlar);
  const mikro = mikroOrtalama(sonuc.alanlar);

  // Geliştirme / saklı test ayrımı: kural desenleri yalnızca set_round1
  // incelenerek geliştirildi; set_v2 hiç bakılmadan ölçüldü. Aradaki fark
  // veri setine ezberleme olup olmadığını gösterir.
  const gelistirme = degerlendir(kayitlar.filter((k) => k.setGroup === "set_round1"));
  const sakliTest = degerlendir(kayitlar.filter((k) => k.setGroup === "set_v2"));
  const mikroGelistirme = mikroOrtalama(gelistirme.alanlar);
  const mikroSakli = mikroOrtalama(sakliTest.alanlar);
  const turOrani = (d: DegerlendirmeSonucu) =>
    d.kampanyaTuru.toplam === 0 ? 0 : d.kampanyaTuru.dogru / d.kampanyaTuru.toplam;

  const cokEtiketci = kayitlar.filter((k) => k.annotators.length > 1).length;
  const adjudike = kayitlar.filter((k) => k.adjudicated).length;
  const zor = kayitlar.filter((k) => k.hard).length;

  const rapor = `# Gold Veri Seti Değerlendirme Raporu

Otomatik üretilmiştir: \`npm run eval:gold\`. Ölçüm yalnızca deterministik
kural katmanını çalıştırır (dil modeli çağrısı yok), bu yüzden sonuçlar
tekrar üretilebilir.

## Veri seti

| | |
|---|---|
| Kayıt | ${sonuc.kayitSayisi} |
| Banka | ${sonuc.bankaSayisi} |
| Birden fazla etiketçi gören kayıt | ${cokEtiketci} |
| Uzlaştırma (adjudication) yapılan kayıt | ${adjudike} |
| Zor olarak işaretlenen kayıt | ${zor} |

Veri setinde her alan için üç durum ayrı ayrı etiketli: değer, değerin
metindeki kanıt ifadesi (span) ve "bu alan bu metinde yok" bilgisi. Son
madde ölçüm açısından belirleyici — kaynakta olmayan bir değeri üretmek
yanlış pozitif sayılır, doğru susmak ayrıca puanlanır.

## Geliştirme / saklı test ayrımı

Kural desenleri geliştirilirken yalnızca \`set_round1\` alt kümesine bakıldı;
\`set_v2\` saklı test kümesi olarak ayrıldı. İki küme arasındaki fark, ölçümün
veri setine ezberlenip ezberlenmediğini gösterir.

| Küme | Kayıt | Mikro F1 | Precision | Recall | Doğru susma | Tür doğruluğu |
|---|---:|---:|---:|---:|---:|---:|
| Geliştirme (\`set_round1\`) | ${gelistirme.kayitSayisi} | ${yuzde(mikroGelistirme.f1)} | ${yuzde(mikroGelistirme.precision)} | ${yuzde(mikroGelistirme.recall)} | ${yuzde(mikroGelistirme.susmaDogrulugu)} | ${yuzde(turOrani(gelistirme))} |
| **Saklı test (\`set_v2\`)** | ${sakliTest.kayitSayisi} | **${yuzde(mikroSakli.f1)}** | ${yuzde(mikroSakli.precision)} | ${yuzde(mikroSakli.recall)} | ${yuzde(mikroSakli.susmaDogrulugu)} | ${yuzde(turOrani(sakliTest))} |

## Alan bazlı sonuçlar

${alanTablosu(sonuc)}

**Doğru susma**: alanın kaynakta bulunmadığı etiketlenmiş kayıtlarda sistemin
değer üretmeme oranı. Uydurma üretimi doğrudan bu sütunu düşürür.

**Kanıt metinde**: üretilen değerin gerekçe cümlesinin kaynak metinde birebir
bulunma oranı (span grounding).

## Kampanya türü sınıflandırması (şartname 5.4)

${turTablosu(sonuc)}

## Zor kayıtlar

Veri setinde \`hard\` işaretli kayıtlar format varyantı, koşullu aralık,
terminoloji karışıklığı veya çelişkili ifade içeriyor. Bu alt kümedeki düşüş,
sistemin nerede zorlandığını gösterir.

${zorTablosu(sonuc)}

## Özet

- Mikro ortalama F1: **${yuzde(mikro.f1)}** (precision ${yuzde(mikro.precision)}, recall ${yuzde(mikro.recall)})
- Kaynakta olmayan alanda doğru susma: **${yuzde(mikro.susmaDogrulugu)}**
- Üretilen değerlerin kanıtı kaynak metinde bulunma oranı: **${yuzde(mikro.groundingOrani)}**
`;

  const docsDir = path.resolve(process.cwd(), "docs");
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, "gold-degerlendirme-raporu.md"), rapor, "utf8");
  fs.writeFileSync(
    path.join(docsDir, "gold-degerlendirme.json"),
    `${JSON.stringify({ tumu: sonuc, gelistirme, sakliTest }, null, 2)}\n`,
    "utf8",
  );

  console.log(rapor);
}

main();
