import { describe, expect, it } from "vitest";
import {
  getVerifiedFeeMatrix,
  VERIFIED_FEES,
} from "../../../../data/verifiedFees";

describe("verifiedFees", () => {
  it("exposes a non-empty matrix with known digital free fees", () => {
    const matrix = getVerifiedFeeMatrix();
    expect(matrix.items.length).toBeGreaterThan(0);
    expect(matrix.sources.length).toBeGreaterThan(0);

    const fast = VERIFIED_FEES.find((k) => k.key === "fast");
    expect(fast?.degerler["vakif-katilim"]).toBe(0);
    expect(fast?.degerler["kuveyt-turk"]).toBe(0);
    expect(fast?.degerler.albaraka).toBe(0);
    expect(fast?.degerler["hayat-finans"]).toBe(0);
    expect(fast?.degerler["tom-katilim"]).toBe(0);
    expect(fast?.degerler["adil-katilim"]).toBeUndefined();
    expect(fast?.degerler["emlak-katilim"]).toBeUndefined();
    expect(fast?.degerler["dunya-katilim"]).toBeUndefined();

    const eft = VERIFIED_FEES.find((k) => k.key === "eft");
    expect(eft?.degerler["dunya-katilim"]).toBe(0);
    expect(eft?.degerler["emlak-katilim"]).toBe(0);
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
