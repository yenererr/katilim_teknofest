import React from 'react';
import { KatilimUrunu } from '../types';
import { Scale } from 'lucide-react';

interface CompareViewProps {
  history: { id: string; text: string; products: KatilimUrunu[]; timestamp: string }[];
}

export const CompareView: React.FC<CompareViewProps> = ({ history }) => {
  // Collect all extracted products from session history
  const allProducts: { bankOrTitle: string; product: KatilimUrunu }[] = [];
  history.forEach(item => {
    item.products.forEach(p => {
      allProducts.push({
        bankOrTitle: p.urun_adi || 'Katılım Ürünü',
        product: p
      });
    });
  });

  if (allProducts.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500 shadow-sm">
        <Scale className="w-10 h-10 text-emerald-600 mx-auto mb-3 opacity-90" />
        <h3 className="text-base font-bold text-slate-800 mb-1">Karşılaştırılacak Ürün Bulunamadı</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          "Tekli Çıkarım" sekmesinde birden fazla banka kampanya metnini analiz ederek ürünleri yan yana karşılaştırabilirsiniz.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
        <div>
          <h2 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
            <Scale className="w-4 h-4 text-emerald-600" />
            <span>Katılım Bankaları Ürün Karşılaştırma Matrisi</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Çıkarılan {allProducts.length} katılım bankacılığı ürününün şart ve oran karşılaştırması
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
              <th className="py-3 px-4 min-w-[160px]">Kriter / Alan</th>
              {allProducts.map((item, idx) => (
                <th key={idx} className="py-3 px-4 min-w-[220px] border-l border-slate-200">
                  <div className="font-bold text-slate-900 text-sm line-clamp-1">{item.bankOrTitle}</div>
                  <div className="text-[10px] text-slate-500 font-medium capitalize mt-0.5">
                    Tür: {item.product.urun_turu.replace('_', ' ')}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">

            {/* Kâr Payı Oranı */}
            <tr className="hover:bg-slate-50/60">
              <td className="py-3 px-4 font-bold text-slate-800">Aylık Kâr Payı Oranı</td>
              {allProducts.map((item, idx) => {
                const rate = item.product.terimler?.kar_payi_orani;
                return (
                  <td key={idx} className="py-3 px-4 border-l border-slate-200">
                    {rate?.deger !== undefined && rate?.deger !== null ? (
                      <div>
                        <span className="font-mono text-emerald-700 font-bold text-sm">
                          %{(rate.deger * 100).toFixed(2)}
                        </span>
                        <span className="ml-1 text-[10px] text-slate-500 font-medium">
                          ({rate.periyot || 'belirsiz'})
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">Metinde Yok</span>
                    )}
                  </td>
                );
              })}
            </tr>

            {/* Vade (Ay) */}
            <tr className="hover:bg-slate-50/60">
              <td className="py-3 px-4 font-bold text-slate-800">Azami Vade (Ay)</td>
              {allProducts.map((item, idx) => {
                const vade = item.product.terimler?.vade_ay;
                return (
                  <td key={idx} className="py-3 px-4 border-l border-slate-200 font-mono text-slate-800 font-semibold">
                    {vade?.max ? `${vade.max} Ay` : <span className="text-slate-400 font-normal italic">null</span>}
                  </td>
                );
              })}
            </tr>

            {/* Tahsis Ücreti */}
            <tr className="hover:bg-slate-50/60">
              <td className="py-3 px-4 font-bold text-slate-800">Tahsis Ücreti / Masraf</td>
              {allProducts.map((item, idx) => {
                const fee = item.product.terimler?.tahsis_ucreti;
                return (
                  <td key={idx} className="py-3 px-4 border-l border-slate-200">
                    {fee?.deger === 0 ? (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold rounded">
                        0.00 TL (Masrafsız)
                      </span>
                    ) : fee?.deger ? (
                      <span className="font-mono text-slate-800 font-semibold">
                        {fee.deger.toLocaleString('tr-TR')} {fee.para_birimi || 'TRY'}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">null</span>
                    )}
                  </td>
                );
              })}
            </tr>

            {/* Hedef Segment */}
            <tr className="hover:bg-slate-50/60">
              <td className="py-3 px-4 font-bold text-slate-800">Müşteri Segmenti</td>
              {allProducts.map((item, idx) => (
                <td key={idx} className="py-3 px-4 border-l border-slate-200">
                  {item.product.musteri_segmenti?.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {item.product.musteri_segmenti.map((seg, sIdx) => (
                        <span key={sIdx} className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded text-[10px] font-semibold">
                          {seg}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-400 italic">[] (Tümü/Belirsiz)</span>
                  )}
                </td>
              ))}
            </tr>

            {/* Terim Eşleme */}
            <tr className="hover:bg-slate-50/60">
              <td className="py-3 px-4 font-bold text-slate-800">Terim Dönüşümü Yapıldı mı?</td>
              {allProducts.map((item, idx) => (
                <td key={idx} className="py-3 px-4 border-l border-slate-200">
                  {item.product.terim_esleme_uygulandi ? (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-[11px] font-bold border border-amber-200">
                      Evet (Terim Dönüştürüldü)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] border border-slate-200">
                      Hayır (Resmî Katılım Terimi)
                    </span>
                  )}
                </td>
              ))}
            </tr>

            {/* Ortalama Güven */}
            <tr className="hover:bg-slate-50/60">
              <td className="py-3 px-4 font-bold text-slate-800">Ortalama Güven Skoru</td>
              {allProducts.map((item, idx) => (
                <td key={idx} className="py-3 px-4 border-l border-slate-200 font-mono font-bold">
                  <span className={item.product.ortalama_guven >= 0.8 ? 'text-emerald-700' : 'text-amber-700'}>
                    %{Math.round(item.product.ortalama_guven * 100)}
                  </span>
                </td>
              ))}
            </tr>

            {/* Manuel Doğrulama Durumu */}
            <tr className="hover:bg-slate-50/60">
              <td className="py-3 px-4 font-bold text-slate-800">Manuel İnceleme Gerekli mi?</td>
              {allProducts.map((item, idx) => (
                <td key={idx} className="py-3 px-4 border-l border-slate-200">
                  {item.product.manuel_dogrulama_gerekli ? (
                    <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded font-bold text-[10px] border border-rose-200">
                      Evet (İnceleme Bekliyor)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px] border border-emerald-200">
                      Doğrulandı
                    </span>
                  )}
                </td>
              ))}
            </tr>

          </tbody>
        </table>
      </div>
    </div>
  );
};

