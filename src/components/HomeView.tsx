import React, { useMemo, useState } from 'react';
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
  FINANSMAN_TURLERI,
  FinansmanTuru,
  KAMPANYALAR,
  UCRETLER,
  VADELER,
  VARSAYILAN_TUTAR,
  VERI_TARIHI,
} from '../data/piyasa';
import { oranBicim, sayiBicim, teklifleriHesapla, tlBicim } from '../lib/finansman';
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

export const HomeView: React.FC<HomeViewProps> = ({
  setActiveTab,
  onKarsilastir,
  onAsistanaSor,
  talep,
}) => {
  const [heroSekme, setHeroSekme] = useState<'finansman' | 'kampanya' | 'ucret' | 'asistan'>(
    'finansman',
  );
  const [tur, setTur] = useState<FinansmanTuru>(talep.tur);
  const [tutarMetni, setTutarMetni] = useState<string>(sayiBicim(talep.tutar));
  const [vadeAy, setVadeAy] = useState<number>(talep.vadeAy);
  const [soru, setSoru] = useState('');

  const tutar = useMemo(() => {
    const rakamlar = tutarMetni.replace(/[^\d]/g, '');
    return rakamlar ? Number(rakamlar) : 0;
  }, [tutarMetni]);

  const satirlar = useMemo(
    () => teklifleriHesapla(talep.tur, talep.tutar, talep.vadeAy),
    [talep],
  );
  const gecerliSatirlar = satirlar.filter((s) => s.uygunMu);
  const fastUcretleri = UCRETLER.find((u) => u.key === 'fast')!;

  const turDegistir = (yeni: FinansmanTuru) => {
    setTur(yeni);
    setTutarMetni(sayiBicim(VARSAYILAN_TUTAR[yeni]));
    if (!VADELER[yeni].includes(vadeAy)) setVadeAy(VADELER[yeni][Math.floor(VADELER[yeni].length / 2)]);
  };

  const karsilastirGonder = (event: React.FormEvent) => {
    event.preventDefault();
    if (tutar <= 0) return;
    onKarsilastir({ tur, tutar, vadeAy });
  };

  return (
    <div className="space-y-5">
      {/* ---------- Kahraman alanı ---------- */}
      <section className="overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-brand-50 to-surface shadow-raised dark:from-brand-950 dark:to-surface">
        <div className="px-4 py-8 text-center sm:px-8 sm:py-10">
          <h1 className="text-2xl font-semibold tracking-tight text-balance text-txt sm:text-3xl">
            En doğru finansal karar için
            <br className="hidden sm:block" /> katılım bankalarını karşılaştırın.
          </h1>

          <div className="mx-auto mt-6 max-w-3xl rounded-xl border border-line bg-surface p-1.5 shadow-flat">
            <div
              role="tablist"
              aria-label="Karşılaştırma türü"
              className="flex items-center gap-1 overflow-x-auto"
            >
              {HERO_SEKMELERI.map((s) => {
                const Icon = s.icon;
                const isActive = heroSekme === s.key;
                return (
                  <button
                    key={s.key}
                    role="tab"
                    type="button"
                    aria-selected={isActive}
                    onClick={() => {
                      setHeroSekme(s.key);
                      if (s.key === 'kampanya') setActiveTab('kampanyalar');
                      if (s.key === 'ucret') setActiveTab('ucretler');
                      if (s.key === 'asistan') setActiveTab('asistan');
                    }}
                    className={`relative flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm whitespace-nowrap transition-colors ${
                      isActive
                        ? 'font-medium text-brand-700 dark:text-brand-300'
                        : 'text-txt-secondary hover:text-txt'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {s.etiket}
                    {isActive && (
                      <motion.span
                        layoutId="hero-tab"
                        className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand-600 dark:bg-brand-400"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <form
            onSubmit={karsilastirGonder}
            className="mx-auto mt-3 grid max-w-3xl grid-cols-1 gap-3 rounded-xl border border-line bg-surface p-3 text-left shadow-raised sm:grid-cols-2 lg:grid-cols-[1.1fr_1fr_0.9fr_auto]"
          >
            <label className="block">
              <span className="mb-1 block text-xs text-txt-secondary">Finansman Türü</span>
              <select
                value={tur}
                onChange={(e) => turDegistir(e.target.value as FinansmanTuru)}
                className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-txt"
              >
                {FINANSMAN_TURLERI.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.etiket}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-txt-secondary">Tutar</span>
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
              disabled={tutar <= 0}
              className="mt-auto inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-6 text-sm font-medium text-white shadow-raised transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              Karşılaştır
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
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
          <section className="rounded-xl border border-line bg-surface shadow-raised">
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
            </p>

            <div className="overflow-x-auto px-2 pb-2">
              <table className="w-full min-w-[44rem] border-collapse text-sm">
                <caption className="sr-only">
                  Katılım bankalarının finansman teklifleri; aylık taksit, kâr oranı, toplam ödeme
                  ve tahsis ücreti.
                </caption>
                <thead>
                  <tr className="text-left text-xs text-txt-secondary">
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
                    const banka = BANKA_INDEKS[s.bankaId];
                    return (
                      <tr
                        key={s.bankaId}
                        className="border-t border-line transition-colors hover:bg-sunken"
                      >
                        <th scope="row" className="px-3 py-3 text-left font-medium">
                          <span className="flex items-center gap-2.5">
                            <BankMark bankaId={s.bankaId} size="sm" />
                            <span
                              className={
                                i === 0 ? 'text-brand-700 dark:text-brand-400' : 'text-txt'
                              }
                            >
                              {banka?.ad}
                            </span>
                          </span>
                        </th>
                        <td className="tnum px-3 py-3 font-mono">{tlBicim(s.taksit)}</td>
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
          <section className="rounded-xl border border-line bg-surface p-4 shadow-raised">
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
          <section className="rounded-xl border border-line bg-surface shadow-raised">
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

          <section className="rounded-xl border border-line bg-surface p-4 shadow-raised">
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
