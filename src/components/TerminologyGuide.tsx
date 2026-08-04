import React from 'react';
import { BookOpen, ArrowRight } from 'lucide-react';

export const TerminologyGuide: React.FC = () => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-8 text-slate-800">
      
      {/* Title */}
      <div className="border-b border-slate-100 pb-4">
        <div className="flex items-center space-x-2 text-emerald-600 font-bold text-xs uppercase tracking-wider mb-1">
          <BookOpen className="w-4 h-4" />
          <span>Ajan Çalışma Mantığı & Standart Rehber</span>
        </div>
        <h2 className="text-lg font-bold text-slate-900">
          Katılım Bankacılığı Bilgi Çıkarım Sözlüğü ve Normalizasyon Standartları
        </h2>
        <p className="text-xs text-slate-500 mt-1 font-medium">
          Bu ajanın ham metinleri okurken uyguladığı kesin eşleme, terim dönüşümü ve doğrulama kuralları.
        </p>
      </div>

      {/* Section 1: Terminology Mapping */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
          <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-mono font-bold">1</span>
          <span>Zorunlu Terim Eşleme Matrisi</span>
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed">
          Katılım bankacılığı ilkeleri doğrultusunda, konvansiyonel bankacılık terimleri çıkarımda kesinlikle kullanılmaz. Kaynak metin konvansiyonel terim içeriyorsa dönüşüm yapılır ve <code className="text-amber-800 bg-amber-50 px-1 py-0.5 rounded font-mono font-bold">terim_esleme_uygulandi: true</code> işaretlenir.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Konvansiyonel → Katılım</div>
            <div className="mt-1 flex items-center justify-between font-mono text-xs">
              <span className="line-through text-rose-600 font-semibold">faiz / faiz oranı</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <strong className="text-emerald-700">kâr payı</strong>
            </div>
            <div className="mt-1 text-[10px] text-slate-500 font-mono">Alan: kar_payi_orani</div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Konvansiyonel → Katılım</div>
            <div className="mt-1 flex items-center justify-between font-mono text-xs">
              <span className="line-through text-rose-600 font-semibold">kredi</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <strong className="text-emerald-700">finansman</strong>
            </div>
            <div className="mt-1 text-[10px] text-slate-500 font-mono">Alan: urun_turu</div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Konvansiyonel → Katılım</div>
            <div className="mt-1 flex items-center justify-between font-mono text-xs">
              <span className="line-through text-rose-600 font-semibold">mevduat</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <strong className="text-emerald-700">katılım fonu</strong>
            </div>
            <div className="mt-1 text-[10px] text-slate-500 font-mono">Alan: urun_turu</div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Konvansiyonel → Katılım</div>
            <div className="mt-1 flex items-center justify-between font-mono text-xs">
              <span className="line-through text-rose-600 font-semibold">dosya masrafı</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <strong className="text-emerald-700">tahsis ücreti</strong>
            </div>
            <div className="mt-1 text-[10px] text-slate-500 font-mono">Alan: tahsis_ucreti</div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Konvansiyonel → Katılım</div>
            <div className="mt-1 flex items-center justify-between font-mono text-xs">
              <span className="line-through text-rose-600 font-semibold">kart puanı</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <strong className="text-emerald-700">ödül</strong>
            </div>
            <div className="mt-1 text-[10px] text-slate-500 font-mono">Alan: odul_miktari</div>
          </div>
        </div>
      </div>

      {/* Section 2: Normalization Rules */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
          <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-mono font-bold">2</span>
          <span>Sayısal Normalizasyon & Standart Dönüşümler</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
            <strong className="text-emerald-800 font-bold">1. Oran Normalizasyonu:</strong>
            <p className="text-slate-600">
              "%2,05" · "2.05 %" · "yüzde 2,05" ifadeleri ondalık sayıya çevrilir: <code className="text-emerald-700 font-mono font-bold">0.0205</code> (Nokta ayraçlı).
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
            <strong className="text-emerald-800 font-bold">2. Vadeler Her Zaman AY Cinsindendir:</strong>
            <p className="text-slate-600">
              "10 yıl" → <code className="text-emerald-700 font-mono font-bold">120</code>. "36 aya varan" → <code className="text-emerald-700 font-mono font-bold">max: 36, min: null</code>.
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
            <strong className="text-emerald-800 font-bold">3. Ücret Sıfırlama (Olumsuz İfadeler):</strong>
            <p className="text-slate-600">
              "Tahsis ücreti alınmaz" → <code className="text-emerald-700 font-mono font-bold">deger: 0.00, tipi: "yok"</code>.
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
            <strong className="text-emerald-800 font-bold">4. Kâr Payı Periyodu Kesinliği:</strong>
            <p className="text-slate-600">
              Metinde "aylık" veya "yıllık" geçmiyorsa <code className="text-amber-800 font-mono">periyot: "belirsiz"</code> atanır ve güven skoru max 0.5 olur.
            </p>
          </div>
        </div>
      </div>

      {/* Section 3: Closed Lists & Categories */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
          <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-mono font-bold">3</span>
          <span>Kapalı Liste Sınıflandırmaları</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="font-bold text-emerald-800 mb-2">Ürün Türü (`urun_turu`):</div>
            <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
              {['konut_finansmani', 'tasit_finansmani', 'ihtiyac_finansmani', 'kart', 'katilim_fonu', 'yatirim', 'alisveris_puani', 'diger'].map(t => (
                <span key={t} className="px-2 py-0.5 bg-white border border-slate-200 text-slate-700 rounded font-semibold">
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="font-bold text-emerald-800 mb-2">Müşteri Segmenti (`musteri_segmenti`):</div>
            <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
              {['yeni_musteri', 'mevcut_musteri', 'kurumsal', 'kobi', 'genc', 'emekli', 'tumu'].map(s => (
                <span key={s} className="px-2 py-0.5 bg-white border border-slate-200 text-slate-700 rounded font-semibold">
                  {s}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-2 italic">
              * Metin segment belirtmiyorsa varsayılan olarak "tumu" değil, boş dizi [] döndürülür.
            </p>
          </div>
        </div>
      </div>

      {/* Section 4: Evidence & Confidence rules */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
          <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-mono font-bold">4</span>
          <span>Kanıt Zorunluluğu ve Güven Skoru Ölçeği</span>
        </h3>

        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-3">
          <p className="text-slate-700 leading-relaxed">
            Ajan çıkardığı HER alan için, o alanın dayandığı cümleyi <code className="text-emerald-800 font-mono font-bold">kanitlar</code> nesnesinde birebir kaynak metinden alıntılamak zorundadır. Kanıt gösterilemeyen alan çıkarılamaz.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900">
              <div className="font-bold text-xs text-emerald-800">0.9 – 1.0</div>
              <div className="text-[10px] font-sans text-emerald-700">Metinde açıkça ve tek anlamlı yazılı.</div>
            </div>
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
              <div className="font-bold text-xs text-amber-800">0.6 – 0.8</div>
              <div className="text-[10px] font-sans text-amber-700">Biçim veya birim hafif yoruma açık.</div>
            </div>
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-900">
              <div className="font-bold text-xs text-rose-800">0.3 – 0.5</div>
              <div className="text-[10px] font-sans text-rose-700">Dolaylı çıkarım / periyot belirsiz.</div>
            </div>
            <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-600">
              <div className="font-bold text-xs text-slate-700">0.0</div>
              <div className="text-[10px] font-sans text-slate-500">Alan metinde hiç geçmiyor.</div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

