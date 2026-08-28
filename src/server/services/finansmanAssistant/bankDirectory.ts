/**
 * Banka rehberi — deterministik sorular.
 *
 * "Katılım bankaları hangileri", "kaç tane var", "X bankasının resmî sitesi",
 * "X bankasının kampanyaları" gibi sorular LLM'e gitmeden, doğrulanmış
 * yapılandırmadan yanıtlanır. Böylece cevap anında gelir ve uydurma olmaz.
 */

import {
  BANK_SOURCE_CONFIGS,
  isOperationalBank,
} from "../scraper/bankSourceConfig";
import { listMemoryCampaigns } from "../postgres/store";
import { getLiveBankStates } from "../liveData/liveDataBridge";
import { asciiKatla } from "../../../nlp/normalize";
import { BANKA_INDEKS } from "../../../data/piyasa";
import {
  FEE_MATRIX_DATE_TR,
  VERIFIED_FEES as UCRETLER,
} from "../../../data/verifiedFees";
import {
  CAMPAIGN_THEME_LABEL,
  campaignMatchesTheme,
  extractCampaignKeywordHint,
  filterCampaignsByMessageKeywords,
  parseCampaignThemeFromMessage,
  prettifyCampaignTitle,
} from "../scraper/campaignNormalize";
import { kisaKampanyaAciklama } from "../../../lib/kampanyaOzet";

export type RehberSonucu = {
  message: string;
  citations: Array<{
    id: number;
    bankName: string;
    sourceUrl: string;
    sourceCheckedAt: string;
    evidenceText: string;
  }>;
};

/**
 * Bankanın herkese açık ana sayfası. Yapılandırmada homepage kaydı yoksa
 * ilk kaynağın kök adresi kullanılır — kampanya/ürün alt sayfası değil.
 */
function anaSayfa(bankId: string): string {
  const cfg = BANK_SOURCE_CONFIGS.find((b) => b.bankId === bankId);
  if (!cfg) return "";
  const homepage = cfg.seedUrls.find((s) => s.sourceType === "homepage");
  if (homepage) return homepage.url;
  const ilk = cfg.seedUrls[0]?.url;
  if (!ilk) return "";
  try {
    return new URL(ilk).origin;
  } catch {
    return ilk;
  }
}

function sonKontrol(bankId: string): string {
  return getLiveBankStates().find((s) => s.id === bankId)?.lastCheckedAt || "";
}

/**
 * Birden fazla bankanın adında geçtiği için tek başına ayırt edici
 * olmayan kelimeler. "Türk" hem Kuveyt Türk hem Albaraka Türk'te,
 * "Finans" hem Hayat Finans hem Türkiye Finans'ta geçiyor.
 */
const AYIRT_EDICI_OLMAYAN = new Set([
  "turk",
  "turkiye",
  "finans",
  "banka",
  "bankasi",
  "katilim",
]);

/**
 * Mesajda geçen bankayı bulur. En çok ayırt edici kelimesi eşleşen banka
 * seçilir; eşitlikte daha uzun eşleşme kazanır. Böylece "Kuveyt Türk"
 * sorgusu yalnızca "Türk" ortaklığı yüzünden Albaraka'ya düşmez.
 */
export function bankaBul(mesaj: string): string | null {
  // ziraaat → ziraat gibi yazım hatalarını yumuşat
  const t = asciiKatla(mesaj).replace(/(.)\1{2,}/g, "$1$1");
  let enIyi: { bankId: string; puan: number; uzunluk: number } | null = null;

  for (const cfg of BANK_SOURCE_CONFIGS) {
    const parcalar = asciiKatla(cfg.bankName)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((p) => p.length >= 3 && !AYIRT_EDICI_OLMAYAN.has(p));

    const eslesen = parcalar.filter((p) => t.includes(p));
    let puan = eslesen.length;
    let uzunluk = eslesen.reduce((n, p) => n + p.length, 0);

    const kimlik = asciiKatla(cfg.bankId).replace(/-/g, " ");
    if (t.includes(kimlik)) {
      puan += 1;
      uzunluk += kimlik.length;
    }
    // Kısa kök: "ziraat" ↔ "ziraaat"
    for (const p of parcalar) {
      if (p.length >= 5 && t.includes(p.slice(0, 5))) {
        puan = Math.max(puan, 1);
        uzunluk = Math.max(uzunluk, p.length);
      }
    }

    if (!puan) continue;
    if (
      !enIyi ||
      puan > enIyi.puan ||
      (puan === enIyi.puan && uzunluk > enIyi.uzunluk)
    ) {
      enIyi = { bankId: cfg.bankId, puan, uzunluk };
    }
  }

  return enIyi?.bankId ?? null;
}

export type RehberNiyeti =
  | "banka_listesi"
  | "banka_sayisi"
  | "banka_sitesi"
  | "banka_kampanyalari"
  | "banka_bilgi"
  | "ucret_karsilastir"
  | "yeni_musteri_avantaj"
  | "genel_kampanyalar"
  | null;

export type BekleyenTakip =
  | "banka_listesi"
  | "banka_kampanyalari"
  | "capabilities"
  | null;

/**
 * "kampanya" + yaygın yazım hataları (kmapnaya, kampnyaları…).
 * Finansman slot akışına düşmemesi için tek yerden kullanılır.
 */
export function kampanyaSinyaliVar(metin: string): boolean {
  const t = asciiKatla(metin);
  return /kampanya|kmapnaya|kmapanya|kampnya|kampnyal|kampanyal/.test(t);
}

/** Rehber sorusu mu? Değilse null döner ve normal akış sürer. */
export function rehberNiyetiTespit(mesaj: string): RehberNiyeti {
  const t = asciiKatla(mesaj);
  const bankaSozu = /(katilim )?bank(a|alar)/.test(t);
  const kampanya = kampanyaSinyaliVar(mesaj);

  if (/(kac|kac tane|sayisi|adedi)/.test(t) && bankaSozu) return "banka_sayisi";

  // Yeni müşteri avantajları / kampanyaları — tüm bankalar arası
  if (
    /yeni musteri/.test(t) &&
    (kampanya || /(avantaj|firsat|ozel|mantikli|hangisi|karsilastir|en iyi)/.test(t))
  ) {
    return "yeni_musteri_avantaj";
  }

  // Tüm bankaların kampanyalarını listeleme (belirli banka belirtilmeden)
  // "eğitim kampanyaları" → tema var; ekstra fiil gerekmez
  // "ev alcam ne kampanyalar var" → kampanya + soru kalıbı
  const kampanyaTemasi = parseCampaignThemeFromMessage(mesaj);
  if (
    (kampanya || kampanyaTemasi != null) &&
    !bankaBul(mesaj) &&
    (kampanyaTemasi != null ||
      /(hangi|listele|neler|\bne\b|goster|tumu|hepsi|aktif|guncel|karsilastir|var\s*m[iı]|var\?|\bvar\b|ne tur|ne cesit|hakkinda|bilgi|ogren|anlat|istiyorum|sirala|kendim)/.test(
        t,
      ))
  ) {
    return "genel_kampanyalar";
  }

  if (kampanya && bankaBul(mesaj)) return "banka_kampanyalari";

  // "Albaraka nasıl banka / iyi mi" (banka adı sonraki turda preferredBankId ile gelir)
  if (
    /nasil\s*(bir\s*)?banka|ne\s*tur\s*banka|ismi\s*hos|hosuma\s*gitti/.test(t) ||
    (bankaBul(mesaj) &&
      /iyi\s*mi|guvenilir|hakkinda|tan[iı]t|nasil/.test(t) &&
      !kampanya &&
      !/oran|kar\s*pay|\btl\b/.test(t))
  ) {
    return "banka_bilgi";
  }

  // "Üye olmak istiyorum" / "hesap açmak istiyorum" — yeni müşteri avantajlarıyla eşle
  if (
    /(uye olmak|hesap acmak|hesap actirmak|muster[iı] olmak|basvur)/.test(t) &&
    bankaSozu &&
    /(hangisi|hangi|en iyi|avantaj|mantikli|onerirsin|tavsiye)/.test(t)
  ) {
    return "yeni_musteri_avantaj";
  }

  // Ücret soruları: "EFT ücreti ne kadar", "kart aidatı var mı"
  if (ucretKalemiBul(t)) return "ucret_karsilastir";

  if (
    /(resmi site|web sitesi|internet sitesi|site adresi|sitesi ne|adresi ne|linki)/.test(
      t,
    )
  ) {
    return "banka_sitesi";
  }

  if (
    /(hangileri|\bhangi\b|neler|listele|liste|say\b|sirala|tumu|hepsi|isimleri|adlari|\bvar\b|kimler|sayabilir)/.test(
      t,
    ) &&
    bankaSozu
  ) {
    return "banka_listesi";
  }

  // Tek başına "listele" / "isimleri göster" — sayı sorusundan sonra önerilen takip
  if (
    /^(listele|liste|isimleri|adlari|hepsini (goster|listele)|bankalari (listele|goster)|isimlerini (goster|listele|yaz))[\s!?.]*$/.test(
      t,
    )
  ) {
    return "banka_listesi";
  }

  return null;
}

/** Bekleyen takip + kısa onay mesajını rehber niyetine çevirir. */
export function bekleyenTakibiCoz(
  mesaj: string,
  pending: BekleyenTakip,
): RehberNiyeti {
  if (!pending) return null;
  const t = asciiKatla(mesaj).trim();
  const kisaOnay =
    /^(listele|liste|evet|olur|tamam|goster|hepsini goster|isimleri|adlari|yaz|soyle)[\s!?.]*$/.test(
      t,
    ) ||
    (t.length <= 24 && /^(listele|liste|goster|isim)/.test(t));
  if (!kisaOnay) return null;
  if (pending === "banka_listesi") return "banka_listesi";
  if (pending === "banka_kampanyalari") return "banka_kampanyalari";
  return null;
}

/** Mesajda geçen ücret kalemini bulur (FAST, EFT, kart aidatı…). */
export function ucretKalemiBul(normalMetin: string) {
  const eslesmeler: Record<string, string[]> = {
    fast: ["fast"],
    eft: ["eft", "havale"],
    kart_aidat: ["kart aidat", "aidat", "kart ucreti"],
    hesap_isletim: ["hesap isletim", "isletim ucreti"],
    atm_nakit: ["atm", "nakit cekim"],
  };
  for (const kalem of UCRETLER) {
    const anahtarlar = eslesmeler[kalem.key] || [kalem.key];
    if (anahtarlar.some((a) => normalMetin.includes(a))) return kalem;
  }
  return null;
}

function ucretYaniti(mesaj: string): RehberSonucu {
  if (UCRETLER.length === 0) {
    return {
      message:
        "Ücret karşılaştırması için doğrulanmış canlı tarife kaynağı henüz yok. " +
        "Yanlış rakam vermemek için örnek liste sunmuyorum. FAST, EFT, kart aidatı " +
        "veya hesap işletim ücreti için ilgili bankanın resmî ücret sayfasını kontrol edin.",
      citations: [],
    };
  }

  const kalem = ucretKalemiBul(asciiKatla(mesaj));
  if (!kalem) {
    return {
      message:
        "Hangi ücreti sorduğunuzu çıkaramadım. FAST, EFT, kart " +
        "aidatı, hesap işletim veya ATM nakit çekim ücretlerini " +
        "karşılaştırabilirim.",
      citations: [],
    };
  }

  const satirlar = Object.entries(kalem.degerler)
    .filter(([, tutar]) => tutar != null)
    .map(([bankaId, tutar]) => ({
      ad: BANKA_INDEKS[bankaId]?.ad || bankaId,
      tutar: tutar as number,
      not: kalem.notlar?.[bankaId],
    }))
    .sort((a, b) => a.tutar - b.tutar)
    .map((s) => {
      const tutarMetin =
        s.tutar === 0 ? "0 TL" : `${s.tutar.toLocaleString("tr-TR")} TL`;
      const urun = s.not ? ` – ${s.not}` : "";
      return `• ${s.ad}: ${tutarMetin}${urun}`;
    });

  if (satirlar.length === 0) {
    return {
      message:
        `**${kalem.etiket}** için henüz doğrulanmış tarife satırı yok. ` +
        "İlgili bankanın resmî ücret sayfasını kontrol edin.",
      citations: [],
    };
  }

  return {
    message:
      `**${kalem.etiket}** — ${kalem.aciklama}\n\n` +
      satirlar.join("\n") +
      `\n\nVeri tarihi: ${FEE_MATRIX_DATE_TR}. Yalnızca kaynakla doğrulanmış bankalar listelenir; ` +
      `işlem öncesi bankadan teyit edin.`,
    citations: [],
  };
}

function kampanyaSatiri(c: Record<string, unknown>): string {
  const baslik = prettifyCampaignTitle(
    String(c.title || c.productName || "Kampanya"),
  );
  const url = String(c.sourceUrl || "").trim();
  const bitis = c.campaignEnd ? String(c.campaignEnd).slice(0, 10) : null;
  const metin = url ? `[${baslik}](${url})` : baslik;
  const ust = bitis ? `• ${metin} (bitiş: ${bitis})` : `• ${metin}`;
  const aciklama = kisaKampanyaAciklama(c);
  return aciklama ? `${ust}\n  ${aciklama}` : ust;
}

function yeniMusteriKampanyaYaniti(): RehberSonucu {
  const aktifler = BANK_SOURCE_CONFIGS.filter((b) => b.enabled);
  const tumKampanyalar = listMemoryCampaigns({ activeOnly: true });

  const yeniMusteriKampanyalari = tumKampanyalar.filter(
    (c: Record<string, unknown>) => {
      const baslik = asciiKatla(String(c.title || ""));
      const kategori = String(c.category || "");
      return (
        /yeni musteri|hosgeldin|ilk kez|yeni uyelik|yeni hesap/.test(baslik) ||
        kategori === "new_customer_financing"
      );
    },
  );

  if (!yeniMusteriKampanyalari.length) {
    const genelKampanyalar = tumKampanyalar.slice(0, 12);
    if (!genelKampanyalar.length) {
      return {
        message:
          `Şu anda kayıtlı aktif kampanya bulunamadı. Banka sayfaları henüz taranmamış olabilir.\n\n` +
          `${aktifler.length} katılım bankasının resmî sitelerinden güncel kampanyaları kontrol edebilirsiniz.`,
        citations: [],
      };
    }
    const bankaGrup = new Map<string, Array<Record<string, unknown>>>();
    for (const c of genelKampanyalar) {
      const bid = String(c.bankId || "");
      if (!bankaGrup.has(bid)) bankaGrup.set(bid, []);
      bankaGrup.get(bid)!.push(c);
    }
    const satirlar: string[] = [];
    for (const [bankId, kampanyalar] of bankaGrup) {
      const cfg = BANK_SOURCE_CONFIGS.find((b) => b.bankId === bankId);
      const ad = cfg?.bankName.replace(/ Katılım Bankası A\.Ş\./, "") || bankId;
      satirlar.push(`**${ad}**`);
      for (const c of kampanyalar.slice(0, 3)) {
        satirlar.push(kampanyaSatiri(c));
      }
      satirlar.push("");
    }
    return {
      message:
        `Yeni müşteriye özel olarak etiketlenmiş kampanya bulamadım ama ` +
        `şu anda aktif ${genelKampanyalar.length} kampanya var:\n\n` +
        satirlar.join("\n").trim() +
        `\n\nBelirli bir bankanın detaylarını sorabilirsiniz.`,
    citations: genelKampanyalar.slice(0, 8).map((c: Record<string, unknown>, i: number) => ({
      id: i + 1,
      bankName: prettifyCampaignTitle(String(c.title || c.productName || c.bankName || "")),
      sourceUrl: String(c.sourceUrl || ""),
      sourceCheckedAt: String(c.sourceCheckedAt || ""),
      evidenceText: String(c.title || "Kampanya"),
    })),
    };
  }

  const bankaGrup = new Map<string, Array<Record<string, unknown>>>();
  for (const c of yeniMusteriKampanyalari) {
    const bid = String(c.bankId || "");
    if (!bankaGrup.has(bid)) bankaGrup.set(bid, []);
    bankaGrup.get(bid)!.push(c);
  }

  const satirlar: string[] = [];
  for (const [bankId, kampanyalar] of bankaGrup) {
    const cfg = BANK_SOURCE_CONFIGS.find((b) => b.bankId === bankId);
    const ad = cfg?.bankName.replace(/ Katılım Bankası A\.Ş\./, "") || bankId;
    satirlar.push(`**${ad}**`);
    for (const c of kampanyalar.slice(0, 4)) {
      satirlar.push(kampanyaSatiri(c));
    }
    satirlar.push("");
  }

  return {
    message:
      `${bankaGrup.size} katılım bankasında toplam ${yeniMusteriKampanyalari.length} ` +
      `yeni müşteriye özel kampanya/avantaj buldum:\n\n` +
      satirlar.join("\n").trim() +
      `\n\nHerhangi birinin detayını sorabilir veya finansman tutarı belirtirseniz ` +
      `kâr payı karşılaştırması da yapabilirim.`,
    citations: yeniMusteriKampanyalari.slice(0, 8).map((c: Record<string, unknown>, i: number) => ({
      id: i + 1,
      bankName: prettifyCampaignTitle(String(c.title || c.productName || c.bankName || "")),
      sourceUrl: String(c.sourceUrl || ""),
      sourceCheckedAt: String(c.sourceCheckedAt || ""),
      evidenceText: String(c.title || "Yeni müşteri kampanyası"),
    })),
  };
}

function genelKampanyaYaniti(
  mesaj?: string,
  contextMessages?: string[],
): RehberSonucu {
  const combined = [mesaj, ...(contextMessages || [])]
    .filter(Boolean)
    .join(" \n ");
  const tema = combined ? parseCampaignThemeFromMessage(combined) : null;
  const tumAktif = listMemoryCampaigns({ activeOnly: true });
  let tumKampanyalar = tumAktif.filter((c) =>
    tema ? campaignMatchesTheme(c, tema) : true,
  );

  // Ek anahtar kelime süzgeci — mevcut + önceki mesaj bağlamı (ör. “uçak bileti” → “kampanya var mı”)
  if (combined) {
    const keywordFiltered = filterCampaignsByMessageKeywords(
      tumKampanyalar,
      combined,
    );
    if (keywordFiltered.length) {
      tumKampanyalar = keywordFiltered;
    } else if (!tema) {
      const hint = extractCampaignKeywordHint(combined);
      if (hint) {
        return {
          message:
            `“${hint}” ile doğrudan eşleşen aktif kampanya bulamadım.\n\n` +
            `Seyahat için “uçak bileti kampanyası”, alışveriş için “e-ticaret kampanyaları” diye sorabilirsiniz; ` +
            `ya da kırtasiye / kart / yeni müşteri diye daraltabilirsiniz.`,
          citations: [],
        };
      }
    }
  }

  if (!tumKampanyalar.length) {
    const temaEtiket = tema ? CAMPAIGN_THEME_LABEL[tema] : null;
    return {
      message: temaEtiket
        ? `Şu anda “${temaEtiket.toLocaleLowerCase("tr-TR")}” ile uyumlu aktif kampanya bulamadım.\n\n` +
          `Başka bir kategori deneyebilir veya banka adı yazarak o bankanın kampanyalarına bakabilirsiniz.`
        : "Şu anda kayıtlı aktif kampanya bulunamadı. Banka sayfaları henüz taranmamış olabilir.\n\n" +
          "Belirli bir bankanın kampanyalarını sorabilirsiniz; yenileme tetiklenir.",
      citations: [],
    };
  }

  const bankaGrup = new Map<string, Array<Record<string, unknown>>>();
  for (const c of tumKampanyalar) {
    const bid = String(c.bankId || "");
    if (!bankaGrup.has(bid)) bankaGrup.set(bid, []);
    bankaGrup.get(bid)!.push(c);
  }

  const satirlar: string[] = [];
  for (const [bankId, kampanyalar] of bankaGrup) {
    const cfg = BANK_SOURCE_CONFIGS.find((b) => b.bankId === bankId);
    const ad = cfg?.bankName.replace(/ Katılım Bankası A\.Ş\./, "") || bankId;
    satirlar.push(`**${ad}** (${kampanyalar.length} kampanya)`);
    for (const c of kampanyalar.slice(0, 4)) {
      satirlar.push(kampanyaSatiri(c));
    }
    if (kampanyalar.length > 4) {
      satirlar.push(`  … ve ${kampanyalar.length - 4} kampanya daha`);
    }
    satirlar.push("");
  }

  const temaEtiket = tema ? CAMPAIGN_THEME_LABEL[tema] : null;
  const baslik = temaEtiket
    ? `${bankaGrup.size} bankada ${tumKampanyalar.length} ${temaEtiket.toLocaleLowerCase("tr-TR")} kampanyası buldum`
    : `${bankaGrup.size} katılım bankasında toplam ${tumKampanyalar.length} aktif kampanya var`;

  return {
    message:
      `${baslik}:\n\n` +
      satirlar.join("\n").trim() +
      (tema
        ? `\n\nBaşka kategori için “kart kampanyaları”, “kırtasiye kampanyaları” veya banka adı yazabilirsiniz.`
        : `\n\nBelirli bir bankanın kampanyalarını detaylı görmek isterseniz banka adını yazın. Kırtasiye, eğitim, kart, alışveriş veya yeni müşteri diye de daraltabilirsiniz.`),
    citations: tumKampanyalar.slice(0, 10).map((c: Record<string, unknown>, i: number) => ({
      id: i + 1,
      bankName: prettifyCampaignTitle(String(c.title || c.productName || c.bankName || "")),
      sourceUrl: String(c.sourceUrl || ""),
      sourceCheckedAt: String(c.sourceCheckedAt || ""),
      evidenceText: String(c.title || "Kampanya"),
    })),
  };
}

/** Rehber sorusuna doğrulanmış veriyle yanıt üretir. */
export function rehberYaniti(
  niyet: Exclude<RehberNiyeti, null>,
  mesaj: string,
  opts?: {
    preferredBankId?: string | null;
    contextMessages?: string[];
  },
): RehberSonucu {
  const aktifler = BANK_SOURCE_CONFIGS.filter((b) => b.enabled);

  if (niyet === "yeni_musteri_avantaj") return yeniMusteriKampanyaYaniti();
  if (niyet === "genel_kampanyalar") {
    return genelKampanyaYaniti(mesaj, opts?.contextMessages);
  }
  if (niyet === "ucret_karsilastir") return ucretYaniti(mesaj);

  if (niyet === "banka_sayisi") {
    const faaliyette = aktifler.filter(isOperationalBank);
    const bekleyen = aktifler.filter((b) => !isOperationalBank(b));
    const bekleyenNot = bekleyen.length
      ? `\n\nAyrıca ${bekleyen
          .map((b) => b.bankName.replace(/ Bankası A\.Ş\.$/, ""))
          .join(", ")} faaliyet izni aldı ancak ürünlerini henüz açmadı; ` +
        `kurumsal sayfasını izliyorum, karşılaştırmaya dahil etmiyorum.`
      : "";
    return {
      message:
        `Türkiye'de faaliyetteki ${faaliyette.length} katılım bankasını takip ediyorum. ` +
        `Sayfalarını düzenli olarak kontrol ediyorum.` +
        bekleyenNot +
        `\n\nİsimlerini görmek isterseniz "listele" yazmanız yeterli.`,
      citations: [],
    };
  }

  if (niyet === "banka_listesi") {
    const satirlar = aktifler.map(
      (b, i) =>
        `${i + 1}. ${b.bankName}` +
        (isOperationalBank(b) ? "" : " — faaliyet izni var, ürünleri henüz açılmadı"),
    );
    return {
      message:
        `Takip ettiğim ${aktifler.length} katılım bankası şunlar:\n\n` +
        satirlar.join("\n") +
        `\n\nHerhangi birinin sitesini, kampanyalarını ya da finansman ` +
        `koşullarını sorabilirsiniz.`,
      citations: aktifler.slice(0, 10).map((b, i) => ({
        id: i + 1,
        bankName: b.bankName,
        sourceUrl: anaSayfa(b.bankId),
        sourceCheckedAt: sonKontrol(b.bankId),
        evidenceText: `${b.bankName} resmî web sitesi.`,
      })),
    };
  }

  const bankId = bankaBul(mesaj) || opts?.preferredBankId || null;
  const cfg = bankId
    ? BANK_SOURCE_CONFIGS.find((b) => b.bankId === bankId)
    : undefined;

  if (!cfg) {
    return {
      message:
        `Hangi bankayı kastettiğinizi çıkaramadım. ` +
        `Şunlardan biri mi: ` +
        aktifler.map((b) => b.bankName.replace(/ Katılım Bankası A\.Ş\./, "")).join(", ") +
        ".",
      citations: [],
    };
  }

  if (niyet === "banka_sitesi") {
    const url = anaSayfa(cfg.bankId);
    return {
      message: `${cfg.bankName} resmî web sitesi: ${url}`,
      citations: [
        {
          id: 1,
          bankName: cfg.bankName,
          sourceUrl: url,
          sourceCheckedAt: sonKontrol(cfg.bankId),
          evidenceText: `${cfg.bankName} resmî web sitesi.`,
        },
      ],
    };
  }

  if (niyet === "banka_bilgi") {
    const url = anaSayfa(cfg.bankId);
    const kisa = cfg.bankName.replace(/ Katılım Bankası A\.Ş\./, "");
    return {
      message:
        `**${kisa}**, Türkiye’de faaliyet gösteren **katılım bankalarından** biridir (faizsiz bankacılık modeliyle çalışır).\n\n` +
        `“İyi mi?” sorusunu tek cümlede puanlayamam; uygunluk ihtiyacınıza (finansman, kampanya, kâr payı) göre değişir. ` +
        `Resmî bilgi ve güncel ürünler için: ${url}\n\n` +
        `İsterseniz kampanyalarını sorun veya finansman oranı için tutar + vade yazın — örneğin “${kisa} 100 bin TL ihtiyaç, 24 ay”.`,
      citations: [
        {
          id: 1,
          bankName: cfg.bankName,
          sourceUrl: url,
          sourceCheckedAt: sonKontrol(cfg.bankId),
          evidenceText: `${cfg.bankName} resmî web sitesi.`,
        },
      ],
    };
  }

  // niyet === "banka_kampanyalari"
  const tumKampanyalar = listMemoryCampaigns({
    bankId: cfg.bankId,
    activeOnly: true,
  });

  const tema = parseCampaignThemeFromMessage(mesaj);
  const kampanyalar = tema
    ? tumKampanyalar.filter((c) => campaignMatchesTheme(c, tema))
    : tumKampanyalar;

  if (!tumKampanyalar.length) {
    return {
      message:
        `${cfg.bankName} için kayıtlı aktif kampanya görünmüyor. ` +
        `Sayfası henüz taranmamış ya da gerçekten aktif kampanyası olmayabilir.\n\n` +
        `Resmî kampanya sayfası: ${anaSayfa(cfg.bankId)}`,
      citations: [],
    };
  }

  if (tema && !kampanyalar.length) {
    const temaEtiket = CAMPAIGN_THEME_LABEL[tema];
    return {
      message:
        `${cfg.bankName} kayıtlarında “${temaEtiket.toLocaleLowerCase("tr-TR")}” temalı aktif kampanya bulamadım. ` +
        `Toplam ${tumKampanyalar.length} kampanya var; “kampanyaları listele” dersen hepsini gösterebilirim.\n\n` +
        `Resmî kampanya sayfası: ${anaSayfa(cfg.bankId)}`,
      citations: [],
    };
  }

  const gosterilecek = kampanyalar.slice(0, 8);
  const temaEtiket = tema ? CAMPAIGN_THEME_LABEL[tema] : null;
  const baslik = temaEtiket
    ? `${cfg.bankName} için ${kampanyalar.length} ${temaEtiket.toLocaleLowerCase("tr-TR")} kampanyası görünüyor`
    : `${cfg.bankName} için ${kampanyalar.length} aktif kampanya görünüyor`;
  return {
    message:
      `${baslik}:\n\n` +
      gosterilecek.map(kampanyaSatiri).join("\n") +
      (kampanyalar.length > gosterilecek.length
        ? `\n\n(İlk ${gosterilecek.length} tanesi gösterildi.)`
        : ""),
    citations: gosterilecek.map((c: Record<string, unknown>, i: number) => ({
      id: i + 1,
      bankName: prettifyCampaignTitle(
        String(c.title || c.productName || cfg.bankName),
      ),
      sourceUrl: String(c.sourceUrl || anaSayfa(cfg.bankId)),
      sourceCheckedAt: String(c.sourceCheckedAt || sonKontrol(cfg.bankId)),
      evidenceText: String(c.title || "Kampanya"),
    })),
  };
}
