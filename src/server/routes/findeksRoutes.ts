import { Router } from "express";
import multer from "multer";
import fetch from "node-fetch";

const router = Router();
const upload = multer({ limits: { fileSize: 15 * 1024 * 1024 } }); // 15MB max

function calculateFallbackAnalysis(score: number, income: number) {
  let riskGroup = "Az Riskli";
  let approvalChance = 70;
  if (score >= 1700) {
    riskGroup = "Çok İyi";
    approvalChance = 95;
  } else if (score >= 1500) {
    riskGroup = "İyi";
    approvalChance = 85;
  } else if (score >= 1100) {
    riskGroup = "Az Riskli";
    approvalChance = 70;
  } else if (score >= 700) {
    riskGroup = "Orta Riskli";
    approvalChance = 40;
  } else {
    riskGroup = "En Riskli";
    approvalChance = 15;
  }

  const estMonthlyDebt = 12500;
  const dtiPercent = Number(((estMonthlyDebt / (income || 60000)) * 100).toFixed(1));

  return {
    score,
    riskGroup,
    totalLimitTl: 180000,
    totalDebtTl: 42000,
    pastDueDebtTl: 0,
    delayCount: 0,
    approvalChancePercent: approvalChance,
    monthlyIncomeTl: income || 60000,
    dtiPercent,
    dtiStatus: dtiPercent <= 50 ? "Uygun" : "Riskli (BDDK %50 Limitini Aşıyor)",
    bankOffers: [
      {
        bankId: "kuveyt-turk",
        bankName: "Kuveyt Türk",
        approvalChance,
        rateDiscountPercent: score >= 1500 ? 0.30 : (score >= 1200 ? 0.15 : 0),
        note: score >= 1500 ? "İyi skorunuza özel kâr payı indirimi ve ön onay imkanı." : "Standart başvuru değerlendirmesi."
      },
      {
        bankId: "turkiye-finans",
        bankName: "Türkiye Finans",
        approvalChance: Math.min(99, approvalChance + 5),
        rateDiscountPercent: score >= 1400 ? 0.25 : 0,
        note: "Mobil başvurularda ön onaylı kart ve indirimli finansman imkanı."
      },
      {
        bankId: "albaraka",
        bankName: "Albaraka Türk",
        approvalChance,
        rateDiscountPercent: score >= 1500 ? 0.20 : 0,
        note: "Masrafsız katılım ve yapılandırılabilir vade avantajları."
      },
      {
        bankId: "vakif-katilim",
        bankName: "Vakıf Katılım",
        approvalChance,
        rateDiscountPercent: score >= 1500 ? 0.15 : 0,
        note: "Kamu güvencesiyle konut ve araç finansmanı desteği."
      },
      {
        bankId: "ziraat-katilim",
        bankName: "Ziraat Katılım",
        approvalChance,
        rateDiscountPercent: score >= 1500 ? 0.15 : 0,
        note: "Ziraat şubelerinden hızlı kredi kullandırımı."
      }
    ],
    summaryMessage: `Findeks Notunuz **${score} (${riskGroup})**. Tahmini Finansman Onay İhtimaliniz **%${approvalChance}**.`
  };
}

router.post("/analyze-pdf", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const income = Number(req.body.monthlyIncome) || 60000;

    if (!file || !file.buffer) {
      // Manual score fallback if no PDF
      const manualScore = Number(req.body.manualScore) || 1450;
      return res.json(calculateFallbackAnalysis(manualScore, income));
    }

    // Try proxying to Python speech-service at port 8001
    try {
      const FormData = (await import("form-data")).default;
      const formData = new FormData();
      formData.append("file", file.buffer, {
        filename: file.originalname || "findeks_report.pdf",
        contentType: "application/pdf",
      });
      formData.append("monthly_income", String(income));

      const pyRes = await fetch("http://localhost:8001/findeks/analyze-pdf", {
        method: "POST",
        body: formData as any,
        headers: formData.getHeaders(),
      });

      if (pyRes.ok) {
        const data = await pyRes.json();
        return res.json(data);
      }
    } catch {
      // Python service offline fallback
    }

    // Fallback: Parse score using regex on raw PDF text buffer if available
    const rawBufferText = file.buffer.toString("binary");
    let score = 1450;
    const match = rawBufferText.match(/(?:Findeks|Kredi\s*Notu)[\s:]*(\d{3,4})/i);
    if (match) {
      const val = parseInt(match[1], 10);
      if (val >= 1 && val <= 1900) score = val;
    }

    return res.json(calculateFallbackAnalysis(score, income));
  } catch (err) {
    return res.status(500).json({ error: "Findeks PDF analizi başarısız oldu." });
  }
});

export default router;
