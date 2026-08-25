import React, { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { BookOpen, ArrowRight, Search } from "lucide-react";
import { CONFIDENCE_STYLES } from "./ConfidenceRing";
import {
  DENKLIK_ETIKET,
  KATILIM_SOZLUGU,
  type DenkllikSeviyesi,
} from "../data/katilimSozlugu";

const NORMALIZATION_RULES = [
  {
    title: "Oran normalizasyonu",
    body: '"%2,05" · "2.05 %" · "yüzde 2,05" ifadeleri ondalık sayıya çevrilir: 0.0205 (nokta ayraçlı).',
  },
  {
    title: "Vadeler her zaman ay cinsinden",
    body: '"10 yıl" → 120. "36 aya varan" → max: 36, min: null.',
  },
  {
    title: "Ücret sıfırlama",
    body: '"Tahsis ücreti alınmaz" → deger: 0.00, tipi: "yok".',
  },
  {
    title: "Kâr payı periyodu",
    body: 'Metinde "aylık" veya "yıllık" geçmiyorsa periyot: "belirsiz" atanır ve güven skoru en fazla 0.5 olur.',
  },
];

const CONFIDENCE_BANDS = [
  { range: "0.9 – 1.0", level: "yuksek" as const, desc: "Metinde açık ve tek anlamlı yazılı." },
  { range: "0.6 – 0.8", level: "orta" as const, desc: "Biçim veya birim hafif yoruma açık." },
  { range: "0.3 – 0.5", level: "dusuk" as const, desc: "Dolaylı çıkarım veya periyot belirsiz." },
  { range: "0.0", level: "yok" as const, desc: "Alan metinde hiç geçmiyor." },
];

const DENKLIK_STYLE: Record<DenkllikSeviyesi, string> = {
  denk: "border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-200",
  buyuk_olcude_denk:
    "border-info-200 bg-info-50 text-info-800 dark:border-info-900 dark:bg-info-950 dark:text-info-200",
  kismen_denk:
    "border-warn-200 bg-warn-50 text-warn-800 dark:border-warn-900 dark:bg-warn-950 dark:text-warn-200",
  denk_degil:
    "border-risk-200 bg-risk-50 text-risk-800 dark:border-risk-900 dark:bg-risk-950 dark:text-risk-200",
};

const SectionHeading: React.FC<{ no: number; children: React.ReactNode }> = ({
  no,
  children,
}) => (
  <h3 className="flex items-center gap-2 text-base font-medium text-txt">
    <span className="tnum grid h-6 w-6 place-items-center rounded-md bg-brand-100 font-mono text-xs text-brand-800 dark:bg-brand-900 dark:text-brand-200">
      {no}
    </span>
    {children}
  </h3>
);

export const TerminologyGuide: React.FC = () => {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [denklikFilter, setDenklikFilter] = useState<DenkllikSeviyesi | "hepsi">(
    "hepsi",
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return KATILIM_SOZLUGU.filter((row) => {
      if (denklikFilter !== "hepsi" && row.denklik !== denklikFilter) return false;
      if (!q) return true;
      return (
        row.geleneksel.toLocaleLowerCase("tr-TR").includes(q) ||
        row.katilim.toLocaleLowerCase("tr-TR").includes(q) ||
        row.aciklama.toLocaleLowerCase("tr-TR").includes(q)
      );
    });
  }, [query, denklikFilter]);

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-8 rounded-xl border border-line bg-surface p-4 shadow-raised sm:p-6"
    >
      <header className="border-b border-line pb-4">
        <p className="flex items-center gap-2 text-xs text-brand-700 dark:text-brand-400">
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          Ajan çalışma mantığı
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-txt">
          Katılım bankacılığı çıkarım sözlüğü ve normalizasyon standartları
        </h2>
        <p className="mt-1 text-sm text-txt-secondary">
          Geleneksel ifadelerin katılım finansındaki karşılıkları, denklik seviyeleri ve
          ajanın uyguladığı dönüşüm kuralları.
        </p>
      </header>

      <section className="space-y-3">
        <SectionHeading no={1}>Katılım finansı terim sözlüğü</SectionHeading>
        <p className="max-w-prose text-sm leading-relaxed text-txt-secondary">
          Kaynak metinde konvansiyonel terim geçiyorsa çıkarım yapılır ve{" "}
          <code className="rounded bg-warn-50 px-1 py-0.5 text-warn-800 dark:bg-warn-950 dark:text-warn-200">
            terim_esleme_uygulandi: true
          </code>{" "}
          işaretlenir. Denklik seviyesi, iki ifadenin hukuki/iktisadi özdeşliğini
          gösterir — &laquo;denk değil&raquo; kayıtları özellikle dönüştürülür.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Sözlükte ara</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-txt-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Örn. faiz, kredi, mevduat…"
              className="w-full rounded-lg border border-line bg-sunken py-2 pl-9 pr-3 text-sm text-txt outline-none ring-brand-500 focus:ring-2"
            />
          </label>
          <select
            value={denklikFilter}
            onChange={(e) =>
              setDenklikFilter(e.target.value as DenkllikSeviyesi | "hepsi")
            }
            className="rounded-lg border border-line bg-sunken px-3 py-2 text-sm text-txt outline-none ring-brand-500 focus:ring-2"
            aria-label="Denklik filtresi"
          >
            <option value="hepsi">Tüm denklikler</option>
            {(Object.keys(DENKLIK_ETIKET) as DenkllikSeviyesi[]).map((k) => (
              <option key={k} value={k}>
                {DENKLIK_ETIKET[k]}
              </option>
            ))}
          </select>
        </div>

        <p className="text-xs text-txt-muted">
          {filtered.length} / {KATILIM_SOZLUGU.length} terim
        </p>

        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-sunken text-xs uppercase tracking-wide text-txt-muted">
              <tr>
                <th className="px-3 py-2.5 font-medium">Geleneksel</th>
                <th className="px-3 py-2.5 font-medium">Katılım karşılığı</th>
                <th className="px-3 py-2.5 font-medium">Denklik</th>
                <th className="hidden px-3 py-2.5 font-medium lg:table-cell">
                  Açıklama
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((row) => (
                <tr key={row.geleneksel} className="align-top">
                  <td className="px-3 py-3">
                    <span className="font-medium text-risk-700 line-through decoration-risk-400/60 dark:text-risk-300">
                      {row.geleneksel}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-start gap-1.5 text-brand-800 dark:text-brand-300">
                      <ArrowRight
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-txt-muted"
                        aria-hidden="true"
                      />
                      {row.katilim}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${DENKLIK_STYLE[row.denklik]}`}
                    >
                      {DENKLIK_ETIKET[row.denklik]}
                    </span>
                  </td>
                  <td className="hidden max-w-md px-3 py-3 text-txt-secondary lg:table-cell">
                    {row.aciklama}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-txt-muted">
                    Eşleşen terim yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading no={2}>Sayısal normalizasyon</SectionHeading>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {NORMALIZATION_RULES.map((rule) => (
            <li key={rule.title} className="rounded-lg border border-line bg-sunken p-3.5">
              <p className="text-sm font-medium text-txt">{rule.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-txt-secondary">{rule.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <SectionHeading no={3}>Kapalı liste sınıflandırmaları</SectionHeading>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-line bg-sunken p-4">
            <p className="text-sm font-medium text-txt">
              Ürün türü <code className="font-mono text-xs text-txt-muted">urun_turu</code>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                "konut_finansmani",
                "tasit_finansmani",
                "ihtiyac_finansmani",
                "kart",
                "katilim_fonu",
                "yatirim",
                "alisveris_puani",
                "diger",
              ].map((t) => (
                <span
                  key={t}
                  className="rounded border border-line bg-surface px-2 py-0.5 font-mono text-xs text-txt-secondary"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-sunken p-4">
            <p className="text-sm font-medium text-txt">
              Müşteri segmenti{" "}
              <code className="font-mono text-xs text-txt-muted">musteri_segmenti</code>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                "yeni_musteri",
                "mevcut_musteri",
                "kurumsal",
                "kobi",
                "genc",
                "emekli",
                "tumu",
              ].map((s) => (
                <span
                  key={s}
                  className="rounded border border-line bg-surface px-2 py-0.5 font-mono text-xs text-txt-secondary"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading no={4}>Kanıt zorunluluğu ve güven ölçeği</SectionHeading>
        <p className="max-w-prose text-sm leading-relaxed text-txt-secondary">
          Ajan çıkardığı her alan için dayandığı cümleyi{" "}
          <code className="font-mono text-txt">kanitlar</code> nesnesinde birebir alıntılamak
          zorundadır. Kanıt gösterilemeyen alan çıkarılamaz.
        </p>

        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {CONFIDENCE_BANDS.map((band) => {
            const style = CONFIDENCE_STYLES[band.level];
            const Icon = style.icon;
            return (
              <li
                key={band.range}
                className={`rounded-lg border p-3 ${style.chipBg} ${style.chipBorder}`}
              >
                <p className={`flex items-center gap-1.5 font-mono text-sm ${style.text}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {band.range}
                  <span className="text-xs">· {style.label}</span>
                </p>
                <p className="mt-1 text-xs leading-relaxed text-txt-secondary">{band.desc}</p>
              </li>
            );
          })}
        </ul>
      </section>
    </motion.article>
  );
};
