/**
 * Canlı kampanya snapshot’ını local belleğe yazar (Postgres host çözülmediğinde).
 * Kullanım: npx tsx scripts/seed-live-campaign-cache.ts
 */
import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

type Row = {
  bankId: string;
  bankName: string;
  title: string;
  conditions?: string[];
  campaignEnd?: string | null;
  category?: string;
  campaignTheme?: string;
  profitRate?: number | null;
  installmentCount?: number | null;
  rewardAmountTl?: number | null;
  sourceUrl: string;
  campaignStatus: "active";
  recordType: "campaign";
};

const BANK: Record<
  string,
  { bankId: string; bankName: string; url: (slug: string) => string }
> = {
  albaraka: {
    bankId: "albaraka",
    bankName: "Albaraka Türk",
    url: (s) => `https://www.albaraka.com.tr/tr/kampanyalar/detay/${s}`,
  },
  dunya: {
    bankId: "dunya-katilim",
    bankName: "Dünya Katılım",
    url: (s) => `https://dunyakatilim.com.tr/kampanyalar/${s}`,
  },
  hayat: {
    bankId: "hayat-finans",
    bankName: "Hayat Finans",
    url: (s) => `https://hayatfinans.com.tr/kampanyalar/${s}`,
  },
  kuveyt: {
    bankId: "kuveyt-turk",
    bankName: "Kuveyt Türk",
    url: (s) =>
      `https://www.kuveytturk.com.tr/kampanyalar/kendim-icin/kart-kampanyalari/${s}`,
  },
  tom: {
    bankId: "tom-katilim",
    bankName: "T.O.M. Katılım",
    url: (s) => `https://tombankhadi.com/kampanyalar/${s}`,
  },
  emlak: {
    bankId: "emlak-katilim",
    bankName: "Emlak Katılım",
    url: (s) =>
      `https://www.emlakkatilim.com.tr/tr/bireysel/kampanyalar/${s}`,
  },
  vakif: {
    bankId: "vakif-katilim",
    bankName: "Vakıf Katılım",
    url: (s) =>
      `https://www.vakifkatilim.com.tr/tr/kendim-icin/kampanyalar/detay/${s}`,
  },
  tf: {
    bankId: "turkiye-finans",
    bankName: "Türkiye Finans",
    url: (s) =>
      `https://www.turkiyefinans.com.tr/tr-tr/kampanyalar/sayfalar/${s}`,
  },
  ziraat: {
    bankId: "ziraat-katilim",
    bankName: "Ziraat Katılım",
    url: (s) =>
      `https://www.ziraatkatilim.com.tr/kart-kampanyalari/${s}`,
  },
};

function slugify(title: string): string {
  return title
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function row(
  bankKey: keyof typeof BANK,
  title: string,
  opts: Partial<Row> & { slug?: string } = {},
): Row {
  const b = BANK[bankKey];
  const slug = opts.slug || slugify(title);
  const sourceUrl = opts.sourceUrl || b.url(slug);
  const id = crypto
    .createHash("sha1")
    .update(`${b.bankId}|${sourceUrl}|campaign`)
    .digest("hex")
    .slice(0, 24);
  return {
    id,
    bankId: b.bankId,
    bankName: b.bankName,
    title,
    productName: title,
    conditions: opts.conditions,
    campaignEnd: opts.campaignEnd ?? null,
    category: opts.category || "financing_campaign",
    campaignTheme: opts.campaignTheme || "general",
    profitRate: opts.profitRate ?? null,
    installmentCount: opts.installmentCount ?? null,
    rewardAmountTl: opts.rewardAmountTl ?? null,
    sourceUrl,
    campaignStatus: "active",
    recordType: "campaign",
  } as Row & { id: string; productName: string };
}

/** Canlıda görünen kampanyalar (kullanıcı snapshot’ı, Ağu 2026). */
const LIVE: Row[] = [
  row("albaraka", "Albarakada Masraflara Son", {
    conditions: [
      "Albaraka Türk olarak dijitalleşen dünyada müşterilerimizin finansal ihtiyaçlarına çözüm üretmenin tutkusuyla masrafsız bir bankacılık sunuyoruz.",
    ],
  }),
  row("albaraka", "Agustos Ayina Ozel Fatura Kampanyasi"),
  row("albaraka", "Dijital Katilma Hesabina Ozel Paylasim Oranlari 10"),
  row("albaraka", "Vade Farksız 140.000 Tl'ye Varan Destek", {
    slug: "vade-farksiz-kampanyasi",
    campaignTheme: "new_customer",
    category: "new_customer_financing",
    profitRate: 0,
    installmentCount: 6,
    campaignEnd: "2026-12-31",
    conditions: [
      "40.000 TL'ye kadar Pratik Finansman Kart ve 100.000 TL'ye kadar seçili sektörlerde vade farksız taksit fırsatı birlikte sunulur.",
    ],
  }),
  row("albaraka", "Saglik Harcamalarina Vade Farksiz 6 Taksit Kampanyasi1 2", {
    installmentCount: 49,
    conditions: [
      "Kampanya, 5975-ISITME CIHAZLARI SATIS-SERVIS, 5976-ORTOPEDI VE PROTEZ MALZ.SATIS, 5912-ECZANELER VE ECZACILAR, 8011-SINIFLANMAMIS HEKIM VE…",
    ],
  }),
  row("albaraka", "Albarakalilara Ozel Ucretsiz İspark Kampanyasi 1", {
    conditions: ["Ücretsiz İSPARK Otopark Kampanyası | Albarakalılara Özel"],
  }),
  row("dunya", "Fiziki Altin", { slug: "fiziki-altin" }),
  row("dunya", "Avantajli Kurlar", {
    installmentCount: 12,
    conditions: [
      "Döviz, altın, gümüş ve tüm yatırımlarınız için benzersiz kurlar Dünya Katılım’da sizi bekliyor.",
    ],
  }),
  row("hayat", "Hayatfinansla İslem Yaptikca Kazan", {
    conditions: [
      "Başka bir banka hesabından veya para kuruluşundan Hayat Finans hesabınıza gelen en az 1.000 TL tutarlı EFT veya FAST transferlerinde nakit…",
    ],
  }),
  row("hayat", "Avantajli Hesap Musterilerine Ozel Fx Dar Makas Avantaji", {
    conditions: [
      "Kampanya döneminde maksimum 5.000 USD veya karşılığı hacme kadar Hayat FX işlemlerinde dar makas uygulanacaktır.",
    ],
  }),
  row("hayat", "Hayatfx İle Gumus İslemleri"),
  row("hayat", "Bana Bunu Al İs Ortagim İle Troy Magaza Firsatlari", {
    conditions: ["Kampanya üst limiti 80.000TL'dir."],
  }),
  row("hayat", "Xiaomi Urunlerinde Finansman Avantaji", {
    conditions: ["Kampanya üst limiti 40.000TL'dir."],
  }),
  row("hayat", "Hayat Finans İle Gastroclub Ayricaliklari", {
    profitRate: 0.1,
    conditions: [
      "Hayat Finans Mobil uygulaması üzerinden GastroClub üyeliğinizi oluşturarak seçkin restoranlar, marketler, moda, teknoloji, kuru temizleme,…",
    ],
  }),
  row("kuveyt", "Kendim icin", {
    slug: "vivensede-vade-farksiz-5-aya-varan-taksit-firsati",
    installmentCount: 5,
    rewardAmountTl: 300,
    campaignEnd: "2026-10-31",
    conditions: ["Vivense’de Vade Farksız 5 Aya Varan Taksit Fırsatı!"],
  }),
  row(
    "kuveyt",
    "Taksitlioda Yeni Musterilere Ozel Kuveyt Turk Alisveris Finansmani Firsati",
    {
      campaignTheme: "new_customer",
      category: "new_customer_financing",
      profitRate: 0.0299,
      installmentCount: 3,
      sourceUrl:
        "https://www.kuveytturk.com.tr/kampanyalar/kendim-icin/finansman-kampanyalari/taksitlioda-yeni-musterilere-ozel",
      conditions: [
        "Taksitlio’nun anlaşmalı olduğu mağazalarda yapacağınız alışverişlerinizde yeni müşteriye özel %2,99 kar payı oranlı Taksitlio Alışveriş…",
      ],
    },
  ),
  row("kuveyt", "Tarimda Kuveyt Turk İle Buyume Zamani", {
    sourceUrl:
      "https://www.kuveytturk.com.tr/kampanyalar/kendim-icin/tarimda-kuveyt-turk-ile-buyume-zamani",
  }),
  row("tom", "Bayii Kampanyalari", {
    installmentCount: 36,
    conditions: [
      "TOM Bank’tan “Hesaplı Kampanya”, seçili bayilerden kredi kullanan müşterilerin, belirli şartları yerine getirdiğinde vade farkının iade edildiği ve avantajlı vadelerle kredi kullanmasını sağlayan bir kampanyadır.",
    ],
  }),
  row("emlak", "Kitap Kirtasiye Harcamalariniza 1000 Tl Parafpara", {
    campaignTheme: "education",
    category: "card_campaign",
  }),
  row("vakif", "Tamamla Kazan", {
    installmentCount: 1,
    conditions: ["1 Aylık tabii Premium Üyelik Hediye"],
  }),
  row("vakif", "Vclub Dunyasi Artik Vakif Katilim Mobilde", {
    campaignTheme: "card",
    category: "card_campaign",
    slug: "vclub-dunyasi-artik-vakif-katilim-mobilde",
  }),
  row("tom", "A101de Her Alisveriste 3 Nakit İade", {
    slug: "a101de-her-alisveriste-3-nakit-iade",
  }),
  row("tf", "Yeni Yatırım Hesabına Sıfır Komisyon", {
    campaignEnd: "2026-10-31",
    sourceUrl:
      "https://www.turkiyefinans.com.tr/tr-tr/kampanyalar/sayfalar/yeni-yatirim-hesabina-sifir-komisyon",
    conditions: [
      "Daha önce yatırım hesabı bulunmayan müşteriler için kampanya boyunca yurt içi hisse alım satımında %0 komisyon.",
    ],
  }),
  row(
    "tf",
    "Mobilden Türkiye Finanslı Ol 50.000 Tl'ye Varan Kâr Paysız İhtiyaç Finansmanı",
    {
      campaignTheme: "new_customer",
      category: "new_customer_financing",
      profitRate: 0,
      campaignEnd: "2026-08-31",
      sourceUrl:
        "https://www.turkiyefinans.com.tr/tr-tr/kampanyalar/sayfalar/mobilden-turkiye-finansli-ol",
      conditions: [
        "Mobilden yeni müşteri olanlara 50.000 TL'ye kadar kâr paysız ihtiyaç finansmanı sunulur.",
      ],
    },
  ),
  row("kuveyt", "Yeni Kuveyt Turk Mobil Musterilerine 10000 Mile Varan Firsat", {
    sourceUrl:
      "https://www.kuveytturk.com.tr/kampanyalar/kendim-icin/musteri-ol-kampanyalari/yeni-kuveyt-turk-mobil-musterilerine-10000-mile-varan-firsat",
  }),
  row("ziraat", "Hava Yolu Bilet Aliminiza 1500 Tl Bankkart Lira 3", {
    campaignTheme: "card",
    category: "card_campaign",
  }),
  row("albaraka", "Yurt Disi Cikis Harci Kampanyasi 1250 Tl Worldpuan 3", {
    campaignTheme: "card",
    category: "card_campaign",
  }),
  row("albaraka", "Yakınını Davet Et Kampanyası", {
    campaignTheme: "card",
    category: "card_campaign",
    rewardAmountTl: 5000,
    campaignEnd: "2026-12-31",
    conditions: [
      "Davet edilen uygun kişi başına 500 TL Worldpuan; davet eden için toplam 5.000 TL'ye kadar Worldpuan.",
    ],
  }),
  row("albaraka", "Eğitim Harcamalarına Vade Farksız 6 Taksit", {
    campaignTheme: "education",
    category: "card_campaign",
    installmentCount: 6,
    campaignEnd: "2026-09-30",
    conditions: [
      "Albaraka World kredi kartı ile tek çekim okul ödemeleri için geçerlidir.",
    ],
  }),
  row("albaraka", "Kırtasiye Harcamalarına Vade Farksız 4 Taksit", {
    campaignTheme: "education",
    category: "card_campaign",
    installmentCount: 4,
    campaignEnd: "2026-09-30",
    conditions: [
      "Albaraka World kredi kartı ile uygun kırtasiye harcamaları için geçerlidir.",
    ],
  }),
  row("dunya", "Altin Kesemticari", {
    campaignTheme: "card",
    category: "card_campaign",
    conditions: ["Altın Kazandıran Alışveriş Dünya Katılım’da !"],
  }),
  row("dunya", "Davet Et, Altın Kazan", {
    campaignTheme: "card",
    category: "card_campaign",
    slug: "davetetkazan",
    conditions: [
      "Davet koduyla müşteri olan ve Paraf Kart başvurusu yapan her kişi için 0,1 gram altın; toplam 1 grama kadar.",
    ],
  }),
  row("dunya", "Lc Waikiki", {
    campaignTheme: "card",
    category: "card_campaign",
    conditions: [
      "LCW mobil uygulaması ve lcw.com ‘dan yapılacak alışverişlerde 300 TL indirime hak kazanmak için; kargo bedeli hariç sepet tutarı tek…",
    ],
  }),
  row("hayat", "Biz Kart ile Arkadaşını Getir Kazan", {
    campaignTheme: "card",
    category: "card_campaign",
    rewardAmountTl: 25000,
    conditions: [
      "Davet eden müşterinin toplam kazanımı 25.000 TL'ye kadar çıkabilir.",
    ],
  }),
  row("hayat", "Biz Kart Dijital Uyelikler Kampanyasi", {
    campaignTheme: "card",
    category: "card_campaign",
    profitRate: 0.75,
    conditions: ["Kampanya Hayat Finans bireysel müşterileri için geçerlidir."],
  }),
  row("hayat", "Biz Kart ile Okula Donus Kampanyasi", {
    campaignTheme: "education",
    category: "card_campaign",
    profitRate: 0.1,
    conditions: ["Biz Kart ile Okula Dönüş Kampanyası"],
  }),
  row("hayat", "Biz Kart Yemek Harcaması Nakit İade", {
    campaignTheme: "card",
    category: "card_campaign",
    rewardAmountTl: 1000,
    campaignEnd: "2026-08-31",
    conditions: [
      "Biz Kart ile yemek sektöründeki uygun harcamaların %10'u, aylık en fazla 1.000 TL nakit iade.",
    ],
  }),
  row("kuveyt", "İsim İcin", {
    campaignTheme: "card",
    category: "card_campaign",
    profitRate: 0.0299,
    sourceUrl:
      "https://www.kuveytturk.com.tr/kampanyalar/isin-icin/akaryakit-taksit",
    conditions: [
      "Kuveyt Türk Tüm Tüzel Kartları ile 500 – 300.00 Arası Akaryakıt Taksitli Harcamalarınıza %2.99 Vade Farkı Oran Fırsatı!",
    ],
  }),
  row("emlak", "Emlak Katılım Paraf 2.500 Tl Parafpara", {
    campaignTheme: "card",
    category: "card_campaign",
    rewardAmountTl: 2500,
    campaignEnd: "2026-09-18",
    conditions: [
      "Kampanyaya uygun müşterinin 5.000 TL harcamaya ulaşması gerekir.",
    ],
  }),
  row("emlak", "Biletinialda 20 İndirim", {
    category: "discount_campaign",
  }),
  row("emlak", "Marina Mayoda Tum Urunlerde 15 İndirim", {
    category: "discount_campaign",
  }),
  row("emlak", "Modanisada Tum İndirimlere Ek 15 İndirim Firsati", {
    category: "discount_campaign",
  }),
  row("emlak", "Enterprise Arac Kiralamalarinda 35 İndirim Firsati", {
    campaignTheme: "vehicle",
    category: "discount_campaign",
  }),
  row("emlak", "Rentgoda 40 İndirim Firsati", {
    category: "discount_campaign",
    profitRate: 0.4,
    conditions: [
      "rentgo.com web sitesinde Emlak Katılım kart sahiplerine özel %40 oranında ek indirim sunulacaktır.",
    ],
  }),
  row("emlak", "Hizli Cicekte Tum İndirimlere Ek 20 İndirim Firsati", {
    category: "discount_campaign",
    profitRate: 0.2,
    conditions: ["İndirim oranı tüm indirimlere ek %20’dir."],
  }),
  row("vakif", "Vakif Katilimli Olanlara Tabiiden Premium Uyelik", {
    installmentCount: 1,
    conditions: [
      "Siz de Vakıf Katılım Mobil Şube’den şimdi müşterimiz olun, 1 aylık tabii Premium üyeliğinizin tadını çıkarın.",
    ],
  }),
  row("ziraat", "Qr İle Odemelerinize Toplam 100 Tl Bankkart Lira 3", {
    campaignTheme: "card",
    category: "card_campaign",
  }),
  row("ziraat", "E Ticaret Alisverislerinize Toplam 500 Tl Bankkart Lira 3", {
    campaignTheme: "card",
    category: "card_campaign",
  }),
  row("ziraat", "Giyim Ve Ayakkabi Alisverisinizde Toplam 1000 Tl Bankkart Lira 3", {
    campaignTheme: "card",
    category: "card_campaign",
    conditions: [
      "Kampanya Koşulları:8 Ağustos – 7 Eylül 2026 tarihleri arasında Ziraat Katılım Bankkart kredi kartınız ile giyim ve ayakkabı…",
    ],
  }),
  row("ziraat", "Kafe Ve Restoran Harcamalariniza Toplam 450 Tl Bankkart Lira 3", {
    campaignTheme: "card",
    category: "card_campaign",
  }),
  row("ziraat", "Kültür Sanat Harcamalarına 500 Tl Bankkart Lira", {
    campaignTheme: "card",
    category: "card_campaign",
    rewardAmountTl: 500,
    campaignEnd: "2026-09-07",
    conditions: [
      "Müze, sinema, tiyatro ve konser bileti harcamalarında alışverişten önce kampanyaya katılım gerekir.",
    ],
  }),
  row("ziraat", "Optik Alisverisinize 500 Tl Bankkart Lira 3", {
    campaignTheme: "card",
    category: "card_campaign",
  }),
  row("ziraat", "Akaryakit Harcamalariniza 400 Tl Bankkart Lira 3", {
    campaignTheme: "card",
    category: "card_campaign",
    conditions: [
      "Kampanya Koşulları:Ziraat Katılım Bankkart kredi kartınız ile anlaşmalı akaryakıt istasyonlarında 8 Ağustos - 7 Eylül 2026 tarihleri…",
    ],
  }),
  row("dunya", "Altin Kesem", {
    campaignTheme: "card",
    category: "card_campaign",
    conditions: ["Altın Kazandıran Alışveriş Dünya Katılım’da !"],
  }),
  row("albaraka", "Dijital Musterilere Ozel Pratik Finansman Kart", {
    campaignTheme: "card",
    category: "card_campaign",
    installmentCount: 12,
    conditions: ["Dijital Müşterilere Özel Pratik Finansman Kart"],
  }),
  row("dunya", "Koton %8 Nakit İade", {
    conditions: [
      "Koton mağazalarındaki uygun alışverişlerde harcamanın %8'i oranında anlık nakit iade.",
    ],
  }),
  row("dunya", "Touristica Peşin Fiyatına 9 Taksit", {
    campaignTheme: "card",
    category: "card_campaign",
    installmentCount: 9,
    conditions: [
      "Dünya Katılım Paraf ile Touristica alışverişlerinde otel ve ürüne göre 9 taksite kadar.",
    ],
  }),
  row("dunya", "Demirdöküm Vade Farksız 9 Taksit", {
    campaignTheme: "card",
    category: "card_campaign",
    installmentCount: 9,
    conditions: [
      "Demirdöküm'ün kendi POS'u üzerinden yapılan uygun işlemler için geçerlidir.",
    ],
  }),
  row("ziraat", "Okul Odemelerinizde 12 Aya Varan Taksit Firsati", {
    campaignTheme: "education",
    category: "card_campaign",
    conditions: ["Uygun eğitim/okul harcamalarında vade farksız taksit."],
  }),
  row("emlak", "Debit Kart İlk Harcamanın Yarısı Nakit İade", {
    campaignTheme: "card",
    category: "card_campaign",
    rewardAmountTl: 500,
    campaignEnd: "2026-08-31",
    conditions: [
      "Görüntülü görüşmeyle ilk defa müşteri olanların ilk Debit Kart harcamasının %50'si, en fazla 500 TL iade edilir.",
    ],
  }),
  row("vakif", "Vakıf Katılım Mastercard Eğitimde Vade Farksız 5 Taksit", {
    campaignTheme: "education",
    category: "card_campaign",
    installmentCount: 5,
    campaignEnd: "2026-12-31",
    conditions: [
      "Bireysel Vakıf Katılım Mastercard ile uygun eğitim harcamalarında geçerlidir.",
    ],
  }),
  row("ziraat", "İlk Bankkart Kredi Kartına 5.000 Tl Bankkart Lira", {
    campaignTheme: "card",
    category: "card_campaign",
    rewardAmountTl: 5000,
    campaignEnd: "2026-09-07",
    conditions: [
      "İlk kez uygun Bankkart kredi kartı alan müşterilerde harcama hedefi şartı aranır.",
    ],
  }),
  row("vakif", "Nota Çiçek'te %20 İndirim", {
    category: "discount_campaign",
    campaignEnd: "2026-12-31",
    conditions: [
      "Mobil Şube kampanyalar alanından kişiye özel kod ile Nota Çiçek alışverişinde %20 indirim.",
    ],
  }),
  row("kuveyt", "Vivensede Vade Farksiz 5 Aya Varan Taksit Firsati", {
    campaignTheme: "card",
    category: "card_campaign",
    slug: "vivensede-vade-farksiz-5-aya-varan-taksit-firsati",
  }),
  row("kuveyt", "Okula Donuste 300 Tlye Varan Altin Puan", {
    campaignTheme: "education",
    category: "card_campaign",
    slug: "okula-donuste-300-tlye-varan-altin-puan",
  }),
];

async function main() {
  const out = path.join(process.cwd(), "data", "campaign-memory-cache.json");
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(
    out,
    JSON.stringify(
      { savedAt: new Date().toISOString(), source: "live-ui-snapshot", campaigns: LIVE },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`Wrote ${LIVE.length} campaigns → ${out}`);

  const admin = process.env.ADMIN_API_KEY?.trim();
  const port = process.env.PORT || "3000";
  if (!admin) {
    console.log("ADMIN_API_KEY yok; yalnızca dosya yazıldı. Sunucuyu yeniden başlatın.");
    return;
  }
  const res = await fetch(`http://127.0.0.1:${port}/api/live/campaigns/resync`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-key": admin,
    },
    body: JSON.stringify({ campaigns: LIVE, persistCache: true }),
  });
  const text = await res.text();
  console.log("resync", res.status, text.slice(0, 500));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
