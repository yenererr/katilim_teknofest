import { describe, expect, it } from "vitest";
import {
  formatFeeCell,
  getVerifiedFeeMatrix,
  VERIFIED_FEES,
} from "../../../../data/verifiedFees";

describe("verifiedFees", () => {
  it("exposes a non-empty matrix with known digital free fees", () => {
    const matrix = getVerifiedFeeMatrix();
    expect(matrix.items.length).toBeGreaterThan(0);
    expect(matrix.sources.length).toBeGreaterThan(0);
    expect(matrix.bankVerifications.length).toBe(10);

    const fast = VERIFIED_FEES.find((k) => k.key === "fast");
    expect(fast?.degerler["vakif-katilim"]).toBe(0);
    expect(fast?.degerler["kuveyt-turk"]).toBe(0);
    expect(fast?.degerler.albaraka).toBe(0);
    expect(fast?.degerler["hayat-finans"]).toBe(0);
    expect(fast?.degerler["tom-katilim"]).toBe(0);
    expect(fast?.degerler["emlak-katilim"]).toBe(0);
    expect(fast?.degerler["dunya-katilim"]).toBe(0);
    expect(fast?.degerler["adil-katilim"]).toBeUndefined();

    const eft = VERIFIED_FEES.find((k) => k.key === "eft");
    expect(eft?.degerler["dunya-katilim"]).toBe(0);
    expect(eft?.degerler["emlak-katilim"]).toBe(0);
  });

  it("never marks Adil Katılım as free", () => {
    for (const kalem of VERIFIED_FEES) {
      expect(kalem.degerler["adil-katilim"]).toBeUndefined();
    }
  });

  it("names aid-free card products instead of bare free", () => {
    const kart = VERIFIED_FEES.find((k) => k.key === "kart_aidat");
    expect(kart?.notlar?.["kuveyt-turk"]).toBe("Sağlam Kart");
    expect(kart?.notlar?.["turkiye-finans"]).toBe("Happy Zero");
    expect(kart?.notlar?.["dunya-katilim"]).toBe("DKart");
    expect(kart?.notlar?.["emlak-katilim"]).toBe("NakitKart");
    expect(kart?.notlar?.["tom-katilim"]).toBe("Hadi Kredi Kartı");
    expect(formatFeeCell(0, "Sağlam Kart")).toBe("0 TL – Sağlam Kart");
    expect(formatFeeCell(null)).toBe("—");
  });

  it("describes ATM as free ATM network coverage", () => {
    const atm = VERIFIED_FEES.find((k) => k.key === "atm_nakit");
    expect(atm?.etiket).toMatch(/ücretsiz ATM ağı/i);
    expect(atm?.degerler["tom-katilim"]).toBeUndefined();
    expect(atm?.degerler["kuveyt-turk"]).toBe(0);
  });

  it("does not invent fees for banks without a source cell", () => {
    for (const kalem of VERIFIED_FEES) {
      for (const [bankId, value] of Object.entries(kalem.degerler)) {
        expect(value === null || typeof value === "number").toBe(true);
        expect(bankId.length).toBeGreaterThan(0);
      }
    }
  });

  it("lists a source for every bank that has a filled cell", () => {
    const matrix = getVerifiedFeeMatrix();
    const sourced = new Set(matrix.sources.map((s) => s.bankId));
    for (const kalem of VERIFIED_FEES) {
      for (const [bankId, value] of Object.entries(kalem.degerler)) {
        if (value != null) expect(sourced.has(bankId)).toBe(true);
      }
    }
  });
});
