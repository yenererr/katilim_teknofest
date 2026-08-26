import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  VAKIF_FINANSMAN_KODLARI,
  getVakifVadeSecenekleri,
  hesaplaVakifKatilim,
  VakifKisitHatasi,
  type VakifFinansmanTuru,
} from "../services/calculators/vakifKatilimCalculator";
import {
  hesaplaZiraatKatilim,
  ZiraatKisitHatasi,
  ZIRAAT_FINANSMAN_EID,
  type ZiraatFinansmanTuru,
} from "../services/calculators/ziraatKatilimCalculator";
import {
  hesaplaKuveytTurk,
  KuveytKisitHatasi,
  resolveKuveytProduct,
} from "../services/calculators/kuveytTurkCalculator";
import { bicimleOdemePlani, hesaplaOdemePlani } from "../../lib/odemePlani";

const finansmanTuru = z.enum(
  Object.keys(VAKIF_FINANSMAN_KODLARI) as [VakifFinansmanTuru, ...VakifFinansmanTuru[]],
);

const hesaplaBody = z.object({
  financingType: finansmanTuru,
  amountTl: z.number().positive().max(100_000_000),
  termMonths: z.number().int().positive().max(360),
  profitRatePercent: z.number().positive().max(100).nullable().optional(),
  calculateType: z.enum(["1", "2"]).optional().default("1"),
});

const odemePlaniBody = z.object({
  financingType: finansmanTuru.optional(),
  amountTl: z.number().positive().max(100_000_000),
  termMonths: z.number().int().positive().max(360),
  profitRatePercent: z.number().positive().max(100),
  mortgageFeeTl: z.number().min(0).optional(),
  appraisalFeeTl: z.number().min(0).optional(),
});

async function handleOdemePlani(req: Request, res: Response) {
  const parsed = odemePlaniBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Geçersiz istek gövdesi.",
      details: parsed.error.flatten(),
    });
  }
  try {
    let profitRatePercent = parsed.data.profitRatePercent;
    let mortgageFeeTl = parsed.data.mortgageFeeTl ?? 0;
    let appraisalFeeTl = parsed.data.appraisalFeeTl ?? 0;

    if (parsed.data.financingType) {
      try {
        const canli = await hesaplaVakifKatilim({
          financingType: parsed.data.financingType,
          amountTl: parsed.data.amountTl,
          termMonths: parsed.data.termMonths,
          profitRatePercent: parsed.data.profitRatePercent,
          calculateType: "1",
        });
        if (canli.profitRatePercent != null) {
          profitRatePercent = canli.profitRatePercent;
        }
        if (canli.mortgageReleaseFeeTl != null) {
          mortgageFeeTl = canli.mortgageReleaseFeeTl;
        }
        if (canli.appraisementFeeTl != null) {
          appraisalFeeTl = canli.appraisementFeeTl;
        }
      } catch {
        // Yerel oranla devam
      }
    }

    const detay = hesaplaOdemePlani({
      amountTl: parsed.data.amountTl,
      termMonths: parsed.data.termMonths,
      profitRatePercent,
      financingType: parsed.data.financingType,
      mortgageFeeTl,
      appraisalFeeTl,
    });
    return res.json(bicimleOdemePlani(detay));
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Ödeme planı hesaplanamadı.";
    return res.status(400).json({ error: message });
  }
}

function isZiraatTur(t: string): t is ZiraatFinansmanTuru {
  return t in ZIRAAT_FINANSMAN_EID;
}

export function createCalculatorRouter(): Router {
  const router = Router();

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
        return res.json({ available: false, reason: message });
      }
      console.warn("[Hesaplama][vakif-katilim]", message);
      return res.status(502).json({ error: message });
    }
  });

  router.post("/ziraat-katilim", async (req, res) => {
    const parsed = hesaplaBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Geçersiz istek gövdesi.",
        details: parsed.error.flatten(),
      });
    }
    if (!isZiraatTur(parsed.data.financingType)) {
      return res.json({
        available: false,
        reason: "Ziraat Katılım bu finansman türü için çevrim içi hesaplama sunmuyor.",
      });
    }
    try {
      const sonuc = await hesaplaZiraatKatilim({
        financingType: parsed.data.financingType,
        amountTl: parsed.data.amountTl,
        termMonths: parsed.data.termMonths,
        profitRatePercent: parsed.data.profitRatePercent,
      });
      return res.json(sonuc);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Hesaplama yapılamadı.";
      if (err instanceof ZiraatKisitHatasi) {
        return res.json({ available: false, reason: message });
      }
      console.warn("[Hesaplama][ziraat-katilim]", message);
      return res.status(502).json({ error: message });
    }
  });

  router.post("/kuveyt-turk", async (req, res) => {
    const parsed = hesaplaBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Geçersiz istek gövdesi.",
        details: parsed.error.flatten(),
      });
    }
    if (!resolveKuveytProduct(parsed.data.financingType)) {
      return res.json({
        available: false,
        reason: "Kuveyt Türk bu finansman türü için çevrim içi hesaplama sunmuyor.",
      });
    }
    try {
      const sonuc = await hesaplaKuveytTurk({
        financingType: parsed.data.financingType,
        amountTl: parsed.data.amountTl,
        termMonths: parsed.data.termMonths,
        profitRatePercent: parsed.data.profitRatePercent,
        calculateType: parsed.data.calculateType,
      });
      return res.json(sonuc);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Hesaplama yapılamadı.";
      if (err instanceof KuveytKisitHatasi) {
        return res.json({ available: false, reason: message });
      }
      console.warn("[Hesaplama][kuveyt-turk]", message);
      return res.status(502).json({ error: message });
    }
  });

  router.post("/odeme-plani", (req, res) => {
    void handleOdemePlani(req, res);
  });
  router.post("/vakif-katilim/odeme-plani", (req, res) => {
    void handleOdemePlani(req, res);
  });

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
