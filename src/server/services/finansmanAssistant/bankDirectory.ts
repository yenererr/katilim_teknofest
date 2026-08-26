/**
 * Banka rehberi — deterministik sorular.
 *
 * "Katılım bankaları hangileri", "kaç tane var", "X bankasının resmî sitesi",
 * "X bankasının kampanyaları" gibi sorular LLM'e gitmeden, doğrulanmış
 * yapılandırmadan yanıtlanır. Böylece cevap anında gelir ve uydurma olmaz.
 */

import { BANK_SOURCE_CONFIGS } from "../scraper/bankSourceConfig";
import { listMemoryCampaigns } from "../postgres/store";
import { getLiveBankStates } from "../liveData/liveDataBridge";
import { asciiKatla } from "../../../nlp/normalize";
import { BANKA_INDEKS, UCRETLER, VERI_TARIHI } from "../../../data/piyasa";

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
  const t = asciiKatla(mesaj);
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
  | "ucret_karsilastir"
  | null;

/** Rehber sorusu mu? Değilse null döner ve normal akış sürer. */
export function rehberNiyetiTespit(mesaj: string): RehberNiyeti {
  const t = asciiKatla(mesaj);
  const bankaSozu = /(katilim )?bank(a|alar)/.test(t);

  if (/(kac|kac tane|sayisi|adedi)/.test(t) && bankaSozu) return "banka_sayisi";

  if (/kampanya/.test(t) && bankaBul(mesaj)) return "banka_kampanyalari";

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
    bankaSozu &&
    /(hangileri|neler|listele|liste|say|sirala|tumu|hepsi|isimleri|adlari)/.test(
      t,
    )
  ) {
    return "banka_listesi";
  }

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
  const kalem = ucretKalemiBul(asciiKatla(mesaj));
  if (!kalem) {
    return {
      message:
        "Hangi ücret kalemini sorduğunuzu anlayamadım. FAST, EFT, kart " +
        "aidatı, hesap işletim veya ATM nakit çekim ücretlerini " +
        "karşılaştırabilirim.",
      citations: [],
    };
  }

  const satirlar = Object.entries(kalem.degerler)
    .map(([bankaId, tutar]) => ({
      ad: BANKA_INDEKS[bankaId]?.ad || bankaId,
      tutar,
    }))
    .sort((a, b) => a.tutar - b.tutar)
    .map(
      (s) =>
        `• ${s.ad}: ${s.tutar === 0 ? "ücretsiz" : `${s.tutar.toLocaleString("tr-TR")} TL`}`,
    );

  return {
    message:
      `**${kalem.etiket}** — ${kalem.aciklama}\n\n` +
      satirlar.join("\n") +
      `\n\nVeri tarihi: ${VERI_TARIHI}. Ücretler bankaların ilan ettiği ` +
      `tarifelerden derlenmiştir; güncel tutarı bankadan teyit edin.`,
    citations: [],
  };
}

function kampanyaSatiri(c: Record<string, unknown>): string {
  const baslik = String(c.title || "Kampanya").trim();
  const bitis = c.campaignEnd ? String(c.campaignEnd).slice(0, 10) : null;
  return bitis ? `• ${baslik} (bitiş: ${bitis})` : `• ${baslik}`;
}

/** Rehber sorusuna doğrulanmış veriyle yanıt üretir. */
export function rehberYaniti(
  niyet: Exclude<RehberNiyeti, null>,
  mesaj: string,
): RehberSonucu {
  const aktifler = BANK_SOURCE_CONFIGS.filter((b) => b.enabled);

  if (niyet === "ucret_karsilastir") return ucretYaniti(mesaj);

  if (niyet === "banka_sayisi") {
    return {
      message:
        `Karşılaştırmaya dahil ettiğim ${aktifler.length} katılım bankası var. ` +
        `Hepsinin resmî sayfalarını düzenli olarak kontrol ediyorum.\n\n` +
        `Listeyi görmek için "katılım bankalarını listele" yazabilirsiniz.`,
      citations: [],
    };
  }

  if (niyet === "banka_listesi") {
    const satirlar = aktifler.map((b, i) => `${i + 1}. ${b.bankName}`);
    return {
      message:
        `Karşılaştırmaya dahil ettiğim ${aktifler.length} katılım bankası:\n\n` +
        satirlar.join("\n") +
        `\n\nBir bankanın resmî sitesini, kampanyalarını veya finansman ` +
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

  const bankId = bankaBul(mesaj);
  const cfg = bankId
    ? BANK_SOURCE_CONFIGS.find((b) => b.bankId === bankId)
    : undefined;

  if (!cfg) {
    return {
      message:
        `Hangi bankayı sorduğunuzu anlayamadım. ` +
        `Şu bankalar için bilgi verebilirim: ` +
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

  // niyet === "banka_kampanyalari"
  const kampanyalar = listMemoryCampaigns({
    bankId: cfg.bankId,
    activeOnly: true,
  });

  if (!kampanyalar.length) {
    return {
      message:
        `${cfg.bankName} için şu anda doğrulanmış aktif kampanya kaydım yok. ` +
        `Kampanya sayfası henüz taranmamış veya yayında aktif kampanya bulunmuyor olabilir.\n\n` +
        `Resmî kampanya sayfası: ${anaSayfa(cfg.bankId)}`,
      citations: [],
    };
  }

  const gosterilecek = kampanyalar.slice(0, 8);
  return {
    message:
      `${cfg.bankName} için doğrulanmış ${kampanyalar.length} aktif kampanya kaydım var:\n\n` +
      gosterilecek.map(kampanyaSatiri).join("\n") +
      (kampanyalar.length > gosterilecek.length
        ? `\n\n(İlk ${gosterilecek.length} tanesi gösterildi.)`
        : ""),
    citations: gosterilecek.map((c: Record<string, unknown>, i: number) => ({
      id: i + 1,
      bankName: cfg.bankName,
      sourceUrl: String(c.sourceUrl || anaSayfa(cfg.bankId)),
      sourceCheckedAt: String(c.sourceCheckedAt || sonKontrol(cfg.bankId)),
      evidenceText: String(c.title || "Kampanya"),
    })),
  };
}
