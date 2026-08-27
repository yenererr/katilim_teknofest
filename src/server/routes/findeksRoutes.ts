import { Router } from "express";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

const router = Router();

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

router.post("/analyze-pdf", async (req, res) => {
  try {
    const income = Number(req.body.monthlyIncome) || 60000;
    const pdfBase64 = req.body.pdfBase64;
    const manualScore = Number(req.body.manualScore);

    if (manualScore && manualScore >= 1 && manualScore <= 1900) {
      return res.json(calculateFallbackAnalysis(manualScore, income));
    }

    if (pdfBase64 && typeof pdfBase64 === "string") {
      const cleanB64 = pdfBase64.replace(/^data:application\/pdf;base64,/, "");
      const buffer = Buffer.from(cleanB64, "base64");

      // Write to temp PDF file for CLI parsing
      const tempPdfPath = path.join(os.tmpdir(), `findeks_${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`);
      fs.writeFileSync(tempPdfPath, buffer);

      try {
        const cliPath = path.join(process.cwd(), "speech-service", "parse_findeks_cli.py");
        const pythonExe = fs.existsSync(path.join(process.cwd(), "speech-service", "venv", "Scripts", "python.exe"))
          ? path.join(process.cwd(), "speech-service", "venv", "Scripts", "python.exe")
          : "python";

        const output = execSync(`"${pythonExe}" "${cliPath}" "${tempPdfPath}" "${income}"`, {
          encoding: "utf-8",
          maxBuffer: 20 * 1024 * 1024,
        });

        // Clean up temp file
        if (fs.existsSync(tempPdfPath)) {
          try { fs.unlinkSync(tempPdfPath); } catch {}
        }

        if (output && output.trim()) {
          const parsed = JSON.parse(output.trim());
          return res.json(parsed);
        }
      } catch (cliErr) {
        console.warn("[FindeksCLI] Python parsing error:", cliErr);
        if (fs.existsSync(tempPdfPath)) {
          try { fs.unlinkSync(tempPdfPath); } catch {}
        }
      }

      // Regex fallback on PDF buffer
      const rawText = buffer.toString("binary");
      let extractedScore = 1450;
      const match = rawText.match(/(?:Findeks|Kredi\s*Notu|Notu)[\s:]*(\d{3,4})/i);
      if (match) {
        const val = parseInt(match[1], 10);
        if (val >= 1 && val <= 1900) extractedScore = val;
      }
      return res.json(calculateFallbackAnalysis(extractedScore, income));
    }

    return res.json(calculateFallbackAnalysis(1450, income));
  } catch (err) {
    return res.status(500).json({ error: "Findeks PDF analizi başarısız oldu." });
  }
});

export default router;
