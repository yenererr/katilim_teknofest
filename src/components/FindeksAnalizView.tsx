import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText,
  UploadCloud,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Percent,
  Building2,
  Sparkles,
  ArrowRight,
  RefreshCw,
  RotateCcw,
  Bot,
  Lightbulb,
  Award
} from 'lucide-react';
import { BANKALAR } from '../data/piyasa';
import { sayiBicim } from '../lib/finansman';

export interface BankOffer {
  bankId: string;
  bankName: string;
  approvalChance: number;
  rateDiscountPercent: number;
  note: string;
}

export interface FindeksAnalysisResult {
  isPdfExtracted?: boolean;
  isScoreExtracted?: boolean;
  parsingStatus?: 'parsed' | 'partial' | 'failed' | 'manual';
  extractionMethod?: string;
  pageCount?: number;
  textLength?: number;
  reportDate?: string | null;
  referenceCode?: string | null;
  score: number | null;
  riskGroup: string;
  totalLimitTl: number | null;
  availableLimitTl?: number | null;
  totalDebtTl: number | null;
  pastDueDebtTl: number | null;
  delayCount: number;
  followupCount?: number;
  followupDebtTl?: number | null;
  debtLimitRatioPercent?: number | null;
  worstPaymentStatus?: string | null;
  approvalChancePercent: number | null;
  monthlyIncomeTl: number;
  dtiPercent: number;
  dtiStatus: string;
  bankOffers: BankOffer[];
  summaryMessage: string;
  warnings?: string[];
  evidence?: Array<{ field: string; label: string; text: string }>;
}

interface FindeksAnalizViewProps {
  onAsistanaSor?: (soru: string) => void;
}

export const FindeksAnalizView: React.FC<FindeksAnalizViewProps> = ({ onAsistanaSor }) => {
  const [file, setFile] = useState<File | null>(null);
  const [monthlyIncome, setMonthlyIncome] = useState<number>(75000);
  const [manualScore, setManualScore] = useState<number>(1550);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FindeksAnalysisResult | null>(null);

  const handleFileUpload = async (uploadedFile: File) => {
    if (!uploadedFile || !uploadedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Lütfen geçerli bir Findeks PDF raporu yükleyin.');
      return;
    }

    setFile(uploadedFile);
    setIsAnalyzing(true);
    setError(null);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(uploadedFile);
      });

      const res = await fetch('/api/findeks/analyze-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: base64, monthlyIncome }),
      });

      if (!res.ok) {
        throw new Error('PDF analiz edilemedi.');
      }

      const data: FindeksAnalysisResult = await res.json();
      setResult(data);
    } catch (err) {
      setError('PDF okunurken bir hata oluştu. Dilerseniz manuel skor ile devam edebilirsiniz.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleManualAnalyze = async () => {
    setIsAnalyzing(true);
    setError(null);

    try {
      const res = await fetch('/api/findeks/analyze-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualScore, monthlyIncome }),
      });

      const data: FindeksAnalysisResult = await res.json();
      setResult(data);
    } catch {
      setError('Analiz hesaplanırken bir hata oluştu.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setFile(null);
    setError(null);
  };

  const formatOptionalTl = (value: number | null | undefined) => (
    value == null ? 'Okunamadı' : `${sayiBicim(value)} TL`
  );

  const formatOptionalPercent = (value: number | null | undefined) => (
    value == null ? 'Okunamadı' : `%${value.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`
  );

  const getScoreColor = (score: number | null) => {
    if (score == null) return 'text-txt-muted bg-sunken border-line';
    if (score >= 1700) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30';
    if (score >= 1500) return 'text-teal-500 bg-teal-500/10 border-teal-500/30';
    if (score >= 1100) return 'text-amber-500 bg-amber-500/10 border-amber-500/30';
    if (score >= 700) return 'text-orange-500 bg-orange-500/10 border-orange-500/30';
    return 'text-rose-500 bg-rose-500/10 border-rose-500/30';
  };

  const scoreText = result?.score == null ? 'Okunamadı' : String(result.score);
  const approvalText = result?.approvalChancePercent == null ? 'Okunamadı' : `%${result.approvalChancePercent}`;
  const isPdfBased = Boolean(result?.isPdfExtracted);

  return (
    <div className="space-y-8">
      {/* Banner / Header */}
      <div className="relative overflow-hidden rounded-2xl border border-brand-500/20 bg-gradient-to-br from-brand-900/30 via-surface to-brand-950/20 p-6 shadow-flat dark:from-brand-950/50 dark:via-surface sm:p-8">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-600 dark:text-brand-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>%100 On-Prem & KVKK Uyumlu Yerel Analiz</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-txt sm:text-3xl">
              Findeks Risk & Finansman Uygunluk Analizi
            </h1>
            <p className="text-sm leading-relaxed text-txt-secondary sm:text-base">
              Findeks Risk Raporunuzu PDF olarak yükleyin veya skorunuzu girin; tüm Katılım Bankaları için kişiye özel finansman onay ihtimalinizi ve indirimli kâr payı fırsatlarını anında hesaplayalım.
            </p>
          </div>

          {/* Direct External Link Button */}
          <div className="shrink-0 space-y-2 text-center lg:text-right">
            <a
              href="https://www.findeks.com/urunler/findeks-kredi-notu"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-brand-500/30 bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-brand-500 hover:shadow-brand-500/25 active:scale-98 sm:w-auto"
            >
              <FileText className="h-4.5 w-4.5" />
              <span>Findeks Raporu Al</span>
              <ExternalLink className="h-4 w-4 opacity-80" />
            </a>
            <p className="text-xs text-txt-muted">
              Resmî Findeks.com sayfasına yönlendirilirsiniz.
            </p>
          </div>
        </div>
      </div>

      {/* CONDITIONAL RENDER: Initial Form vs AI Summary Card */}
      {!result ? (
        /* Upload and Manual Entry Grid (Shown ONLY when no analysis yet) */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* PDF Uploader Card */}
          <div className="lg:col-span-2 rounded-2xl border border-line bg-surface p-6 shadow-raised transition-all hover:border-brand-500/30">
            <h2 className="flex items-center gap-2 text-base font-semibold text-txt">
              <UploadCloud className="h-5 w-5 text-brand-600 dark:text-brand-400" />
              <span>Findeks PDF Raporu Yükle</span>
            </h2>
            <p className="mt-1 text-xs text-txt-secondary">
              Findeks.com'dan indirdiğiniz `.pdf` formatındaki risk raporunu sürükleyip bırakın.
            </p>

            <label className="group mt-4 flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-sunken/50 p-6 text-center transition-all hover:border-brand-500 hover:bg-brand-500/5">
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const uploaded = e.target.files?.[0];
                  if (uploaded) handleFileUpload(uploaded);
                }}
              />
              {isAnalyzing ? (
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="h-8 w-8 animate-spin text-brand-600 dark:text-brand-400" />
                  <span className="text-xs font-medium text-txt-secondary">
                    PDF Metinleri ve Risk Tablosu Okunuyor…
                  </span>
                </div>
              ) : file ? (
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                  <span className="text-sm font-semibold text-txt">{file.name}</span>
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">
                    PDF Yüklendi ve Analiz Edildi!
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <UploadCloud className="h-9 w-9 text-txt-muted transition-transform group-hover:scale-110 group-hover:text-brand-600" />
                  <span className="text-sm font-medium text-txt group-hover:text-brand-600">
                    PDF Raporunu Buraya Sürükleyin veya Dosya Seçin
                  </span>
                  <span className="text-xs text-txt-muted">Maksimum 15 MB · Yalnızca yerel bellek işlemcisi</span>
                </div>
              )}
            </label>
          </div>

          {/* Manual Input Card */}
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-raised flex flex-col justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-txt">
                <Percent className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                <span>Manuel Not & Gelir Girdisi</span>
              </h2>
              <p className="mt-1 text-xs text-txt-secondary">
                Raporunuz yanınızda değilse Findeks notunuzu manuel yazabilirsiniz.
              </p>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-txt-secondary">
                    Findeks Kredi Notu (1 - 1900)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1900"
                    value={manualScore}
                    onChange={(e) => setManualScore(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-xl border border-line bg-sunken px-3.5 py-2.5 text-sm font-semibold text-txt outline-none transition-focus focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-txt-secondary">
                    Aylık Net Gelir (TL)
                  </label>
                  <input
                    type="number"
                    step="5000"
                    value={monthlyIncome}
                    onChange={(e) => setMonthlyIncome(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-xl border border-line bg-sunken px-3.5 py-2.5 text-sm font-semibold text-txt outline-none transition-focus focus:border-brand-500"
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleManualAnalyze}
              disabled={isAnalyzing}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-xs font-semibold text-white transition-all hover:bg-brand-500 active:scale-98 disabled:opacity-50"
            >
              <span>Analiz Et</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        /* AI FINDESK ÖZET & DEĞERLENDİRME PANELDİR (Analiz Sonrası Ekranı) */
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border border-brand-500/30 bg-gradient-to-r from-brand-950/40 via-surface to-brand-900/20 p-6 shadow-raised dark:from-brand-950/70"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-txt flex items-center gap-2">
                  <span>Yapay Zekâ Findeks Risk Değerlendirme Raporu</span>
                  <span className="rounded-full bg-brand-500/10 px-2.5 py-0.5 text-xs font-semibold text-brand-600 dark:text-brand-400">
                    Yerel NLP Özeti
                  </span>
                </h2>
                <p className="text-xs text-txt-secondary">
                  {file ? `Yüklenen Rapor: ${file.name}` : 'Girilen Finansal Parametrelere Göre Oluşturuldu'}
                </p>
                {result.extractionMethod && (
                  <p className="mt-1 text-[11px] text-txt-muted">
                    {isPdfBased
                      ? `${result.pageCount || 0} sayfa, ${result.textLength || 0} karakter okundu · ${result.extractionMethod}`
                      : 'Manuel giriş'}
                    {result.reportDate ? ` · Rapor tarihi: ${result.reportDate}` : ''}
                  </p>
                )}
              </div>
            </div>

            {/* Reset / Re-upload Button */}
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-line bg-sunken px-4 text-xs font-semibold text-txt transition-colors hover:bg-surface hover:border-brand-500/30"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Yeni Rapor Yükle / Yeniden Hesapla</span>
            </button>
          </div>

          {/* Executive Insights & Bullet Points */}
          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-3">
              <p className="text-sm leading-relaxed text-txt font-medium">
                {result.summaryMessage ? result.summaryMessage.replace(/\*\*/g, '') : (
                  <>
                    Sayın Müşterimiz, Findeks Kredi Notunuz <span className="font-bold text-brand-600 dark:text-brand-400">{scoreText} ({result.riskGroup})</span> olarak değerlendirilmiştir.
                  </>
                )}
              </p>
              <div className="grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-2">
                <div className="flex items-start gap-2 rounded-xl border border-line bg-sunken/40 p-3">
                  <Award className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <div>
                    <span className="font-semibold text-txt">Rapor Kaynağı</span>
                    <p className="mt-0.5 text-txt-secondary">
                      {isPdfBased
                        ? 'Değerler yüklediğiniz PDF metin katmanından çıkarıldı; uydurma örnek veri kullanılmadı.'
                        : 'Değerlendirme manuel girdiğiniz skor üzerinden hesaplandı.'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-xl border border-line bg-sunken/40 p-3">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div>
                    <span className="font-semibold text-txt">BDDK Gelir Dengesi (%{result.dtiPercent})</span>
                    <p className="mt-0.5 text-txt-secondary">
                      Okunan toplam borç ve girdiğiniz aylık gelirle tahmini borç/gelir dengesi hesaplandı.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Status Pill */}
            <div className="flex flex-col items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/5 p-4 text-center">
              <span className="text-xs font-semibold text-txt-muted uppercase tracking-wider">AI Tavsiyesi</span>
              <span className={`mt-1 text-sm font-bold ${
                (result.approvalChancePercent || 0) >= 80
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : (result.approvalChancePercent || 0) >= 50
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-risk-600 dark:text-risk-300'
              }`}>
                {result.approvalChancePercent == null
                  ? 'Skor okunamadı'
                  : result.approvalChancePercent >= 80
                    ? 'Yüksek onay beklentisi'
                    : result.approvalChancePercent >= 50
                      ? 'Standart değerlendirme'
                      : 'Dikkatli değerlendirme gerekli'}
              </span>
              <p className="mt-1 text-xs text-txt-secondary">
                Bu oran kesin onay değil; banka gelir, teminat, ürün ve başvuru koşullarını ayrıca değerlendirir. Tahmini onay ihtimali: {approvalText}.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-risk-300 bg-risk-50 p-4 text-xs font-medium text-risk-900 dark:border-risk-800 dark:bg-risk-950 dark:text-risk-100">
          <AlertCircle className="h-4 w-4 shrink-0 text-risk-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Analysis Results Display */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Main Cards: Gauge & Financial Stats */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Score & Risk Group Card */}
            <div className="rounded-2xl border border-line bg-surface p-6 shadow-raised text-center flex flex-col items-center justify-center">
              <span className="text-xs font-medium text-txt-muted">Findeks Kredi Notu</span>
              <div className="my-3 text-4xl font-extrabold tracking-tight text-brand-600 dark:text-brand-400">
                {scoreText} <span className="text-xs font-normal text-txt-muted">/ 1900</span>
              </div>
              <div className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs font-semibold ${getScoreColor(result.score)}`}>
                <TrendingUp className="h-3.5 w-3.5" />
                <span>Risk Grubu: {result.riskGroup}</span>
              </div>
            </div>

            {/* Approval Chance Card */}
            <div className="rounded-2xl border border-line bg-surface p-6 shadow-raised text-center flex flex-col items-center justify-center">
              <span className="text-xs font-medium text-txt-muted">Tahmini Onay İhtimali</span>
              <div className="my-3 text-4xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
                {approvalText}
              </div>
              <span className="text-xs font-medium text-txt-secondary">
                {result.approvalChancePercent == null
                  ? 'Skor bulunamadığı için hesaplanmadı'
                  : result.approvalChancePercent >= 80
                    ? 'Yüksek Onay Beklentisi'
                    : 'Standart Risk Değerlendirmesi'}
              </span>
            </div>

            {/* DTI & Debt Ratio Card */}
            <div className="rounded-2xl border border-line bg-surface p-6 shadow-raised text-center flex flex-col items-center justify-center">
              <span className="text-xs font-medium text-txt-muted">BDDK Borç/Gelir (DTI) Oranı</span>
              <div className="my-3 text-4xl font-extrabold tracking-tight text-txt">
                {formatOptionalPercent(result.dtiPercent)}
              </div>
              <span className={`text-xs font-medium ${result.dtiPercent <= 50 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {result.dtiStatus}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="text-[11px] font-medium text-txt-muted">Toplam Limit</p>
              <p className="mt-1 text-sm font-semibold text-txt">{formatOptionalTl(result.totalLimitTl)}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="text-[11px] font-medium text-txt-muted">Kullanılabilir Limit</p>
              <p className="mt-1 text-sm font-semibold text-txt">{formatOptionalTl(result.availableLimitTl)}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="text-[11px] font-medium text-txt-muted">Toplam Borç</p>
              <p className="mt-1 text-sm font-semibold text-txt">{formatOptionalTl(result.totalDebtTl)}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="text-[11px] font-medium text-txt-muted">Borç / Limit</p>
              <p className="mt-1 text-sm font-semibold text-txt">{formatOptionalPercent(result.debtLimitRatioPercent)}</p>
            </div>
          </div>

          {result.warnings && result.warnings.length > 0 && (
            <div className="rounded-2xl border border-warn-200 bg-warn-50 p-4 text-xs text-warn-900 dark:border-warn-900 dark:bg-warn-950 dark:text-warn-100">
              <p className="font-semibold">Okuma uyarıları</p>
              <ul className="mt-2 space-y-1">
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {result.evidence && result.evidence.length > 0 && (
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-raised">
              <h3 className="text-sm font-semibold text-txt">PDF'den Okunan Kanıt Satırları</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {result.evidence.map((item) => (
                  <div key={`${item.field}-${item.text}`} className="rounded-xl border border-line bg-sunken/50 p-3">
                    <p className="text-[11px] font-semibold text-brand-700 dark:text-brand-300">{item.label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-txt-secondary">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bank Offers Matrix */}
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-raised">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-txt">
                  Katılım Bankaları Kişiye Özel Kâr Payı & Onay Matrisi
                </h3>
                <p className="text-xs text-txt-secondary">
                  Findeks skorunuza göre bankaların sunduğu özel kâr payı indirimleri.
                </p>
              </div>

              {onAsistanaSor && (
                <button
                  type="button"
                  onClick={() => onAsistanaSor(
                    result.score == null
                      ? 'Findeks raporum okundu ama kredi notu bulunamadı; uygun katılım finansmanı için nasıl ilerlemeliyim?'
                      : `Findeks notum ${result.score} (${result.riskGroup}), toplam borcum ${formatOptionalTl(result.totalDebtTl)}; en uygun katılım bankası tekliflerini incelemek istiyorum`
                  )}
                  className="inline-flex items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3.5 py-2 text-xs font-semibold text-brand-600 transition-all hover:bg-brand-500/20 dark:text-brand-400"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Sesli Asistana Sor</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line bg-sunken/60 text-txt-secondary">
                    <th className="px-4 py-3 font-semibold">Katılım Bankası</th>
                    <th className="px-4 py-3 font-semibold">Tahmini Onay İhtimali</th>
                    <th className="px-4 py-3 font-semibold">Kişiye Özel Kâr Payı İndirimi</th>
                    <th className="px-4 py-3 font-semibold">Bankacılık Notu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {result.bankOffers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-5 text-center text-txt-secondary">
                        Skor okunamadığı için banka bazlı tahmini onay matrisi oluşturulmadı.
                      </td>
                    </tr>
                  )}
                  {result.bankOffers.map((offer) => {
                    const bankMeta = BANKALAR.find((b) => b.id === offer.bankId);
                    return (
                      <tr key={offer.bankId} className="transition-colors hover:bg-sunken/40">
                        <td className="px-4 py-3.5 font-semibold text-txt">
                          <div className="flex items-center gap-2.5">
                            {bankMeta?.logo ? (
                              <img src={bankMeta.logo} alt={offer.bankName} className="h-5 w-5 object-contain" />
                            ) : (
                              <Building2 className="h-4 w-4 text-brand-600" />
                            )}
                            <span>{offer.bankName}</span>
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-20 overflow-hidden rounded-full bg-sunken">
                              <div
                                className="h-full bg-brand-600 transition-all duration-500"
                                style={{ width: `${offer.approvalChance}%` }}
                              />
                            </div>
                            <span className="font-semibold text-txt">%{offer.approvalChance}</span>
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          {offer.rateDiscountPercent > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              -%{offer.rateDiscountPercent.toFixed(2)} İndirimli
                            </span>
                          ) : (
                            <span className="text-txt-muted">Standart Oran</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-txt-secondary">
                          {offer.note}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};
