import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  ChevronRight,
  Home as HomeIcon,
  MessageSquare,
  Receipt,
  Send,
  Sparkles,
  Tag,
} from 'lucide-react';
import {
  BANKALAR,
  BANKA_INDEKS,
  FINANSMAN_SECENEKLERI,
  FINANSMAN_TURLERI,
  FinansmanTuru,
  VADELER,
  VARSAYILAN_TUTAR,
} from '../data/piyasa';
import { aylikTaksit, oranBicim, sayiBicim, tlBicim } from '../lib/finansman';
import { hesaplaOdemePlani } from '../lib/odemePlani';
import { isDisplayableCampaignClient } from '../lib/kampanyaFiltre';
import { kisaKampanyaAciklama } from '../lib/kampanyaOzet';
import { KarsilastirmaOgesi } from '../lib/compare';
import { FINANSMAN_NOTLARI_BY_KEY } from '../data/finansmanNotlari';
import { BankMark } from './BankMark';
import { FxConverter } from './FxConverter';
import { FxRateTicker } from './FxRateTicker';
import { TabKey } from './nav';

/** Ana sayfa canlı karşılaştırma: bankanın kendi API’si olan üç katılım bankası */
const CANLI_BANKALAR: { id: string; path: string }[] = [
  { id: 'vakif-katilim', path: '/api/calculators/vakif-katilim' },
  { id: 'ziraat-katilim', path: '/api/calculators/ziraat-katilim' },
  { id: 'kuveyt-turk', path: '/api/calculators/kuveyt-turk' },
];

type LiveCampaignOzet = {
  id?: string;
  bankId: string;
  title?: string | null;
  productName?: string | null;
  sourceUrl?: string | null;
  campaignEnd?: string | null;
  campaignTheme?: string | null;
  conditions?: string[] | null;
  participationMethod?: string | null;
  evidence?: Array<string | { text?: unknown }> | null;
  installmentCount?: number | null;
  maxTermMonths?: number | null;
  minAmountTl?: number | null;
  maxAmountTl?: number | null;
  rewardAmountTl?: number | null;
  rewardType?: string | null;
};

export interface KarsilastirmaTalebi {
  tur: FinansmanTuru;
  tutar: number;
  vadeAy: number;
}

interface HomeViewProps {
  setActiveTab: (tab: TabKey) => void;
  /** “Karşılaştır” tetiklendiğinde son işlemlere kaydedilir */
  onKarsilastir: (talep: KarsilastirmaTalebi) => void;
  /** Asistan kutusundan gönderilen soru */
  onAsistanaSor: (soru: string) => void;
  talep: KarsilastirmaTalebi;
  ogeler: KarsilastirmaOgesi[];
}

const HERO_SEKMELERI: { key: 'finansman' | 'kampanya' | 'ucret' | 'asistan'; etiket: string; icon: typeof HomeIcon }[] = [
  { key: 'finansman', etiket: 'Finansman', icon: HomeIcon },
  { key: 'kampanya', etiket: 'Kampanya', icon: Tag },
  { key: 'ucret', etiket: 'Ücret', icon: Receipt },
  { key: 'asistan', etiket: 'Asistana Sor', icon: MessageSquare },
];

const TEMA_ETIKET: Record<string, string> = {
  education: 'EĞİTİM',
  card: 'KART',
  housing: 'KONUT',
  vehicle: 'TAŞIT',
  new_customer: 'YENİ MÜŞTERİ',
  shopping: 'ALIŞVERİŞ',
  general: 'GENEL',
};

/** Canlı hesaplama / özel oran yedek satırı */
type CanliBankaSonuc = {
  bankaId: string;
  bankaAdi: string;
  profitRatePercent: number;
  monthlyInstallmentTl: number;
  totalPaymentTl: number | null;
  appraisementFeeTl: number | null;
  sourceLabel?: string;
};

function softtechCanliSatir(opts: {
  bankaId: string;
  amountTl: number;
  termMonths: number;
  profitRatePercent: number;
  financingType: string;
}): CanliBankaSonuc | null {
  try {
    const plan = hesaplaOdemePlani({
      amountTl: opts.amountTl,
      termMonths: opts.termMonths,
      profitRatePercent: opts.profitRatePercent,
      financingType: opts.financingType,
    });
    return {
      bankaId: opts.bankaId,
      bankaAdi: BANKA_INDEKS[opts.bankaId]?.ad || opts.bankaId,
      profitRatePercent: opts.profitRatePercent,
      monthlyInstallmentTl: plan.taksitTutari,
      totalPaymentTl: plan.odenecekToplamTutar,
      appraisementFeeTl: 0,
      sourceLabel: 'Özel oran (yerel motor)',
    };
  } catch {
    return null;
  }
}

export const HomeView: React.FC<HomeViewProps> = ({
  setActiveTab,
  onKarsilastir,
  onAsistanaSor,
  talep,
  ogeler,
}) => {
  const [heroSekme, setHeroSekme] = useState<'finansman' | 'kampanya' | 'ucret' | 'asistan'>(
    'finansman',
  );
  const [secenek, setSecenek] = useState<string>('tasit_finansmani');
  // Karşılaştırılan ayrıntılı tür — canlı hesaplama servisine bu gönderilir.
  const [aktifSecenek, setAktifSecenek] = useState<string>('');
  const secilen = FINANSMAN_SECENEKLERI.find((f) => f.key === secenek) || null;
  const tur: FinansmanTuru = secilen?.temelTur ?? talep.tur;
  const [tutarMetni, setTutarMetni] = useState<string>(sayiBicim(talep.tutar));
  const [vadeAy, setVadeAy] = useState<number>(talep.vadeAy);
  const [vadeMetni, setVadeMetni] = useState<string>(String(talep.vadeAy));
  const [soru, setSoru] = useState('');
  /** Özel kâr oranı — işaretlenince kullanıcı oranı kullanılır. */
  const [oranOzel, setOranOzel] = useState(false);
  const [oranMetni, setOranMetni] = useState('3,99');
  /** 1 = finansman tutarından, 2 = taksit tutarından */
  const [hesapTipi, setHesapTipi] = useState<'1' | '2'>('1');
  // Vakıf / Ziraat / Kuveyt canlı hesaplama (özel oranda yerel yedek).
  const [canliBankalar, setCanliBankalar] = useState<CanliBankaSonuc[]>([]);
  const [canliNotu, setCanliNotu] = useState<string | null>(null);
  const [canliYukleniyor, setCanliYukleniyor] = useState(false);

  const tutar = useMemo(() => {
    const rakamlar = tutarMetni.replace(/[^\d]/g, '');
    return rakamlar ? Number(rakamlar) : 0;
  }, [tutarMetni]);

  const ozelOranYuzde = useMemo(() => {
    if (!oranOzel) return null;
    const n = Number(oranMetni.replace(',', '.').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [oranOzel, oranMetni]);

  const turNotu = secenek ? FINANSMAN_NOTLARI_BY_KEY[secenek] : null;
  const [canliKampanyalar, setCanliKampanyalar] = useState<LiveCampaignOzet[]>([]);

  useEffect(() => {
    let iptal = false;
    fetch('/api/live/campaigns')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('yanıt yok'))))
      .then(
        (d: {
          financingCampaigns?: LiveCampaignOzet[];
          cardAndDiscountCampaigns?: LiveCampaignOzet[];
        }) => {
          if (iptal) return;
          const hepsi = [
            ...(d.financingCampaigns || []),
            ...(d.cardAndDiscountCampaigns || []),
          ].filter(isDisplayableCampaignClient);
          const uniq = new Map<string, LiveCampaignOzet>();
          for (const c of hepsi) {
            const key = `${c.bankId}|${c.sourceUrl || c.id || c.title}`;
            if (!uniq.has(key)) uniq.set(key, c);
          }
          setCanliKampanyalar([...uniq.values()]);
        },
      )
      .catch(() => {
        if (!iptal) setCanliKampanyalar([]);
      });
    return () => {
      iptal = true;
    };
  }, []);

  const canliSatirlar = useMemo(
    () =>
      ogeler
        .map((oge) => {
          const product = oge.product;
          if (product.urun_turu !== talep.tur) return null;

          const oran = product.terimler?.kar_payi_orani;
          if (oran?.deger === undefined || oran.deger === null || oran.deger <= 0) return null;

          const aylikKarPayi =
            oran.periyot === 'yillik' ? oran.deger / 12 : oran.periyot === 'aylik' ? oran.deger : null;
          if (aylikKarPayi === null) return null;

          const azamiVade = product.terimler?.vade_ay?.max ?? null;
          const uygunMu = azamiVade === null || talep.vadeAy <= azamiVade;
          const taksit = aylikTaksit(talep.tutar, aylikKarPayi, talep.vadeAy);
          const toplamOdeme = taksit * talep.vadeAy;
          const tahsisUcreti = product.terimler?.tahsis_ucreti?.deger ?? 0;
          const bankaId = BANKALAR.find((b) => b.ad === oge.bankaAdi)?.id;

          return {
            id: oge.id,
            bankaId,
            bankaAdi: oge.bankaAdi,
            aylikKarPayi,
            taksit,
            toplamOdeme,
            tahsisUcreti,
            toplamMaliyet: toplamOdeme + tahsisUcreti,
            kampanyaliMi: Boolean(product.kampanya_bitis || product.terimler?.odul?.deger),
            uygunMu,
            canli: true,
          };
        })
        .filter((s): s is NonNullable<typeof s> => Boolean(s))
        .sort((a, b) => {
          if (a.uygunMu !== b.uygunMu) return a.uygunMu ? -1 : 1;
          return a.toplamMaliyet - b.toplamMaliyet;
        }),
    [ogeler, talep],
  );
  // Üç bankanın canlı hesaplama servisinden sonuç al; özel oranda API
  // başarısız olursa Softtech (yerel) formülle doldur.
  useEffect(() => {
    if (talep.tutar <= 0 || talep.vadeAy <= 0) {
      setCanliBankalar([]);
      return;
    }
    let iptal = false;
    setCanliYukleniyor(true);
    const finansmanTipi = aktifSecenek || talep.tur;
    const zamanlayici = setTimeout(() => {
      const govde = {
        financingType: finansmanTipi,
        amountTl: talep.tutar,
        termMonths: talep.vadeAy,
        calculateType: hesapTipi,
        ...(ozelOranYuzde != null ? { profitRatePercent: ozelOranYuzde } : {}),
      };
      void Promise.all(
        CANLI_BANKALAR.map(async ({ id, path }) => {
          try {
            const r = await fetch(path, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(govde),
            });
            if (!r.ok) return { id, reason: null as string | null, sonuc: null };
            const d = (await r.json()) as {
              available?: boolean;
              reason?: string;
              bankId?: string;
              profitRatePercent?: number | null;
              monthlyInstallmentTl?: number | null;
              totalPaymentTl?: number | null;
              appraisementFeeTl?: number | null;
              allocationFeeTl?: number | null;
            };
            if (d.available === false) {
              return { id, reason: d.reason || null, sonuc: null };
            }
            if (
              d.monthlyInstallmentTl == null ||
              d.profitRatePercent == null ||
              !(d.profitRatePercent > 0)
            ) {
              return { id, reason: null, sonuc: null };
            }
            return {
              id,
              reason: null as string | null,
              sonuc: {
                bankaId: d.bankId || id,
                bankaAdi: BANKA_INDEKS[d.bankId || id]?.ad || id,
                profitRatePercent: d.profitRatePercent,
                monthlyInstallmentTl: d.monthlyInstallmentTl,
                totalPaymentTl: d.totalPaymentTl ?? null,
                appraisementFeeTl:
                  (d.allocationFeeTl ?? 0) > 0
                    ? d.allocationFeeTl!
                    : (d.appraisementFeeTl ?? null),
                sourceLabel: 'Canlı banka hesabı',
              } satisfies CanliBankaSonuc,
            };
          } catch {
            return { id, reason: null as string | null, sonuc: null };
          }
        }),
      ).then((sonuclar) => {
        if (iptal) return;
        const dolu: CanliBankaSonuc[] = [];
        const notlar: string[] = [];
        for (const s of sonuclar) {
          if (s.sonuc) {
            dolu.push(s.sonuc);
            continue;
          }
          if (s.reason) notlar.push(s.reason);
          // Özel oran seçiliyse API olmayan bankayı yerel motorla tamamla.
          if (ozelOranYuzde != null) {
            const yedek = softtechCanliSatir({
              bankaId: s.id,
              amountTl: talep.tutar,
              termMonths: talep.vadeAy,
              profitRatePercent: ozelOranYuzde,
              financingType: finansmanTipi,
            });
            if (yedek) dolu.push(yedek);
          }
        }
        setCanliBankalar(dolu);
        setCanliNotu(notlar[0] ?? null);
        if (!oranOzel) {
          const referans =
            dolu.find((x) => x.bankaId === 'vakif-katilim') ?? dolu[0];
          if (referans?.profitRatePercent != null) {
            setOranMetni(
              referans.profitRatePercent.toLocaleString('tr-TR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }),
            );
          }
        }
        setCanliYukleniyor(false);
      });
    }, 350);
    return () => {
      iptal = true;
      clearTimeout(zamanlayici);
    };
  }, [aktifSecenek, talep.tur, talep.tutar, talep.vadeAy, hesapTipi, ozelOranYuzde, oranOzel]);

  const canliVeriAktif = canliSatirlar.length > 0;
  const temelSatirlar = canliSatirlar;

  // Canlı (veya özel oran yedek) satırları scrape satırlarının üzerine yazar.
  const tabloSatirlari = useMemo(() => {
    if (canliBankalar.length === 0) return temelSatirlar;

    const canliSatirMapped = canliBankalar.map((t) => {
      const toplamOdeme =
        t.totalPaymentTl ?? t.monthlyInstallmentTl * talep.vadeAy;
      const tahsisUcreti = t.appraisementFeeTl ?? 0;
      return {
        id: `${t.bankaId}-canli`,
        bankaId: t.bankaId,
        bankaAdi: t.bankaAdi,
        aylikKarPayi: t.profitRatePercent / 100,
        taksit: t.monthlyInstallmentTl,
        toplamOdeme,
        tahsisUcreti,
        toplamMaliyet: toplamOdeme + tahsisUcreti,
        kampanyaliMi: false,
        uygunMu: true,
        canli: true as const,
      };
    });

    // Özel oran: yalnızca aynı oranla hesaplanan üç bankayı göster (karışık scrape oranı olmasın).
    if (ozelOranYuzde != null) {
      return [...canliSatirMapped].sort((a, b) => {
        if (a.uygunMu !== b.uygunMu) return a.uygunMu ? -1 : 1;
        return a.toplamMaliyet - b.toplamMaliyet;
      });
    }

    const canliIds = new Set(canliBankalar.map((t) => t.bankaId));
    const digerleri = temelSatirlar.filter((s) => !s.bankaId || !canliIds.has(s.bankaId));
    return [...digerleri, ...canliSatirMapped].sort((a, b) => {
      if (a.uygunMu !== b.uygunMu) return a.uygunMu ? -1 : 1;
      return a.toplamMaliyet - b.toplamMaliyet;
    });
  }, [temelSatirlar, canliBankalar, ozelOranYuzde, talep.vadeAy]);

  const gecerliSatirlar = tabloSatirlari.filter((s) => s.uygunMu);
  const oneCikanKampanyalar = canliKampanyalar.slice(0, 3);

  const secenekDegistir = (yeniKey: string) => {
    setSecenek(yeniKey);
    const yeni = FINANSMAN_SECENEKLERI.find((f) => f.key === yeniKey);
    if (!yeni) return;
    setTutarMetni(sayiBicim(VARSAYILAN_TUTAR[yeni.temelTur]));
    // Kullanıcının yazdığı vade korunur (1–360 ay).
    if (vadeAy < 1 || vadeAy > 360) {
      const vadeler = VADELER[yeni.temelTur];
      const varsayilan = vadeler[Math.floor(vadeler.length / 2)];
      setVadeAy(varsayilan);
      setVadeMetni(String(varsayilan));
    }
  };

  const vadeUygula = (ham: string) => {
    const n = Number(ham.replace(/[^\d]/g, ''));
    if (!Number.isFinite(n) || n < 1) {
      setVadeMetni(String(vadeAy));
      return;
    }
    const ay = Math.min(360, Math.floor(n));
    setVadeAy(ay);
    setVadeMetni(String(ay));
  };

  const karsilastirGonder = (event: React.FormEvent) => {
    event.preventDefault();
    // Tür seçilmeden karşılaştırma yapılmaz.
    if (!secilen || tutar <= 0) return;
    setAktifSecenek(secilen.key);
    onKarsilastir({ tur: secilen.temelTur, tutar, vadeAy });
  };

  return (
    <div className="space-y-6">
      {/* ---------- Kahraman alanı ---------- */}
      <section className="mx-auto max-w-3xl py-6 text-center sm:py-8">
        <div>
          <p className="flex items-center justify-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
            Bağımsız karşılaştırma
            <span className="text-line-strong" aria-hidden="true">•</span>
            Güncel banka verileri
          </p>
          <h1 className="mx-auto mt-3 max-w-2xl text-3xl font-extrabold text-balance text-txt sm:text-[48px] sm:leading-[56px]">
            Size en uygun katılım finansmanını bulun.
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-txt-secondary sm:text-lg">
            Katılım bankalarının güncel kâr oranlarını, aylık taksitlerini ve toplam maliyetlerini
            sade bir tabloda karşılaştırın.
          </p>

          <nav
            aria-label="Hızlı geçiş"
            className="mx-auto mt-7 max-w-3xl rounded-lg border border-line bg-surface p-1.5 shadow-flat"
          >
            <div className="flex items-center gap-1 overflow-x-auto">
              {HERO_SEKMELERI.map((s) => {
                const Icon = s.icon;
                const isActive = heroSekme === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => {
                      setHeroSekme(s.key);
                      if (s.key === 'kampanya') setActiveTab('kampanyalar');
                      if (s.key === 'ucret') setActiveTab('ucretler');
                      if (s.key === 'asistan') setActiveTab('finansman-asistani');
                    }}
                    className={`relative flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                      isActive
                        ? 'font-semibold text-brand-700 dark:text-brand-200'
                        : 'text-txt-secondary hover:bg-sunken/80 hover:text-txt'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {s.etiket}
                    {isActive && (
                      <motion.span
                        layoutId="hero-nav"
                        className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand-500 dark:bg-brand-400"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </nav>

        </div>
      </section>

      <form
        onSubmit={karsilastirGonder}
        className="mx-auto max-w-5xl space-y-3 rounded-xl border border-line bg-surface p-4 text-left shadow-raised sm:p-5"
      >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1.1fr_1fr_0.9fr_auto]">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-txt-muted">
                  Finansman Türü
                </span>
                <select
                  value={secenek}
                  onChange={(e) => secenekDegistir(e.target.value)}
                  className={`h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100 ${
                    secenek ? 'text-txt' : 'text-txt-muted'
                  }`}
                >
                  <option value="">Finansman türü seçin</option>
                  {FINANSMAN_SECENEKLERI.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.etiket}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-txt-secondary">
                  {hesapTipi === '2' ? 'Taksit Tutarı' : 'Tutar'}
                </span>
                <span className="relative block">
                  <input
                    inputMode="numeric"
                    value={tutarMetni}
                    onChange={(e) => setTutarMetni(e.target.value)}
                    onBlur={() => setTutarMetni(tutar ? sayiBicim(tutar) : '')}
                    className="tnum h-11 w-full rounded-lg border border-line bg-surface px-3 pr-10 font-mono text-sm text-txt transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                  <span className="absolute inset-y-0 right-3 grid place-items-center text-xs text-txt-muted">
                    TL
                  </span>
                </span>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-txt-muted">Vade (Ay)</span>
                <span className="relative block">
                  <input
                    list={`home-vade-${tur}`}
                    inputMode="numeric"
                    value={vadeMetni}
                    onChange={(e) => setVadeMetni(e.target.value)}
                    onBlur={() => vadeUygula(vadeMetni)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') vadeUygula(vadeMetni);
                    }}
                    aria-label="Vade ay olarak"
                    className="tnum h-11 w-full rounded-lg border border-line bg-surface px-3 pr-10 font-mono text-sm text-txt transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-xs text-txt-muted">
                    Ay
                  </span>
                </span>
                <datalist id={`home-vade-${tur}`}>
                  {VADELER[tur].map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </label>

              <button
                type="submit"
                disabled={!secilen || tutar <= 0}
                className="mt-auto inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-6 text-sm font-semibold text-white shadow-raised transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 disabled:opacity-50 dark:ring-offset-surface"
              >
                Karşılaştır
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-2">
              <div className="block">
                <span className="mb-1 block text-xs text-txt-secondary">
                  Kâr Oranı Kendin Belirle
                </span>
                <div className="flex h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3">
                  <input
                    id="home-oran-ozel"
                    type="checkbox"
                    checked={oranOzel}
                    onChange={(e) => setOranOzel(e.target.checked)}
                    className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-400"
                  />
                  <label htmlFor="home-oran-ozel" className="sr-only">
                    Özel kâr oranı kullan
                  </label>
                  <input
                    inputMode="decimal"
                    disabled={!oranOzel}
                    value={oranMetni}
                    onChange={(e) => setOranMetni(e.target.value)}
                    aria-label="Aylık kâr oranı yüzdesi"
                    className="tnum h-full min-w-0 flex-1 bg-transparent font-mono text-sm text-txt outline-none disabled:text-txt-muted"
                  />
                </div>
              </div>

              <fieldset className="flex flex-wrap items-end gap-x-5 gap-y-2 pb-1">
                <legend className="sr-only">Hesaplama biçimi</legend>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-txt">
                  <input
                    type="radio"
                    name="home-hesap-tipi"
                    checked={hesapTipi === '1'}
                    onChange={() => setHesapTipi('1')}
                    className="h-4 w-4 border-line text-brand-600 focus:ring-brand-400"
                  />
                  Finansman Tutarından Hesapla
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-txt">
                  <input
                    type="radio"
                    name="home-hesap-tipi"
                    checked={hesapTipi === '2'}
                    onChange={() => setHesapTipi('2')}
                    className="h-4 w-4 border-line text-brand-600 focus:ring-brand-400"
                  />
                  Taksit Tutarından Hesapla
                </label>
              </fieldset>
            </div>

        {turNotu && (
          <p className="text-[11px] leading-relaxed text-txt-muted">{turNotu.metin}</p>
        )}
      </form>

      <FxRateTicker />

      {/* ---------- İki sütun ---------- */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {/* Sonuç tablosu */}
          <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-raised">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-brand-50/80 px-4 py-3.5 dark:bg-brand-950/40">
              <h2 className="text-base font-semibold tracking-tight text-txt">
                Finansman Karşılaştırma Sonuçları
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('finansmanlar')}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-brand-700 transition-colors hover:text-brand-800 dark:text-brand-400"
              >
                Tümünü Gör
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            <p className="px-4 pt-3 text-xs text-txt-secondary">
              {FINANSMAN_TURLERI.find((f) => f.key === talep.tur)?.etiket} ·{' '}
              <span className="tnum font-mono">{tlBicim(talep.tutar)}</span> ·{' '}
              <span className="tnum font-mono">{talep.vadeAy} ay</span> · toplam maliyete göre
              sıralı
              {canliVeriAktif && (
                <span className="ml-1 rounded border border-brand-200 bg-brand-50 px-1.5 py-0.5 text-[0.625rem] text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300">
                  canlı scrape
                </span>
              )}
              {canliYukleniyor && (
                <span className="ml-1 text-[0.625rem] text-txt-muted">
                  Canlı hesaplanıyor…
                </span>
              )}
              {canliBankalar.length > 0 && !canliYukleniyor && (
                <span className="ml-1 rounded border border-brand-200 bg-brand-50 px-1.5 py-0.5 text-[0.625rem] text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300">
                  {canliBankalar.length} banka canlı hesap
                </span>
              )}
            </p>

            {canliNotu && (
              <p className="px-4 pb-1 text-xs text-warn-800 dark:text-warn-200">
                Bazı bankalar bu koşullarda hesaplama sunmuyor: {canliNotu}
              </p>
            )}

            <div className="overflow-x-auto px-2 pb-2" tabIndex={0} role="region" aria-label="Karşılaştırma sonuçları tablosu">
              <table className="table-zebra w-full min-w-[44rem] border-collapse text-sm">
                <caption className="sr-only">
                  Katılım bankalarının finansman teklifleri; aylık taksit, kâr oranı, toplam ödeme
                  ve tahsis ücreti.
                </caption>
                <thead>
                  <tr className="sticky top-0 z-10 bg-[#eff8f7] text-left text-xs text-txt-secondary dark:bg-brand-950">
                    <th scope="col" className="px-3 py-2.5 font-medium">Banka</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Aylık Taksit</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Kâr Oranı</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Toplam Ödeme</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Tahsis Ücreti</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Kampanya</th>
                    <th scope="col" className="px-3 py-2.5">
                      <span className="sr-only">Detay</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {gecerliSatirlar.map((s, i) => {
                    const banka = s.bankaId ? BANKA_INDEKS[s.bankaId] : undefined;
                    const rowKey = 'id' in s ? s.id : s.bankaId;
                    const rowBankaAdi = 'bankaAdi' in s ? s.bankaAdi : banka?.ad;
                    return (
                      <tr
                        key={rowKey}
                        className={`border-t border-line transition-colors hover:bg-sunken ${
                          i === 0 ? 'bg-brand-50/70 dark:bg-brand-950/35' : ''
                        }`}
                      >
                        <th scope="row" className="px-3 py-3 text-left font-medium">
                          <span className="flex items-center gap-2.5">
                            <BankMark bankaId={s.bankaId} ad={rowBankaAdi} size="sm" />
                            <span
                              className={
                                i === 0 ? 'text-brand-700 dark:text-brand-400' : 'text-txt'
                              }
                            >
                              {rowBankaAdi}
                            </span>
                            {i === 0 && (
                              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[0.625rem] font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-100">
                                En uygun seçenek
                              </span>
                            )}
                          </span>
                        </th>
                        {/* Aylik taksit, tablodaki karar verdirici sayi:
                            bankanin kendi hesaplama aracindaki gibi vurgulanir. */}
                        <td className="tnum px-3 py-3 font-mono font-semibold text-accent-700 dark:text-accent-400">
                          {tlBicim(s.taksit)}
                        </td>
                        <td className="tnum px-3 py-3 font-mono text-txt-secondary">
                          {oranBicim(s.aylikKarPayi)}
                        </td>
                        <td className="tnum px-3 py-3 font-mono">{tlBicim(s.toplamOdeme)}</td>
                        <td className="tnum px-3 py-3 font-mono text-txt-secondary">
                          {s.tahsisUcreti > 0 ? tlBicim(s.tahsisUcreti) : 'Yok'}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${
                              s.kampanyaliMi
                                ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                                : 'bg-sunken text-txt-muted'
                            }`}
                          >
                            {s.kampanyaliMi ? 'Var' : 'Yok'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setActiveTab('compare')}
                            aria-label={`${banka?.ad} teklifini karşılaştırmaya götür`}
                            className="grid h-9 w-9 place-items-center rounded-lg text-txt-muted transition-colors hover:bg-sunken hover:text-txt"
                          >
                            <ChevronRight className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {gecerliSatirlar.length === 0 && (
                    <tr className="border-t border-line">
                      <td colSpan={7} className="px-3 py-8 text-center text-sm text-txt-secondary">
                        {canliVeriAktif || canliBankalar.length > 0
                          ? 'Seçilen vade, bu üründeki bankaların azami vadesini aşıyor. Daha kısa bir vade deneyin.'
                          : 'Bu koşullarda gösterilecek canlı oran yok. Karşılaştır’a basarak banka hesaplama servislerinden sonuç alın veya scrape ürünleri bekleyin — uydurma oran gösterilmez.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-line px-2 py-2">
              <button
                type="button"
                onClick={() => setActiveTab('compare')}
                className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg text-sm text-brand-700 transition-colors hover:bg-sunken dark:text-brand-400"
              >
                Detaylı Karşılaştırmayı Görüntüle
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </section>

          {/* Ücret — doğrulanmış tarife özeti */}
          <section className="rounded-xl border border-line bg-surface p-4 shadow-flat">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
              <h2 className="text-base font-semibold tracking-tight text-txt">
                Ücret Karşılaştırması
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('ucretler')}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-brand-700 transition-colors hover:text-brand-800 dark:text-brand-400"
              >
                Ücretler sekmesi
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-txt-secondary">
              FAST, EFT, hesap işletim, aidatsız kart seçeneği ve ücretsiz ATM ağı için
              doğrulanmış dijital kanal tarifeleri. “0 TL” ücretsiz; “—” tarife
              yayımlanmadığı anlamına gelir. Kart sütununda ürün adı gösterilir.
            </p>
          </section>

          <FxConverter />
        </div>

        {/* Sağ sütun */}
        <div className="space-y-5">
          <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-raised">
            <div className="flex items-center justify-between gap-2 border-b border-line bg-brand-50/80 px-4 py-3.5 dark:bg-brand-950/40">
              <h2 className="text-base font-semibold tracking-tight text-txt">
                Popüler Kampanyalar
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('kampanyalar')}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-brand-700 transition-colors hover:text-brand-800 dark:text-brand-400"
              >
                Tümünü Gör
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            <ul className="space-y-2 p-3">
              {oneCikanKampanyalar.map((k) => {
                const baslik = k.title || k.productName || 'Kampanya';
                const tema = k.campaignTheme || 'general';
                const bitis = k.campaignEnd ? String(k.campaignEnd).slice(0, 10) : null;
                const aciklama = kisaKampanyaAciklama(k);
                return (
                  <li
                    key={`${k.bankId}|${k.sourceUrl || k.id || baslik}`}
                    className="rounded-lg border border-line bg-surface p-3 transition-colors hover:border-brand-200 hover:bg-[#f7fafa] dark:hover:border-brand-800 dark:hover:bg-sunken"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <BankMark bankaId={k.bankId} size="sm" />
                        <span className="truncate text-xs text-txt-secondary">
                          {BANKA_INDEKS[k.bankId]?.ad || k.bankId}
                        </span>
                      </div>
                      <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[0.625rem] font-medium tracking-wide text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                        {TEMA_ETIKET[tema] || 'GENEL'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-txt">{baslik}</p>
                    {aciklama ? (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-txt-secondary">
                        {aciklama}
                      </p>
                    ) : null}
                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <span className="text-xs text-txt-muted">
                        {bitis ? `Bitiş: ${bitis}` : 'Bitiş tarihi belirtilmemiş'}
                      </span>
                      {k.sourceUrl ? (
                        <a
                          href={k.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-1.5 text-xs text-brand-700 transition-colors hover:text-brand-800 dark:text-brand-400"
                        >
                          Kaynağa git
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setActiveTab('kampanyalar')}
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-1.5 text-xs text-brand-700 transition-colors hover:text-brand-800 dark:text-brand-400"
                        >
                          Detayları Gör
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
              {oneCikanKampanyalar.length === 0 && (
                <li className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-txt-secondary">
                  Canlı kampanya henüz yok. Scraper veya veritabanı bağlantısı sonrası burada
                  görünecek.
                </li>
              )}
            </ul>

            <div className="border-t border-line p-2">
              <button
                type="button"
                onClick={() => setActiveTab('kampanyalar')}
                className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-line text-sm text-txt transition-colors hover:bg-sunken"
              >
                Tüm Kampanyaları Keşfet
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-surface p-4 shadow-flat">
            <div className="flex items-center justify-between gap-2 pb-2">
              <h2 className="text-base font-semibold tracking-tight text-txt">Asistana Sor</h2>
              <span className="inline-flex items-center gap-1 text-xs text-txt-muted">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Kural tabanlı NLP
              </span>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!soru.trim()) return;
                onAsistanaSor(soru.trim());
                setSoru('');
              }}
              className="relative"
            >
              <label htmlFor="asistan-soru" className="sr-only">
                Asistana sorunuz
              </label>
              <textarea
                id="asistan-soru"
                rows={2}
                value={soru}
                onChange={(e) => setSoru(e.target.value)}
                placeholder="Örneğin: 200.000 TL ihtiyaç finansmanı için en uygun banka hangisi?"
                className="w-full resize-none rounded-lg border border-line bg-sunken py-3 pr-14 pl-3 text-sm text-txt placeholder:text-txt-muted"
              />
              <button
                type="submit"
                aria-label="Soruyu gönder"
                disabled={!soru.trim()}
                className="absolute right-2.5 bottom-3 grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
};
