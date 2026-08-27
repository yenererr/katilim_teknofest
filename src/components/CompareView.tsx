import React, { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeftRight,
  Star,
  Quote,
  Loader2,
  Info,
  ExternalLink,
  Trophy,
} from 'lucide-react';
import { BANKA_INDEKS, FINANSMAN_SECENEKLERI, VADELER, VARSAYILAN_TUTAR } from '../data/piyasa';
import { FINANSMAN_NOTLARI_BY_KEY } from '../data/finansmanNotlari';
import { sayiBicim } from '../lib/finansman';
import { BankMark } from './BankMark';
import { KarsilastirmaTalebi } from './HomeView';
import {
  YapilandirilmisUrun,
  TeklifSatiri,
  teklifleriHazirla,
  bankaBasinaEnIyi,
  ortakMotorlaTamamla,
  tekliflerBirlestir,
  canliTeklifiSatiraCevir,
  CANLI_HESAPLAMA_UCLARI,
  yasalAzamiVade,
  type CanliTeklif,
  type TalepKosullari,
  hesaplaKriterler,
  kazananHaritasi,
  farkAciklamalari,
  yuzdeBicim,
  tlBicim,
} from '../lib/urunKarsilastir';

/** Tablo satırları — her biri kendi biçimlendirmesini ve kanıt alanını bilir. */
const SATIRLAR: {
  key: string;
  etiket: string;
  kriter: string | null;
  kanitAlani: string | null;
  deger: (s: TeklifSatiri) => React.ReactNode;
}[] = [
  {
    key: 'kar_payi',
    etiket: 'Kâr payı oranı (aylık)',
    kriter: 'en_dusuk_kar_payi',
    kanitAlani: 'kar_payi_orani',
    deger: (s) => <span className="tnum font-mono text-base text-txt">{yuzdeBicim(s.aylikOran)}</span>,
  },
  {
    key: 'taksit',
    etiket: 'Aylık taksit',
    kriter: 'en_dusuk_taksit',
    kanitAlani: null,
    deger: (s) => <span className="tnum font-mono text-txt">{tlBicim(s.taksit)}</span>,
  },
  {
    key: 'vade',
    etiket: 'Vade',
    kriter: 'en_uzun_vade',
    kanitAlani: 'vade_ay',
    deger: (s) => (
      <span className="tnum font-mono text-txt">
        {s.vadeAy} ay
        {s.azamiVade != null && s.azamiVade !== s.vadeAy && (
          <span className="mt-0.5 block text-xs font-normal text-txt-muted">
            azami {s.azamiVade} ay
          </span>
        )}
      </span>
    ),
  },
  {
    key: 'kampanya_avantaji',
    etiket: 'Kampanya avantajı',
    kriter: null,
    kanitAlani: 'odul',
    deger: (s) =>
      s.kampanyaAvantaji ? (
        <span className="text-xs leading-relaxed text-txt">{s.kampanyaAvantaji}</span>
      ) : (
        <span className="text-txt-muted">Belirtilmemiş</span>
      ),
  },
  {
    key: 'masraf_durumu',
    etiket: 'Masraf durumu',
    kriter: null,
    kanitAlani: 'tahsis_ucreti',
    deger: (s) => <span className="text-xs text-txt-secondary">{s.masrafDurumu}</span>,
  },
  {
    key: 'toplam_odeme',
    etiket: 'Toplam geri ödeme',
    kriter: null,
    kanitAlani: null,
    deger: (s) => <span className="tnum font-mono text-txt-secondary">{tlBicim(s.toplamOdeme)}</span>,
  },
  {
    key: 'tahsis',
    etiket: 'Tahsis ücreti',
    kriter: 'en_dusuk_masraf',
    kanitAlani: 'tahsis_ucreti',
    deger: (s) =>
      s.tahsisUcreti === 0 ? (
        <span className="inline-flex items-center rounded border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs text-brand-800 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-200">
          Ücretsiz
        </span>
      ) : (
        <span className="tnum font-mono text-txt-secondary">{tlBicim(s.tahsisUcreti)}</span>
      ),
  },
  {
    key: 'toplam_maliyet',
    etiket: 'Toplam maliyet',
    kriter: 'en_dusuk_maliyet',
    kanitAlani: null,
    deger: (s) => (
      <span className="tnum font-mono font-medium text-txt">{tlBicim(s.toplamMaliyet)}</span>
    ),
  },
  {
    key: 'odul',
    etiket: 'Ödül / puan',
    kriter: 'en_yuksek_odul',
    kanitAlani: 'odul',
    deger: (s) =>
      s.odulTl === null ? (
        <span className="text-txt-muted">Belirtilmemiş</span>
      ) : (
        <span className="tnum font-mono text-txt">{tlBicim(s.odulTl)}</span>
      ),
  },
  {
    key: 'segment',
    etiket: 'Hedef kitle',
    kriter: null,
    kanitAlani: null,
    deger: (s) =>
      s.segmentler.length ? (
        <span className="flex flex-wrap gap-1">
          {s.segmentler.map((x) => (
            <span
              key={x}
              className="rounded border border-line bg-sunken px-1.5 py-0.5 text-xs text-txt-secondary"
            >
              {x}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-txt-muted">Belirtilmemiş</span>
      ),
  },
  {
    key: 'kampanya_bitis',
    etiket: 'Kampanya bitişi',
    kriter: null,
    kanitAlani: null,
    deger: (s) =>
      s.kampanyaBitis ? (
        <span className="tnum font-mono text-xs text-txt">{s.kampanyaBitis}</span>
      ) : (
        <span className="text-txt-muted">Süresiz</span>
      ),
  },
  {
    key: 'kaynak',
    etiket: 'Kaynak',
    kriter: null,
    kanitAlani: null,
    deger: (s) =>
      s.kaynakUrl ? (
        <a
          href={s.kaynakUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline dark:text-brand-400"
        >
          Resmî sayfa
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      ) : (
        <span className="text-txt-muted">—</span>
      ),
  },
];

interface CompareViewProps {
  talep: KarsilastirmaTalebi;
  onTalepDegisti: (talep: KarsilastirmaTalebi) => void;
}

export const CompareView: React.FC<CompareViewProps> = ({ talep, onTalepDegisti }) => {
  const reduceMotion = useReducedMotion();

  const [secenek, setSecenek] = useState(
    () =>
      talep.secenek ??
      FINANSMAN_SECENEKLERI.find((f) => f.temelTur === talep.tur)?.key ??
      'ihtiyac_finansmani',
  );
  const [tutarMetni, setTutarMetni] = useState(() => sayiBicim(talep.tutar));
  const [vadeMetni, setVadeMetni] = useState(() => String(talep.vadeAy));
  const [oranOzel, setOranOzel] = useState(() => talep.ozelOranYuzde != null);
  const [oranMetni, setOranMetni] = useState(() =>
    talep.ozelOranYuzde != null
      ? talep.ozelOranYuzde.toLocaleString('tr-TR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : '3,99',
  );
  const [hesapTipi, setHesapTipi] = useState<'1' | '2'>(() => talep.hesapTipi ?? '1');
  const [urunler, setUrunler] = useState<YapilandirilmisUrun[]>([]);
  const [canliSatirlar, setCanliSatirlar] = useState<TeklifSatiri[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [acikKanit, setAcikKanit] = useState<string | null>(null);

  const tutar = useMemo(() => {
    const rakamlar = tutarMetni.replace(/[^\d]/g, '');
    return rakamlar ? Number(rakamlar) : 0;
  }, [tutarMetni]);

  const vadeAy = useMemo(() => {
    const n = Number(vadeMetni.replace(/[^\d]/g, ''));
    return Number.isFinite(n) && n > 0 ? Math.min(360, n) : 0;
  }, [vadeMetni]);

  const ozelOranYuzde = useMemo(() => {
    if (!oranOzel) return null;
    const n = Number(oranMetni.replace(',', '.').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [oranOzel, oranMetni]);

  const temelTur = useMemo(
    () => FINANSMAN_SECENEKLERI.find((f) => f.key === secenek)?.temelTur ?? secenek,
    [secenek],
  );

  const turNotu = FINANSMAN_NOTLARI_BY_KEY[secenek] ?? null;

  /** Yasal vade sınırı aşıldıysa hiçbir banka teklif veremez. */
  const yasalSinir = useMemo(
    () => (tutar > 0 ? yasalAzamiVade(temelTur, tutar) : null),
    [temelTur, tutar],
  );
  const vadeSinirAsildi = yasalSinir !== null && vadeAy > yasalSinir;

  // Ana sayfadan gelen talep değişirse formu ona eşitle.
  useEffect(() => {
    setTutarMetni(sayiBicim(talep.tutar));
    setVadeMetni(String(talep.vadeAy));
    if (talep.secenek) setSecenek(talep.secenek);
    if (talep.hesapTipi) setHesapTipi(talep.hesapTipi);
    if (talep.ozelOranYuzde != null) {
      setOranOzel(true);
      setOranMetni(
        talep.ozelOranYuzde.toLocaleString('tr-TR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      );
    }
  }, [talep]);

  useEffect(() => {
    let iptal = false;
    setYukleniyor(true);
    setHata(null);
    fetch('/api/live/products')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Ürün listesi alınamadı'))))
      .then((d: { structuredProducts?: YapilandirilmisUrun[] }) => {
        if (iptal) return;
        setUrunler(d.structuredProducts ?? []);
        setYukleniyor(false);
      })
      .catch((e: Error) => {
        if (iptal) return;
        setHata(e.message);
        setYukleniyor(false);
      });
    return () => {
      iptal = true;
    };
  }, []);

  // Bankaların kendi hesaplama araçlarından canlı teklif al.
  useEffect(() => {
    if (tutar <= 0 || vadeAy <= 0) {
      setCanliSatirlar([]);
      return;
    }
    let iptal = false;
    const kosul: TalepKosullari = {
      urunTuru: temelTur,
      tutar,
      vadeAy,
      ortakOranYuzde: ozelOranYuzde,
    };
    const govde = {
      financingType: temelTur,
      amountTl: tutar,
      termMonths: vadeAy,
      calculateType: hesapTipi,
      ...(ozelOranYuzde != null ? { profitRatePercent: ozelOranYuzde } : {}),
    };

    const zamanlayici = window.setTimeout(() => {
      void Promise.all(
        CANLI_HESAPLAMA_UCLARI.map(async ({ bankaId, path }) => {
          try {
            const r = await fetch(path, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(govde),
            });
            if (!r.ok) return null;
            const d = (await r.json()) as CanliTeklif;
            return canliTeklifiSatiraCevir(d.bankId || bankaId, d, kosul);
          } catch {
            return null;
          }
        }),
      ).then((sonuclar) => {
        if (iptal) return;
        setCanliSatirlar(sonuclar.filter((s): s is TeklifSatiri => s !== null));
      });
    }, 300);

    return () => {
      iptal = true;
      window.clearTimeout(zamanlayici);
    };
  }, [temelTur, tutar, vadeAy, hesapTipi, ozelOranYuzde]);

  const teklifler = useMemo(() => {
    if (tutar <= 0 || vadeAy <= 0) return [];
    const kosul = {
      urunTuru: temelTur,
      tutar,
      vadeAy,
      ortakOranYuzde: ozelOranYuzde,
    };
    const dogrulanmis = bankaBasinaEnIyi(teklifleriHazirla(urunler, kosul));
    // Bankanın kendi aracından gelen sonuç, doğrulanmış tabloya göre önceliklidir.
    const birlesik = tekliflerBirlestir(canliSatirlar, dogrulanmis);
    // Ortak oran verildiğinde aynı motoru kullanan diğer bankalar da tabloya girer.
    return ortakMotorlaTamamla(birlesik, kosul);
  }, [urunler, canliSatirlar, temelTur, tutar, vadeAy, ozelOranYuzde]);

  const kriterler = useMemo(() => hesaplaKriterler(teklifler), [teklifler]);
  const kazananlar = useMemo(() => kazananHaritasi(kriterler), [kriterler]);
  const enAvantajli = kriterler.find((k) => k.key === 'en_avantajli');

  const farklar = useMemo(() => {
    if (teklifler.length < 2) return [];
    return farkAciklamalari(teklifler[0], teklifler[1]);
  }, [teklifler]);

  const secenekDegistir = (yeniKey: string) => {
    setSecenek(yeniKey);
    const yeni = FINANSMAN_SECENEKLERI.find((f) => f.key === yeniKey);
    if (!yeni) return;
    const yeniTutar = VARSAYILAN_TUTAR[yeni.temelTur];
    const vadeler = VADELER[yeni.temelTur];
    const yeniVade = vadeler[Math.floor(vadeler.length / 2)];
    setTutarMetni(sayiBicim(yeniTutar));
    setVadeMetni(String(yeniVade));
    onTalepDegisti({
      tur: yeni.temelTur,
      tutar: yeniTutar,
      vadeAy: yeniVade,
      secenek: yeniKey,
      ozelOranYuzde,
      hesapTipi,
    });
  };

  // Tutar / vade elle değiştirildiğinde ortak talebi güncelle.
  const talebiEsitle = () => {
    if (tutar <= 0 || vadeAy <= 0) return;
    if (tutar === talep.tutar && vadeAy === talep.vadeAy) return;
    onTalepDegisti({ ...talep, tutar, vadeAy, secenek, ozelOranYuzde, hesapTipi });
  };

  const cellBase = 'border-l border-line px-4 py-3 align-top';
  const rowHeader =
    'sticky left-0 z-10 bg-surface px-4 py-3 text-left text-sm font-medium text-txt-secondary';

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.26, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-4"
    >
      {/* Talep koşulları — aynı senaryoda tüm bankalar */}
      <section
        aria-labelledby="karsilastir-kosul-baslik"
        className="space-y-3 rounded-xl border border-line bg-surface p-4 sm:p-5"
      >
        <div>
          <h2
            id="karsilastir-kosul-baslik"
            className="text-base font-semibold tracking-tight text-txt"
          >
            Karşılaştırma koşulları
          </h2>
          <p className="mt-0.5 text-xs text-txt-secondary">
            Aynı ürün türü, tutar ve vadede tüm katılım bankalarının doğrulanmış teklifleri
            yan yana getirilir.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs text-txt-secondary">Ürün türü</span>
            <select
              value={secenek}
              onChange={(e) => secenekDegistir(e.target.value)}
              className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-txt"
            >
              {FINANSMAN_SECENEKLERI.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.etiket}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-txt-secondary">Tutar (TL)</span>
            <input
              inputMode="numeric"
              value={tutarMetni}
              onChange={(e) => setTutarMetni(e.target.value)}
              onBlur={() => {
                setTutarMetni(sayiBicim(tutar > 0 ? tutar : 0));
                talebiEsitle();
              }}
              className="tnum h-11 w-full rounded-lg border border-line bg-surface px-3 font-mono text-sm text-txt"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-txt-secondary">Vade (ay)</span>
            <span className="relative block">
              <input
                list="karsilastir-vade"
                inputMode="numeric"
                value={vadeMetni}
                onChange={(e) => setVadeMetni(e.target.value)}
                onBlur={talebiEsitle}
                aria-label="Vade ay olarak"
                className="tnum h-11 w-full rounded-lg border border-line bg-surface px-3 pr-10 font-mono text-sm text-txt"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-xs text-txt-muted">
                Ay
              </span>
            </span>
            <datalist id="karsilastir-vade">
              {(VADELER[temelTur] ?? []).map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-2">
          <div className="block">
            <span className="mb-1 block text-xs text-txt-secondary">
              Kâr Oranı Kendin Belirle
            </span>
            <div className="flex h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3">
              <input
                id="karsilastir-oran-ozel"
                type="checkbox"
                checked={oranOzel}
                onChange={(e) => setOranOzel(e.target.checked)}
                className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-400"
              />
              <label htmlFor="karsilastir-oran-ozel" className="sr-only">
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
                name="karsilastir-hesap-tipi"
                checked={hesapTipi === '1'}
                onChange={() => setHesapTipi('1')}
                className="h-4 w-4 border-line text-brand-600 focus:ring-brand-400"
              />
              Finansman Tutarından Hesapla
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-txt">
              <input
                type="radio"
                name="karsilastir-hesap-tipi"
                checked={hesapTipi === '2'}
                onChange={() => setHesapTipi('2')}
                className="h-4 w-4 border-line text-brand-600 focus:ring-brand-400"
              />
              Taksit Tutarından Hesapla
            </label>
          </fieldset>
        </div>

        {ozelOranYuzde != null && (
          <p className="rounded-lg border border-warn-200 bg-warn-50 px-3 py-2 text-xs leading-relaxed text-warn-800 dark:border-warn-800 dark:bg-warn-950 dark:text-warn-200">
            Tüm bankalar için ortak %{oranMetni} oranı uygulanıyor. Bu görünüm bankaların
            ilan ettiği oranları değil, aynı oranda masraf ve toplam maliyet farkını
            karşılaştırır.
          </p>
        )}

        {turNotu && (
          <p className="text-[11px] leading-relaxed text-txt-muted">{turNotu.metin}</p>
        )}
      </section>

      {yukleniyor && (
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface p-6 text-sm text-txt-secondary">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Doğrulanmış ürün verileri yükleniyor…
        </div>
      )}

      {hata && !yukleniyor && (
        <div className="rounded-xl border border-risk-200 bg-risk-50 p-4 text-sm text-risk-800 dark:border-risk-800 dark:bg-risk-950 dark:text-risk-200">
          {hata}
        </div>
      )}

      {vadeSinirAsildi && (
        <div className="rounded-xl border border-risk-200 bg-risk-50 p-4 text-sm leading-relaxed text-risk-800 dark:border-risk-800 dark:bg-risk-950 dark:text-risk-200">
          <strong className="font-medium">Yasal vade sınırı aşıldı.</strong> İhtiyaç finansmanında{' '}
          {sayiBicim(tutar)} TL tutar için azami vade{' '}
          <strong className="font-medium">{yasalSinir} ay</strong>&apos;dır; {vadeAy} ay
          seçtiniz. Vadeyi {yasalSinir} aya indirin veya finansman tutarını düşürün.
        </div>
      )}

      {!yukleniyor && !hata && !vadeSinirAsildi && teklifler.length === 0 && (
        <div className="rounded-xl border border-line bg-surface p-10 text-center">
          <ArrowLeftRight className="mx-auto mb-3 h-8 w-8 text-txt-muted" aria-hidden="true" />
          <h2 className="text-base font-medium text-txt">Bu koşullarda teklif bulunamadı</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-txt-secondary">
            Seçtiğiniz ürün türü, tutar ve vade için doğrulanmış oran verisi yok. Tutarı veya
            vadeyi değiştirip yeniden deneyin — uydurma rakam gösterilmez.
          </p>
        </div>
      )}

      {/* Özet — kazananlar ve fark açıklaması */}
      {teklifler.length > 0 && enAvantajli?.kazanan && (
        <section className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 sm:p-5 dark:border-brand-800 dark:bg-brand-950/40">
          <h2 className="flex items-center gap-2 text-sm font-medium text-txt">
            <Trophy className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            Karşılaştırma özeti
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-txt-secondary">
            {sayiBicim(tutar)} TL / {vadeAy} ay koşulunda {teklifler.length} bankanın teklifi
            karşılaştırıldı. Bileşik skoru en yüksek olan{' '}
            <strong className="font-medium text-txt">
              {BANKA_INDEKS[enAvantajli.kazanan.bankaId]?.ad ?? enAvantajli.kazanan.bankaId}
            </strong>{' '}
            — {enAvantajli.kazanan.urunAdi} ({enAvantajli.gosterim}).
          </p>

          {farklar.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-txt-secondary">
              {farklar.map((f) => (
                <li key={f} className="flex gap-2">
                  <span aria-hidden="true">•</span>
                  <span>
                    İkinci sıradaki{' '}
                    {BANKA_INDEKS[teklifler[1].bankaId]?.ad ?? teklifler[1].bankaId} ile
                    karşılaştırıldığında: {f}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <ul className="mt-3 flex flex-wrap gap-2">
            {kriterler
              .filter((k) => k.key !== 'en_avantajli' && k.kazanan)
              .map((k) => (
                <li
                  key={k.key}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs text-txt-secondary"
                >
                  <Star
                    className="h-3.5 w-3.5 fill-current text-brand-600 dark:text-brand-400"
                    aria-hidden="true"
                  />
                  {k.etiket}:{' '}
                  <strong className="font-medium text-txt">
                    {BANKA_INDEKS[k.kazanan!.bankaId]?.ad ?? k.kazanan!.bankaId}
                  </strong>{' '}
                  ({k.gosterim})
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* Karşılaştırma matrisi */}
      {teklifler.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
          <div className="border-b border-line pb-4">
            <h2 className="flex items-center gap-2 text-sm font-medium text-txt">
              <ArrowLeftRight
                className="h-4 w-4 text-brand-600 dark:text-brand-400"
                aria-hidden="true"
              />
              Karşılaştırma matrisi
            </h2>
            <p className="mt-0.5 text-xs text-txt-secondary">
              Her satırda en iyi değer yıldızla işaretlidir. Kanıt düğmesi, değerin çıkarıldığı
              cümleyi gösterir.
            </p>
          </div>

          <div
            className="mt-4 overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Banka teklifleri karşılaştırma tablosu"
          >
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Katılım bankalarının aynı tutar ve vadedeki finansman tekliflerinin kâr payı
                oranı, taksit, tahsis ücreti, toplam maliyet ve ödül karşılaştırması
              </caption>
              <thead>
                <tr className="border-b border-line bg-sunken text-xs text-txt-secondary">
                  <th scope="col" className="sticky left-0 z-10 min-w-44 bg-sunken px-4 py-3">
                    Kriter
                  </th>
                  {teklifler.map((s) => (
                    <th key={s.id} scope="col" className="min-w-56 border-l border-line px-4 py-3">
                      <span className="flex items-center gap-2">
                        <BankMark bankaId={s.bankaId} size="sm" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-txt">
                            {BANKA_INDEKS[s.bankaId]?.ad ?? s.bankaId}
                          </span>
                          <span className="mt-0.5 block truncate text-xs font-normal text-txt-secondary">
                            {s.urunAdi}
                          </span>
                          {s.ilanOraniYok && (
                            <span className="mt-1 inline-block rounded border border-warn-200 bg-warn-50 px-1.5 py-0.5 text-[0.625rem] font-normal text-warn-800 dark:border-warn-800 dark:bg-warn-950 dark:text-warn-200">
                              İlan oranı yok
                            </span>
                          )}
                        </span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {SATIRLAR.map((satir) => {
                  const kazananId = satir.kriter ? kazananlar[satir.kriter] : null;
                  const kanitVar =
                    satir.kanitAlani !== null &&
                    teklifler.some((s) => s.kanitlar[satir.kanitAlani as string]);
                  const kanitAcik = acikKanit === satir.key;

                  return (
                    <React.Fragment key={satir.key}>
                      <tr>
                        <th scope="row" className={rowHeader}>
                          <span className="flex items-center justify-between gap-2">
                            {satir.etiket}
                            {kanitVar && (
                              <button
                                type="button"
                                onClick={() => setAcikKanit(kanitAcik ? null : satir.key)}
                                aria-expanded={kanitAcik}
                                aria-label={`${satir.etiket} için kanıt alıntılarını ${kanitAcik ? 'gizle' : 'göster'}`}
                                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors ${
                                  kanitAcik
                                    ? 'border-brand-600 bg-brand-600 text-white'
                                    : 'border-line bg-surface text-txt-muted hover:text-txt'
                                }`}
                              >
                                <Quote className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </span>
                        </th>

                        {teklifler.map((s) => {
                          const kazandi = kazananId === s.id;
                          return (
                            <td
                              key={s.id}
                              className={`${cellBase} ${kazandi ? 'bg-brand-50 dark:bg-brand-950' : ''}`}
                            >
                              <span className="flex items-center gap-1.5">
                                {satir.deger(s)}
                                {kazandi && (
                                  <Star
                                    className="h-3.5 w-3.5 shrink-0 fill-current text-brand-600 dark:text-brand-400"
                                    aria-label="Bu kriterde en iyi"
                                  />
                                )}
                              </span>
                            </td>
                          );
                        })}
                      </tr>

                      {kanitAcik && satir.kanitAlani && (
                        <tr className="bg-sunken">
                          <th
                            scope="row"
                            className="px-4 py-3 text-left text-xs text-txt-muted"
                          >
                            Kanıt alıntısı
                          </th>
                          {teklifler.map((s) => {
                            const alinti = s.kanitlar[satir.kanitAlani as string];
                            return (
                              <td
                                key={s.id}
                                className="border-l border-line px-4 py-3 align-top"
                              >
                                {alinti ? (
                                  <p className="text-xs leading-relaxed text-txt-secondary">
                                    &laquo;{alinti}&raquo;
                                  </p>
                                ) : (
                                  <span className="text-xs text-txt-muted">Kanıt yok</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-3 flex items-start gap-2 border-t border-line pt-3 text-xs leading-relaxed text-txt-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Taksit ve toplam maliyet, bankanın ilan ettiği aylık kâr payı oranı üzerinden eşit
            taksitli (anüite) ödeme planıyla hesaplanır. Aynı bankadan birden çok uygun teklif
            varsa toplam maliyeti en düşük olan gösterilir. Nihai teklif için bankaya
            başvurulmalıdır.
          </p>
        </div>
      )}
    </motion.section>
  );
};
