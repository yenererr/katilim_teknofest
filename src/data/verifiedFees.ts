/**
 * Doğrulanmış perakende ücret matrisi.
 *
 * Kaynak: bankaların resmî ücret sayfası / duyurusu / BDDK tablosu.
 * Bilinmeyen hücreler null — UI "—" gösterir; 0 = ücretsiz (doğrulanmış).
 *
 * Karşılaştırma kanalı (aksi belirtilmedikçe): mobil / internet şube,
 * orta tutar dilimi (yaklaşık 8.300–399.000 TL arası gönderim).
 */

export type FeeValue = number | null;

export type UcretKalemi = {
  key: string;
  etiket: string;
  aciklama: string;
  /** bankaId → TL. null = doğrulanmış rakam yok; 0 = ücretsiz */
  degerler: Record<string, FeeValue>;
};

export type FeeSourceRef = {
  bankId: string;
  url: string;
  label: string;
  checkedAt: string;
};

/** Matris derleme tarihi (görüntüleme). */
export const FEE_MATRIX_DATE = "2026-08-27";
export const FEE_MATRIX_DATE_TR = "27 Ağustos 2026";

export const FEE_SOURCES: FeeSourceRef[] = [
  {
    bankId: "vakif-katilim",
    url: "https://www.vakifkatilim.com.tr/tr/yardimci-sayfalar/urun-ve-hizmet-ucretleri",
    label: "Vakıf Katılım ürün/hizmet ücretleri + 22.01.2026 duyurusu",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "kuveyt-turk",
    url: "https://www.kuveytturk.com.tr/blog/finans/eftye-dair-merak-edilenler",
    label: "Kuveyt Türk — mobil/internet EFT ücretsiz",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "turkiye-finans",
    url: "https://www.turkiyefinans.com.tr/tr-tr/kampanyalar/sayfalar/masrafsiz-bankacilik.aspx",
    label: "Türkiye Finans — Masrafsız Bankacılık",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "ziraat-katilim",
    url: "https://www.ziraatkatilimozelbankacilik.com.tr/odemeler/anlik-transfer-fast",
    label: "Ziraat Katılım — FAST masraf alınmaz",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "ziraat-katilim",
    url: "https://www.ziraatkatilim.com.tr/sites/default/files/2026-07/EK%201-Kurumsal%20M%C3%BC%C5%9Fteriler%20%C3%9Ccret%20Bilgi%20Formu%20%281%29.pdf",
    label: "Ziraat Katılım kurumsal form — mobil EFT ücretsiz (tüm dilimler)",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "albaraka",
    url: "https://www.albaraka.com.tr/tr/urun-ve-hizmet-ucretleri",
    label: "Albaraka — dijital EFT/FAST ücretsiz; klasik/gold/platinum kart aidatsız",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "albaraka",
    url: "https://www.albaraka.com.tr/tr/kampanyalar/detay/albarakada-masraflara-son",
    label: "Albaraka — Masraflara Son (hesap işletim 0, EFT/Havale/FAST 0, ATM ağı ücretsiz)",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "hayat-finans",
    url: "https://www.hayatfinans.com.tr/urun-ve-hizmet-ucretleri",
    label: "Hayat Finans — resmi tarife: EFT/FAST ücretsiz; anlaşmalı ATM para çekme ücretsiz",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "hayat-finans",
    url: "https://hayatfinans.com.tr/masrafsiz-bankacilik",
    label: "Hayat Finans — Masrafsız Bankacılık (hesap işletim alınmaz)",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "tom-katilim",
    url: "https://www.tombank.com.tr/assets/images/doc/urun_ve_hizmet_ucretleri.pdf",
    label: "TOM Bank — resmi PDF: FAST ve EFT tüm dilimler ücretsiz (06.01.2025)",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "tom-katilim",
    url: "https://tombank.com.tr/",
    label: "TOM Bank — aidatsız kredi kartı / ücretsiz para transferi duyurusu",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "emlak-katilim",
    url: "https://asset.emlakkatilim.com.tr/documents/urun-ve-hizmet-ucretleri/breysel-bankacilik-urun-ve-hzmet-ucretler-2026-tr.pdf",
    label: "Emlak Katılım 2026 bireysel tarife — mobil/internet EFT, kendi ATM çekim, kart yıllık 0",
    checkedAt: "2026-08-27",
  },
  {
    bankId: "dunya-katilim",
    url: "https://www.dunyakatilim.com.tr/",
    label: "Dünya Katılım — mobil/internet EFT ve havale masrafsız",
    checkedAt: "2026-08-27",
  },
];

/**
 * Yalnızca kaynakla desteklenen hücreler doldurulur.
 * Diğer bankalar null/eksik kalır (tahmin yok).
 */
export const VERIFIED_FEES: UcretKalemi[] = [
  {
    key: "fast",
    etiket: "FAST",
    aciklama:
      "Mobil / internet üzerinden anlık transfer. BSMV hariç; şube/ATM kanalı farklı olabilir.",
    degerler: {
      albaraka: 0,
      "hayat-finans": 0,
      "kuveyt-turk": 0,
      "tom-katilim": 0,
      "turkiye-finans": 0,
      "vakif-katilim": 0,
      "ziraat-katilim": 0,
      // Adil / Dünya / Emlak: genel tarifede doğrulanmış ücretsiz ilan yok
    },
  },
  {
    key: "eft",
    etiket: "EFT (mobil / internet)",
    aciklama:
      "Orta tutar diliminde dijital kanal EFT. Banka duyurusu veya tarifede ücretsiz ilan edilenler 0.",
    degerler: {
      albaraka: 0,
      "dunya-katilim": 0,
      "emlak-katilim": 0,
      "hayat-finans": 0,
      "kuveyt-turk": 0,
      "tom-katilim": 0,
      "turkiye-finans": 0,
      "vakif-katilim": 0,
      "ziraat-katilim": 0,
    },
  },
  {
    key: "hesap_isletim",
    etiket: "Hesap işletim ücreti",
    aciklama: "Katılma / vadesiz hesap işletim ücreti (aylık veya işlem bazlı ilan).",
    degerler: {
      albaraka: 0,
      "hayat-finans": 0,
      "turkiye-finans": 0,
      "vakif-katilim": 0,
    },
  },
  {
    key: "kart_aidat",
    etiket: "Kart yıllık aidatı",
    aciklama:
      "Seçili aidatsız kart ürünü varsa 0. Diğer kartlarda aidat ürüne göre değişir — bilinmeyenler boş.",
    degerler: {
      // Klasik / Gold / Platinum ücretsiz; özel bankacılık kartları ücretli olabilir
      albaraka: 0,
      // Paraf Troy yıllık 0
      "emlak-katilim": 0,
      // Aidatsız kredi kartı ürünü
      "tom-katilim": 0,
      // Happy Bonus Zero — aidatsız
      "turkiye-finans": 0,
    },
  },
  {
    key: "atm_nakit",
    etiket: "ATM nakit çekim (kendi ATM)",
    aciklama:
      "Bankanın kendi ATM’sinden nakit çekim. Ortak / anlaşmalı ATM ücretleri ayrıdır (Hayat Finans vb. için tarife anlaşmalı ATM’yi kapsar — bu satırda gösterilmez).",
    degerler: {
      albaraka: 0,
      "emlak-katilim": 0,
      "turkiye-finans": 0,
      "vakif-katilim": 0,
    },
  },
];

/** UI / asistan için: bankanın bilinen bir ücreti var mı? */
export function bankHasAnyVerifiedFee(bankId: string): boolean {
  return VERIFIED_FEES.some((k) => k.degerler[bankId] != null);
}

export function getVerifiedFeeMatrix() {
  return {
    updated_at: FEE_MATRIX_DATE,
    updated_at_tr: FEE_MATRIX_DATE_TR,
    channel_note:
      "Karşılaştırma: mobil/internet şube, orta tutar dilimi. Nihai tutar için bankanın ücret sayfasını doğrulayın.",
    items: VERIFIED_FEES,
    sources: FEE_SOURCES,
  };
}
