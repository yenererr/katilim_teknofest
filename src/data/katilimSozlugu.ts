/**
 * Katılım finansı terminoloji sözlüğü.
 * Geleneksel bankacılık ifadesi → katılım karşılığı + denklik seviyesi.
 */

export type DenkllikSeviyesi =
  | "denk"
  | "buyuk_olcude_denk"
  | "kismen_denk"
  | "denk_degil";

export type KatilimSozlukKaydi = {
  geleneksel: string;
  katilim: string;
  denklik: DenkllikSeviyesi;
  aciklama: string;
  /** NLP / şema alanı (varsa) */
  alan?: string;
  /** Metinde aranacak ek kökler */
  varyantlar?: string[];
  /** Metin çıkarımında konvansiyonel → katılım eşlemesi yapılsın mı */
  eslemeAktif?: boolean;
};

export const DENKLIK_ETIKET: Record<DenkllikSeviyesi, string> = {
  denk: "Denk",
  buyuk_olcude_denk: "Büyük ölçüde denk",
  kismen_denk: "Kısmen denk",
  denk_degil: "Denk değil",
};

export const KATILIM_SOZLUGU: KatilimSozlukKaydi[] = [
  {
    geleneksel: "kredi",
    katilim: "finansman",
    denklik: "kismen_denk",
    aciklama:
      "Her ikisi de müşterinin fon ihtiyacının karşılanmasına yöneliktir; ancak katılım finansında finansman işleminin dayandığı sözleşme ve varlık ilişkisi farklı olabilir.",
    alan: "urun_turu",
    varyantlar: ["kredi kullanımı"],
    eslemeAktif: true,
  },
  {
    geleneksel: "kredi kullandırma",
    katilim: "finansman sağlama / kullandırma",
    denklik: "buyuk_olcude_denk",
    aciklama:
      "İşlevsel olarak benzer olmakla birlikte finansmanın türüne göre murabaha, icâre, müşâreke vb. farklı akitler söz konusu olabilir.",
    alan: "urun_turu",
    eslemeAktif: true,
  },
  {
    geleneksel: "kredi sözleşmesi",
    katilim: "finansman sözleşmesi / akdi",
    denklik: "kismen_denk",
    aciklama:
      "Her ikisi tarafların hak ve yükümlülüklerini belirler; ancak katılım finansında sözleşmenin türü işlemin niteliğini belirleyen temel unsurlardan biridir.",
    alan: "urun_turu",
    eslemeAktif: true,
  },
  {
    geleneksel: "kredi borcu",
    katilim: "finansman borcu / ödeme yükümlülüğü",
    denklik: "kismen_denk",
    aciklama:
      "Müşterinin kuruma karşı ödeme yükümlülüğü bulunur; ancak bu yükümlülüğün hukuki ve ekonomik kaynağı kredi faizinden farklı olabilir.",
    alan: "urun_turu",
    eslemeAktif: true,
  },
  {
    geleneksel: "anapara",
    katilim: "finanse edilen tutar / satış bedeli / kira bedeli vb.",
    denklik: "denk_degil",
    aciklama:
      "Katılım finansında her işlemde klasik anlamda anapara-faiz ilişkisi bulunmaz. İşlemin türüne göre farklı parasal yükümlülükler ortaya çıkar.",
    alan: "tutar",
    eslemeAktif: true,
  },
  {
    geleneksel: "faiz",
    katilim: "kâr / kâr payı / kâr marjı",
    denklik: "denk_degil",
    aciklama:
      "Kâr, kâr payı veya kâr marjı kavramları faizle aynı hukuki ve iktisadi niteliğe sahip değildir.",
    alan: "kar_payi_orani",
    varyantlar: ["faizli"],
    eslemeAktif: true,
  },
  {
    geleneksel: "faiz oranı",
    katilim: "kâr oranı / kâr marjı / getiri oranı",
    denklik: "kismen_denk",
    aciklama:
      "Müşterinin maliyetini veya kurumun beklenen getirisini ifade etme bakımından benzer kullanılabilir; ancak hesaplama ve akdi dayanakları farklı olabilir.",
    alan: "kar_payi_orani",
    varyantlar: ["faiz orani", "faiz indirimi"],
    eslemeAktif: true,
  },
  {
    geleneksel: "faiz geliri",
    katilim: "kâr geliri / ticari kâr / kira geliri",
    denklik: "denk_degil",
    aciklama:
      "Katılım finansında gelir, işlemin niteliğine göre mal satışından, kiralamadan veya ortaklıktan doğabilir.",
    alan: "kar_payi_orani",
    eslemeAktif: true,
  },
  {
    geleneksel: "faiz gideri",
    katilim: "finansman maliyeti / kâr payı gideri",
    denklik: "denk_degil",
    aciklama:
      "Özellikle katılım fonlarının maliyetinin ifade edilmesinde kullanılabilir; ancak geleneksel faiz gideriyle hukuki açıdan özdeş değildir.",
    alan: "kar_payi_orani",
    eslemeAktif: true,
  },
  {
    geleneksel: "borç veren",
    katilim: "finansman sağlayan katılım finans kuruluşu",
    denklik: "kismen_denk",
    aciklama:
      "Katılım finans kuruluşu yalnızca klasik anlamda borç veren konumunda olmayabilir; satıcı, kiraya veren veya ortak olarak da işlemde yer alabilir.",
    alan: "urun_turu",
    eslemeAktif: true,
  },
  {
    geleneksel: "borç alan",
    katilim: "finansman müşterisi",
    denklik: "buyuk_olcude_denk",
    aciklama:
      'Her ikisi de finansman ihtiyacını karşılayan taraftır. Ancak katılım finansında müşteri her işlemde "borç alan" konumunda değildir.',
    alan: "urun_turu",
    varyantlar: ["kredi müşterisi", "kredi musterisi"],
    eslemeAktif: true,
  },
  {
    geleneksel: "kredi faizi",
    katilim: "kâr marjı / kâr payı / kira bedeli",
    denklik: "denk_degil",
    aciklama:
      "Bunlar müşterinin yaptığı toplam ödemeyi etkileyebilir; ancak ekonomik ve sözleşmesel kaynakları farklıdır.",
    alan: "kar_payi_orani",
    eslemeAktif: true,
  },
  {
    geleneksel: "kredi taksiti",
    katilim: "finansman taksiti / dönemsel ödeme",
    denklik: "buyuk_olcude_denk",
    aciklama: "Müşterinin belirli dönemlerde yaptığı ödemeyi ifade eder.",
    alan: "taksit_sayisi",
    eslemeAktif: true,
  },
  {
    geleneksel: "kredi vadesi",
    katilim: "finansman vadesi",
    denklik: "denk",
    aciklama:
      "Finansmanın başlangıcı ile sona ermesi arasındaki süreyi ifade eder.",
    alan: "vade_ay",
    eslemeAktif: true,
  },
  {
    geleneksel: "kredi limiti",
    katilim: "finansman limiti",
    denklik: "buyuk_olcude_denk",
    aciklama: "Müşteriye tahsis edilen azami finansman tutarını ifade eder.",
    alan: "tutar",
    eslemeAktif: true,
  },
  {
    geleneksel: "kredi değerlendirmesi",
    katilim: "finansman değerlendirmesi",
    denklik: "buyuk_olcude_denk",
    aciklama:
      "Müşterinin ödeme gücü, risk profili ve finansmana uygunluğunun değerlendirilmesini ifade eder.",
    alan: "urun_turu",
    varyantlar: ["kredi degerlendirmesi"],
    eslemeAktif: true,
  },
  {
    geleneksel: "kredi riski",
    katilim: "finansman riski",
    denklik: "kismen_denk",
    aciklama:
      "Her ikisinde de müşterinin yükümlülüğünü yerine getirememe riski vardır; ancak katılım finansında işlem türüne bağlı farklı riskler de ortaya çıkar.",
    alan: "urun_turu",
    eslemeAktif: true,
  },
  {
    geleneksel: "teminat",
    katilim: "teminat",
    denklik: "denk",
    aciklama:
      "Rehin, ipotek, kefalet vb. teminat mekanizmaları her iki sistemde de kullanılabilir.",
    alan: "urun_turu",
    eslemeAktif: false,
  },
  {
    geleneksel: "kredi geri ödemesi",
    katilim: "finansman ödemesi / taksit ödemesi",
    denklik: "buyuk_olcude_denk",
    aciklama:
      "Müşterinin finansman işleminden doğan yükümlülüğünü yerine getirmesidir.",
    alan: "taksit_sayisi",
    varyantlar: ["kredi geri odemesi"],
    eslemeAktif: true,
  },
  {
    geleneksel: "kredi tahsisi",
    katilim: "finansman tahsisi",
    denklik: "buyuk_olcude_denk",
    aciklama: "Kuruluşun müşteriye finansman sağlama kararını ifade eder.",
    alan: "tahsis_ucreti",
    eslemeAktif: true,
  },
  {
    geleneksel: "mevduat",
    katilim: "katılma hesabı",
    denklik: "denk_degil",
    aciklama:
      "Mevduatta önceden belirlenmiş faiz esaslı getiri söz konusu olabilirken katılma hesabında kâr-zarar paylaşımı esastır.",
    alan: "urun_turu",
    varyantlar: ["vadeli mevduat", "mevduat hesabı", "mevduat hesabi"],
    eslemeAktif: true,
  },
  {
    geleneksel: "mevduat faizi",
    katilim: "kâr payı",
    denklik: "denk_degil",
    aciklama:
      "Her ikisi de müşteriye getiri sağlayabilir; ancak getirinin oluşumu, hesaplanması ve sözleşmesel niteliği farklıdır.",
    alan: "kar_payi_orani",
    eslemeAktif: true,
  },
  {
    geleneksel: "faizli kredi",
    katilim: "murabaha finansmanı",
    denklik: "denk_degil",
    aciklama:
      "Murabaha, belirli bir malın maliyetine kâr eklenerek vadeli satılması esasına dayanır; klasik faizli krediyle aynı akit değildir.",
    alan: "urun_turu",
    eslemeAktif: true,
  },
  {
    geleneksel: "tüketici kredisi",
    katilim: "bireysel finansman",
    denklik: "kismen_denk",
    aciklama:
      "Müşterinin bireysel ihtiyacının finansmanına yöneliktir; ancak katılım finansında kullanılan akit farklı olabilir.",
    alan: "urun_turu",
    varyantlar: ["tuketici kredisi", "ihtiyaç kredisi", "ihtiyac kredisi"],
    eslemeAktif: true,
  },
  {
    geleneksel: "taşıt kredisi",
    katilim: "taşıt finansmanı",
    denklik: "buyuk_olcude_denk",
    aciklama:
      "Amaç bakımından benzerdir; ancak katılım finansmanında işlem, örneğin malın alınıp müşteriye vadeli satılması şeklinde yapılandırılabilir.",
    alan: "urun_turu",
    varyantlar: ["tasit kredisi", "araç kredisi", "arac kredisi"],
    eslemeAktif: true,
  },
  {
    geleneksel: "konut kredisi",
    katilim: "konut finansmanı",
    denklik: "buyuk_olcude_denk",
    aciklama:
      "Konut ediniminin finansmanı bakımından benzerdir; hukuki ve sözleşmesel yapı farklıdır.",
    alan: "urun_turu",
    eslemeAktif: true,
  },
  {
    geleneksel: "ticari kredi",
    katilim: "ticari finansman",
    denklik: "buyuk_olcude_denk",
    aciklama: "İşletmelerin finansman ihtiyacının karşılanmasına yöneliktir.",
    alan: "urun_turu",
    eslemeAktif: true,
  },
  {
    geleneksel: "kredi faiz oranı",
    katilim: "finansman kâr oranı / kâr marjı",
    denklik: "kismen_denk",
    aciklama:
      "Müşteri açısından maliyet karşılaştırması yapılabilir; ancak iki kavramın hukuki ve sözleşmesel niteliği aynı değildir.",
    alan: "kar_payi_orani",
    varyantlar: ["kredi faiz orani"],
    eslemeAktif: true,
  },
  // Mevcut ajan eşlemeleri (sözlükte yok ama çıkarım için kritik)
  {
    geleneksel: "dosya masrafı",
    katilim: "tahsis ücreti",
    denklik: "kismen_denk",
    aciklama:
      "Dosya / işlem masrafı katılım finansında çoğunlukla tahsis ücreti olarak ifade edilir; kampanyalarda sıfırlanabilir.",
    alan: "tahsis_ucreti",
    varyantlar: ["dosya masrafi", "dosya ücreti", "dosya ucreti", "masraf"],
    eslemeAktif: true,
  },
  {
    geleneksel: "kart puanı",
    katilim: "ödül",
    denklik: "kismen_denk",
    aciklama:
      "Kart puanı / bonus gibi konvansiyonel ödül ifadeleri katılım finansında ödül olarak normalize edilir.",
    alan: "odul",
    varyantlar: ["kart puani", "bonus puan", "puan kazanımı", "puan kazanimi"],
    eslemeAktif: true,
  },
];
