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
import { prettifyCampaignTitle } from "../scraper/campaignNormalize";

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
  if (
    kampanya &&
    !bankaBul(mesaj) &&
    /(hangi|listele|neler|goster|tumu|hepsi|aktif|guncel|karsilastir|var mi|var\?|ne tur|ne cesit|hakkinda|bilgi|ogren|anlat|istiyorum)/.test(
      t,
    )
  ) {
    return "genel_kampanyalar";
  }

  if (kampanya && bankaBul(mesaj)) return "banka_kampanyalari";

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
      `\n\nVeri tarihi: ${VERI_TARIHI}. Bankaların ilan ettiği tarifelerden derlendi; ` +
      `işlem öncesi bankadan teyit etmekte fayda var.`,
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
  return bitis ? `• ${metin} (bitiş: ${bitis})` : `• ${metin}`;
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

function genelKampanyaYaniti(): RehberSonucu {
  const tumKampanyalar = listMemoryCampaigns({ activeOnly: true });

  if (!tumKampanyalar.length) {
    return {
      message:
        "Şu anda kayıtlı aktif kampanya bulunamadı. Banka sayfaları henüz taranmamış olabilir.\n\n" +
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
    for (const c of kampanyalar.slice(0, 3)) {
      satirlar.push(kampanyaSatiri(c));
    }
    if (kampanyalar.length > 3) {
      satirlar.push(`  … ve ${kampanyalar.length - 3} kampanya daha`);
    }
    satirlar.push("");
  }

  return {
    message:
      `${bankaGrup.size} katılım bankasında toplam ${tumKampanyalar.length} aktif kampanya var:\n\n` +
      satirlar.join("\n").trim() +
      `\n\nBelirli bir bankanın kampanyalarını detaylı görmek isterseniz banka adını yazın.`,
    citations: tumKampanyalar.slice(0, 8).map((c: Record<string, unknown>, i: number) => ({
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
  opts?: { preferredBankId?: string | null },
): RehberSonucu {
  const aktifler = BANK_SOURCE_CONFIGS.filter((b) => b.enabled);

  if (niyet === "yeni_musteri_avantaj") return yeniMusteriKampanyaYaniti();
  if (niyet === "genel_kampanyalar") return genelKampanyaYaniti();
  if (niyet === "ucret_karsilastir") return ucretYaniti(mesaj);

  if (niyet === "banka_sayisi") {
    return {
      message:
        `Türkiye'de ${aktifler.length} katılım bankası var, hepsini takip ediyorum. ` +
        `Sayfalarını düzenli olarak kontrol ediyorum.\n\n` +
        `İsimlerini görmek isterseniz "listele" yazmanız yeterli.`,
      citations: [],
    };
  }

  if (niyet === "banka_listesi") {
    const satirlar = aktifler.map((b, i) => `${i + 1}. ${b.bankName}`);
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

  // niyet === "banka_kampanyalari"
  const tumKampanyalar = listMemoryCampaigns({
    bankId: cfg.bankId,
    activeOnly: true,
  });

  const t = asciiKatla(mesaj);
  const egitimFiltresi = /egitim|okul|universite|ogrenci/.test(t);
  const kampanyalar = egitimFiltresi
    ? tumKampanyalar.filter((c) => {
        const haystack = asciiKatla(
          `${c.title || ""} ${c.productName || ""} ${c.summary || ""}`,
        );
        return /egitim|okul|universite|ogrenci|burs/.test(haystack);
      })
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

  if (egitimFiltresi && !kampanyalar.length) {
    return {
      message:
        `${cfg.bankName} kayıtlarında başlığında eğitim geçen aktif kampanya bulamadım. ` +
        `Toplam ${tumKampanyalar.length} kampanya var; “kampanyaları listele” dersen hepsini gösterebilirim.\n\n` +
        `Resmî kampanya sayfası: ${anaSayfa(cfg.bankId)}`,
      citations: [],
    };
  }

  const gosterilecek = kampanyalar.slice(0, 8);
  const baslik = egitimFiltresi
    ? `${cfg.bankName} için eğitimle ilgili ${kampanyalar.length} kampanya görünüyor`
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
