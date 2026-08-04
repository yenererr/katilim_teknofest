import React, { useState } from 'react';
import { ExtractionResponse } from '../types';
import { Copy, Check, Download, Edit3, Save, RotateCcw, AlertOctagon } from 'lucide-react';

interface JsonViewerProps {
  data: ExtractionResponse | null;
  onUpdateJson?: (newData: ExtractionResponse) => void;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({ data, onUpdateJson }) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editString, setEditString] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  if (!data) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500 shadow-sm">
        <p className="text-base font-bold text-slate-700">Henüz bir bilgi çıkarımı yapılmadı.</p>
        <p className="text-xs text-slate-400 mt-1">
          Lütfen "Tekli Çıkarım" sekmesinde bir metin analiz edin veya örnek şablonlardan birini seçin.
        </p>
      </div>
    );
  }

  const jsonString = JSON.stringify(data.urunler ? { urunler: data.urunler } : data, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `katilim_bankaciligi_cikarim_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleStartEdit = () => {
    setEditString(jsonString);
    setParseError(null);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    try {
      const parsed = JSON.parse(editString);
      if (!parsed.urunler || !Array.isArray(parsed.urunler)) {
        throw new Error("JSON nesnesinin kökünde 'urunler' dizisi olmalıdır.");
      }
      if (onUpdateJson) {
        onUpdateJson({ ...data, urunler: parsed.urunler });
      }
      setIsEditing(false);
      setParseError(null);
    } catch (err: any) {
      setParseError("Geçersiz JSON yapısı: " + err.message);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col h-full">
      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
            <span>Yapılandırılmış Veri (JSON)</span>
            <span className="px-2 py-0.5 text-[10px] bg-blue-100 text-blue-700 font-bold rounded">
              RESMÎ ŞEMA
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {data.urunler?.length || 0} Adet Ürün/Kampanya Çıkarıldı
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {isEditing ? (
            <>
              <button
                onClick={handleSaveEdit}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Kaydet</span>
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>İptal</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleStartEdit}
                className="flex items-center space-x-1 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-all"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Manuel Düzenle</span>
              </button>

              <button
                onClick={handleCopy}
                className="flex items-center space-x-1 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-all"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                <span>{copied ? 'Kopyalandı' : 'Kopyala'}</span>
              </button>

              <button
                onClick={handleDownload}
                className="flex items-center space-x-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>.JSON İndir</span>
              </button>
            </>
          )}
        </div>
      </div>

      {parseError && (
        <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center space-x-2">
          <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{parseError}</span>
        </div>
      )}

      {/* Editor or Viewer */}
      <div className="mt-4 flex-1 min-h-[400px]">
        {isEditing ? (
          <textarea
            value={editString}
            onChange={(e) => setEditString(e.target.value)}
            className="w-full h-full min-h-[420px] p-4 bg-slate-900 border border-emerald-500 rounded-xl font-mono text-xs text-emerald-400 focus:outline-none leading-relaxed"
          />
        ) : (
          <pre className="w-full h-full max-h-[550px] overflow-auto p-4 bg-slate-900 border border-slate-800 rounded-xl font-mono text-[11px] text-emerald-400 leading-relaxed selection:bg-emerald-900 selection:text-white">
            {jsonString}
          </pre>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-slate-400 border-t border-slate-100 pt-2">
        <span>Sözdizim: JSON UTF-8</span>
        {data.meta?.duration_ms && (
          <span>Gecikme / Süre: {data.meta.duration_ms} ms</span>
        )}
      </div>
    </div>
  );
};

