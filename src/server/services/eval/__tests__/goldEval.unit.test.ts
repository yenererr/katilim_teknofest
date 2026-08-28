import { describe, expect, it } from "vitest";
import { loadGoldDataset, parseCsv } from "../goldDataset";
import {
  OLCULEN_ALANLAR,
  degerlendir,
  metrikHesapla,
  mikroOrtalama,
  turSinifMetrikleri,
} from "../goldEvaluator";

/**
 * Gold veri seti üzerindeki başarı, kod değiştikçe sessizce düşmesin diye
 * eşiklerle kilitlenir. Eşikler ölçülen değerin biraz altına konur: amaç
 * bugünkü sayıyı dondurmak değil, gerilemeyi yakalamak.
 *
 * Güncel rapor için: `npm run eval:gold`
 */

describe("CSV çözücü", () => {
  it("tırnak içindeki virgül ve satır sonunu alan sınırı saymaz", () => {
    const satirlar = parseCsv('a,b\n"x,1","iki\nsatır"\n');
    expect(satirlar).toEqual([
      ["a", "b"],
      ["x,1", "iki\nsatır"],
    ]);
  });

  it("çift tırnak kaçışını çözer", () => {
    expect(parseCsv('a\n"o ""dedi"""\n')).toEqual([["a"], ['o "dedi"']]);
  });
});

describe("gold veri seti", () => {
  const kayitlar = loadGoldDataset();

  it("11 bankadan etiketli kayıt içerir", () => {
    expect(kayitlar.length).toBeGreaterThanOrEqual(180);
    expect(new Set(kayitlar.map((k) => k.bankSlug)).size).toBeGreaterThanOrEqual(10);
  });

  it("etiketsiz kayıt oranı ihmal edilebilir düzeydedir", () => {
    // Bazı kayıtlarda yalnızca kampanya türü etiketli; onlar alan
    // çıkarımı ölçümüne girmez ama veri seti için geçerli kayıtlardır.
    // Hiçbir etiketi olmayan kayıt ölçüme hiç katkı vermez: sayısı
    // izlenir, artarsa veri setinde eksik etiketleme var demektir.
    const etiketsiz = kayitlar.filter(
      (k) =>
        Object.keys(k.fields).length === 0 &&
        k.absentFields.length === 0 &&
        !k.campaignType,
    );
    expect(etiketsiz.length / kayitlar.length).toBeLessThan(0.02);
  });

  it("etiketlenen değerlerin kanıt ifadesi kaynak metinde geçer", () => {
    // Etiketçinin işaretlediği span'in metinde bulunması veri setinin
    // kendi tutarlılık kontrolüdür; bozulursa ölçüm anlamsızlaşır.
    let toplam = 0;
    let bulunan = 0;
    for (const k of kayitlar) {
      const metin = k.text.replace(/\s+/g, " ");
      for (const span of Object.values(k.fieldSpans)) {
        if (!span?.trim()) continue;
        toplam += 1;
        if (metin.includes(span.replace(/\s+/g, " ").trim())) bulunan += 1;
      }
    }
    expect(toplam).toBeGreaterThan(100);
    expect(bulunan / toplam).toBeGreaterThan(0.95);
  });
});

describe("çıkarım başarısı — regresyon eşikleri", () => {
  const kayitlar = loadGoldDataset();
  const tumu = degerlendir(kayitlar);
  const sakliTest = degerlendir(kayitlar.filter((k) => k.setGroup === "set_v2"));

  it("mikro F1 eşiğin altına düşmez", () => {
    expect(mikroOrtalama(tumu.alanlar).f1).toBeGreaterThan(0.6);
  });

  it("saklı test kümesinde de eşiği korur", () => {
    // Geliştirme kümesine ezberleme olursa bu eşik düşer.
    expect(mikroOrtalama(sakliTest.alanlar).f1).toBeGreaterThan(0.55);
  });

  it("üretilen her değerin kanıtı kaynak metinde bulunur", () => {
    // Grounding %100 olmalı: kanıt cümlesi metinden alınır, üretilmez.
    expect(mikroOrtalama(tumu.alanlar).groundingOrani).toBe(1);
  });

  it("kaynakta olmayan alanda büyük çoğunlukla susar", () => {
    expect(mikroOrtalama(tumu.alanlar).susmaDogrulugu).toBeGreaterThan(0.75);
  });

  it("yüksek destekli alanlarda F1 eşiği", () => {
    const esikler: Partial<Record<(typeof OLCULEN_ALANLAR)[number], number>> = {
      kampanya_suresi: 0.85,
      taksit_sayisi: 0.7,
      alisveris_puani: 0.7,
      odul_miktari: 0.7,
    };
    for (const [alan, esik] of Object.entries(esikler)) {
      const f1 = metrikHesapla(
        tumu.alanlar[alan as (typeof OLCULEN_ALANLAR)[number]],
      ).f1;
      expect(f1, `${alan} F1`).toBeGreaterThan(esik as number);
    }
  });

  it("kampanya türü makro F1 eşiği", () => {
    expect(turSinifMetrikleri(tumu.kampanyaTuru).makroF1).toBeGreaterThan(0.5);
  });
});
