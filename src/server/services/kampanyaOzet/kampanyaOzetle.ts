import type { ExtractedFinancialRecord } from "../scraper/scraperTypes";
import { callEvrenChat, sanitizeEvrenError } from "../evren/evrenChat";

/**
 * Tek bir kampanyanın özeti.
 *
 * Özet yalnızca o kampanyanın kendi alanlarından üretilir; başka kampanya,
 * banka geneli bilgi veya modelin ön bilgisi karışmaz. Alan yoksa "belirtilmemiş"
 * denir — eksik bilgi tamamlanmaz.
 */

export type OzetKaynagi = "kural" | "model";

export interface KampanyaOzeti {
  ozet: string;
  kaynak: OzetKaynagi;
  /** Özetin dayandığı alanlar — kullanıcıya şeffaflık için */
  kullanilanAlanlar: string[];
  /** Yapılandırılmış hiçbir alan yoksa true; kullanıcı resmî sayfaya yönlendirilir */
  veriYetersiz: boolean;
  modelUyarisi: string | null;
}

const tl = (v: number) =>
  `${v.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} TL`;

const yuzde = (v: number) =>
  `%${(v * 100).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const TEMA_ADI: Record<string, string> = {
  education: "eğitim",
  card: "kart",
  housing: "konut",
  vehicle: "taşıt",
  new_customer: "yeni müşteri",
  pilgrimage: "hac / umre",
  shopping: "alışveriş",
  travel: "seyahat",
  general: "genel",
};

const ODUL_ADI: Record<string, string> = {
  puan: "puan",
  indirim: "indirim",
  voucher: "alışveriş çeki",
  mil: "mil",
};

/** Tarihi gün-ay-yıl olarak yazar; çözümlenemezse ham hâlini döndürür. */
function tarihBicim(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Kampanyanın kendi alanlarından cümleler üretir.
 * Deterministik ve dış servise bağımsızdır (şartname 5.9 on-premise).
 */
export function kuralTabanliOzet(k: ExtractedFinancialRecord): KampanyaOzeti {
  const kullanilan: string[] = [];
  const cumleler: string[] = [];

  const tema = k.campaignTheme ? TEMA_ADI[k.campaignTheme] : null;
  const baslik = k.productName || k.title || "Kampanya";

  // Giriş cümlesi
  if (tema && tema !== "genel") {
    cumleler.push(`${baslik}, ${tema} temalı bir kampanyadır.`);
    kullanilan.push("campaignTheme");
  } else {
    cumleler.push(`${baslik}.`);
  }

  // Kâr payı
  if (typeof k.profitRate === "number" && k.profitRate > 0) {
    const periyot =
      k.ratePeriod === "monthly"
        ? "aylık"
        : k.ratePeriod === "annual"
          ? "yıllık"
          : null;
    cumleler.push(
      periyot
        ? `Kâr payı oranı ${periyot} ${yuzde(k.profitRate)}.`
        : `Kâr payı oranı ${yuzde(k.profitRate)} (periyot belirtilmemiş).`,
    );
    kullanilan.push("profitRate");
  }

  // Vade / taksit
  const vade = k.maxTermMonths ?? k.installmentCount;
  if (typeof vade === "number" && vade > 0) {
    cumleler.push(
      k.minTermMonths && k.minTermMonths !== k.maxTermMonths
        ? `Vade ${k.minTermMonths}–${vade} ay arasındadır.`
        : `${vade} aya kadar vade sunulmaktadır.`,
    );
    kullanilan.push(k.maxTermMonths != null ? "maxTermMonths" : "installmentCount");
  }

  // Tutar aralığı
  if (typeof k.minAmountTl === "number" || typeof k.maxAmountTl === "number") {
    const alt = k.minAmountTl != null ? tl(k.minAmountTl) : null;
    const ust = k.maxAmountTl != null ? tl(k.maxAmountTl) : null;
    cumleler.push(
      alt && ust
        ? `Finansman tutarı ${alt} ile ${ust} arasındadır.`
        : ust
          ? `${ust} tutarına kadar geçerlidir.`
          : `En az ${alt} tutarında kullanım gerekir.`,
    );
    kullanilan.push("minAmountTl/maxAmountTl");
  }

  // Ödül
  if (typeof k.rewardAmountTl === "number" && k.rewardAmountTl > 0) {
    const tur = k.rewardType ? (ODUL_ADI[k.rewardType] ?? k.rewardType) : "ödül";
    cumleler.push(`Kampanya kapsamında ${tl(k.rewardAmountTl)} ${tur} verilmektedir.`);
    kullanilan.push("rewardAmountTl");
  }

  // Masraf
  if (k.allocationFeeValue === 0) {
    cumleler.push("Tahsis ücreti alınmamaktadır.");
    kullanilan.push("allocationFeeValue");
  } else if (typeof k.allocationFeeValue === "number") {
    cumleler.push(
      k.allocationFeeType === "percentage"
        ? `Tahsis ücreti tutarın ${yuzde(k.allocationFeeValue)}'i kadardır.`
        : `Tahsis ücreti ${tl(k.allocationFeeValue)}.`,
    );
    kullanilan.push("allocationFeeValue");
  }

  // Hedef kitle
  if (k.targetSegments?.length) {
    cumleler.push(`Hedef kitle: ${k.targetSegments.join(", ")}.`);
    kullanilan.push("targetSegments");
  }

  // Katılım yöntemi
  if (k.participationMethod) {
    cumleler.push(`Katılım: ${k.participationMethod}`);
    kullanilan.push("participationMethod");
  }

  // Süre
  if (k.campaignEnd) {
    cumleler.push(`Kampanya ${tarihBicim(k.campaignEnd)} tarihine kadar geçerlidir.`);
    kullanilan.push("campaignEnd");
  }

  // Koşullar — ilk ikisi
  const kosullar = (k.conditions ?? []).filter(Boolean).slice(0, 2);
  if (kosullar.length) {
    cumleler.push(`Koşullar: ${kosullar.join(" ")}`);
    kullanilan.push("conditions");
  }

  // Başlık ve tema dışında hiçbir alan yoksa veri yetersizdir.
  const anlamliAlanlar = kullanilan.filter((a) => a !== "campaignTheme");
  const veriYetersiz = anlamliAlanlar.length === 0;

  if (veriYetersiz) {
    return {
      ozet:
        `${baslik} için bankanın sayfasından yapılandırılmış bilgi çıkarılamadı. ` +
        `Kâr payı oranı, vade, tutar ve koşullar bu kampanya metninde yer almıyor; ` +
        `güncel şartlar için resmî sayfayı inceleyin.`,
      kaynak: "kural",
      kullanilanAlanlar: kullanilan,
      veriYetersiz: true,
      modelUyarisi: null,
    };
  }

  return {
    ozet: cumleler.join(" "),
    kaynak: "kural",
    kullanilanAlanlar: kullanilan,
    veriYetersiz: false,
    modelUyarisi: null,
  };
}

/** Modele yalnızca bu kampanyanın alanları verilir. */
function modelBaglami(k: ExtractedFinancialRecord): string {
  const alanlar: Record<string, unknown> = {
    baslik: k.productName || k.title,
    banka: k.bankId,
    tema: k.campaignTheme ?? null,
    kar_payi_orani: k.profitRate,
    oran_periyodu: k.ratePeriod,
    asgari_tutar_tl: k.minAmountTl,
    azami_tutar_tl: k.maxAmountTl,
    asgari_vade_ay: k.minTermMonths,
    azami_vade_ay: k.maxTermMonths,
    taksit_sayisi: k.installmentCount,
    tahsis_ucreti_degeri: k.allocationFeeValue,
    tahsis_ucreti_tipi: k.allocationFeeType,
    odul_tutari_tl: k.rewardAmountTl,
    odul_turu: k.rewardType,
    kampanya_baslangic: k.campaignStart,
    kampanya_bitis: k.campaignEnd,
    hedef_kitle: k.targetSegments,
    katilim_yontemi: k.participationMethod,
    kosullar: k.conditions,
    haric_tutulanlar: k.exclusions,
  };
  // Boş alanları göndermeyip modelin "veri var" sanmasını engelleriz.
  const dolu = Object.fromEntries(
    Object.entries(alanlar).filter(
      ([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0),
    ),
  );
  return JSON.stringify(dolu, null, 1);
}

const SISTEM_PROMPTU = `Sen katılım bankacılığı ürünlerini açıklayan bir asistansın.

Sana YALNIZCA tek bir kampanyanın yapılandırılmış alanları verilir.

Kurallar:
- Sadece verilen alanları kullan. Başka kampanya, banka geneli bilgi veya kendi ön bilgini KULLANMA.
- Verilmeyen bir bilgiyi tahmin etme, tamamlama veya uydurma. Alan yoksa o konudan hiç bahsetme.
- Faiz yerine kâr payı, kredi yerine finansman terimlerini kullan.
- 2-4 cümle, sade Türkçe, düz metin. Madde işareti ve başlık kullanma.
- Pazarlama dili kullanma; yalnızca alanlardaki olguları aktar.
- Tutar ve oranları verildiği gibi yaz, yeniden hesaplama.`;

/** Modele verdiğimiz alan adları — çıktıda görünürlerse yanıt ham bağlamdır. */
const BAGLAM_ALAN_ADLARI = [
  "baslik",
  "banka",
  "kar_payi_orani",
  "oran_periyodu",
  "asgari_tutar_tl",
  "azami_tutar_tl",
  "asgari_vade_ay",
  "azami_vade_ay",
  "taksit_sayisi",
  "tahsis_ucreti_degeri",
  "tahsis_ucreti_tipi",
  "odul_tutari_tl",
  "odul_turu",
  "kampanya_baslangic",
  "kampanya_bitis",
  "hedef_kitle",
  "katilim_yontemi",
  "kosullar",
  "haric_tutulanlar",
];

/**
 * Model yanıtının kullanılabilir bir özet olup olmadığını denetler.
 *
 * Model zaman zaman kendisine verilen bağlam JSON'unu olduğu gibi geri
 * yansıtıyor. Böyle bir çıktı kullanıcıya özet diye gösterilemez; bu yüzden
 * yanıtın biçimine güvenmek yerine açıkça doğrulanır.
 */
export function modelYanitiGecerliMi(metin: string): boolean {
  const t = metin.trim();
  if (t.length < 20) return false;

  // JSON veya kod bloğu olarak dönmüş
  if (/^[[{]/.test(t)) return false;
  if (/^```/.test(t)) return false;

  // Alan adı ardından iki nokta geliyorsa ham bağlam sızmış demektir.
  const kucuk = t.toLocaleLowerCase("tr-TR");
  const alanSizmasi = BAGLAM_ALAN_ADLARI.some(
    (alan) => kucuk.includes(`"${alan}"`) || kucuk.includes(`${alan}:`),
  );
  if (alanSizmasi) return false;

  // Çok sayıda tırnak+iki nokta çifti de JSON habercisidir
  const anahtarSayisi = (t.match(/"\s*:/g) ?? []).length;
  if (anahtarSayisi >= 2) return false;

  // Anlamlı Türkçe metin en az birkaç kelime içermeli
  if (t.split(/\s+/).length < 8) return false;

  return true;
}

/**
 * Kampanyayı özetler. Model erişilebilirse onu kullanır; erişilemezse veya
 * yanıt boşsa kural tabanlı özete düşer. Her durumda özet üretilir.
 */
export async function kampanyaOzetle(
  k: ExtractedFinancialRecord,
  opts: { modelKullan?: boolean } = {},
): Promise<KampanyaOzeti> {
  const kural = kuralTabanliOzet(k);

  // Yapılandırılmış veri yoksa modele sormanın anlamı yok; uydurma riski doğar.
  if (kural.veriYetersiz || opts.modelKullan === false) return kural;

  try {
    const sonuc = await callEvrenChat({
      systemPrompt: SISTEM_PROMPTU,
      userPrompt: `Kampanya alanları:\n${modelBaglami(k)}\n\nBu kampanyayı özetle.`,
      temperature: 0.2,
      maxTokens: 320,
      timeoutMs: 12_000,
    });

    // API anahtarı yoksa istemci null döner — kural tabanlı özet kullanılır.
    const metin = sonuc?.content?.trim();
    if (!metin) return kural;

    // Model bağlam JSON'unu geri yansıtabiliyor; doğrulanmayan yanıt kullanılmaz.
    if (!modelYanitiGecerliMi(metin)) {
      return {
        ...kural,
        modelUyarisi: "Model yanıtı özet biçiminde değildi; kural tabanlı özet gösteriliyor.",
      };
    }

    return {
      ozet: metin,
      kaynak: "model",
      kullanilanAlanlar: kural.kullanilanAlanlar,
      veriYetersiz: false,
      modelUyarisi: sonuc?.modelWarning ?? null,
    };
  } catch (err) {
    // Dış servis erişilemezse kural tabanlı özet döner — kurum içi çalışabilirlik.
    return {
      ...kural,
      modelUyarisi: sanitizeEvrenError(err instanceof Error ? err.message : String(err)),
    };
  }
}
