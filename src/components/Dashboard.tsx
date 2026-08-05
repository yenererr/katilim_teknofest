import React, { useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Layers,
  Landmark,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Star,
  Sparkles,
  Info,
  Check,
} from 'lucide-react';
import {
  KarsilastirmaOgesi,
  hesaplaKriterler,
  urunTuruDagilimi,
  guvenBandiDagilimi,
  bankayaGoreGrupla,
  yaklasanBitisler,
  otomatikBulgular,
  aylikKarPayi,
  yuzdeBicim,
} from '../lib/compare';
import { AnimatedNumber } from './AnimatedNumber';

interface DashboardProps {
  ogeler: KarsilastirmaOgesi[];
  isLoading?: boolean;
  /** Bir ürüne gitmek için — kampanyalar sekmesine yönlendirir */
  onSelectProduct?: (id: string) => void;
}

const KpiKart: React.FC<{
  etiket: string;
  deger: number;
  onEk?: string;
  icon: React.ComponentType<{ className?: string }>;
  ton?: 'notr' | 'uyari' | 'olumlu';
  index: number;
}> = ({ etiket, deger, onEk = '', icon: Icon, ton = 'notr', index }) => {
  const reduceMotion = useReducedMotion();
  const tonSinif =
    ton === 'uyari'
      ? 'text-warn-700 dark:text-warn-300'
      : ton === 'olumlu'
        ? 'text-brand-700 dark:text-brand-300'
        : 'text-txt';

  return (
    <motion.li
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.24, delay: reduceMotion ? 0 : index * 0.04 }}
      className="rounded-lg border border-line bg-surface p-4 shadow-flat"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-txt-secondary">{etiket}</span>
        <Icon className="h-4 w-4 shrink-0 text-txt-muted" aria-hidden="true" />
      </div>
      <p className={`mt-2 font-mono text-2xl ${tonSinif}`}>
        <AnimatedNumber value={deger} prefix={onEk} />
      </p>
    </motion.li>
  );
};

/** Yatay bar — elle SVG değil, erişilebilir HTML; değer barın ucunda yazar. */
const YatayBar: React.FC<{ etiket: string; deger: number; maks: number; vurgu?: boolean }> = ({
  etiket,
  deger,
  maks,
  vurgu,
}) => (
  <li className="flex items-center gap-3">
    <span className="w-24 shrink-0 truncate text-xs text-txt-secondary" title={etiket}>
      {etiket}
    </span>
    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-sunken">
      <span
        className={`block h-full rounded-full ${vurgu ? 'bg-brand-500' : 'bg-ink-400 dark:bg-ink-600'}`}
        style={{ width: `${maks > 0 ? Math.max(2, (deger / maks) * 100) : 0}%` }}
      />
    </span>
    <span className="tnum w-8 shrink-0 text-right font-mono text-xs text-txt">{deger}</span>
  </li>
);

export const Dashboard: React.FC<DashboardProps> = ({ ogeler, isLoading, onSelectProduct }) => {
  const reduceMotion = useReducedMotion();

  const kriterler = useMemo(() => hesaplaKriterler(ogeler), [ogeler]);
  const turler = useMemo(() => urunTuruDagilimi(ogeler), [ogeler]);
  const bantlar = useMemo(() => guvenBandiDagilimi(ogeler), [ogeler]);
  const bankalar = useMemo(() => bankayaGoreGrupla(ogeler), [ogeler]);
  const yaklasan = useMemo(() => yaklasanBitisler(ogeler, 60), [ogeler]);
  const bulgular = useMemo(() => otomatikBulgular(ogeler), [ogeler]);

  const inceleme = ogeler.filter((o) => o.product.manuel_dogrulama_gerekli).length;
  const ortalamaGuven =
    ogeler.length > 0
      ? Math.round((ogeler.reduce((a, o) => a + o.product.ortalama_guven, 0) / ogeler.length) * 100)
      : 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="rounded-lg border border-line p-4">
              <div className="skeleton h-4 w-24" />
              <div className="skeleton mt-3 h-8 w-16" />
            </li>
          ))}
        </ul>
        <div className="skeleton h-64 w-full" />
      </div>
    );
  }

  if (ogeler.length === 0) {
    return (
      <div className="flex min-h-96 flex-col items-center justify-center rounded-xl border border-line bg-surface p-10 text-center shadow-raised">
        <Layers className="mb-3 h-8 w-8 text-txt-muted" aria-hidden="true" />
        <h2 className="text-base font-medium text-txt">Henüz veri yok</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-txt-secondary">
          Çıkarım sekmesinde bir kampanya metni analiz edin; özet, dağılım ve karşılaştırma
          bulguları burada oluşur.
        </p>
      </div>
    );
  }

  const maksTur = Math.max(...turler.map((t) => t.adet), 1);
  const bankaOranlari = bankalar
    .filter((b) => b.ortalamaKarPayi !== null)
    .sort((a, b) => (a.ortalamaKarPayi ?? 0) - (b.ortalamaKarPayi ?? 0));
  const maksOran = Math.max(...bankaOranlari.map((b) => b.ortalamaKarPayi ?? 0), 0.0001);

  return (
    <div className="space-y-4">
      {/* KPI şeridi */}
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiKart etiket="Çıkarılan ürün" deger={ogeler.length} icon={Layers} index={0} />
        <KpiKart etiket="İzlenen banka" deger={bankalar.length} icon={Landmark} index={1} />
        <KpiKart
          etiket="Ortalama güven"
          deger={ortalamaGuven}
          onEk="%"
          icon={ShieldCheck}
          ton={ortalamaGuven >= 80 ? 'olumlu' : 'notr'}
          index={2}
        />
        <KpiKart
          etiket="İnceleme bekleyen"
          deger={inceleme}
          icon={AlertTriangle}
          ton={inceleme > 0 ? 'uyari' : 'notr'}
          index={3}
        />
      </ul>

      {/* En avantajlı kartları */}
      <section
        aria-labelledby="kriter-basligi"
        className="rounded-xl border border-line bg-surface p-4 shadow-raised sm:p-5"
      >
        <h2 id="kriter-basligi" className="flex items-center gap-2 text-sm font-medium text-txt">
          <Star className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          Kriter bazlı kazananlar
        </h2>
        <p className="mt-0.5 text-xs text-txt-secondary">
          Yalnızca ilgili alanı metinde bulunan ürünler karşılaştırmaya girer.
        </p>

        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {kriterler.map((k, idx) => (
            <motion.li
              key={k.key}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.22, delay: reduceMotion ? 0 : idx * 0.04 }}
              className={`rounded-lg border p-3 ${
                k.kazanan ? 'border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-950' : 'border-line bg-sunken'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-txt-secondary">{k.etiket}</span>
                {k.kazanan && (
                  <Star
                    className="h-3.5 w-3.5 shrink-0 fill-current text-brand-600 dark:text-brand-400"
                    aria-label="Kazanan"
                  />
                )}
              </div>

              {k.kazanan ? (
                <>
                  <button
                    type="button"
                    onClick={() => onSelectProduct?.(k.kazanan!.id)}
                    className="mt-1.5 block w-full text-left text-sm font-medium text-txt hover:underline"
                  >
                    {k.kazanan.bankaAdi}
                  </button>
                  <p className="truncate text-xs text-txt-secondary">
                    {k.kazanan.product.urun_adi || 'İsimsiz ürün'}
                  </p>
                  <p className="tnum mt-2 font-mono text-lg text-brand-700 dark:text-brand-300">
                    {k.gosterim}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-txt-muted">Karşılaştırılabilir veri yok</p>
              )}

              <p className="mt-2 text-xs text-txt-muted">
                <span className="tnum font-mono">{k.degerlendirilen}</span> ürün değerlendirildi
                {k.disBirakilan > 0 && (
                  <>
                    {' · '}
                    <span className="tnum font-mono">{k.disBirakilan}</span> dışarıda
                  </>
                )}
              </p>
              {k.disBirakmaSebebi && (
                <p className="mt-0.5 text-xs text-txt-muted italic">{k.disBirakmaSebebi}</p>
              )}
            </motion.li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Dağılımlar */}
        <section className="space-y-4 xl:col-span-2">
          <div className="rounded-xl border border-line bg-surface p-4 shadow-raised sm:p-5">
            <h2 className="text-sm font-medium text-txt">Ürün türüne göre dağılım</h2>
            <ul className="mt-4 space-y-2.5">
              {turler.map((t) => (
                <YatayBar key={t.tur} etiket={t.etiket} deger={t.adet} maks={maksTur} />
              ))}
            </ul>
          </div>

          {bankaOranlari.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-4 shadow-raised sm:p-5">
              <h2 className="text-sm font-medium text-txt">Bankaya göre ortalama kâr payı</h2>
              <p className="mt-0.5 text-xs text-txt-secondary">
                Aylığa normalize edilmiş; periyodu belirsiz ürünler hariç. En düşük vurgulanmıştır.
              </p>
              <ul
                className="mt-4 space-y-2.5"
                aria-label={`${bankaOranlari.length} bankanın ortalama aylık kâr payı oranı karşılaştırması`}
              >
                {bankaOranlari.map((b, i) => (
                  <li key={b.banka} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-xs text-txt-secondary" title={b.banka}>
                      {b.banka}
                    </span>
                    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-sunken">
                      <span
                        className={`block h-full rounded-full ${i === 0 ? 'bg-brand-500' : 'bg-ink-400 dark:bg-ink-600'}`}
                        style={{ width: `${Math.max(3, ((b.ortalamaKarPayi ?? 0) / maksOran) * 100)}%` }}
                      />
                    </span>
                    <span className="tnum w-16 shrink-0 text-right font-mono text-xs text-txt">
                      {yuzdeBicim(b.ortalamaKarPayi ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {yaklasan.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-4 shadow-raised sm:p-5">
              <h2 className="flex items-center gap-2 text-sm font-medium text-txt">
                <Clock className="h-4 w-4 text-warn-600 dark:text-warn-400" aria-hidden="true" />
                Yakında sona erecek kampanyalar
              </h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">
                    Bitiş tarihine 60 günden az kalan kampanyalar
                  </caption>
                  <thead>
                    <tr className="border-b border-line text-xs text-txt-secondary">
                      <th scope="col" className="py-2 pr-3">Kampanya</th>
                      <th scope="col" className="py-2 pr-3">Banka</th>
                      <th scope="col" className="py-2 pr-3">Kalan</th>
                      <th scope="col" className="py-2">Bitiş</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {yaklasan.slice(0, 6).map(({ oge, kalan }) => (
                      <tr key={oge.id}>
                        <td className="max-w-56 truncate py-2.5 pr-3 text-txt">
                          {oge.product.urun_adi || 'İsimsiz ürün'}
                        </td>
                        <td className="py-2.5 pr-3 text-txt-secondary">{oge.bankaAdi}</td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`tnum inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-xs ${
                              kalan <= 7
                                ? 'border-risk-200 bg-risk-50 text-risk-700 dark:border-risk-800 dark:bg-risk-950 dark:text-risk-300'
                                : 'border-warn-200 bg-warn-50 text-warn-800 dark:border-warn-800 dark:bg-warn-950 dark:text-warn-200'
                            }`}
                          >
                            {kalan <= 7 && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
                            {kalan} gün
                          </span>
                        </td>
                        <td className="tnum py-2.5 font-mono text-xs text-txt-secondary">
                          {oge.product.kampanya_bitis}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Bulgular ve güven dağılımı */}
        <section className="space-y-4">
          <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 shadow-raised sm:p-5 dark:border-brand-800 dark:bg-brand-950/40">
            <h2 className="flex items-center gap-2 text-sm font-medium text-txt">
              <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
              Otomatik bulgular
            </h2>
            <p className="mt-0.5 text-xs text-txt-secondary">
              Yalnızca eldeki kayıtlardan türetilmiştir.
            </p>
            <ul className="mt-3 space-y-2.5">
              {bulgular.map((b) => {
                const Icon = b.tur === 'uyari' ? AlertTriangle : b.tur === 'olumlu' ? Check : Info;
                const renk =
                  b.tur === 'uyari'
                    ? 'text-warn-600 dark:text-warn-400'
                    : b.tur === 'olumlu'
                      ? 'text-brand-600 dark:text-brand-400'
                      : 'text-txt-muted';
                return (
                  <li key={b.id} className="flex items-start gap-2 text-sm leading-relaxed text-txt-secondary">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${renk}`} aria-hidden="true" />
                    <span>{b.metin}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-xl border border-line bg-surface p-4 shadow-raised sm:p-5">
            <h2 className="text-sm font-medium text-txt">Güven bandı dağılımı</h2>
            <div
              className="mt-3 flex h-3 overflow-hidden rounded-full bg-sunken"
              role="img"
              aria-label={`Yüksek güven ${bantlar.yuksek}, orta ${bantlar.orta}, düşük ${bantlar.dusuk} ürün`}
            >
              {bantlar.yuksek > 0 && (
                <span className="bg-brand-500" style={{ width: `${(bantlar.yuksek / ogeler.length) * 100}%` }} />
              )}
              {bantlar.orta > 0 && (
                <span className="bg-warn-500" style={{ width: `${(bantlar.orta / ogeler.length) * 100}%` }} />
              )}
              {bantlar.dusuk > 0 && (
                <span className="bg-risk-500" style={{ width: `${(bantlar.dusuk / ogeler.length) * 100}%` }} />
              )}
            </div>
            <ul className="mt-3 space-y-1.5 text-xs">
              <li className="flex items-center justify-between text-txt-secondary">
                <span className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                  Yüksek (≥%90)
                </span>
                <span className="tnum font-mono text-txt">{bantlar.yuksek}</span>
              </li>
              <li className="flex items-center justify-between text-txt-secondary">
                <span className="flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-warn-600 dark:text-warn-400" aria-hidden="true" />
                  Orta (%60–89)
                </span>
                <span className="tnum font-mono text-txt">{bantlar.orta}</span>
              </li>
              <li className="flex items-center justify-between text-txt-secondary">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-risk-600 dark:text-risk-400" aria-hidden="true" />
                  Düşük (&lt;%60)
                </span>
                <span className="tnum font-mono text-txt">{bantlar.dusuk}</span>
              </li>
            </ul>
          </div>

          {ogeler.some((o) => aylikKarPayi(o.product) === null) && (
            <p className="rounded-lg border border-line bg-sunken p-3 text-xs leading-relaxed text-txt-secondary">
              Periyodu belirsiz oranlar aylığa çevrilemediği için oran karşılaştırmalarına dâhil
              edilmez. Bu ürünleri Çıkarım sekmesinde kanıt alıntısıyla doğrulayabilirsiniz.
            </p>
          )}
        </section>
      </div>
    </div>
  );
};
