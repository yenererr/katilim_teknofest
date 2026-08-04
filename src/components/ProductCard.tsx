import React, { useState } from 'react';
import { KatilimUrunu, UrunTuru, MusteriSegmenti } from '../types';
import {
  AlertOctagon,
  Quote,
  CheckCircle,
  HelpCircle,
  Sparkles,
  Percent,
  Calendar,
  Wallet,
  CreditCard,
  Gift,
  Coins
} from 'lucide-react';

interface ProductCardProps {
  product: KatilimUrunu;
  index: number;
  onHighlightSentence: (sentence: string | null) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, index, onHighlightSentence }) => {
  const [activeQuoteKey, setActiveQuoteKey] = useState<string | null>(null);

  const getProductTypeLabel = (turu: UrunTuru): string => {
    switch (turu) {
      case 'konut_finansmani': return 'Konut Finansmanı';
      case 'tasit_finansmani': return 'Taşıt Finansmanı';
      case 'ihtiyac_finansmani': return 'İhtiyaç Finansmanı';
      case 'kart': return 'Kart / Ödül';
      case 'katilim_fonu': return 'Katılım Fonu (Hesap)';
      case 'yatirim': return 'Yatırım';
      case 'alisveris_puani': return 'Alışveriş Puanı';
      default: return 'Diğer';
    }
  };

  const getSegmentLabel = (seg: MusteriSegmenti): string => {
    switch (seg) {
      case 'yeni_musteri': return 'Yeni Müşteri';
      case 'mevcut_musteri': return 'Mevcut Müşteri';
      case 'kurumsal': return 'Kurumsal';
      case 'kobi': return 'KOBİ';
      case 'genc': return 'Genç';
      case 'emekli': return 'Emekli';
      case 'tumu': return 'Tümü';
      default: return seg;
    }
  };

  const getConfidenceBadge = (score: number) => {
    if (score >= 0.9) {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle className="w-3 h-3 text-emerald-600" />
          <span>%{Math.round(score * 100)} (Yüksek)</span>
        </span>
      );
    } else if (score >= 0.6) {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
          <HelpCircle className="w-3 h-3 text-amber-600" />
          <span>%{Math.round(score * 100)} (Orta)</span>
        </span>
      );
    } else if (score > 0) {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
          <HelpCircle className="w-3 h-3 text-rose-600" />
          <span>%{Math.round(score * 100)} (Düşük)</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
        <span>%0 (Metinde Yok)</span>
      </span>
    );
  };

  const handleQuoteClick = (key: string, quote?: string) => {
    if (!quote) return;
    if (activeQuoteKey === key) {
      setActiveQuoteKey(null);
      onHighlightSentence(null);
    } else {
      setActiveQuoteKey(key);
      onHighlightSentence(quote);
    }
  };

  const termKeys = [
    { key: 'kar_payi_orani', label: 'Kâr Payı Oranı', icon: Percent },
    { key: 'vade_ay', label: 'Vade (Ay)', icon: Calendar },
    { key: 'tahsis_ucreti', label: 'Tahsis Ücreti', icon: Wallet },
    { key: 'tutar', label: 'Finansman Tutarı', icon: Coins },
    { key: 'taksit_sayisi', label: 'Taksit Sayısı', icon: CreditCard },
    { key: 'odul', label: 'Ödül / Puan', icon: Gift },
  ] as const;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 shadow-sm relative overflow-hidden">
      {/* Top Banner if Manual Validation Needed */}
      {product.manuel_dogrulama_gerekli && (
        <div className="mb-4 p-3.5 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-900 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <AlertOctagon className="w-5 h-5 text-orange-600 shrink-0" />
            <div>
              <span className="font-bold text-orange-900">Manuel Doğrulama Gerekli: </span>
              <span>Ortalama güven skoru %60'ın altındadır (%{Math.round(product.ortalama_guven * 100)}). Lütfen çıkarılan alanları kontrol edin.</span>
            </div>
          </div>
          <span className="px-2 py-0.5 bg-orange-100 text-orange-800 text-[10px] font-mono rounded font-bold uppercase shrink-0 border border-orange-300">
            İnceleme Bekliyor
          </span>
        </div>
      )}

      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center space-x-2 flex-wrap gap-y-1 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider">
              Ürün #{index + 1}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
              {getProductTypeLabel(product.urun_turu)}
            </span>
            {product.terim_esleme_uygulandi && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center space-x-1">
                <Sparkles className="w-3 h-3 text-blue-600" />
                <span>Terim Dönüşümü Uygulandı</span>
              </span>
            )}
          </div>
          <h3 className="text-lg font-bold text-slate-900 tracking-tight">
            {product.urun_adi || 'İsimsiz Katılım Ürünü'}
          </h3>
        </div>

        <div className="flex items-center space-x-3 self-start md:self-auto">
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ortalama Güven</div>
            <div className="text-xl font-mono font-bold text-emerald-600">
              %{Math.round(product.ortalama_guven * 100)}
            </div>
          </div>
          <div className="w-12 h-12 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center font-mono text-sm font-bold text-emerald-700 shadow-xs">
            {(product.ortalama_guven * 10).toFixed(1)}
          </div>
        </div>
      </div>

      {/* Details Bar: Segments & Campaign Dates */}
      <div className="py-3 flex flex-wrap items-center justify-between text-xs border-b border-slate-100 gap-3">
        <div className="flex items-center space-x-2">
          <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Müşteri Segmenti:</span>
          {product.musteri_segmenti && product.musteri_segmenti.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {product.musteri_segmenti.map((seg, i) => (
                <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200 font-medium text-xs">
                  {getSegmentLabel(seg)}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-slate-400 italic text-xs">Belirtilmedi (Varsayılan Boş Dizi)</span>
          )}
        </div>

        <div className="flex items-center space-x-4 text-slate-500 font-medium">
          <div>
            <span>Başlangıç: </span>
            <strong className="text-slate-800">{product.kampanya_baslangic || 'Belirtilmedi'}</strong>
          </div>
          <div>
            <span>Bitiş: </span>
            <strong className="text-slate-800">{product.kampanya_bitis || 'Süresiz / Belirtilmedi'}</strong>
          </div>
        </div>
      </div>

      {/* Terminology Table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 font-bold bg-slate-50/80 uppercase text-[10px] tracking-wider">
              <th className="py-2.5 px-3">Katılım Terimi / Alan</th>
              <th className="py-2.5 px-3">Ham Metin (Alıntı)</th>
              <th className="py-2.5 px-3">Normalize Edilmiş Değer</th>
              <th className="py-2.5 px-3">Güven Skoru</th>
              <th className="py-2.5 px-3 text-right">Kanıt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {termKeys.map(({ key, label, icon: Icon }) => {
              const term = (product.terimler as any)?.[key];
              const quote = product.kanitlar?.[key];
              const isQuoteActive = activeQuoteKey === key;

              return (
                <tr
                  key={key}
                  className={`transition-colors hover:bg-slate-50/80 ${
                    isQuoteActive ? 'bg-emerald-50/60' : ''
                  }`}
                >
                  {/* Katılım Terimi */}
                  <td className="py-3 px-3 font-semibold text-slate-800">
                    <div className="flex items-center space-x-2">
                      <Icon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{label}</span>
                    </div>
                  </td>

                  {/* Ham Metin */}
                  <td className="py-3 px-3 text-slate-600 font-mono text-[11px] max-w-[200px] truncate">
                    {term?.ham ? (
                      <span title={term.ham} className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        "{term.ham}"
                      </span>
                    ) : (
                      <span className="text-slate-400 italic font-sans text-xs">Metinde Yok</span>
                    )}
                  </td>

                  {/* Normalize Edilmiş Değer */}
                  <td className="py-3 px-3 text-slate-900 font-bold">
                    {key === 'kar_payi_orani' && term?.deger !== undefined && term?.deger !== null ? (
                      <span className="flex items-center space-x-1.5">
                        <span className="text-emerald-700 font-mono font-bold text-sm">
                          %{(term.deger * 100).toFixed(2)}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded border border-slate-200 uppercase font-medium">
                          {term.periyot || 'belirsiz'}
                        </span>
                      </span>
                    ) : key === 'vade_ay' ? (
                      term?.max !== undefined && term?.max !== null ? (
                        <span className="font-mono text-emerald-700">
                          {term.min ? `${term.min} - ${term.max} Ay` : `${term.max} Ay Max`}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-normal italic">null</span>
                      )
                    ) : key === 'tahsis_ucreti' ? (
                      term?.deger === 0 ? (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded font-bold">
                          0.00 TL (Ücretsiz)
                        </span>
                      ) : term?.deger ? (
                        <span className="font-mono text-emerald-700">
                          {term.deger.toLocaleString('tr-TR')} {term.para_birimi || 'TRY'} ({term.tipi || 'sabit'})
                        </span>
                      ) : (
                        <span className="text-slate-400 font-normal italic">null</span>
                      )
                    ) : key === 'tutar' ? (
                      term?.min || term?.max ? (
                        <span className="font-mono text-emerald-700">
                          {term.min ? `${term.min.toLocaleString('tr-TR')} ₺` : '0 ₺'} - {term.max ? `${term.max.toLocaleString('tr-TR')} ₺` : 'Sınırsız'}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-normal italic">null</span>
                      )
                    ) : term?.deger !== undefined && term?.deger !== null ? (
                      <span className="font-mono text-emerald-700">{term.deger}</span>
                    ) : (
                      <span className="text-slate-400 font-normal italic">null</span>
                    )}
                  </td>

                  {/* Güven Skoru */}
                  <td className="py-3 px-3">
                    {getConfidenceBadge(term?.guven ?? 0)}
                  </td>

                  {/* Kanıt Göster */}
                  <td className="py-3 px-3 text-right">
                    {quote ? (
                      <button
                        onClick={() => handleQuoteClick(key, quote)}
                        className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                          isQuoteActive
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Quote className="w-3 h-3" />
                        <span>{isQuoteActive ? 'Kanıtı Gizle' : 'Kanıt Göster'}</span>
                      </button>
                    ) : (
                      <span className="text-slate-400 text-[11px] italic">Kanıt Yok</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Notes / Remarks if any */}
      {product.notlar && (
        <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700">
          <span className="font-bold text-emerald-700 uppercase tracking-wider text-[10px] mr-1.5">Ajan Notu:</span>
          <span>{product.notlar}</span>
        </div>
      )}
    </div>
  );
};
