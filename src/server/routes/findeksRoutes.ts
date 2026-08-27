import { Router } from "express";
import { execFileSync } from "child_process";
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

  return {
    isPdfExtracted: false,
    isScoreExtracted: true,
    parsingStatus: "manual",
    extractionMethod: "manual_score",
    pageCount: 0,
    textLength: 0,
    reportDate: null,
    referenceCode: null,
    score,
    riskGroup,
    totalLimitTl: null,
    availableLimitTl: null,
    totalDebtTl: null,
    pastDueDebtTl: null,
    delayCount: 0,
    followupCount: 0,
    followupDebtTl: null,
    debtLimitRatioPercent: null,
    worstPaymentStatus: null,
    approvalChancePercent: approvalChance,
    monthlyIncomeTl: income || 60000,
    dtiPercent: 0,
    dtiStatus: "Rapor yüklenmediği için borç/gelir hesaplanmadı",
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
    summaryMessage: `Findeks Notunuz **${score} (${riskGroup})** manuel girişten alındı. Tahmini finansman onay ihtimali **%${approvalChance}**.`,
    warnings: ["Manuel skor girildiği için rapordan limit, borç, gecikme ve takip alanları okunmadı."],
    evidence: [],
  };
}

function resolvePythonCandidates(): string[] {
  const candidates = [
    process.env.FINDEKS_PYTHON,
    path.join(process.cwd(), "speech-service", "venv", "Scripts", "python.exe"),
    "python",
    "python3",
    "py",
  ].filter(Boolean) as string[];

  return [...new Set(candidates)];
}

function parseFindeksPdfWithPython(tempPdfPath: string, income: number) {
  const cliPath = path.join(process.cwd(), "speech-service", "parse_findeks_cli.py");
  const errors: string[] = [];

  for (const pythonExe of resolvePythonCandidates()) {
    if (pythonExe.includes(path.sep) && !fs.existsSync(pythonExe)) continue;

    try {
      const output = execFileSync(pythonExe, [cliPath, tempPdfPath, String(income)], {
        encoding: "utf-8",
        maxBuffer: 20 * 1024 * 1024,
        timeout: 60_000,
        windowsHide: true,
      });
      const trimmed = output.trim();
      if (!trimmed) {
        errors.push(`${pythonExe}: boş çıktı`);
        continue;
      }
      return JSON.parse(trimmed);
    } catch (err) {
      errors.push(`${pythonExe}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const detail = errors.length > 0 ? errors.join(" | ") : "Python çalıştırıcısı bulunamadı.";
  throw new Error(`Findeks PDF parser çalıştırılamadı. ${detail}`);
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
      if (!buffer.length || buffer.subarray(0, 4).toString("utf-8") !== "%PDF") {
        return res.status(400).json({ error: "Yüklenen dosya geçerli bir PDF değil." });
      }

      const tempPdfPath = path.join(os.tmpdir(), `findeks_${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`);
      fs.writeFileSync(tempPdfPath, buffer);

      try {
        const parsed = parseFindeksPdfWithPython(tempPdfPath, income);
        return res.json(parsed);
      } finally {
        if (fs.existsSync(tempPdfPath)) try { fs.unlinkSync(tempPdfPath); } catch {}
      }
    }

    return res.status(400).json({ error: "Analiz için Findeks PDF raporu veya manuel skor girilmelidir." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Findeks PDF analizi başarısız oldu.";
    return res.status(500).json({ error: message });
  }
});

export default router;
