import { describe, expect, it } from "vitest";
import {
  convertWithTcmb,
  parseTcmbTodayXml,
  tcmbArchivePath,
  tcmbDateToIso,
  type TcmbFxSnapshot,
} from "../tcmbRates";
import {
  dovizAsistanYaniti,
  isDovizMesaji,
} from "../../finansmanAssistant/dovizAsistan";

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="26.08.2026" Date="08/26/2026" Bulten_No="2026/159">
  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
    <Unit>1</Unit>
    <Isim>ABD DOLARI</Isim>
    <ForexBuying>48.0000</ForexBuying>
    <ForexSelling>48.2000</ForexSelling>
  </Currency>
  <Currency CrossOrder="1" Kod="EUR" CurrencyCode="EUR">
    <Unit>1</Unit>
    <Isim>EURO</Isim>
    <ForexBuying>52.0000</ForexBuying>
    <ForexSelling>52.4000</ForexSelling>
  </Currency>
  <Currency CrossOrder="2" Kod="GBP" CurrencyCode="GBP">
    <Unit>1</Unit>
    <Isim>INGILIZ STERLINI</Isim>
    <ForexBuying>60.0000</ForexBuying>
    <ForexSelling>60.5000</ForexSelling>
  </Currency>
</Tarih_Date>`;

describe("tcmbRates", () => {
  it("Tarih_Date ISO’ya çevrilir", () => {
    expect(tcmbDateToIso("26.08.2026")).toBe("2026-08-26");
  });

  it("today.xml USD/EUR/GBP okur", () => {
    const snap = parseTcmbTodayXml(SAMPLE_XML);
    expect(snap.bulletinDate).toBe("26.08.2026");
    expect(snap.rates.USD.forexSelling).toBe(48.2);
    expect(snap.rates.EUR.forexBuying).toBe(52);
    expect(snap.rates.GBP.mid).toBeCloseTo(60.25);
    expect(snap.rates.USD.change).toBeNull();
  });

  it("önceki bültenle değişim hesaplar", () => {
    const prev = SAMPLE_XML.replace("48.2000", "48.0000").replace(
      "52.4000",
      "52.0000",
    );
    const snap = parseTcmbTodayXml(SAMPLE_XML, prev);
    expect(snap.rates.USD.change).toBeCloseTo(0.2);
    expect(snap.rates.EUR.change).toBeCloseTo(0.4);
  });

  it("TCMB arşiv yolu üretir", () => {
    expect(tcmbArchivePath("26.08.2026")).toBe("/kurlar/202608/26082026.xml");
  });

  it("TRY→USD ve USD→TRY çevirir", () => {
    const snap = parseTcmbTodayXml(SAMPLE_XML);
    const toUsd = convertWithTcmb(snap, 96_400, "TRY", "USD");
    expect(toUsd.result).toBeCloseTo(2000, 5);
    const toTry = convertWithTcmb(snap, 100, "USD", "TRY");
    expect(toTry.result).toBeCloseTo(4820, 5);
  });
});

describe("dovizAsistan", () => {
  it("döviz niyetini tanır", () => {
    expect(isDovizMesaji("100.000 TL kaç dolar?")).toBe(true);
    expect(isDovizMesaji("euro kuru ne")).toBe(true);
    expect(isDovizMesaji("2000 sterlin kaç TL")).toBe(true);
    expect(isDovizMesaji("200.000 TL ihtiyaç 24 ay")).toBe(false);
  });

  it("örnek XML ile çeviri yanıtı üretir", async () => {
    // Canlı TCMB yerine parse edilmiş snapshot ile convert path’i doğrulanır;
    // asistan canlı fetch kullanır — burada niyet + mesaj kalıbı yeter.
    const snap: TcmbFxSnapshot = parseTcmbTodayXml(SAMPLE_XML);
    const c = convertWithTcmb(snap, 100_000, "TRY", "USD");
    expect(c.result).toBeCloseTo(100_000 / 48.2, 4);
    expect(isDovizMesaji("TCMB döviz kurları")).toBe(true);
  });
});

// Canlı ağ — ortam izin verirse
describe("tcmb live", () => {
  it(
    "today.xml çekilir",
    async () => {
      const { getTcmbFxRates, __resetTcmbFxCacheForTests } = await import(
        "../tcmbRates"
      );
      __resetTcmbFxCacheForTests();
      const snap = await getTcmbFxRates({ force: true });
      expect(snap.rates.USD.forexSelling).toBeGreaterThan(1);
      expect(snap.rates.EUR.forexSelling).toBeGreaterThan(1);
      expect(snap.rates.GBP.forexSelling).toBeGreaterThan(1);
    },
    20_000,
  );

  it(
    "asistan 100.000 TL kaç dolar yanıtlar",
    async () => {
      const r = await dovizAsistanYaniti("100.000 TL kaç dolar?");
      expect(r.message).toMatch(/USD|dolar/i);
      expect(r.citations[0]?.sourceUrl).toMatch(/tcmb\.gov\.tr/);
    },
    20_000,
  );
});
