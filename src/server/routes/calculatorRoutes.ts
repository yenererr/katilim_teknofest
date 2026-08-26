import { Router } from "express";
import { z } from "zod";
import {
  VAKIF_FINANSMAN_KODLARI,
  getVakifVadeSecenekleri,
  hesaplaVakifKatilim,
  VakifKisitHatasi,
  type VakifFinansmanTuru,
} from "../services/calculators/vakifKatilimCalculator";

const finansmanTuru = z.enum(
  Object.keys(VAKIF_FINANSMAN_KODLARI) as [VakifFinansmanTuru, ...VakifFinansmanTuru[]],
);

const hesaplaBody = z.object({
  financingType: finansmanTuru,
  amountTl: z.number().positive().max(100_000_000),
  termMonths: z.number().int().positive().max(360),
});

export function createCalculatorRouter(): Router {
  const router = Router();

  /** Bankanın kendi hesaplama aracıyla birebir aynı sonucu döndürür. */
  router.post("/vakif-katilim", async (req, res) => {
    const parsed = hesaplaBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Geçersiz istek gövdesi.",
        details: parsed.error.flatten(),
      });
    }
    try {
      const sonuc = await hesaplaVakifKatilim(parsed.data);
      return res.json(sonuc);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Hesaplama yapılamadı.";
      if (err instanceof VakifKisitHatasi) {
        // Bankanın kendi kısıtı: 200 döner, arayüz mesajı kullanıcıya gösterir.
        return res.json({ available: false, reason: message });
      }
      console.warn("[Hesaplama][vakif-katilim]", message);
      return res.status(502).json({ error: message });
    }
  });

  /** Seçilen finansman türü için bankanın sunduğu vade seçenekleri. */
  router.get("/vakif-katilim/vadeler", async (req, res) => {
    const tur = finansmanTuru.safeParse(req.query.financingType);
    if (!tur.success) {
      return res.status(400).json({ error: "Geçersiz finansman türü." });
    }
    try {
      const vadeler = await getVakifVadeSecenekleri(tur.data);
      return res.json({ financingType: tur.data, termMonths: vadeler });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Vade listesi alınamadı.";
      return res.status(502).json({ error: message });
    }
  });

  return router;
}
