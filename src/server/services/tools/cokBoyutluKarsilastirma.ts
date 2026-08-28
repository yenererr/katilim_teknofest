/**
 * Çok boyutlu banka karşılaştırması — her boyutta ayrı kazanan.
 *
 * `compareProductsTool` tek metrik seçip tek kazanan döndürür. Bu motor ise
 * kâr payı / vade / masraf / ödül boyutlarını aynı anda değerlendirip
 * "oranda X, vadede Y avantajlı" biçiminde ayrı ayrı hüküm üretir.
 *
 * Kural: eksik veri asla sıfır/avantaj sayılmaz. Bir boyutta en az iki
 * bankanın doğrulanmış değeri yoksa o boyut "karşılaştırılamaz" işaretlenir.
 */

export type KarsilastirmaBoyutu = "kar_payi" | "vade" | "masraf" | "odul";

export type BankaAdayi = {
  bankId: string;
  bankName: string;
  productName?: string | null;
  /** Aylığa normalize edilmiş kâr payı oranı, ondalık (0.0189 = %1,89) */
  aylikKarPayiOrani: number | null;
  /** Azami vade (ay) */
  azamiVadeAy: number | null;
  /** Tahsis/dosya masrafı — TL tutarı */
  masrafTl: number | null;
  /** Oransal masraf (0.005 = binde 5); masrafTl yoksa tutarla çözülür */
  masrafOrani?: number | null;
  /** Bu tutara kadar masraf alınmıyor (ör. 50.000 TL'ye kadar masrafsız) */
  masrafMuafiyetiTl?: number | null;
  /** Ödül / hediye TL değeri */
  odulTl: number | null;
  /** "5.000 TL alışveriş kartı" gibi serbest metin */
  odulAciklamasi?: string | null;
  sourceUrl?: string | null;
};

export type BoyutSiraSatiri = {
  bankId: string;
  bankName: string;
  deger: number | null;
  gosterim: string | null;
  /** Cümle içinde kullanılacak biçim (ek alacağı için parantezsiz) */
  cumleGosterim?: string | null;
  haricSebebi?: string;
};

export type BoyutSonucu = {
  boyut: KarsilastirmaBoyutu;
  etiket: string;
  karsilastirilabilir: boolean;
  esit: boolean;
  kazananBankId: string | null;
  kazananBankName: string | null;
  /** Kullanıcıya gösterilecek Türkçe madde cümlesi */
  gerekce: string;
  siralama: BoyutSiraSatiri[];
};

export type CokBoyutluSonuc = {
  boyutlar: BoyutSonucu[];
  /** Tüm karşılaştırılabilir boyutları kazanan banka varsa onun adı */
  genelKazananBankName: string | null;
  /** Karşılaştırılamayan boyutlar için şeffaflık notları */
  notlar: string[];
  karsilastirilabilirBoyutSayisi: number;
  /** En az bir boyutta taraflar eşit mi? */
  esitBoyutVar: boolean;
};

const ETIKET: Record<KarsilastirmaBoyutu, string> = {
  kar_payi: "Kâr payı oranı",
  vade: "Vade",
  masraf: "Masraf avantajı",
  odul: "Ek ödül",
};

/** Küçük olan iyi mi? */
const KUCUK_IYI: Record<KarsilastirmaBoyutu, boolean> = {
  kar_payi: true,
  vade: false,
  masraf: true,
  odul: false,
};

const trSayi = (n: number, ondalik = 2) =>
  n.toLocaleString("tr-TR", {
    minimumFractionDigits: ondalik,
    maximumFractionDigits: ondalik,
  });

const tlBicim = (n: number) =>
  `${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL`;

const yuzde = (oran: number) => `%${trSayi(oran * 100)}`;

/**
 * Türkçe bildirme eki: son okunan hecenin ünlüsüne ve sessiz uyumuna göre.
 * "%1,87" → yedi → 'dir  |  "%2,03" → üç → 'tür
 */
export function bildirmeEki(gosterim: string): string {
  const rakamlar = gosterim.replace(/[^\d]/g, "");
  const son = rakamlar.slice(-1);
  const tablo: Record<string, string> = {
    "0": "dır",
    "1": "dir",
    "2": "dir",
    "3": "tür",
    "4": "tür",
    "5": "tir",
    "6": "dır",
    "7": "dir",
    "8": "dir",
    "9": "dur",
  };
  return `'${tablo[son] ?? "dir"}`;
}

/** Oransal masrafı TL'ye çevirir; muafiyet varsa dikkate alır. */
function etkinMasrafTl(a: BankaAdayi, tutarTl: number | null): number | null {
  if (a.masrafMuafiyetiTl != null && tutarTl != null && tutarTl <= a.masrafMuafiyetiTl) {
    return 0;
  }
  if (a.masrafTl != null) return a.masrafTl;
  if (a.masrafOrani != null && tutarTl != null) {
    return Math.round(a.masrafOrani * tutarTl);
  }
  return null;
}

function boyutDegeri(
  boyut: KarsilastirmaBoyutu,
  a: BankaAdayi,
  tutarTl: number | null,
): {
  deger: number | null;
  gosterim: string | null;
  cumleGosterim?: string | null;
  sebep?: string;
} {
  if (boyut === "kar_payi") {
    if (a.aylikKarPayiOrani == null) {
      return {
        deger: null,
        gosterim: null,
        sebep: "İlan edilen kâr payı oranı doğrulanmış kaynakta yok.",
      };
    }
    return {
      deger: a.aylikKarPayiOrani,
      gosterim: `${yuzde(a.aylikKarPayiOrani)} (aylık)`,
      cumleGosterim: yuzde(a.aylikKarPayiOrani),
    };
  }

  if (boyut === "vade") {
    if (a.azamiVadeAy == null) {
      return { deger: null, gosterim: null, sebep: "Azami vade kaynakta belirtilmemiş." };
    }
    return { deger: a.azamiVadeAy, gosterim: `${a.azamiVadeAy} ay` };
  }

  if (boyut === "masraf") {
    const fee = etkinMasrafTl(a, tutarTl);
    if (fee == null) {
      return {
        deger: null,
        gosterim: null,
        sebep: "Tahsis/dosya masrafı kaynakta belirtilmemiş; sıfır varsayılmadı.",
      };
    }
    if (fee === 0 && a.masrafMuafiyetiTl != null) {
      return {
        deger: 0,
        gosterim: `${tlBicim(a.masrafMuafiyetiTl)}'ye kadar masraf yok`,
        cumleGosterim: `${tlBicim(
          a.masrafMuafiyetiTl,
        )}'ye kadar dosya masrafı alınmamaktadır`,
      };
    }
    if (fee === 0) {
      return {
        deger: 0,
        gosterim: "masraf yok",
        cumleGosterim: "tahsis/dosya masrafı alınmamaktadır",
      };
    }
    return {
      deger: fee,
      gosterim: tlBicim(fee),
      cumleGosterim: `tahsis ücreti ${tlBicim(fee)}`,
    };
  }

  // odul
  if (a.odulTl == null && !a.odulAciklamasi) {
    return { deger: null, gosterim: null, sebep: "Ödül/hediye bilgisi kaynakta yok." };
  }
  if (a.odulTl == null) {
    // Tutarsız ama tanımlı ödül: sıralamaya girmez, bilgi olarak taşınır
    return { deger: null, gosterim: a.odulAciklamasi ?? null, sebep: "Ödül tutarı sayısal değil." };
  }
  return {
    deger: a.odulTl,
    gosterim: a.odulAciklamasi?.trim() || tlBicim(a.odulTl),
  };
}

function gerekceCumlesi(
  boyut: KarsilastirmaBoyutu,
  kazanan: BoyutSiraSatiri,
  esit: boolean,
  hepsi: BoyutSiraSatiri[],
): string {
  const g = kazanan.cumleGosterim ?? kazanan.gosterim ?? "—";

  if (esit) {
    const isimler = hepsi
      .filter((r) => r.deger === kazanan.deger)
      .map((r) => r.bankName)
      .join(" ve ");
    if (boyut === "kar_payi") return `Kâr payı oranı ${isimler} tarafında eşit: ${g}.`;
    if (boyut === "vade") return `Vade açısından ${isimler} eşit: ${g}.`;
    if (boyut === "masraf") return `Masraf açısından ${isimler} eşit: ${g}.`;
    return `Ek ödül açısından ${isimler} eşit: ${g}.`;
  }

  switch (boyut) {
    case "kar_payi":
      return `Kâr payı oranı açısından ${kazanan.bankName} daha avantajlıdır çünkü aylık oran ${g}${bildirmeEki(g)}.`;
    case "vade":
      return `Vade açısından ${kazanan.bankName} daha avantajlıdır çünkü ${g} vade sunmaktadır.`;
    case "masraf":
      return `Masraf avantajı açısından ${kazanan.bankName} öne çıkmaktadır çünkü ${g}.`;
    case "odul":
      return `Ek ödül açısından ise ${kazanan.bankName} ${g} vermektedir.`;
  }
}

function boyutuDegerlendir(
  boyut: KarsilastirmaBoyutu,
  adaylar: BankaAdayi[],
  tutarTl: number | null,
): BoyutSonucu {
  const siralama: BoyutSiraSatiri[] = adaylar.map((a) => {
    const { deger, gosterim, cumleGosterim, sebep } = boyutDegeri(
      boyut,
      a,
      tutarTl,
    );
    return {
      bankId: a.bankId,
      bankName: a.bankName,
      deger,
      gosterim,
      cumleGosterim: cumleGosterim ?? gosterim,
      ...(sebep ? { haricSebebi: sebep } : {}),
    };
  });

  const kullanilabilir = siralama.filter((r) => r.deger != null);

  if (kullanilabilir.length < 2) {
    const eksikler = siralama
      .filter((r) => r.deger == null)
      .map((r) => r.bankName)
      .join(", ");
    return {
      boyut,
      etiket: ETIKET[boyut],
      karsilastirilabilir: false,
      esit: false,
      kazananBankId: null,
      kazananBankName: null,
      gerekce:
        kullanilabilir.length === 1
          ? `${ETIKET[boyut]} yalnızca ${kullanilabilir[0].bankName} için doğrulandı (${kullanilabilir[0].gosterim}); karşı taraf verisi olmadığı için üstünlük iddia edilmiyor.`
          : `${ETIKET[boyut]} için doğrulanmış veri yok (${eksikler}).`,
      siralama,
    };
  }

  const kucukIyi = KUCUK_IYI[boyut];
  kullanilabilir.sort((a, b) =>
    kucukIyi
      ? (a.deger as number) - (b.deger as number)
      : (b.deger as number) - (a.deger as number),
  );

  const kazanan = kullanilabilir[0];
  const esit = kullanilabilir[1].deger === kazanan.deger;

  return {
    boyut,
    etiket: ETIKET[boyut],
    karsilastirilabilir: true,
    esit,
    kazananBankId: esit ? null : kazanan.bankId,
    kazananBankName: esit ? null : kazanan.bankName,
    gerekce: gerekceCumlesi(boyut, kazanan, esit, kullanilabilir),
    siralama: [...kullanilabilir, ...siralama.filter((r) => r.deger == null)],
  };
}

export const TUM_BOYUTLAR: KarsilastirmaBoyutu[] = [
  "kar_payi",
  "vade",
  "masraf",
  "odul",
];

/**
 * Adayları istenen boyutlarda karşılaştırır.
 * @param tutarTl Oransal masrafı TL'ye çevirmek ve muafiyet eşiğini uygulamak için.
 */
export function cokBoyutluKarsilastir(
  adaylar: BankaAdayi[],
  opts: {
    boyutlar?: KarsilastirmaBoyutu[];
    tutarTl?: number | null;
  } = {},
): CokBoyutluSonuc {
  const boyutlar = opts.boyutlar?.length ? opts.boyutlar : TUM_BOYUTLAR;
  const tutarTl = opts.tutarTl ?? null;

  if (adaylar.length < 2) {
    return {
      boyutlar: [],
      genelKazananBankName: null,
      notlar: ["Karşılaştırma için en az iki banka gerekiyor."],
      karsilastirilabilirBoyutSayisi: 0,
      esitBoyutVar: false,
    };
  }

  const sonuclar = boyutlar.map((b) => boyutuDegerlendir(b, adaylar, tutarTl));
  const gecerli = sonuclar.filter((s) => s.karsilastirilabilir && !s.esit);

  const kazananlar = new Set(gecerli.map((s) => s.kazananBankName));
  const genelKazananBankName =
    gecerli.length > 0 && kazananlar.size === 1
      ? (gecerli[0].kazananBankName as string)
      : null;

  const notlar = sonuclar
    .filter((s) => !s.karsilastirilabilir)
    .map((s) => s.gerekce);

  return {
    boyutlar: sonuclar,
    genelKazananBankName,
    notlar,
    karsilastirilabilirBoyutSayisi: sonuclar.filter((s) => s.karsilastirilabilir)
      .length,
    esitBoyutVar: sonuclar.some((s) => s.karsilastirilabilir && s.esit),
  };
}

/**
 * Senaryo formatında Türkçe yanıt metni üretir.
 */
export function cokBoyutluMesaj(
  sonuc: CokBoyutluSonuc,
  opts: { urunEtiketi?: string | null } = {},
): string {
  const gosterilecek = sonuc.boyutlar.filter((s) => s.karsilastirilabilir);
  const urun = opts.urunEtiketi ? `${opts.urunEtiketi} için ` : "";
  /** Ürün etiketi yoksa cümle küçük harfle başlamasın. */
  const bh = (s: string) =>
    urun ? `${urun}${s}` : s.charAt(0).toLocaleUpperCase("tr-TR") + s.slice(1);

  if (gosterilecek.length === 0) {
    return (
      bh(
        "iki banka arasında sayısal karşılaştırma yapabilecek doğrulanmış veri bulamadım.",
      ) +
      `\n\n${sonuc.notlar.map((n) => `• ${n}`).join("\n")}`
    );
  }

  const kazanan = sonuc.genelKazananBankName;
  const bas =
    kazanan == null
      ? bh("bu iki kampanya farklı avantajlar sunmaktadır.")
      : sonuc.esitBoyutVar
        ? bh(
            `karşılaştırmada ${kazanan} öne çıkıyor; bazı boyutlarda iki taraf eşit.`,
          )
        : bh(`karşılaştırmada ${kazanan} tüm ölçülebilir boyutlarda öne çıkıyor.`);

  const maddeler = gosterilecek.map((s) => `• ${s.gerekce}`);
  const notlar = sonuc.notlar.length
    ? `\n\nVeri notu:\n${sonuc.notlar.map((n) => `• ${n}`).join("\n")}`
    : "";

  return `${bas}\n\n${maddeler.join("\n")}${notlar}`;
}
