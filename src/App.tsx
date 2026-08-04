import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { SamplePicker } from './components/SamplePicker';
import { TextInspector } from './components/TextInspector';
import { ProductCard } from './components/ProductCard';
import { JsonViewer } from './components/JsonViewer';
import { CompareView } from './components/CompareView';
import { TerminologyGuide } from './components/TerminologyGuide';
import { SAMPLE_BANK_TEXTS } from './data/samples';
import { ExtractionResponse, KatilimUrunu, SampleBankText } from './types';
import { Sparkles, History, AlertCircle, ArrowRight, Layers, FileCode2, Scale } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'single' | 'compare' | 'guide' | 'json'>('single');
  const [text, setText] = useState<string>(SAMPLE_BANK_TEXTS[0].text);
  const [selectedSampleId, setSelectedSampleId] = useState<string | undefined>(SAMPLE_BANK_TEXTS[0].id);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [latestResult, setLatestResult] = useState<ExtractionResponse | null>(null);
  const [highlightSentence, setHighlightSentence] = useState<string | null>(null);

  // History of session extractions for comparison and inspection
  const [history, setHistory] = useState<{ id: string; text: string; products: KatilimUrunu[]; timestamp: string }[]>([]);

  // Automatically run initial extraction on first mount so the preview shows results immediately
  useEffect(() => {
    handleExtract(SAMPLE_BANK_TEXTS[0].text);
  }, []);

  const handleSelectSample = (sample: SampleBankText) => {
    setSelectedSampleId(sample.id);
    setText(sample.text);
    setError(null);
    setHighlightSentence(null);
    handleExtract(sample.text);
  };

  const handleExtract = async (textToExtract?: string) => {
    const targetText = textToExtract !== undefined ? textToExtract : text;
    if (!targetText.trim()) return;

    setIsLoading(true);
    setError(null);
    setHighlightSentence(null);

    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: targetText }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP Hata: ${res.status}`);
      }

      const data: ExtractionResponse = await res.json();
      setLatestResult(data);

      // Add to session history
      if (data.urunler && data.urunler.length > 0) {
        setHistory(prev => [
          {
            id: `hist_${Date.now()}`,
            text: targetText,
            products: data.urunler,
            timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
          },
          ...prev.filter(h => h.text !== targetText), // avoid duplicate exact text entries
        ]);
      }
    } catch (err: any) {
      console.error('Extract error:', err);
      setError(err.message || 'Çıkarım işlemi sırasında bir hata oluştu.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateJson = (updated: ExtractionResponse) => {
    setLatestResult(updated);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased selection:bg-emerald-100 selection:text-emerald-900">
      
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        extractedCount={history.reduce((acc, curr) => acc + curr.products.length, 0)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Error Notification */}
        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between shadow-xs">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="px-3 py-1 bg-white border border-rose-200 hover:bg-rose-100 text-rose-900 rounded-lg font-bold"
            >
              Kapat
            </button>
          </div>
        )}

        {/* Tab 1: Single Extraction (Tekli Çıkarım) */}
        {activeTab === 'single' && (
          <div className="space-y-6">
            
            {/* Quick Sample Selector */}
            <SamplePicker
              onSelectSample={handleSelectSample}
              selectedId={selectedSampleId}
            />

            {/* Split Screen Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Left Column: Text Input Inspector (5 cols) */}
              <div className="lg:col-span-5 h-full">
                <TextInspector
                  text={text}
                  setText={setText}
                  onExtract={() => handleExtract()}
                  isLoading={isLoading}
                  highlightSentence={highlightSentence}
                />
              </div>

              {/* Right Column: Extracted Products & Metrics (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                
                {isLoading ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-12 text-center flex flex-col items-center justify-center min-h-[400px] shadow-sm">
                    <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mb-4" />
                    <h3 className="text-base font-bold text-slate-800 mb-1">
                      Katılım Bankacılığı Metni Analiz Ediliyor...
                    </h3>
                    <p className="text-xs text-slate-500 max-w-sm">
                      Terim eşlemeleri (faiz → kâr payı, dosya masrafı → tahsis ücreti), vade ay dönüşümleri, kanıt alıntıları ve güven skorları hesaplanıyor.
                    </p>
                  </div>
                ) : latestResult && latestResult.urunler && latestResult.urunler.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-3 px-1">
                      <div className="flex items-center space-x-2">
                        <Sparkles className="w-4 h-4 text-emerald-600" />
                        <h2 className="text-sm font-bold text-slate-900">
                          Çıkarılan Katılım Bankacılığı Verisi ({latestResult.urunler.length} Ürün)
                        </h2>
                      </div>
                      <button
                        onClick={() => setActiveTab('json')}
                        className="text-xs text-emerald-700 hover:text-emerald-800 font-bold flex items-center space-x-1"
                      >
                        <FileCode2 className="w-3.5 h-3.5" />
                        <span>Ham JSON Görüntüle</span>
                      </button>
                    </div>

                    {latestResult.urunler.map((product, idx) => (
                      <ProductCard
                        key={idx}
                        product={product}
                        index={idx}
                        onHighlightSentence={(sentence) => setHighlightSentence(sentence)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500 min-h-[400px] flex flex-col items-center justify-center shadow-sm">
                    <Layers className="w-10 h-10 text-slate-400 mb-3" />
                    <h3 className="text-base font-bold text-slate-700 mb-1">
                      Sonuç Bekleniyor
                    </h3>
                    <p className="text-xs text-slate-400 max-w-xs">
                      Sol taraftaki metni güncelleyip "Yapılandırılmış JSON Çıkar" butonuna basarak katılım bankacılığı verisini çıkarabilirsiniz.
                    </p>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* Tab 2: Compare View */}
        {activeTab === 'compare' && (
          <CompareView history={history} />
        )}

        {/* Tab 3: JSON Viewer */}
        {activeTab === 'json' && (
          <JsonViewer data={latestResult} onUpdateJson={handleUpdateJson} />
        )}

        {/* Tab 4: Terminology & System Rules Guide */}
        {activeTab === 'guide' && (
          <TerminologyGuide />
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            © 2026 Katılım Bankacılığı Bilgi Çıkarım Ajanı · Türkiye Katılım Bankaları Şeması
          </span>
          <span className="font-mono text-[11px] text-slate-400">
            Resmî Şema: kar_payi_orani | vade_ay | tahsis_ucreti | urun_turu
          </span>
        </div>
      </footer>
    </div>
  );
}
