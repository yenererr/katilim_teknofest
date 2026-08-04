import React from 'react';
import { Play, RotateCcw, AlertTriangle, CheckCircle2, FileText, Info } from 'lucide-react';

interface TextInspectorProps {
  text: string;
  setText: (t: string) => void;
  onExtract: () => void;
  isLoading: boolean;
  highlightSentence?: string | null;
}

export const TextInspector: React.FC<TextInspectorProps> = ({
  text,
  setText,
  onExtract,
  isLoading,
  highlightSentence,
}) => {
  // Check for conventional terms in real time to inform the user
  const lowerText = text.toLowerCase();
  const conventionalTermsDetected: { orig: string; mapped: string }[] = [];
  
  if (/\bfaiz\b/.test(lowerText) || /faiz oranı/.test(lowerText)) {
    conventionalTermsDetected.push({ orig: 'faiz / faiz oranı', mapped: 'kâr payı (kar_payi_orani)' });
  }
  if (/\bkredi\b/.test(lowerText)) {
    conventionalTermsDetected.push({ orig: 'kredi', mapped: 'finansman (urun_turu)' });
  }
  if (/\bmevduat\b/.test(lowerText)) {
    conventionalTermsDetected.push({ orig: 'mevduat', mapped: 'katılım fonu (urun_turu)' });
  }
  if (/dosya masrafı/.test(lowerText)) {
    conventionalTermsDetected.push({ orig: 'dosya masrafı', mapped: 'tahsis ücreti (tahsis_ucreti)' });
  }
  if (/kart puanı/.test(lowerText)) {
    conventionalTermsDetected.push({ orig: 'kart puanı', mapped: 'ödül (odul_miktari)' });
  }

  const handleClear = () => {
    setText('');
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col h-full shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <FileText className="w-4 h-4 text-emerald-600" />
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ham Metin Girişi</h2>
        </div>
        <div className="flex items-center space-x-3 text-xs text-slate-500 font-medium">
          <span className="font-mono text-[10px] text-slate-400">{text.length} KARAKTER</span>
          {text.length > 0 && (
            <button
              onClick={handleClear}
              className="text-slate-500 hover:text-slate-800 flex items-center space-x-1 hover:bg-slate-100 px-2 py-1 rounded transition-colors text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Temizle</span>
            </button>
          )}
        </div>
      </div>

      {/* Real-time Conventional Term Mapping Alert */}
      {conventionalTermsDetected.length > 0 && (
        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start space-x-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-amber-800">
              Konvansiyonel Terim Tespit Edildi ({conventionalTermsDetected.length}):
            </div>
            <p className="mt-0.5 text-amber-700 leading-normal">
              Katılım bankacılığı ilkeleri gereği bu terimler çıkarımda otomatik olarak katılım karşılıklarına dönüştürülecektir (<code className="font-mono text-[11px] font-bold">terim_esleme_uygulandi: true</code>).
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {conventionalTermsDetected.map((item, idx) => (
                <span key={idx} className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded font-mono text-[11px] border border-amber-300">
                  <span className="line-through text-amber-700">{item.orig}</span> → <strong className="text-emerald-800">{item.mapped}</strong>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Text Area */}
      <div className="relative flex-1 min-h-[220px]">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Resmî katılım bankası kampanya veya ürün metnini buraya yapıştırın veya yukarıdaki örnek şablonlardan birini seçin..."
          className="w-full h-full p-4 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-sm font-serif italic focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none outline-none leading-relaxed transition-all placeholder:text-slate-400 placeholder:not-italic placeholder:font-sans"
        />
        {highlightSentence && (
          <div className="absolute bottom-3 left-3 right-3 p-3 bg-emerald-900/95 text-emerald-50 border border-emerald-700 rounded-lg text-xs backdrop-blur shadow-lg flex items-start space-x-2.5">
            <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-emerald-300">Aktif Kanıt Alıntısı: </span>
              <span className="italic font-serif">"{highlightSentence}"</span>
            </div>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100">
        <div className="text-xs text-slate-500 flex items-center space-x-1.5 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Şema Uyumlu Veri Çıkarımı</span>
        </div>

        <button
          onClick={onExtract}
          disabled={isLoading || !text.trim()}
          className="flex items-center space-x-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-lg shadow-md transition-all active:scale-98"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Veri Çıkarılıyor...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-white" />
              <span>VERİ ÇIKAR</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

