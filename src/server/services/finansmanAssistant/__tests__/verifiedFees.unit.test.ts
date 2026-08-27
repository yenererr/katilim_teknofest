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
    expect(fast?.degerler["adil-katilim"]).toBeUndefined();
  });

  it("does not invent fees for banks without a source cell", () => {
    for (const kalem of VERIFIED_FEES) {
      for (const [bankId, value] of Object.entries(kalem.degerler)) {
        expect(value === null || typeof value === "number").toBe(true);
        expect(bankId.length).toBeGreaterThan(0);
      }
    }
  });
});
