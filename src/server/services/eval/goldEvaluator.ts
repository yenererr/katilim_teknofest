/**
 * Gold veri seti üzerinde alan bazlı (field-level) başarı ölçümü.
 *
 * Ölçülen üç şey var:
 *
 * 1. **Alan çıkarımı** — her alan için precision / recall / F1. Veri setinde
 *    "bu alan metinde yok" bilgisi de etiketli olduğu için, kaynakta olmayan
 *    bir değeri üretmek (uydurma) yanlış pozitif olarak cezalandırılır;
 *    doğru susmak (`TN`) ayrıca raporlanır.
 * 2. **Span kanıtı** — üretilen her değerin dayandığı ifade kaynak metinde
 *    birebir geçiyor mu (grounding) ve insan etiketçinin işaretlediği span
 *    ile örtüşüyor mu.
 * 3. **Kampanya türü** — şartname 5.4'teki sekiz sınıf için doğruluk ve
 *    karışıklık matrisi.
 *
 * Ölçüm yalnızca deterministik kural katmanını çalıştırır: dil modeli
 * çağrısı yoktur, bu yüzden rapor tekrar üretilebilir.
 */

import { kuralTabanliCikar } from "../../../nlp/extract";
import {
  KAMPANYA_TURU_ETIKET,
  kampanyaTuruBelirle,
  type KampanyaTuru,
} from "../../../nlp/kampanyaTuru";
import { asciiKatla } from "../../../nlp/normalize";
import type { GoldKayit } from "./goldDataset";

/** Ölçüme giren alanlar — veri setindeki adlarıyla. */
export const OLCULEN_ALANLAR = [
  "kar_payi_orani",
  "vade_ay",
  "finansman_tutari",
  "tahsis_ucreti",
  "taksit_sayisi",
  "kampanya_suresi",
  "masraf_durumu",
  "alisveris_puani",
  "indirim_orani",
  "odul_miktari",
  "hedef_kitle",
] as const;

export type OlculenAlan = (typeof OLCULEN_ALANLAR)[number];

export type AlanSonucu = {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  /** Değer üretildi ama gold değerinden farklı */
  yanlisDeger: number;
  /** Üretilen değerin kanıtı kaynak metinde birebir bulundu */
  kanitDogrulandi: number;
  /** Kanıt, insan etiketçinin span'i ile örtüştü */
  spanOrtusmesi: number;
  /** Kanıt üretilen tahmin sayısı (grounding oranının paydası) */
  kanitliTahmin: number;
};

export type Tahmin = {
  deger: unknown;
  kanit: string | null;
};

const bosSonuc = (): AlanSonucu => ({
  tp: 0,
  fp: 0,
  fn: 0,
  tn: 0,
  yanlisDeger: 0,
  kanitDogrulandi: 0,
  spanOrtusmesi: 0,
  kanitliTahmin: 0,
});

/* ------------------------------------------------------------------ */
/* Karşılaştırma yardımcıları                                          */
/* ------------------------------------------------------------------ */

function sayiyaCevir(deger: unknown): number | null {
  if (typeof deger === "number" && Number.isFinite(deger)) return deger;
  if (deger && typeof deger === "object") {
    const o = deger as Record<string, unknown>;
    for (const anahtar of ["value", "max", "min"]) {
      const n = o[anahtar];
      if (typeof n === "number" && Number.isFinite(n)) return n;
    }
  }
  return null;
}

/** Gold değeri aralık olabilir; tahmin aralığın herhangi bir ucuna eşitse doğrudur. */
function sayisalEsit(
  tahmin: number,
  gold: unknown,
  tolerans: number,
): boolean {
  const yakin = (a: number, b: number) => Math.abs(a - b) <= tolerans;

  if (typeof gold === "number") return yakin(tahmin, gold);

  if (gold && typeof gold === "object") {
    const o = gold as Record<string, unknown>;
    const min = typeof o.min === "number" ? o.min : null;
    const max = typeof o.max === "number" ? o.max : null;
    const value = typeof o.value === "number" ? o.value : null;

    if (value != null) return yakin(tahmin, value);
    if (min != null && yakin(tahmin, min)) return true;
    if (max != null && yakin(tahmin, max)) return true;
    // Aralık verilmişse aralığın içi de kabul edilir.
    if (min != null && max != null) return tahmin >= min && tahmin <= max;
  }
  return false;
}

/**
 * Bizim segment kodlarımızı veri setinin sözlüğüne indirger.
 * Veri seti üç etiket kullanıyor: yeni_musteri, mevcut_musteri ve
 * bunların dışındaki her özel kitle için belirli_segment.
 */
function segmentiGoldSozlugune(kod: string): string {
  if (kod === "yeni_musteri" || kod === "mevcut_musteri") return kod;
  return "belirli_segment";
}

/** Boşluk ve büyük/küçük farkını yok sayan metin karşılaştırması. */
function sadelestir(metin: string): string {
  return asciiKatla(metin).replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------ */
/* Kural katmanının çıktısını gold alan adlarına eşle                  */
/* ------------------------------------------------------------------ */

export function tahminleriUret(metin: string): Partial<Record<OlculenAlan, Tahmin>> {
  const k = kuralTabanliCikar(metin);
  const cikti: Partial<Record<OlculenAlan, Tahmin>> = {};

  if (k.kar_payi_orani.deger != null) {
    // Veri seti oranı yüzde olarak tutuyor (2.99); kural katmanı ondalık.
    cikti.kar_payi_orani = {
      deger: Number((k.kar_payi_orani.deger * 100).toFixed(4)),
      kanit: k.kar_payi_orani.kanit,
    };
  }

  // Veri seti tek bir vade sayısı etiketliyor; ilan edilen azami vade esastır.
  const vade = k.vade_ay.max ?? k.vade_ay.min;
  if (vade != null) cikti.vade_ay = { deger: vade, kanit: k.vade_ay.kanit };

  if (k.tutar.max != null || k.tutar.min != null) {
    cikti.finansman_tutari = {
      deger: k.tutar.max ?? k.tutar.min,
      kanit: k.tutar.kanit,
    };
  }

  if (k.tahsis_ucreti.deger != null && k.tahsis_ucreti.tipi === "sabit") {
    cikti.tahsis_ucreti = {
      deger: k.tahsis_ucreti.deger,
      kanit: k.tahsis_ucreti.kanit,
    };
  }

  if (k.kampanya_bitis.iso) {
    cikti.kampanya_suresi = {
      deger: k.kampanya_bitis.iso,
      kanit: k.kampanya_bitis.kanit,
    };
  }

  // Masraf durumu her metinde bir cümle üretir; "belirtilmemiş" susma sayılır.
  if (k.masraf_durumu && k.masraf_durumu !== "Masraf belirtilmemiş") {
    cikti.masraf_durumu = {
      deger: { has_fee: !/yok|alınmıyor|ücretsiz|karşılan/i.test(k.masraf_durumu) },
      kanit: k.tahsis_ucreti.kanit ?? k.kampanya_avantaji.kanit,
    };
  }

  if (k.alisveris_puani.deger != null) {
    cikti.alisveris_puani = {
      deger: { kind: "points", value: k.alisveris_puani.deger },
      kanit: k.alisveris_puani.kanit,
    };
  }

  if (k.indirim_orani.deger != null) {
    cikti.indirim_orani = {
      deger: Number((k.indirim_orani.deger * 100).toFixed(4)),
      kanit: k.indirim_orani.kanit,
    };
  }

  if (k.odul_tutari.deger != null) {
    cikti.odul_miktari = {
      deger: { value: k.odul_tutari.deger, currency: "TRY" },
      kanit: k.odul_tutari.kanit,
    };
  } else if (
    k.kampanya_avantaji.deger != null &&
    k.kampanya_avantaji.tur === "hediye_ceki"
  ) {
    cikti.odul_miktari = {
      deger: { value: k.kampanya_avantaji.deger, currency: "TRY" },
      kanit: k.kampanya_avantaji.kanit,
    };
  }

  if (k.taksit_sayisi.deger != null) {
    cikti.taksit_sayisi = {
      deger: k.taksit_sayisi.deger,
      kanit: k.taksit_sayisi.kanit,
    };
  }

  if (k.hedef_kitle.deger && k.hedef_kitle.deger.length > 0) {
    cikti.hedef_kitle = {
      deger: [...new Set(k.hedef_kitle.deger.map(segmentiGoldSozlugune))],
      kanit: k.hedef_kitle.kanit,
    };
  }

  return cikti;
}

/** Alanın gold değeriyle tahminin uyuşup uyuşmadığı. */
export function degerUyusuyorMu(
  alan: OlculenAlan,
  tahmin: unknown,
  gold: unknown,
): boolean {
  if (alan === "hedef_kitle") {
    const t = new Set((tahmin as string[]) ?? []);
    const g = new Set(
      Array.isArray(gold) ? (gold as string[]).map(segmentiGoldSozlugune) : [],
    );
    // Kesişim varsa doğru sayılır: veri seti çoklu etiket kullanıyor.
    return [...t].some((x) => g.has(x));
  }

  if (alan === "masraf_durumu") {
    const t = (tahmin as { has_fee?: boolean })?.has_fee;
    const g = (gold as { has_fee?: boolean })?.has_fee;
    return typeof t === "boolean" && t === g;
  }

  if (alan === "kampanya_suresi") {
    return String(tahmin) === String(gold);
  }

  const sayi = sayiyaCevir(tahmin);
  if (sayi == null) return false;

  // Oranlarda küsurat toleransı; tutarlarda birebir eşitlik beklenir.
  const tolerans =
    alan === "kar_payi_orani" || alan === "indirim_orani" ? 0.011 : 0;
  const goldDeger =
    alan === "alisveris_puani" || alan === "odul_miktari"
      ? (gold as Record<string, unknown>)
      : gold;
  return sayisalEsit(sayi, goldDeger, tolerans);
}

/* ------------------------------------------------------------------ */
/* Ana değerlendirme                                                   */
/* ------------------------------------------------------------------ */

export type TurSonucu = {
  dogru: number;
  toplam: number;
  /** Gerçek etiket → tahmin → adet */
  karisiklik: Record<string, Record<string, number>>;
};

export type DegerlendirmeSonucu = {
  kayitSayisi: number;
  bankaSayisi: number;
  alanlar: Record<OlculenAlan, AlanSonucu>;
  kampanyaTuru: TurSonucu;
  /** Zorluk etiketi taşıyan kayıtlarda alan bazlı F1 (genel ile karşılaştırmak için) */
  zorKayitAlanlari: Record<OlculenAlan, AlanSonucu>;
};

/** Bizim tür kodumuzu veri setinin Türkçe etiketine çevirir. */
export function turEtiketi(tur: KampanyaTuru | null): string | null {
  if (!tur) return null;
  // Veri seti "Kampanyası" son ekini kullanmıyor: "Konut Finansmanı".
  return KAMPANYA_TURU_ETIKET[tur].replace(/ Kampanyası$/, "");
}

export function degerlendir(kayitlar: GoldKayit[]): DegerlendirmeSonucu {
  const alanlar = Object.fromEntries(
    OLCULEN_ALANLAR.map((a) => [a, bosSonuc()]),
  ) as Record<OlculenAlan, AlanSonucu>;
  const zorAlanlar = Object.fromEntries(
    OLCULEN_ALANLAR.map((a) => [a, bosSonuc()]),
  ) as Record<OlculenAlan, AlanSonucu>;

  const tur: TurSonucu = { dogru: 0, toplam: 0, karisiklik: {} };

  for (const kayit of kayitlar) {
    const tahminler = tahminleriUret(kayit.text);
    const sadeMetin = sadelestir(kayit.text);

    for (const alan of OLCULEN_ALANLAR) {
      const hedefler = [alanlar[alan], ...(kayit.hard ? [zorAlanlar[alan]] : [])];
      const tahmin = tahminler[alan];
      const goldVar = Object.prototype.hasOwnProperty.call(kayit.fields, alan);
      const goldYok = kayit.absentFields.includes(alan);

      // Ne değeri ne de "yok" bilgisi etiketlenmemişse kayıt bu alan için
      // ölçüme girmez; etiketlenmemiş veriyi doğru/yanlış saymak yanıltır.
      if (!goldVar && !goldYok) continue;

      if (!tahmin) {
        for (const h of hedefler) {
          if (goldVar) h.fn += 1;
          else h.tn += 1;
        }
        continue;
      }

      // Kanıt kontrolü — tahmin üretildiyse her hâlükârda ölçülür.
      if (tahmin.kanit) {
        const kanitSade = sadelestir(tahmin.kanit);
        const metindeVar = kanitSade.length > 0 && sadeMetin.includes(kanitSade);
        const goldSpan = kayit.fieldSpans[alan];
        const spanSade = goldSpan ? sadelestir(goldSpan) : "";
        const ortusuyor =
          spanSade.length > 0 &&
          (kanitSade.includes(spanSade) || spanSade.includes(kanitSade));

        for (const h of hedefler) {
          h.kanitliTahmin += 1;
          if (metindeVar) h.kanitDogrulandi += 1;
          if (ortusuyor) h.spanOrtusmesi += 1;
        }
      }

      if (!goldVar) {
        // Kaynakta olmadığı doğrulanmış alanda değer üretmek uydurmadır.
        for (const h of hedefler) h.fp += 1;
        continue;
      }

      const uyuyor = degerUyusuyorMu(alan, tahmin.deger, kayit.fields[alan]);
      for (const h of hedefler) {
        if (uyuyor) {
          h.tp += 1;
        } else {
          h.fp += 1;
          h.fn += 1;
          h.yanlisDeger += 1;
        }
      }
    }

    // Kampanya türü — etiketsiz kayıtlar ölçüme girmez.
    if (kayit.campaignType) {
      tur.toplam += 1;
      const tahminEdilen =
        turEtiketi(
          kampanyaTuruBelirle({
            metin: kayit.text,
            url: kayit.sourceUrl,
          }).tur,
        ) ?? "(tür atanmadı)";
      if (tahminEdilen === kayit.campaignType) tur.dogru += 1;
      const satir = (tur.karisiklik[kayit.campaignType] ??= {});
      satir[tahminEdilen] = (satir[tahminEdilen] ?? 0) + 1;
    }
  }

  return {
    kayitSayisi: kayitlar.length,
    bankaSayisi: new Set(kayitlar.map((k) => k.bankSlug)).size,
    alanlar,
    kampanyaTuru: tur,
    zorKayitAlanlari: zorAlanlar,
  };
}

export type Metrik = {
  precision: number;
  recall: number;
  f1: number;
  /** Kaynakta olmayan alanda doğru susma oranı */
  susmaDogrulugu: number;
  groundingOrani: number;
  spanOrtusmeOrani: number;
  destek: number;
};

export function metrikHesapla(s: AlanSonucu): Metrik {
  const precision = s.tp + s.fp === 0 ? 1 : s.tp / (s.tp + s.fp);
  const recall = s.tp + s.fn === 0 ? 1 : s.tp / (s.tp + s.fn);
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const susmaPaydasi = s.tn + s.fp;
  return {
    precision,
    recall,
    f1,
    susmaDogrulugu: susmaPaydasi === 0 ? 1 : s.tn / susmaPaydasi,
    groundingOrani:
      s.kanitliTahmin === 0 ? 1 : s.kanitDogrulandi / s.kanitliTahmin,
    spanOrtusmeOrani:
      s.kanitliTahmin === 0 ? 0 : s.spanOrtusmesi / s.kanitliTahmin,
    destek: s.tp + s.fn,
  };
}

export type SinifMetrigi = {
  sinif: string;
  precision: number;
  recall: number;
  f1: number;
  destek: number;
};

/**
 * Kampanya türü için sınıf bazlı precision/recall/F1 ve makro ortalama.
 *
 * Sınıf dağılımı dengesiz (Kart 34, Konut 7), bu yüzden yalnızca doğruluk
 * yanıltıcı olur: hiç tahmin edilmeyen küçük bir sınıf doğruluğu az düşürür
 * ama makro F1'i belirgin düşürür.
 */
export function turSinifMetrikleri(t: TurSonucu): {
  siniflar: SinifMetrigi[];
  makroF1: number;
} {
  const gercekler = Object.keys(t.karisiklik);
  const tumSiniflar = new Set<string>(gercekler);
  for (const satir of Object.values(t.karisiklik)) {
    for (const tahmin of Object.keys(satir)) tumSiniflar.add(tahmin);
  }

  const siniflar: SinifMetrigi[] = [];
  for (const sinif of gercekler) {
    const tp = t.karisiklik[sinif]?.[sinif] ?? 0;
    const destek = Object.values(t.karisiklik[sinif] ?? {}).reduce(
      (a, b) => a + b,
      0,
    );
    let tahminToplam = 0;
    for (const satir of Object.values(t.karisiklik)) {
      tahminToplam += satir[sinif] ?? 0;
    }
    const precision = tahminToplam === 0 ? 0 : tp / tahminToplam;
    const recall = destek === 0 ? 0 : tp / destek;
    const f1 =
      precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    siniflar.push({ sinif, precision, recall, f1, destek });
  }

  const makroF1 =
    siniflar.length === 0
      ? 0
      : siniflar.reduce((a, s) => a + s.f1, 0) / siniflar.length;
  return { siniflar: siniflar.sort((a, b) => b.destek - a.destek), makroF1 };
}

/** Tüm alanların mikro ortalaması. */
export function mikroOrtalama(
  alanlar: Record<OlculenAlan, AlanSonucu>,
): Metrik {
  const toplam = bosSonuc();
  for (const alan of OLCULEN_ALANLAR) {
    const s = alanlar[alan];
    toplam.tp += s.tp;
    toplam.fp += s.fp;
    toplam.fn += s.fn;
    toplam.tn += s.tn;
    toplam.kanitDogrulandi += s.kanitDogrulandi;
    toplam.spanOrtusmesi += s.spanOrtusmesi;
    toplam.kanitliTahmin += s.kanitliTahmin;
  }
  return metrikHesapla(toplam);
}
