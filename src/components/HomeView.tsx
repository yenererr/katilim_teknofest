import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Home as HomeIcon,
  MessageSquare,
  Receipt,
  Send,
  ShieldCheck,
  Sparkles,
  Tag,
  Users,
} from 'lucide-react';
import {
  BANKALAR,
  BANKA_INDEKS,
  FINANSMAN_SECENEKLERI,
  FINANSMAN_TURLERI,
  FinansmanTuru,
  KAMPANYALAR,
  UCRETLER,
  VADELER,
  VARSAYILAN_TUTAR,
  VERI_TARIHI,
} from '../data/piyasa';
import { aylikTaksit, oranBicim, sayiBicim, teklifleriHesapla, tlBicim } from '../lib/finansman';
import { KarsilastirmaOgesi } from '../lib/compare';
import { FINANSMAN_NOTLARI_BY_KEY } from '../data/finansmanNotlari';
import { BankMark } from './BankMark';
import { TabKey } from './nav';

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

const ETIKET_TONU: Record<string, string> = {
  'TAKSİT': 'bg-info-50 text-info-700 dark:bg-info-950 dark:text-info-300',
  'İNDİRİM': 'bg-warn-50 text-warn-800 dark:bg-warn-950 dark:text-warn-300',
  'YENİ MÜŞTERİ': 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
  'PUAN': 'bg-info-50 text-info-700 dark:bg-info-950 dark:text-info-300',
  'NAKİT İADE': 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
};

/** /api/calculators/vakif-katilim yanıtı */
type VakifCanliSonuc = {
  profitRatePercent: number | null;
  monthlyInstallmentTl: number | null;
  totalPaymentTl: number | null;
  appraisementFeeTl: number | null;
  termMonths: number;
  amountTl: number;
  calculatedAt: string;
};

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
  // Seçim kullanıcıya bırakılır: form boş bir değerle başlar.
  const [secenek, setSecenek] = useState<string>('');
  // Karşılaştırılan ayrıntılı tür — canlı hesaplama servisine bu gönderilir.
  const [aktifSecenek, setAktifSecenek] = useState<string>('');
  const secilen = FINANSMAN_SECENEKLERI.find((f) => f.key === secenek) || null;
  const tur: FinansmanTuru = secilen?.temelTur ?? talep.tur;
  const [tutarMetni, setTutarMetni] = useState<string>(sayiBicim(talep.tutar));
  const [vadeAy, setVadeAy] = useState<number>(talep.vadeAy);
  const [soru, setSoru] = useState('');
  /** Özel kâr oranı — işaretlenince kullanıcı oranı kullanılır. */
  const [oranOzel, setOranOzel] = useState(false);
  const [oranMetni, setOranMetni] = useState('3,99');
  /** 1 = finansman tutarından, 2 = taksit tutarından */
  const [hesapTipi, setHesapTipi] = useState<'1' | '2'>('1');
  // Vakıf Katılım'ın kendi hesaplama servisinden gelen canlı sonuç.
  const [vakifCanli, setVakifCanli] = useState<VakifCanliSonuc | null>(null);
  const [vakifNotu, setVakifNotu] = useState<string | null>(null);
  const [vakifYukleniyor, setVakifYukleniyor] = useState(false);

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
  const satirlar = useMemo(
    () => teklifleriHesapla(talep.tur, talep.tutar, talep.vadeAy),
    [talep],
  );
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
  // Vakıf Katılım için bankanın kendi hesaplama servisinden canlı sonuç al.
  // Kullanıcı yazarken her tuşta istek gitmesin diye kısa bir bekleme var.
  useEffect(() => {
    if (talep.tutar <= 0 || talep.vadeAy <= 0) {
      setVakifCanli(null);
      return;
    }
    let iptal = false;
    setVakifYukleniyor(true);
    const zamanlayici = setTimeout(() => {
      fetch('/api/calculators/vakif-katilim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          financingType: aktifSecenek || talep.tur,
          amountTl: talep.tutar,
          termMonths: talep.vadeAy,
          calculateType: hesapTipi,
          ...(ozelOranYuzde != null ? { profitRatePercent: ozelOranYuzde } : {}),
        }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('yanıt yok'))))
        .then((d: VakifCanliSonuc & { available?: boolean; reason?: string }) => {
          if (iptal) return;
          if (d.available === false) {
            // Bankanın kendi kısıtı (tutar/vade limiti) — kullanıcıya gösterilir.
            setVakifCanli(null);
            setVakifNotu(d.reason || null);
            return;
          }
          setVakifCanli(d);
          setVakifNotu(null);
          if (d.profitRatePercent != null && !oranOzel) {
            setOranMetni(
              d.profitRatePercent.toLocaleString('tr-TR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }),
            );
          }
        })
        .catch(() => {
          // Banka servisi ulaşılamazsa tablo mevcut verisiyle çalışmaya devam eder.
          if (!iptal) {
            setVakifCanli(null);
            setVakifNotu(null);
          }
        })
        .finally(() => {
          if (!iptal) setVakifYukleniyor(false);
        });
    }, 350);
    return () => {
      iptal = true;
      clearTimeout(zamanlayici);
    };
  }, [aktifSecenek, talep.tur, talep.tutar, talep.vadeAy, hesapTipi, ozelOranYuzde, oranOzel]);

  const canliVeriAktif = canliSatirlar.length > 0;
  const temelSatirlar = canliVeriAktif ? canliSatirlar : satirlar;

  // Vakıf Katılım satırı, bankanın ilan ettiği güncel rakamlarla değiştirilir.
  const tabloSatirlari = useMemo(() => {
    const t = vakifCanli;
    if (!t || t.monthlyInstallmentTl == null || t.profitRatePercent == null) {
      return temelSatirlar;
    }
    const toplamOdeme = t.totalPaymentTl ?? t.monthlyInstallmentTl * t.termMonths;
    const tahsisUcreti = t.appraisementFeeTl ?? 0;
    const vakifSatir = {
      id: 'vakif-katilim-canli',
      bankaId: 'vakif-katilim',
      bankaAdi: 'Vakıf Katılım',
      aylikKarPayi: t.profitRatePercent / 100,
      taksit: t.monthlyInstallmentTl,
      toplamOdeme,
      tahsisUcreti,
      toplamMaliyet: toplamOdeme + tahsisUcreti,
      kampanyaliMi: false,
      uygunMu: true,
      canli: true as const,
    };
    const digerleri = temelSatirlar.filter((s) => s.bankaId !== 'vakif-katilim');
    return [...digerleri, vakifSatir].sort((a, b) => {
      if (a.uygunMu !== b.uygunMu) return a.uygunMu ? -1 : 1;
      return a.toplamMaliyet - b.toplamMaliyet;
    });
  }, [temelSatirlar, vakifCanli]);

  const gecerliSatirlar = tabloSatirlari.filter((s) => s.uygunMu);
  const fastUcretleri = UCRETLER.find((u) => u.key === 'fast')!;

  const secenekDegistir = (yeniKey: string) => {
    setSecenek(yeniKey);
    const yeni = FINANSMAN_SECENEKLERI.find((f) => f.key === yeniKey);
    if (!yeni) return;
    // Tutar ve vade seçilen türün makul aralığına çekilir.
    setTutarMetni(sayiBicim(VARSAYILAN_TUTAR[yeni.temelTur]));
    const vadeler = VADELER[yeni.temelTur];
    if (!vadeler.includes(vadeAy)) {
      setVadeAy(vadeler[Math.floor(vadeler.length / 2)]);
    }
  };

  const karsilastirGonder = (event: React.FormEvent) => {
    event.preventDefault();
    // Tür seçilmeden karşılaştırma yapılmaz.
    if (!secilen || tutar <= 0) return;
    setAktifSecenek(secilen.key);
    onKarsilastir({ tur: secilen.temelTur, tutar, vadeAy });
  };

  return (
    <div className="space-y-5">
      {/* ---------- Kahraman alanı ---------- */}
      <section className="overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-brand-50/80 to-surface dark:from-brand-950/60 dark:to-surface">
        <div className="px-4 py-8 text-center sm:px-8 sm:py-10">
          <p className="text-sm font-semibold tracking-wide text-brand-700 dark:text-brand-300">
            KatılımFinans
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-balance text-txt sm:text-3xl">
            En doğru finansal karar için
            <br className="hidden sm:block" /> katılım bankalarını karşılaştırın.
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-txt-secondary">
            Aynı koşullarda taksit, kâr oranı ve toplam maliyeti yan yana görün.
          </p>

          <nav
            aria-label="Hızlı geçiş"
            className="mx-auto mt-6 max-w-3xl rounded-xl border border-line bg-surface p-1.5"
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
                        ? 'font-semibold text-brand-800 dark:text-brand-200'
                        : 'text-txt-secondary hover:bg-sunken/80 hover:text-txt'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {s.etiket}
                    {isActive && (
                      <motion.span
                        layoutId="hero-nav"
                        className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand-600 dark:bg-brand-400"
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
            className="mx-auto mt-3 max-w-3xl space-y-3 rounded-xl border border-line bg-surface p-3 text-left sm:p-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1.1fr_1fr_0.9fr_auto]">
              <label className="block">
                <span className="mb-1 block text-xs text-txt-secondary">Finansman Türü</span>
                <select
                  value={secenek}
                  onChange={(e) => secenekDegistir(e.target.value)}
                  className={`h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm ${
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
                    className="tnum h-11 w-full rounded-lg border border-line bg-surface px-3 pr-10 font-mono text-sm text-txt"
                  />
                  <span className="absolute inset-y-0 right-3 grid place-items-center text-xs text-txt-muted">
                    TL
                  </span>
                </span>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-txt-secondary">Vade</span>
                <select
                  value={vadeAy}
                  onChange={(e) => setVadeAy(Number(e.target.value))}
                  className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-txt"
                >
                  {VADELER[tur].map((v) => (
                    <option key={v} value={v}>
                      {v} Ay
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="submit"
                disabled={!secilen || tutar <= 0}
                className="mt-auto inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-6 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 disabled:opacity-50 dark:ring-offset-surface"
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
        </div>
      </section>

      {/* ---------- Güven şeridi ---------- */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-4">
        {[
          { icon: CalendarDays, ust: 'Güncel veriler', alt: VERI_TARIHI },
          { icon: Users, ust: `${BANKALAR.length} Katılım Bankası`, alt: 'Kapsamda' },
          { icon: Tag, ust: '1000+ Kampanya', alt: 'Aktif fırsat' },
          { icon: ShieldCheck, ust: 'Şeffaf Karşılaştırma', alt: 'Aynı koşullarda' },
        ].map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.ust} className="flex items-center gap-3 bg-surface px-4 py-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                <Icon className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-txt">{k.ust}</span>
                <span className="block truncate text-xs text-txt-muted">{k.alt}</span>
              </span>
            </div>
          );
        })}
      </section>

      {/* ---------- İki sütun ---------- */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {/* Sonuç tablosu */}
          <section className="rounded-xl border border-line bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3.5">
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
              {vakifYukleniyor && (
                <span className="ml-1 text-[0.625rem] text-txt-muted">
                  Vakıf Katılım hesaplanıyor…
                </span>
              )}
              {vakifCanli && !vakifYukleniyor && (
                <span className="ml-1 rounded border border-brand-200 bg-brand-50 px-1.5 py-0.5 text-[0.625rem] text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300">
                  Vakıf Katılım: bankanın kendi hesaplaması
                </span>
              )}
            </p>

            {vakifNotu && (
              <p className="px-4 pb-1 text-xs text-warn-800 dark:text-warn-200">
                Vakıf Katılım bu koşullarda hesaplama sunmuyor: {vakifNotu}
              </p>
            )}

            <div className="overflow-x-auto px-2 pb-2" tabIndex={0} role="region" aria-label="Karşılaştırma sonuçları tablosu">
              <table className="table-zebra w-full min-w-[44rem] border-collapse text-sm">
                <caption className="sr-only">
                  Katılım bankalarının finansman teklifleri; aylık taksit, kâr oranı, toplam ödeme
                  ve tahsis ücreti.
                </caption>
                <thead>
                  <tr className="sticky top-0 z-10 bg-surface text-left text-xs text-txt-secondary">
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
                        className="border-t border-line transition-colors hover:bg-sunken"
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
                          </span>
                        </th>
                        {/* Aylik taksit, tablodaki karar verdirici sayi:
                            bankanin kendi hesaplama aracindaki gibi vurgulanir. */}
                        <td className="tnum px-3 py-3 font-mono font-medium text-accent-700 dark:text-accent-400">
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
                        Seçilen vade, bu üründeki bankaların azami vadesini aşıyor. Daha kısa bir
                        vade deneyin.
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

          {/* Ücret kartları */}
          <section className="rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
              <h2 className="text-base font-semibold tracking-tight text-txt">
                Ücret Karşılaştırması — {fastUcretleri.etiket} (TL)
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('ucretler')}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-brand-700 transition-colors hover:text-brand-800 dark:text-brand-400"
              >
                Tüm Ücretleri Gör
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
              {BANKALAR.map((b) => {
                const ucret = fastUcretleri.degerler[b.id] ?? 0;
                return (
                  <li
                    key={b.id}
                    className="flex flex-col items-center gap-1.5 rounded-lg border border-line px-2 py-3 text-center"
                  >
                    <BankMark bankaId={b.id} size="sm" />
                    <span className="truncate text-xs text-txt-secondary">{b.ad}</span>
                    <span className="tnum font-mono text-base text-txt">
                      {ucret.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </span>
                    <span
                      className={`text-xs ${
                        ucret === 0 ? 'text-brand-600 dark:text-brand-400' : 'text-txt-muted'
                      }`}
                    >
                      {ucret === 0 ? 'Ücretsiz' : 'İşlem başı'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {/* Sağ sütun */}
        <div className="space-y-5">
          <section className="rounded-xl border border-line bg-surface">
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3.5">
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
              {KAMPANYALAR.slice(0, 3).map((k) => (
                <li
                  key={k.id}
                  className="rounded-xl border border-line p-3 transition-colors hover:bg-sunken"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <BankMark bankaId={k.bankaId} size="sm" />
                      <span className="truncate text-xs text-txt-secondary">
                        {BANKA_INDEKS[k.bankaId]?.ad}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-medium tracking-wide ${
                        ETIKET_TONU[k.etiket] ?? 'bg-sunken text-txt-secondary'
                      }`}
                    >
                      {k.etiket}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-txt">{k.baslik}</p>
                  <p className="mt-1 text-xs leading-relaxed text-txt-secondary">{k.aciklama}</p>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <span className="text-xs text-txt-muted">Bitiş: {k.bitis}</span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('kampanyalar')}
                      className="inline-flex min-h-9 items-center gap-1 rounded-lg px-1.5 text-xs text-brand-700 transition-colors hover:text-brand-800 dark:text-brand-400"
                    >
                      Detayları Gör
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
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

          <section className="rounded-xl border border-line bg-surface p-4">
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
