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
import { KarsilastirmaOgesi } from '../lib/compare';
import { FINANSMAN_NOTLARI_BY_KEY } from '../data/finansmanNotlari';
import { BankMark } from './BankMark';
import { CampaignCarousel } from './CampaignCarousel';
import { FxConverter } from './FxConverter';
import { FxRatePanel } from './FxRatePanel';
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
  /** Ayrıntılı seçenek anahtarı (ör. tasit_finansmani_ikinci_el) */
  secenek?: string;
  /** Kullanıcının elle girdiği aylık kâr oranı yüzdesi; null = bankaların ilan oranı */
  ozelOranYuzde?: number | null;
  /** '1' = finansman tutarından, '2' = taksit tutarından hesapla */
  hesapTipi?: '1' | '2';
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

  const kurlaraKaydir = () => {
    document
      .getElementById('kurlar')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const karsilastirGonder = (event: React.FormEvent) => {
    event.preventDefault();
    // Tür seçilmeden karşılaştırma yapılmaz.
    if (!secilen || tutar <= 0) return;
    setAktifSecenek(secilen.key);
    onKarsilastir({
      tur: secilen.temelTur,
      tutar,
      vadeAy,
      secenek: secilen.key,
      ozelOranYuzde,
      hesapTipi,
    });
  };

  return (
    <div className="space-y-6">
      {/* ---------- Kahraman alanı ---------- */}
      <section className="hero-finance-bg relative overflow-hidden rounded-2xl border border-line px-5 py-8 shadow-flat sm:px-8 lg:px-10">
        <div className="relative z-10 max-w-[43rem]">
          <p className="flex items-center gap-2.5 text-[0.8125rem] font-medium text-brand-100">
            Bağımsız karşılaştırma
            <span className="h-1 w-1 rounded-full bg-white/40" aria-hidden="true" />
            Güncel banka verileri
          </p>
          <h1 className="mt-5 max-w-[42rem] text-4xl font-extrabold tracking-[-0.045em] text-balance text-white sm:text-[52px] sm:leading-[1.07]">
            Size en uygun katılım finansmanını bulun.
          </h1>
          <p className="mt-3.5 max-w-xl text-sm leading-[1.9] text-white/85">
            Katılım bankalarının güncel kâr oranlarını, aylık taksitlerini ve
            <br />
            toplam maliyetlerini sade bir tabloda karşılaştırın.
          </p>
        </div>
      </section>

      {/* ---------- Ana içerik + kenar çubuğu ---------- */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-8">
        <div className="min-w-0 space-y-5">
          <nav
            aria-label="Hızlı geçiş"
            className="rounded-xl border border-line bg-surface p-1.5 shadow-flat"
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

          <form
            onSubmit={karsilastirGonder}
            className="space-y-4 rounded-xl border border-line bg-surface p-[18px] text-left shadow-raised"
          >
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1.05fr_1.05fr_0.8fr_8rem]">
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

            <div className="grid grid-cols-1 items-end gap-5 border-t border-line pt-3.5 sm:grid-cols-[17.5rem_1fr]">
              <div className="block">
                <span className="mb-2 block text-xs text-txt-secondary">
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

              <fieldset className="flex h-11 flex-wrap items-center justify-center gap-x-7 gap-y-2">
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
              <p className="text-[0.625rem] leading-relaxed text-txt-muted">{turNotu.metin}</p>
            )}
          </form>

          {/* Sonuç kartı */}
          <section className="rounded-xl border border-line bg-surface p-[18px] shadow-raised">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5">
              <h2 className="text-[0.9375rem] font-bold tracking-tight text-txt">
                Finansman Karşılaştırma Sonuçları
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('compare')}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-brand-700 transition-colors hover:text-brand-800 dark:text-brand-400"
              >
                Tümünü Gör
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-3.5 text-[0.6875rem] text-txt-secondary">
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
              <p className="pb-2.5 text-xs text-warn-800 dark:text-warn-200">
                Bazı bankalar bu koşullarda hesaplama sunmuyor: {canliNotu}
              </p>
            )}

            <ul className="space-y-2">
              {gecerliSatirlar.map((s, i) => {
                const banka = s.bankaId ? BANKA_INDEKS[s.bankaId] : undefined;
                const rowKey = 'id' in s ? s.id : s.bankaId;
                const rowBankaAdi = 'bankaAdi' in s ? s.bankaAdi : banka?.ad;
                return (
                  <li
                    key={rowKey}
                    className={`grid min-h-16 grid-cols-[1fr_2.25rem] items-center gap-x-3 gap-y-2 rounded-xl border px-3.5 py-2 transition-all hover:-translate-y-px hover:border-line-strong hover:shadow-raised sm:grid-cols-[1.3fr_0.8fr_0.8fr_0.85fr_2.25rem] ${
                      i === 0
                        ? 'border-brand-200 bg-brand-50/60 dark:border-brand-800 dark:bg-brand-950/30'
                        : 'border-line bg-surface'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <BankMark bankaId={s.bankaId} ad={rowBankaAdi} size="sm" />
                      <span
                        className={`truncate text-xs font-bold ${
                          i === 0 ? 'text-brand-700 dark:text-brand-300' : 'text-txt'
                        }`}
                      >
                        {rowBankaAdi}
                      </span>
                      {i === 0 && (
                        <span className="shrink-0 rounded-lg bg-accent-100 px-2 py-1 text-[0.5625rem] font-semibold text-accent-700 dark:bg-accent-950 dark:text-accent-300">
                          En Uygun
                        </span>
                      )}
                      {s.kampanyaliMi && (
                        <span className="hidden shrink-0 rounded-lg bg-brand-50 px-2 py-1 text-[0.5625rem] font-medium text-brand-700 lg:inline dark:bg-brand-950 dark:text-brand-300">
                          Kampanyalı
                        </span>
                      )}
                    </div>

                    <div className="col-span-2 grid grid-cols-3 gap-3 sm:col-span-3 sm:contents">
                      <div className="flex flex-col gap-1">
                        <span className="text-[0.5625rem] text-txt-muted">Aylık Taksit</span>
                        {/* Karar verdirici sayı: bankanın kendi aracındaki gibi vurgulanır. */}
                        <strong className="tnum font-mono text-xs font-bold text-accent-700 dark:text-accent-400">
                          {tlBicim(s.taksit)}
                        </strong>
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-[0.5625rem] text-txt-muted">Kâr Oranı</span>
                        <strong className="tnum font-mono text-xs font-bold text-txt">
                          {oranBicim(s.aylikKarPayi)}
                        </strong>
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-[0.5625rem] text-txt-muted">
                          Toplam Ödeme
                          {s.tahsisUcreti > 0 ? ' + tahsis' : ''}
                        </span>
                        <strong className="tnum font-mono text-xs font-bold text-txt">
                          {tlBicim(s.toplamOdeme)}
                        </strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveTab('compare')}
                      aria-label={`${rowBankaAdi} teklifini karşılaştırmaya götür`}
                      className="col-start-2 row-start-1 grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface text-brand-600 transition-colors hover:bg-brand-50 sm:col-start-5 dark:hover:bg-brand-950"
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}

              {gecerliSatirlar.length === 0 && (
                <li className="rounded-xl border border-dashed border-line px-3 py-8 text-center text-sm leading-relaxed text-txt-secondary">
                  {canliVeriAktif || canliBankalar.length > 0
                    ? 'Seçilen vade, bu üründeki bankaların azami vadesini aşıyor. Daha kısa bir vade deneyin.'
                    : 'Bu koşullarda gösterilecek canlı oran yok. Karşılaştır’a basarak banka hesaplama servislerinden sonuç alın veya scrape ürünleri bekleyin — uydurma oran gösterilmez.'}
                </li>
              )}
            </ul>

            <button
              type="button"
              onClick={() => setActiveTab('compare')}
              className="mx-auto mt-3.5 flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-6 text-[0.6875rem] font-medium text-brand-700 transition-colors hover:bg-sunken dark:text-brand-400"
            >
              Tüm Sonuçları Gör
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
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

          <div id="kurlar" className="scroll-mt-24">
            <FxConverter />
          </div>
        </div>

        {/* ---------- Kenar çubuğu ---------- */}
        <aside className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <FxRatePanel onTumunuGor={kurlaraKaydir} />

          <CampaignCarousel
            kampanyalar={oneCikanKampanyalar}
            onTumunuGor={() => setActiveTab('kampanyalar')}
          />

          {/* Asistan çağrısı */}
          <section className="relative overflow-hidden rounded-xl bg-gradient-to-br from-brand-600 to-brand-500 p-[19px] text-white shadow-float sm:col-span-2 xl:col-span-1">
            <Sparkles
              className="pointer-events-none absolute -right-5 -bottom-8 h-32 w-32 rotate-[22deg] opacity-10"
              aria-hidden="true"
            />

            <div className="relative z-10">
              <h2 className="max-w-[14.5rem] text-sm leading-[1.65] font-medium">
                Finansmanda aklınıza takılan her şeyi sorabilirsiniz.
              </h2>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!soru.trim()) return;
                  onAsistanaSor(soru.trim());
                  setSoru('');
                }}
                className="mt-4"
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
                  className="w-full resize-none rounded-lg border border-white/25 bg-white/15 p-2.5 text-xs text-white placeholder:text-white/70 focus:border-white/50 focus:outline-none"
                />

                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span className="text-[0.5625rem] text-white/75">Kural tabanlı NLP</span>
                  <button
                    type="submit"
                    disabled={!soru.trim()}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-[0.6875rem] font-semibold text-brand-700 transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    Asistana Sor
                  </button>
                </div>
              </form>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};
