import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { TopNav } from './components/TopNav';
import { SideRail, SonIslem } from './components/SideRail';
import { TabKey, TAB_TITLES } from './components/nav';
import { HomeView, KarsilastirmaTalebi } from './components/HomeView';
import { FinansmanView } from './components/FinansmanView';
import { FeesView } from './components/FeesView';
import { CampaignsView } from './components/CampaignsView';
import { Dashboard } from './components/Dashboard';
import { CampaignList } from './components/CampaignList';
import { SamplePicker } from './components/SamplePicker';
import { TextInspector } from './components/TextInspector';
import { ProductCard } from './components/ProductCard';
import { JsonViewer } from './components/JsonViewer';
import { CompareView } from './components/CompareView';
import { TerminologyGuide } from './components/TerminologyGuide';
import { ToastProvider, useToast } from './components/Toast';
import { SAMPLE_BANK_TEXTS } from './data/samples';
import { FINANSMAN_TURLERI, VERI_TARIHI } from './data/piyasa';
import { sayiBicim } from './lib/finansman';
import { ExtractionResponse, KatilimUrunu, SampleBankText } from './types';
import { KarsilastirmaOgesi } from './lib/compare';
import {
  Sparkles,
  AlertTriangle,
  Layers,
  FileCode2,
  RefreshCw,
  X,
  Scale,
  DatabaseZap,
  Zap,
  Lock,
} from 'lucide-react';

const LOADING_STEPS = [
  'Metin ayrıştırılıyor…',
  'Konvansiyonel terimler katılım karşılıklarına eşleniyor…',
  'Oran, vade ve tutar değerleri normalize ediliyor…',
  'Kanıt alıntıları ve güven skorları hesaplanıyor…',
];

interface HistoryEntry {
  id: string;
  text: string;
  products: KatilimUrunu[];
  timestamp: string;
  bankName?: string;
}

/** Sol paneldeki “son işlemler” listesi — hem karşılaştırmalar hem çıkarımlar. */
interface KarsilastirmaKaydi extends KarsilastirmaTalebi {
  id: string;
  zaman: string;
}

const VARSAYILAN_TALEP: KarsilastirmaTalebi = {
  tur: 'tasit_finansmani',
  tutar: 500_000,
  vadeAy: 24,
};

const useTheme = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const stored = window.localStorage.getItem('katilim-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem('katilim-theme', theme);
  }, [theme]);

  return { theme, toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) };
};

/** Metni örnek şablonlarla eşleştirerek banka adını bulur. */
const bankaAdiCoz = (text: string): string => {
  const eslesen = SAMPLE_BANK_TEXTS.find((s) => s.text === text);
  return eslesen?.bankName ?? 'Elle girilen metin';
};

const saatDamgasi = () =>
  new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

function AppInner() {
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [text, setText] = useState<string>(SAMPLE_BANK_TEXTS[0].text);
  const [selectedSampleId, setSelectedSampleId] = useState<string | undefined>(
    SAMPLE_BANK_TEXTS[0].id,
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [latestResult, setLatestResult] = useState<ExtractionResponse | null>(null);
  const [highlightSentence, setHighlightSentence] = useState<string | null>(null);
  const [activeEvidenceKey, setActiveEvidenceKey] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [seciliIds, setSeciliIds] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [talep, setTalep] = useState<KarsilastirmaTalebi>(VARSAYILAN_TALEP);
  const [karsilastirmalar, setKarsilastirmalar] = useState<KarsilastirmaKaydi[]>([]);

  const lastAttemptRef = useRef<string>(SAMPLE_BANK_TEXTS[0].text);

  const handleExtract = useCallback(
    async (textToExtract?: string) => {
      const targetText = textToExtract !== undefined ? textToExtract : text;
      if (!targetText.trim()) return;

      lastAttemptRef.current = targetText;
      setIsLoading(true);
      setLoadingStep(0);
      setError(null);
      setHighlightSentence(null);
      setActiveEvidenceKey(null);

      try {
        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: targetText }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP hata: ${res.status}`);
        }

        const data: ExtractionResponse = await res.json();
        setLatestResult(data);

        const saat = saatDamgasi();
        setLastUpdated(saat);

        if (data.urunler && data.urunler.length > 0) {
          setHistory((prev) => [
            {
              id: `hist_${Date.now()}`,
              text: targetText,
              products: data.urunler,
              timestamp: saat,
              bankName: bankaAdiCoz(targetText),
            },
            ...prev.filter((h) => h.text !== targetText),
          ]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Çıkarım işlemi sırasında bir hata oluştu.');
      } finally {
        setIsLoading(false);
      }
    },
    [text],
  );

  useEffect(() => {
    handleExtract(SAMPLE_BANK_TEXTS[0].text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isLoading) return;
    const id = window.setInterval(() => {
      setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1));
    }, 900);
    return () => window.clearInterval(id);
  }, [isLoading]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        if (!isLoading) handleExtract();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleExtract, isLoading]);

  const handleSelectSample = (sample: SampleBankText) => {
    setSelectedSampleId(sample.id);
    setText(sample.text);
    setError(null);
    setHighlightSentence(null);
    setActiveEvidenceKey(null);
    handleExtract(sample.text);
  };

  /** Geçmişteki tüm ürünler, karşılaştırma motorunun beklediği biçimde. */
  const ogeler = useMemo<KarsilastirmaOgesi[]>(() => {
    const liste: KarsilastirmaOgesi[] = [];
    history.forEach((h) => {
      h.products.forEach((p, i) => {
        liste.push({
          id: `${h.id}::${i}`,
          bankaAdi: h.bankName || 'Bilinmeyen banka',
          product: p,
        });
      });
    });
    return liste;
  }, [history]);

  const evidences = useMemo(() => {
    const map: Record<string, string> = {};
    latestResult?.urunler?.forEach((product, idx) => {
      const kanitlar: Record<string, string> = product.kanitlar ?? {};
      Object.entries(kanitlar).forEach(([field, quote]) => {
        if (quote) map[`${idx}::${field}`] = quote;
      });
    });
    return map;
  }, [latestResult]);

  const handleSelectEvidence = (key: string | null) => {
    setActiveEvidenceKey(key);
    setHighlightSentence(key ? (evidences[key] ?? null) : null);
  };

  const handleHighlightFromCard = (sentence: string | null, key?: string | null) => {
    setHighlightSentence(sentence);
    setActiveEvidenceKey(sentence ? (key ?? null) : null);
  };

  const handleExport = useCallback(() => {
    const payload = { urunler: ogeler.map((o) => o.product) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `katilim_cikarim_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Tüm çıkarımlar JSON olarak indirildi.', 'basari');
  }, [ogeler, showToast]);

  /** Ana sayfadaki karşılaştırma formu — sonuçlar yerinde tazelenir. */
  const handleKarsilastir = useCallback((yeni: KarsilastirmaTalebi) => {
    setTalep(yeni);
    setKarsilastirmalar((prev) =>
      [
        { ...yeni, id: `kars_${Date.now()}`, zaman: saatDamgasi() },
        ...prev.filter((k) => !(k.tur === yeni.tur && k.tutar === yeni.tutar && k.vadeAy === yeni.vadeAy)),
      ].slice(0, 8),
    );
  }, []);

  const handleAsistanaSor = useCallback(
    (soru: string) => {
      setText(soru);
      setSelectedSampleId(undefined);
      setActiveTab('asistan');
      handleExtract(soru);
    },
    [handleExtract],
  );

  /** Sol paneldeki son işlemler: karşılaştırmalar önce, ardından çıkarımlar. */
  const sonIslemler = useMemo<SonIslem[]>(() => {
    const karsList: SonIslem[] = karsilastirmalar.map((k) => ({
      id: `kars::${k.id}`,
      baslik: FINANSMAN_TURLERI.find((f) => f.key === k.tur)?.etiket ?? 'Finansman',
      altBaslik: `${sayiBicim(k.tutar)} TL · ${k.vadeAy} ay`,
      zaman: k.zaman,
      bankaAdi: 'Karşılaştırma',
    }));
    const cikarimList: SonIslem[] = history.map((h) => ({
      id: `hist::${h.id}`,
      baslik: h.bankName ?? 'Çıkarım',
      altBaslik: `${h.products.length} ürün çıkarıldı`,
      zaman: h.timestamp,
      bankaAdi: h.bankName,
    }));
    return [...karsList, ...cikarimList];
  }, [karsilastirmalar, history]);

  const handleSonIslemSec = (id: string) => {
    if (id.startsWith('kars::')) {
      const kayit = karsilastirmalar.find((k) => `kars::${k.id}` === id);
      if (kayit) {
        setTalep({ tur: kayit.tur, tutar: kayit.tutar, vadeAy: kayit.vadeAy });
        setActiveTab('finansmanlar');
      }
      return;
    }
    const kayit = history.find((h) => `hist::${h.id}` === id);
    if (kayit) {
      setText(kayit.text);
      setSelectedSampleId(SAMPLE_BANK_TEXTS.find((s) => s.text === kayit.text)?.id);
      setActiveTab('asistan');
      handleExtract(kayit.text);
    }
  };

  const handleArama = (sorgu: string) => {
    handleAsistanaSor(sorgu);
  };

  const productCount = latestResult?.urunler?.length ?? 0;
  const reviewCount = ogeler.filter((o) => o.product.manuel_dogrulama_gerekli).length;
  const { baslik, aciklama } = TAB_TITLES[activeTab];

  const panelProps = (key: TabKey) => ({
    id: `panel-${key}`,
    role: 'tabpanel' as const,
    'aria-labelledby': `tab-${key}`,
    tabIndex: 0,
  });

  return (
    <div className="min-h-dvh bg-canvas text-txt">
      <TopNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        theme={theme}
        onToggleTheme={toggleTheme}
        kaydedilenSayisi={ogeler.length}
        bildirimSayisi={reviewCount}
        onExport={ogeler.length > 0 ? handleExport : undefined}
      />

      <div className="flex">
        <SideRail
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          sonIslemler={sonIslemler}
          onSonIslemSec={handleSonIslemSec}
          onArama={handleArama}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex-1 px-4 pt-5 pb-10 sm:px-6">
            {activeTab !== 'home' && (
              <div className="mb-4">
                <h1 className="text-lg font-semibold tracking-tight text-txt">{baslik}</h1>
                <p className="mt-0.5 text-sm text-txt-secondary">{aciklama}</p>
              </div>
            )}

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  role="alert"
                  className="mb-5 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-risk-200 bg-risk-50 p-4 text-sm text-risk-900 shadow-flat dark:border-risk-800 dark:bg-risk-950 dark:text-risk-100"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <AlertTriangle
                      className="mt-0.5 h-4.5 w-4.5 shrink-0 text-risk-600 dark:text-risk-400"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="font-medium">Çıkarım tamamlanamadı</p>
                      <p className="mt-0.5 leading-relaxed text-risk-800 dark:text-risk-200">
                        {error}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleExtract(lastAttemptRef.current)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-risk-300 bg-surface px-3 text-xs font-medium text-risk-800 transition-colors hover:bg-risk-100 dark:border-risk-700 dark:bg-risk-900 dark:text-risk-100 dark:hover:bg-risk-800"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      Tekrar dene
                    </button>
                    <button
                      type="button"
                      onClick={() => setError(null)}
                      aria-label="Hata bildirimini kapat"
                      className="grid h-11 w-11 place-items-center rounded-lg text-risk-700 transition-colors hover:bg-risk-100 dark:text-risk-300 dark:hover:bg-risk-900"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {activeTab === 'home' && (
              <div {...panelProps('home')}>
                <HomeView
                  setActiveTab={setActiveTab}
                  onKarsilastir={handleKarsilastir}
                  onAsistanaSor={handleAsistanaSor}
                  talep={talep}
                />
              </div>
            )}

            {activeTab === 'finansmanlar' && (
              <div {...panelProps('finansmanlar')} className="space-y-6">
                <FinansmanView talep={talep} onTalepDegisti={setTalep} />
                {ogeler.length > 0 && (
                  <section>
                    <h2 className="mb-3 text-base font-semibold tracking-tight text-txt">
                      Metinden çıkarılan ürünler
                    </h2>
                    <Dashboard
                      ogeler={ogeler}
                      isLoading={isLoading && ogeler.length === 0}
                      onSelectProduct={(id) => {
                        setSeciliIds([id]);
                        setActiveTab('kampanyalar');
                      }}
                    />
                  </section>
                )}
              </div>
            )}

            {activeTab === 'ucretler' && (
              <div {...panelProps('ucretler')}>
                <FeesView />
              </div>
            )}

            {activeTab === 'kampanyalar' && (
              <div {...panelProps('kampanyalar')} className="space-y-6">
                <CampaignsView />
                {ogeler.length > 0 && (
                  <section>
                    <h2 className="mb-3 text-base font-semibold tracking-tight text-txt">
                      Metinden çıkarılan kampanyalar
                    </h2>
                    <CampaignList
                      ogeler={ogeler}
                      secili={seciliIds}
                      onSeciliChange={setSeciliIds}
                      onCompare={() => setActiveTab('compare')}
                      isLoading={isLoading && ogeler.length === 0}
                    />
                  </section>
                )}
              </div>
            )}

            {activeTab === 'asistan' && (
              <div {...panelProps('asistan')} className="space-y-5">
                <SamplePicker onSelectSample={handleSelectSample} selectedId={selectedSampleId} />

                <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
                  <div className="xl:col-span-5 xl:sticky xl:top-24">
                    <TextInspector
                      text={text}
                      setText={setText}
                      onExtract={() => handleExtract()}
                      isLoading={isLoading}
                      highlightSentence={highlightSentence}
                      evidences={evidences}
                      onSelectEvidence={handleSelectEvidence}
                      activeEvidenceKey={activeEvidenceKey}
                    />
                  </div>

                  <div className="space-y-4 xl:col-span-7">
                    <p className="sr-only" aria-live="polite">
                      {isLoading
                        ? LOADING_STEPS[loadingStep]
                        : productCount > 0
                          ? `${productCount} ürün çıkarıldı.`
                          : 'Sonuç bekleniyor.'}
                    </p>

                    {isLoading ? (
                      <ExtractionSkeleton step={loadingStep} />
                    ) : productCount > 0 ? (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                          <h2 className="flex items-center gap-2 text-sm font-medium text-txt">
                            <Sparkles
                              className="h-4 w-4 text-brand-600 dark:text-brand-400"
                              aria-hidden="true"
                            />
                            Çıkarılan veri
                            <span className="tnum rounded-full border border-line bg-sunken px-2 py-0.5 font-mono text-xs text-txt-secondary">
                              {productCount} ürün
                            </span>
                          </h2>
                          <button
                            type="button"
                            onClick={() => setActiveTab('json')}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs text-txt-secondary transition-colors hover:text-txt"
                          >
                            <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Ham JSON
                          </button>
                        </div>

                        {latestResult?.urunler?.map((product, idx) => (
                          <ProductCard
                            key={`${product.urun_adi ?? 'urun'}-${idx}`}
                            product={product}
                            index={idx}
                            onHighlightSentence={handleHighlightFromCard}
                            activeEvidenceKey={activeEvidenceKey}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="flex min-h-96 flex-col items-center justify-center rounded-xl border border-line bg-surface p-10 text-center shadow-raised">
                        <Layers className="mb-3 h-8 w-8 text-txt-muted" aria-hidden="true" />
                        <h2 className="text-base font-medium text-txt">Sonuç bekleniyor</h2>
                        <p className="mx-auto mt-1 max-w-xs text-sm text-txt-secondary">
                          Soldaki metni düzenleyip çıkarımı başlatın; alanlar kanıt alıntılarıyla
                          birlikte burada listelenir.
                        </p>
                        <button
                          type="button"
                          onClick={() => handleExtract()}
                          disabled={!text.trim()}
                          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-medium text-white shadow-raised transition-colors hover:bg-brand-700 disabled:opacity-50"
                        >
                          Veri çıkar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'compare' && (
              <div {...panelProps('compare')}>
                <CompareView history={history} ogeler={ogeler} seciliIds={seciliIds} />
              </div>
            )}

            {activeTab === 'json' && (
              <div {...panelProps('json')}>
                <JsonViewer data={latestResult} onUpdateJson={setLatestResult} />
              </div>
            )}

            {activeTab === 'guide' && (
              <div {...panelProps('guide')}>
                <TerminologyGuide />
              </div>
            )}
          </main>

          <TrustFooter lastUpdated={lastUpdated} />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <AppInner />
      </ToastProvider>
    </MotionConfig>
  );
}

/** Alt güven şeridi — referans arayüzdeki dört maddelik açıklama bandı. */
const TrustFooter: React.FC<{ lastUpdated: string | null }> = ({ lastUpdated }) => (
  <footer className="border-t border-line bg-surface">
    <ul className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2 lg:grid-cols-4">
      {[
        {
          icon: Scale,
          baslik: 'Tarafsız Karşılaştırma',
          aciklama: 'Tüm bankalar aynı kriterlerle karşılaştırılır.',
        },
        {
          icon: DatabaseZap,
          baslik: 'Güncel ve Doğru Veri',
          aciklama: `Örnek veri seti ${VERI_TARIHI} itibarıyla derlendi.`,
        },
        {
          icon: Zap,
          baslik: 'Kolay ve Hızlı',
          aciklama: 'İhtiyacını seç, en iyi seçenekleri hemen gör.',
        },
        {
          icon: Lock,
          baslik: 'Gizliliğin Güvende',
          aciklama: 'Çıkarım yerelde çalışır, dış servise veri gitmez.',
        },
      ].map((k) => {
        const Icon = k.icon;
        return (
          <li key={k.baslik} className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sunken text-txt-secondary">
              <Icon className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-txt">{k.baslik}</span>
              <span className="block text-xs leading-relaxed text-txt-muted">{k.aciklama}</span>
            </span>
          </li>
        );
      })}
    </ul>
    <div className="flex flex-col items-center justify-between gap-2 border-t border-line px-6 py-3 text-xs text-txt-muted sm:flex-row">
      <span>© 2026 KatılımFinans Asistanı · Katılım Bankacılığı Bilgi Çıkarım Ajanı</span>
      <span className="font-mono">
        {lastUpdated ? `Son çıkarım ${lastUpdated}` : 'kar_payi_orani · vade_ay · tahsis_ucreti'}
      </span>
    </div>
  </footer>
);

/** Nihai düzenle birebir aynı iskelet: layout kayması sıfır. */
const ExtractionSkeleton: React.FC<{ step: number }> = ({ step }) => (
  <div className="rounded-xl border border-line bg-surface p-4 shadow-raised sm:p-5">
    <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
      <div className="w-full space-y-2">
        <div className="skeleton h-5 w-40" />
        <div className="skeleton h-6 w-64 max-w-full" />
      </div>
      <div className="skeleton h-13 w-13 shrink-0 rounded-full" />
    </div>

    <div className="mt-4 rounded-lg border border-line bg-sunken p-4">
      <div className="skeleton h-4 w-28" />
      <div className="skeleton mt-2 h-11 w-48 max-w-full" />
    </div>

    <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="rounded-lg border border-line p-3">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton mt-2 h-6 w-32 max-w-full" />
          <div className="skeleton mt-3 h-9 w-28" />
        </li>
      ))}
    </ul>

    <p className="mt-4 border-t border-line pt-3 text-xs text-txt-secondary">
      <span className="tnum font-mono">
        {step + 1}/{LOADING_STEPS.length}
      </span>{' '}
      · {LOADING_STEPS[step]}
    </p>
  </div>
);
