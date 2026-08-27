/**
 * Doğrulanmış perakende ücret matrisi.
 *
 * Kaynak: bankaların resmî ücret sayfası / masrafsız bankacılık duyurusu.
 * Bilinmeyen hücreler null — UI "—" gösterir; 0 = ücretsiz (doğrulanmış).
 * Kart satırında ürün adı `notlar` ile gösterilir (premium kartlar ücretli olabilir).
 *
 * Karşılaştırma kanalı (aksi belirtilmedikçe): mobil / internet şube.
 */

export type FeeValue = number | null;

export type UcretKalemi = {
  key: string;
  etiket: string;
  aciklama: string;
  /** bankaId → TL. null = doğrulanmış rakam yok; 0 = ücretsiz */
  degerler: Record<string, FeeValue>;
  /** bankaId → ürün / açıklama (ör. "Sağlam Kart") */
  notlar?: Record<string, string>;
};

export type FeeSourceRef = {
  bankId: string;
  url: string;
  label: string;
  checkedAt: string;
};

export type BankFeeVerification = {
  bankId: string;
  title: string;
  summary: string;
  details: string[];
  sourceLabel: string;
  sourceUrl?: string;
};

/** Matris derleme tarihi (görüntüleme). */
export const FEE_MATRIX_DATE = "2026-08-27";
export const FEE_MATRIX_DATE_TR = "27 Ağustos 2026";

export const FEE_SOURCES: FeeSourceRef[] = [
  {
    bankId: "adil-katilim",
    url: "https://www.adilkatilim.com.tr/",
    label: "Adil Katılım resmî sitesi — mobil henüz yayımlanmadı; tarife yok",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "albaraka",
    url: "https://www.albaraka.com.tr/tr/urun-ve-hizmet-ucretleri",
    label: "Albaraka — ürün ve hizmet ücretleri (dijital EFT/FAST ücretsiz)",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "albaraka",
    url: "https://www.albaraka.com.tr/tr/kampanyalar/detay/albarakada-masraflara-son",
    label: "Albaraka — Masraflara Son (hesap işletim, EFT/Havale/FAST, ATM)",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "dunya-katilim",
    url: "https://www.dunyakatilim.com.tr/",
    label: "Dünya Katılım Mobil — EFT, havale ve FAST ücretsiz",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "dunya-katilim",
    url: "https://www.dunyakatilim.com.tr/",
    label: "Dünya Katılım DKart — yıllık kart ücreti yok",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "hayat-finans",
    url: "https://hayatfinans.com.tr/masrafsiz-bankacilik",
    label: "Hayat Finans — Masrafsız Bankacılık",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "hayat-finans",
    url: "https://www.hayatfinans.com.tr/",
    label: "Hayat Finans Banka Kartı — aidatsız",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "kuveyt-turk",
    url: "https://www.kuveytturk.com.tr/",
    label: "Kuveyt Türk — Masrafsız Bankacılık, Sağlam Kart, ortak ATM ağı",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "tom-katilim",
    url: "https://tombank.com.tr/",
    label: "TOM Bank — standart Hadi kredi kartı ömür boyu aidatsız; FAST/EFT 0",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "emlak-katilim",
    url: "https://www.emlakkatilim.com.tr/",
    label: "Emlak Katılım — müşteri ol / NakitKart (banka kartı)",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "turkiye-finans",
    url: "https://www.turkiyefinans.com.tr/tr-tr/kampanyalar/sayfalar/masrafsiz-bankacilik.aspx",
    label: "Türkiye Finans — Masrafsız Bankacılık, Happy Zero",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "vakif-katilim",
    url: "https://www.vakifkatilim.com.tr/",
    label: "Vakıf Katılım — masrafsız bankacılık",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "ziraat-katilim",
    url: "https://www.ziraatkatilim.com.tr/",
    label: "Ziraat Katılım — dijital müşteri avantajları / ürün-hizmet ücretleri",
    checkedAt: "2026-08-27",
  },
];

/**
 * Yalnızca kaynakla desteklenen hücreler doldurulur.
 * Adil Katılım için hiçbir hücre “ücretsiz” yazılmaz (tarife yayımlanmadı).
 */
export const VERIFIED_FEES: UcretKalemi[] = [
  {
    key: "fast",
    etiket: "FAST mobil/internet",
    aciklama:
      "Mobil / internet üzerinden anlık transfer. BSMV hariç; şube kanalı farklı olabilir.",
    degerler: {
      albaraka: 0,
      "dunya-katilim": 0,
      "hayat-finans": 0,
      "kuveyt-turk": 0,
      "tom-katilim": 0,
      "emlak-katilim": 0,
      "turkiye-finans": 0,
      "vakif-katilim": 0,
      "ziraat-katilim": 0,
    },
  },
  {
    key: "eft",
    etiket: "EFT mobil/internet",
    aciklama:
      "Dijital kanal EFT / havale. Bankanın ücretsiz ilan ettiği dilimler 0 TL.",
    degerler: {
      albaraka: 0,
      "dunya-katilim": 0,
      "hayat-finans": 0,
      "kuveyt-turk": 0,
      "tom-katilim": 0,
      "emlak-katilim": 0,
      "turkiye-finans": 0,
      "vakif-katilim": 0,
      "ziraat-katilim": 0,
    },
  },
  {
    key: "hesap_isletim",
    etiket: "Hesap işletim",
    aciklama:
      "Katılma / vadesiz hesap işletim ücreti. Açıkça 0 TL ilan edilmeyenler boş bırakılır.",
    degerler: {
      albaraka: 0,
      "hayat-finans": 0,
      "kuveyt-turk": 0,
      "emlak-katilim": 0,
      "turkiye-finans": 0,
      "vakif-katilim": 0,
      "ziraat-katilim": 0,
    },
  },
  {
    key: "kart_aidat",
    etiket: "Aidatsız kart seçeneği",
    aciklama:
      "Yalnızca adı geçen ürün için 0 TL. Aynı bankanın premium kartı ücretli olabilir.",
    degerler: {
      albaraka: 0,
      "dunya-katilim": 0,
      "hayat-finans": 0,
      "kuveyt-turk": 0,
      "tom-katilim": 0,
      "emlak-katilim": 0,
      "turkiye-finans": 0,
      "vakif-katilim": 0,
      "ziraat-katilim": 0,
    },
    notlar: {
      albaraka: "Banka/kredi kartı",
      "dunya-katilim": "DKart",
      "hayat-finans": "Banka Kartı",
      "kuveyt-turk": "Sağlam Kart",
      "tom-katilim": "Hadi Kredi Kartı",
      "emlak-katilim": "NakitKart",
      "turkiye-finans": "Happy Zero",
      "vakif-katilim": "Aidatsız kart",
    },
  },
  {
    key: "atm_nakit",
    etiket: "ATM’den nakit çekim (ücretsiz ATM ağı)",
    aciklama:
      "Bankanın kendi ATM’leri ile resmî olarak ücretsiz ilan ettiği anlaşmalı ATM ağlarını kapsar. Diğer banka ATM’leri, ücretsiz işlem adedi ve limitleri farklı olabilir.",
    degerler: {
      albaraka: 0,
      "dunya-katilim": 0,
      "hayat-finans": 0,
      "kuveyt-turk": 0,
      "emlak-katilim": 0,
      "turkiye-finans": 0,
      "vakif-katilim": 0,
      "ziraat-katilim": 0,
    },
  },
];

/** Banka banka doğrulama özeti (Ücretler sekmesi). */
export const BANK_FEE_VERIFICATIONS: BankFeeVerification[] = [
  {
    bankId: "adil-katilim",
    title: "Adil Katılım",
    summary:
      "Mobil uygulama henüz “çok yakında” ifadesiyle tanıtılıyor. FAST, EFT, kart ve ATM tarifeleri yayımlanmış değil. Tabloda “Ücretsiz” yazılmaz; “—” hizmet/tarife yayımlanmadığı anlamına gelir.",
    details: [
      "FAST: Doğrulanmış ücret yok",
      "EFT: Doğrulanmış ücret yok",
      "Hesap işletim: Doğrulanmış ücret yok",
      "Kart aidatı: Doğrulanmış ürün/tarife yok",
      "ATM: Doğrulanmış ücret yok",
    ],
    sourceLabel: "Adil Katılım resmî sitesi",
    sourceUrl: "https://www.adilkatilim.com.tr/",
  },
  {
    bankId: "albaraka",
    title: "Albaraka Türk",
    summary:
      "Bireysel masrafsız bankacılıkta temel işlemler ücretsiz. Resmî ücret tablosunda mobil/internet/ATM kanalıyla EFT’nin bütün tutar dilimlerinde ücretsiz olduğu belirtiliyor.",
    details: [
      "FAST mobil/internet: 0 TL",
      "EFT mobil/internet: 0 TL",
      "Hesap işletim: 0 TL",
      "Banka ve kredi kartı aidatı: 0 TL",
      "Albaraka ATM’den çekim: 0 TL",
      "Trend müşterilerinde diğer banka ATM’lerinden ayda üç çekim: 0 TL",
    ],
    sourceLabel: "Albaraka ürün ve hizmet ücretleri / Masraflara Son",
    sourceUrl: "https://www.albaraka.com.tr/tr/urun-ve-hizmet-ucretleri",
  },
  {
    bankId: "dunya-katilim",
    title: "Dünya Katılım",
    summary:
      "Mobil sayfa EFT, havale ve FAST’ın ücretsiz olduğunu; DKart sayfası yıllık kart ücretinin bulunmadığını belirtiyor. Hesap işletim için açık doğrulama yok.",
    details: [
      "FAST mobil: 0 TL",
      "EFT mobil: 0 TL",
      "Hesap işletim: Henüz açık doğrulama bulunamadı",
      "DKart kredi kartı yıllık aidatı: 0 TL",
      "Dünya Katılım ATM: 0 TL",
      "DKart’a cari hesap bağlanırsa Halkbank ATM’lerinden çekim/yatırma: 0 TL",
    ],
    sourceLabel: "Dünya Katılım Mobil, DKart",
    sourceUrl: "https://www.dunyakatilim.com.tr/",
  },
  {
    bankId: "hayat-finans",
    title: "Hayat Finans",
    summary:
      "Standart banka kartı ücretsizdir. Hayat Plus özel kredi kartının yıllık aidatı için açık rakam yayımlanmadığından tüm kartlar için “ücretsiz” denmez.",
    details: [
      "FAST: 0 TL",
      "EFT: 0 TL",
      "Hesap işletim: 0 TL",
      "Hayat Finans Banka Kartı: 0 TL",
      "İş Bankası Bankamatiklerinden çekim/yatırma: 0 TL",
      "Yapı Kredi ATM’lerinden çekim/yatırma: 0 TL",
    ],
    sourceLabel: "Hayat Finans masrafsız bankacılık, Banka Kartı",
    sourceUrl: "https://hayatfinans.com.tr/masrafsiz-bankacilik",
  },
  {
    bankId: "kuveyt-turk",
    title: "Kuveyt Türk",
    summary: "Masrafsız bankacılık, Sağlam Kart ve ortak ATM ağı duyurularına göre.",
    details: [
      "FAST: 0 TL",
      "EFT: 0 TL",
      "Hesap açma/kapatma ve işletim: 0 TL",
      "Sağlam Kart yıllık aidatı: 0 TL",
      "Kuveyt Türk ATM’den çekim: 0 TL",
      "Akbank ATM’leri: Sınırsız ücretsiz",
      "Yapı Kredi ATM’leri: Ayda 10 çekme/yatırma ücretsiz",
    ],
    sourceLabel: "Masrafsız Bankacılık, Sağlam Kart, ortak ATM ağı",
    sourceUrl: "https://www.kuveytturk.com.tr/",
  },
  {
    bankId: "tom-katilim",
    title: "T.O.M. Katılım / TOM Bank Hadi",
    summary:
      "Standart Hadi kredi kartı “ömür boyu ücretsiz ve aidatsız”; Hadi Black ücretli ayrı üründür. Hesap işletim ve ATM için açık tarife doğrulanamadı.",
    details: [
      "FAST: 0 TL",
      "EFT ve yurt içi para transferleri: 0 TL",
      "Hesap işletim: Açık tarife doğrulaması bulunamadı",
      "Standart Hadi kredi kartı: Ömür boyu 0 TL",
      "Hadi Black: Ücretli ayrı kart ürünü",
      "ATM çekimi: Güncel resmî ücret/koşul açık şekilde doğrulanamadı",
    ],
    sourceLabel: "TOM Bank resmî sitesi",
    sourceUrl: "https://tombank.com.tr/",
  },
  {
    bankId: "emlak-katilim",
    title: "Emlak Katılım",
    summary:
      "Kart hücresinde NakitKart / banka kartı 0 TL gösterilir; tüm kredi kartlarının ücretsiz olduğu genellemesi yapılmaz. Paraf yıllık aidatı doğrulanamadı.",
    details: [
      "FAST: 0 TL",
      "EFT/Havale: 0 TL",
      "Hesap işletim: 0 TL",
      "NakitKart/banka kartı: 0 TL",
      "Emlak Katılım ve 20 binden fazla kamu ATM’si: 0 TL",
      "Paraf kredi kartı yıllık aidatı: Açık güncel tutar doğrulanamadı",
    ],
    sourceLabel: "Emlak Katılım müşteri ol, banka kartı",
    sourceUrl: "https://www.emlakkatilim.com.tr/",
  },
  {
    bankId: "turkiye-finans",
    title: "Türkiye Finans",
    summary:
      "Karşılaştırmada özellikle Happy Zero adı gösterilir; diğer aidatlı Happy Kart çeşitleri ürün bazında farklılaşabilir.",
    details: [
      "FAST: 0 TL",
      "EFT/Havale: 0 TL",
      "Hesap açma/kapatma ve işletim: 0 TL",
      "Happy Zero kredi kartı: 0 TL",
      "Türkiye Finans ATM: 0 TL",
      "Anlaşmalı Yapı Kredi/PTT ATM (yaklaşık 8.000+): 0 TL",
    ],
    sourceLabel: "Türkiye Finans masrafsız bankacılık, kredi kartları",
    sourceUrl:
      "https://www.turkiyefinans.com.tr/tr-tr/kampanyalar/sayfalar/masrafsiz-bankacilik.aspx",
  },
  {
    bankId: "vakif-katilim",
    title: "Vakıf Katılım",
    summary: "Masrafsız bankacılık kapsamında temel dijital işlemler ve aidatsız kart seçeneği.",
    details: [
      "FAST: 0 TL",
      "EFT/Havale: 0 TL",
      "Hesap açma ve hesap işletim: 0 TL",
      "Aidatsız kredi kartı seçeneği: 0 TL",
      "Banka kartı ücreti: 0 TL",
      "Vakıf Katılım/TAM ATM’den çekim ve yatırma: 0 TL",
    ],
    sourceLabel: "Vakıf Katılım masrafsız bankacılık",
    sourceUrl: "https://www.vakifkatilim.com.tr/",
  },
  {
    bankId: "ziraat-katilim",
    title: "Ziraat Katılım",
    summary: "Dijital müşteri avantajları ve ürün-hizmet ücretleri duyurularına göre.",
    details: [
      "FAST mobil/internet: 0 TL",
      "EFT/Havale mobil/internet: 0 TL",
      "Hesap işletim: 0 TL",
      "Kredi kartı aidatı: 0 TL",
      "Ziraat Katılım ATM: 0 TL",
      "Tüm kamu ATM’lerinden para yatırma/çekme: 0 TL",
    ],
    sourceLabel: "Ziraat Katılım dijital müşteri avantajları, ürün ve hizmet ücretleri",
    sourceUrl: "https://www.ziraatkatilim.com.tr/",
  },
];

/** UI / asistan için: bankanın bilinen bir ücreti var mı? */
export function bankHasAnyVerifiedFee(bankId: string): boolean {
  return VERIFIED_FEES.some((k) => k.degerler[bankId] != null);
}

/** Hücre metni: "—", "0 TL" veya "0 TL – Ürün". */
export function formatFeeCell(
  amount: FeeValue,
  note?: string | null,
): string {
  if (amount == null) return "—";
  const base =
    amount === 0
      ? "0 TL"
      : `${amount.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} TL`;
  if (note && note.trim()) return `${base} – ${note.trim()}`;
  return base;
}

export function getVerifiedFeeMatrix() {
  return {
    updated_at: FEE_MATRIX_DATE,
    updated_at_tr: FEE_MATRIX_DATE_TR,
    channel_note:
      "“0 TL”, bankanın ilgili bireysel ürün veya dijital kanal için açıkça ücretsiz olduğunu belirtmesi anlamına gelir. “—” ücret var demek değildir; doğrulanabilir güncel tarife yayımlanmadığı anlamına gelir. Karşılaştırma: mobil/internet şube.",
    items: VERIFIED_FEES,
    sources: FEE_SOURCES,
    bankVerifications: BANK_FEE_VERIFICATIONS,
  };
}
