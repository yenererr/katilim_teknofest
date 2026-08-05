import React, { useState } from 'react';
import { ExtractionResponse } from '../types';
import { useToast } from './Toast';
import { Copy, Check, Download, Edit3, Save, RotateCcw, AlertTriangle, FileCode2 } from 'lucide-react';

interface JsonViewerProps {
  data: ExtractionResponse | null;
  onUpdateJson?: (newData: ExtractionResponse) => void;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({ data, onUpdateJson }) => {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editString, setEditString] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  if (!data) {
    return (
      <div className="rounded-xl border border-line bg-surface p-10 text-center shadow-raised">
        <FileCode2 className="mx-auto mb-3 h-8 w-8 text-txt-muted" aria-hidden="true" />
        <h2 className="text-base font-medium text-txt">Henüz bir çıkarım yapılmadı</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-txt-secondary">
          &laquo;Tekli Çıkarım&raquo; sekmesinde bir metin analiz edin; yapılandırılmış JSON burada
          görünecek.
        </p>
      </div>
    );
  }

  const jsonString = JSON.stringify(data.urunler ? { urunler: data.urunler } : data, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      showToast('JSON panoya kopyalandı.', 'basari');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Pano erişimi reddedildi. JSON metnini elle seçip kopyalayabilirsiniz.', 'uyari');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `katilim_bankaciligi_cikarim_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('JSON dosyası indirildi.', 'basari');
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
      onUpdateJson?.({ ...data, urunler: parsed.urunler });
      setIsEditing(false);
      setParseError(null);
      showToast('Düzenlenen JSON uygulandı.', 'basari');
    } catch (err) {
      setParseError('Geçersiz JSON yapısı: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const buttonBase =
    'inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors';

  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-surface p-4 shadow-raised sm:p-5">
      <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium text-txt">
            Yapılandırılmış veri (JSON)
            <span className="rounded border border-info-200 bg-info-50 px-1.5 py-0.5 text-xs text-info-800 dark:border-info-800 dark:bg-info-950 dark:text-info-200">
              Resmî şema
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-txt-secondary">
            <span className="tnum font-mono">{data.urunler?.length || 0}</span> ürün / kampanya
            çıkarıldı
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleSaveEdit}
                className={`${buttonBase} border-brand-600 bg-brand-600 font-medium text-white hover:bg-brand-700`}
              >
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
                Kaydet
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className={`${buttonBase} border-line bg-surface text-txt-secondary hover:bg-sunken hover:text-txt`}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                İptal
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleStartEdit}
                className={`${buttonBase} border-line bg-surface text-txt-secondary hover:bg-sunken hover:text-txt`}
              >
                <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                Manuel düzenle
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className={`${buttonBase} border-line bg-surface text-txt-secondary hover:bg-sunken hover:text-txt`}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {copied ? 'Kopyalandı' : 'Kopyala'}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className={`${buttonBase} border-brand-600 bg-brand-600 font-medium text-white hover:bg-brand-700`}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                .json indir
              </button>
            </>
          )}
        </div>
      </div>

      {parseError && (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg border border-risk-200 bg-risk-50 p-3 text-xs text-risk-800 dark:border-risk-800 dark:bg-risk-950 dark:text-risk-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {parseError}
        </p>
      )}

      <div className="mt-4 min-h-96 flex-1">
        {isEditing ? (
          <textarea
            value={editString}
            onChange={(e) => setEditString(e.target.value)}
            spellCheck={false}
            aria-label="JSON düzenleyici"
            className="h-full min-h-96 w-full resize-none rounded-lg border border-brand-500 bg-ink-950 p-4 font-mono text-xs leading-relaxed text-brand-100 outline-none"
          />
        ) : (
          <pre className="h-full max-h-[34rem] w-full overflow-auto rounded-lg border border-line bg-ink-950 p-4 font-mono text-xs leading-relaxed text-brand-100">
            {jsonString}
          </pre>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 font-mono text-xs text-txt-muted">
        <span>JSON · UTF-8</span>
        {data.meta?.duration_ms && <span className="tnum">Süre: {data.meta.duration_ms} ms</span>}
      </div>
    </div>
  );
};
