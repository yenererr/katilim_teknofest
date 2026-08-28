/**
 * Belirli bankalar için karşılaştırma adayı üretir.
 *
 * Kaynak sırası:
 *  1. Doğrulanmış kazınmış kayıt (oran, azami vade, tahsis, ödül)
 *  2. Bankanın canlı hesaplama motoru (oran + taksit + masraf) — kazınmış oran yoksa
 *
 * Ödül ve masraf muafiyeti alanları kazıyıcıda sayısal olarak dolmadığı için
 * kampanya metninden çıkarılır (`odulCikar`, `masrafMuafiyetiCikar`).
 */

import { BANKA_INDEKS, VARSAYILAN_TUTAR } from "../../../data/piyasa";
import { listMemoryProducts } from "../postgres/store";
import { enrichWithLiveCalculators } from "./liveCalculatorEnrichment";
import type { BankaAdayi } from "../tools/cokBoyutluKarsilastirma";
import type {
  FinancingConversationState,
  FinancingType,
} from "./finansmanTypes";

/** Canlı hesaplama motoru olan bankalar */
const CANLI_MOTORLU = new Set(["vakif-katilim", "ziraat-katilim", "kuveyt-turk"]);

const VARSAYILAN_VADE: Record<string, number> = {
  konut_finansmani: 120,
  tasit_finansmani: 36,
  ihtiyac_finansmani: 24,
  isyeri_finansmani: 60,
};

export function finansmanAnahtari(type: FinancingType | null): string {
  if (!type) return "ihtiyac_finansmani";
  if (type === "vehicle") return "tasit_finansmani";
  if (type === "housing") return "konut_finansmani";
  if (type === "commercial") return "isyeri_finansmani";
  return "ihtiyac_finansmani";
}

function trSayiCoz(ham: string): number | null {
  const t = ham.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Kampanya metninden ödül tutarı ve açıklaması çıkarır.
 * "5.000 TL alışveriş kartı", "10.000 TL'ye varan nakit iade", "2.500 TL hediye"
 */
export function odulCikar(
  metinler: Array<string | null | undefined>,
): { tl: number | null; aciklama: string | null } {
  const havuz = metinler.filter((m): m is string => Boolean(m && m.trim()));

  for (const metin of havuz) {
    // TL tutarı + ödül türü aynı cümlede
    const m = metin.match(
      /([\d.]{2,12}(?:,\d+)?)\s*(?:tl|₺)(?:['’]?\s*(?:ye|a)\s*(?:varan|kadar))?\s*([^.,;\n]{0,42}?(?:alışveriş kartı|alisveris karti|hediye çeki|hediye ceki|nakit iade|para puan|puan|hediye|kart|iade|bonus|mil))/i,
    );
    if (m) {
      const tl = trSayiCoz(m[1]);
      const tur = m[2].trim().replace(/\s+/g, " ");
      if (tl != null && tl >= 50) {
        return {
          tl,
          aciklama: `${tl.toLocaleString("tr-TR")} TL ${tur}`,
        };
      }
    }
  }

  // Sayısal olmayan ama tanımlı ödül (ör. "10.000 Mile varan fırsat")
  for (const metin of havuz) {
    const m = metin.match(/([\d.]{2,12})\s*(mil|puan)/i);
    if (m) {
      const n = trSayiCoz(m[1]);
      if (n != null && n >= 50) {
        return { tl: null, aciklama: `${n.toLocaleString("tr-TR")} ${m[2]}` };
      }
    }
  }

  return { tl: null, aciklama: null };
}

/**
 * "50.000 TL'ye kadar dosya masrafı alınmaz" → 50000
 */
/**
 * Olumsuzluk kalıpları. "alınmamaktadır" eşleşir, "alınmaktadır" eşleşmez —
 * bu ayrım masrafın alınıp alınmadığını belirlediği için kritiktir.
 */
const MASRAF_YOK =
  "(?:yok|ücretsiz|ucretsiz|muaf|al[ıi]nmaz|al[ıi]nmamakta|al[ıi]nm[ıi]yor|al[ıi]nmayacak|tahsil\\s*edilmez|talep\\s*edilmez)";

export function masrafMuafiyetiCikar(
  metinler: Array<string | null | undefined>,
): number | null {
  const havuz = metinler.filter((m): m is string => Boolean(m && m.trim()));
  const ileri = new RegExp(
    `([\\d.]{2,12})\\s*(?:tl|₺)['’]?\\s*(?:ye|a)?\\s*kadar[^.;\\n]{0,50}?(?:dosya|tahsis)\\s*(?:masraf|ücret|ucret)[^.;\\n]{0,20}?${MASRAF_YOK}`,
    "i",
  );
  // Ters sıra: "dosya masrafı 50.000 TL'ye kadar alınmaz"
  const geri = new RegExp(
    `(?:dosya|tahsis)\\s*(?:masraf|ücret|ucret)[^.;\\n]{0,30}?([\\d.]{2,12})\\s*(?:tl|₺)['’]?\\s*(?:ye|a)?\\s*kadar[^.;\\n]{0,20}?${MASRAF_YOK}`,
    "i",
  );

  for (const metin of havuz) {
    for (const re of [ileri, geri]) {
      const m = metin.match(re);
      if (m) {
        const n = trSayiCoz(m[1]);
        if (n != null && n > 0) return n;
      }
    }
  }
  return null;
}

type HamKayit = Record<string, any>;

function kayitAc(row: HamKayit): HamKayit {
  return row?.payload && typeof row.payload === "object" ? row.payload : row;
}

function kayitTuru(k: HamKayit): string | null {
  if (k.productType) return String(k.productType);
  const kategori = String(k.category ?? "");
  if (kategori === "housing_finance") return "konut_finansmani";
  if (kategori === "vehicle_finance") return "tasit_finansmani";
  if (kategori === "consumer_finance") return "ihtiyac_finansmani";
  return null;
}

/** Bir banka için verilen türde en bilgi dolu kazınmış kaydı seçer. */
function enIyiKayit(bankId: string, financingKey: string): HamKayit | null {
  const adaylar = listMemoryProducts({ bankId })
    .map(kayitAc)
    .filter((k) => kayitTuru(k) === financingKey);

  if (adaylar.length === 0) return null;

  // Alan doluluğuna göre puanla: oran > vade > masraf > ödül
  const puan = (k: HamKayit) =>
    (k.profitRate != null ? 8 : 0) +
    (k.maxTermMonths != null ? 4 : 0) +
    (k.allocationFeeValue != null ? 2 : 0) +
    (k.rewardAmountTl != null ? 1 : 0);

  return [...adaylar].sort((a, b) => puan(b) - puan(a))[0];
}

function metinHavuzu(k: HamKayit | null): string[] {
  if (!k) return [];
  const parcalar: Array<string | null | undefined> = [
    k.campaignAdvantage,
    k.productName,
    k.title,
    k.rewardType,
    ...(Array.isArray(k.conditions) ? k.conditions : []),
    ...(Array.isArray(k.evidence)
      ? k.evidence.map((e: any) => (typeof e?.text === "string" ? e.text : null))
      : []),
  ];
  return parcalar.filter((p): p is string => Boolean(p && String(p).trim()));
}

/** Aylığa normalize eder. */
function aylikOran(k: HamKayit): number | null {
  const oran = typeof k.profitRate === "number" ? k.profitRate : null;
  if (oran == null || oran <= 0) return null;
  if (k.ratePeriod === "annual") return oran / 12;
  if (k.ratePeriod === "monthly") return oran;
  return null; // belirsiz periyot karşılaştırmaya girmez
}

export type AdayToplamaSonucu = {
  adaylar: BankaAdayi[];
  tutarTl: number;
  vadeAy: number;
  varsayimlar: string[];
  canliBankIds: string[];
};

/**
 * Karşılaştırma/alan sorgusu için banka adaylarını toplar.
 */
export async function bankaAdaylariniTopla(opts: {
  bankIds: string[];
  financingType: FinancingType | null;
  amountTl?: number | null;
  termMonths?: number | null;
  /** Testlerde ağ çağrısını kapatmak için */
  canliKullan?: boolean;
}): Promise<AdayToplamaSonucu> {
  const financingKey = finansmanAnahtari(opts.financingType);
  const varsayimlar: string[] = [];

  let tutarTl = opts.amountTl ?? null;
  if (tutarTl == null || tutarTl <= 0) {
    tutarTl =
      VARSAYILAN_TUTAR[financingKey as keyof typeof VARSAYILAN_TUTAR] ?? 200_000;
    varsayimlar.push(
      `Tutar belirtilmediği için temsili ${tutarTl.toLocaleString("tr-TR")} TL üzerinden hesaplandı.`,
    );
  }

  // 1) Kazınmış kayıtlar — temsili vadeyi belirlemek için önce bunlar okunur
  const kazinmis = new Map<string, HamKayit | null>();
  for (const bankId of opts.bankIds) {
    kazinmis.set(bankId, enIyiKayit(bankId, financingKey));
  }

  const kullaniciVadesi = opts.termMonths ?? null;
  let vadeAy = kullaniciVadesi;
  if (vadeAy == null || vadeAy <= 0) {
    const varsayilan = VARSAYILAN_VADE[financingKey] ?? 24;
    // Adayların azami vadelerinin en küçüğü: hem hesap geçerli olur hem de
    // karşılaştırma aynı vade üzerinden yapılır.
    const azamiler = [...kazinmis.values()]
      .map((k) => (k?.maxTermMonths != null ? Number(k.maxTermMonths) : null))
      .filter((n): n is number => n != null && n > 0);
    const ortakAzami = azamiler.length ? Math.min(...azamiler) : null;

    if (ortakAzami != null && ortakAzami < varsayilan) {
      vadeAy = ortakAzami;
      varsayimlar.push(
        `Vade belirtilmediği için ürünün azami vadesi olan ${vadeAy} ay kullanıldı.`,
      );
    } else {
      vadeAy = varsayilan;
      varsayimlar.push(`Vade belirtilmediği için temsili ${vadeAy} ay kullanıldı.`);
    }
  }

  // 2) Canlı hesaplama motorları
  const canliHedef =
    opts.canliKullan === false
      ? []
      : opts.bankIds.filter((b) => CANLI_MOTORLU.has(b));
  const canliOranlar = new Map<
    string,
    { oran: number | null; masrafTl: number | null }
  >();
  let canliBankIds: string[] = [];

  if (canliHedef.length > 0) {
    const state = {
      selectedBankIds: canliHedef,
      financingType: opts.financingType,
      requestedAmountTl: tutarTl,
      preferredTermMonths: vadeAy,
      customProfitRatePercent: null,
    } as unknown as FinancingConversationState;

    try {
      const sonuc = await enrichWithLiveCalculators([], state);
      canliBankIds = sonuc.liveBankIds;
      for (const m of sonuc.matches) {
        if (!m.calculationAvailable) continue;
        canliOranlar.set(m.bankId, {
          oran:
            m.profitRate != null
              ? m.ratePeriod === "annual"
                ? m.profitRate / 12
                : m.profitRate
              : null,
          masrafTl: m.allocationFeeTl ?? null,
        });
      }
    } catch {
      varsayimlar.push("Canlı hesaplama motorlarına ulaşılamadı.");
    }
  }

  // 3) Birleştir
  const adaylar: BankaAdayi[] = opts.bankIds.map((bankId) => {
    const k = kazinmis.get(bankId) ?? null;
    const canli = canliOranlar.get(bankId);
    const metinler = metinHavuzu(k);
    const odul = odulCikar(metinler);
    const muafiyet = masrafMuafiyetiCikar(metinler);

    const kazinmisOran = k ? aylikOran(k) : null;
    // Canlı motor oranı, ilan edilmiş kazınmış orandan daha güncel kabul edilir
    const oran = canli?.oran ?? kazinmisOran;

    const masrafTl =
      canli?.masrafTl ??
      (k?.allocationFeeType === "fixed" && typeof k.allocationFeeValue === "number"
        ? k.allocationFeeValue
        : null);
    const masrafOrani =
      k?.allocationFeeType === "percentage" &&
      typeof k.allocationFeeValue === "number"
        ? k.allocationFeeValue
        : null;

    return {
      bankId,
      bankName: BANKA_INDEKS[bankId]?.ad || bankId,
      productName: k?.productName ? String(k.productName) : null,
      aylikKarPayiOrani: oran,
      azamiVadeAy:
        k?.maxTermMonths != null ? Number(k.maxTermMonths) : null,
      masrafTl,
      masrafOrani,
      masrafMuafiyetiTl: muafiyet,
      odulTl:
        typeof k?.rewardAmountTl === "number" && k.rewardAmountTl > 0
          ? k.rewardAmountTl
          : odul.tl,
      odulAciklamasi: odul.aciklama,
      sourceUrl: k?.sourceUrl ? String(k.sourceUrl) : null,
    };
  });

  if (canliBankIds.length > 0) {
    varsayimlar.push(
      `Kâr payı oranları ${canliBankIds
        .map((b) => BANKA_INDEKS[b]?.ad || b)
        .join(", ")} için bankanın kendi hesaplama aracından alındı (${tutarTl.toLocaleString("tr-TR")} TL / ${vadeAy} ay).`,
    );
  }

  return { adaylar, tutarTl, vadeAy, varsayimlar, canliBankIds };
}
