/**
 * Terminoloji yanıtları.
 *
 * "Kâr payı nedir", "faizle farkı ne", "murabaha ne demek" gibi sorular
 * banka personelinin ve müşterinin en sık sorduğu kategorilerden biri.
 * Elimizde doğrulanmış bir sözlük varken bunları LLM'e göndermek hem
 * yavaş hem de uydurma riski taşıyor; doğrudan sözlükten yanıtlanır.
 */

import {
  DENKLIK_ETIKET,
  KATILIM_SOZLUGU,
  type KatilimSozlukKaydi,
} from "../../../data/katilimSozlugu";
import { asciiKatla } from "../../../nlp/normalize";
import { bankaBul } from "./bankDirectory";

/** Sözlükte karşılığı olmayan ama sık sorulan katılım finansı kavramları. */
export const EK_KAVRAMLAR: Array<{
  terim: string;
  varyantlar: string[];
  aciklama: string;
}> = [
  {
    terim: "Murabaha",
    varyantlar: ["murabaha", "murabahe"],
    aciklama:
      "Katılım bankasının müşterinin talep ettiği malı satıcıdan peşin alıp, " +
      "üzerine kâr payı ekleyerek müşteriye vadeli satmasıdır. Kâr payı " +
      "sözleşmede baştan belirlenir ve vade boyunca değişmez.",
  },
  {
    terim: "Mudarebe",
    varyantlar: ["mudarebe", "mudaraba"],
    aciklama:
      "Bir tarafın sermaye, diğer tarafın emek ve işletmecilik koyduğu " +
      "ortaklıktır. Kâr önceden belirlenen orana göre paylaşılır; zarar, " +
      "emek sahibinin kusuru yoksa sermaye sahibine aittir. Katılma " +
      "hesaplarının dayandığı temel modeldir.",
  },
  {
    terim: "Müşareke",
    varyantlar: ["musareke", "musaraka", "muşareke"],
    aciklama:
      "Tarafların birlikte sermaye koyduğu ortaklıktır. Kâr anlaşılan orana, " +
      "zarar ise sermaye payına göre paylaşılır.",
  },
  {
    terim: "İcara",
    varyantlar: ["icara", "icare", "ijara"],
    aciklama:
      "Kiralama esaslı finansman yöntemidir. Katılım bankası varlığı satın " +
      "alıp müşteriye kiralar; sözleşmeye göre vade sonunda mülkiyet " +
      "müşteriye geçebilir (finansal kiralama).",
  },
  {
    terim: "Selem",
    varyantlar: ["selem"],
    aciklama:
      "Bedeli peşin ödenen, teslimi ileri tarihte yapılan satış sözleşmesidir. " +
      "Genellikle tarım ve üretim finansmanında kullanılır.",
  },
  {
    terim: "Tekafül",
    varyantlar: ["tekaful", "tekafül"],
    aciklama:
      "Katılım sigortacılığıdır. Katılımcıların oluşturduğu risk fonundan " +
      "dayanışma esasıyla tazminat ödenir.",
  },
  {
    terim: "Katılma hesabı",
    varyantlar: ["katilma hesabi", "katilim hesabi"],
    aciklama:
      "Vadeli mevduatın katılım bankacılığındaki karşılığıdır. Önceden sabit " +
      "getiri taahhüt edilmez; toplanan fonların işletilmesinden doğan kâr " +
      "veya zarar, belirlenen katılım oranına göre paylaşılır.",
  },
  {
    terim: "Katılım bankacılığı",
    varyantlar: ["katilim bankaciligi", "faizsiz bankacilik"],
    aciklama:
      "Faiz yerine kâr-zarar ortaklığı, alım-satım ve kiralama gibi ticari " +
      "işlemlere dayanan bankacılık modelidir. Fonlar faiz karşılığı değil, " +
      "gerçek bir mal veya hizmet ilişkisi üzerinden kullandırılır.",
  },
  {
    terim: "Kâr payı oranı",
    varyantlar: [
      "kar payi orani",
      "kâr payı oranı",
      "kar pay orani",
      "kar payi ne demek",
    ],
    aciklama:
      "Katılım bankacılığında faiz yerine kullanılan orandır. Finansman " +
      "işlemine konu olan mal veya hizmetin peşin alım fiyatı ile müşteriye " +
      "vadeli satış fiyatı arasındaki farktan doğan kâr payını ifade eder. " +
      "Sözleşmede baştan belirlenir; bir borç üzerinden değil, gerçek bir " +
      "alım-satım ilişkisi üzerinden oluşur.",
  },
  {
    terim: "Finansman maliyeti",
    varyantlar: [
      "finansman maliyeti",
      "toplam maliyet",
      "toplam geri odeme",
      "toplam geri ödeme",
    ],
    aciklama:
      "Kullandırılan finansman kapsamında oluşan toplam geri ödeme tutarını " +
      "ve müşterinin katlandığı toplam maliyeti ifade eder. Kâr payının yanı " +
      "sıra tahsis ücreti, dosya masrafı, sigorta ve benzeri kalemleri de " +
      "kapsar; bu nedenle yalnızca kâr payı oranına bakmak yeterli değildir.",
  },
  {
    terim: "Katılım fonu",
    varyantlar: ["katilim fonu", "katılım fonu"],
    aciklama:
      "Katılım bankacılığı prensiplerine uygun olarak değerlendirilen ve fon " +
      "sahipleri ile banka arasında kâr-zarar paylaşımına dayanan hesap " +
      "türünü ifade eder. Geleneksel bankacılıktaki mevduatın karşılığıdır, " +
      "ancak önceden sabit bir getiri taahhüdü içermez.",
  },
  {
    terim: "Masrafsız finansman",
    varyantlar: [
      "masrafsiz finansman",
      "masrafsız finansman",
      "masrafsiz",
      "dosya masrafi yok",
    ],
    aciklama:
      "Finansman işlemi kapsamında tahsis ücreti, dosya masrafı veya benzeri " +
      "ek maliyetlerin uygulanmadığı finansman türünü ifade eder. Kâr payı " +
      "oranı aynı olsa bile masrafsız finansman, toplam maliyeti düşürdüğü " +
      "için müşteri lehinedir.",
  },
  {
    terim: "Avantajlı finansman",
    varyantlar: [
      "avantajli finansman",
      "avantajlı finansman",
      "avantajli kar payi",
      "ozel oranli finansman",
      "dusuk maliyetli finansman",
    ],
    aciklama:
      "Standart finansman koşullarına göre daha uygun maliyet, kâr payı oranı " +
      "veya ek fayda sunan kampanyalı finansman ürününü ifade eder. " +
      "Kampanya metinlerinde çoğu zaman sayısal bir oran verilmeden " +
      "\"avantajlı kâr payı fırsatı\", \"özel oranlı finansman\" veya " +
      "\"düşük maliyetli finansman\" gibi niteliksel ifadelerle geçer.",
  },
];

export type SozlukYaniti = {
  message: string;
  terim: string;
};

function kayitMetni(k: KatilimSozlukKaydi): string {
  return (
    `**${k.geleneksel}** → **${k.katilim}**\n\n` +
    `${k.aciklama}\n\n` +
    `Denklik: ${DENKLIK_ETIKET[k.denklik]}.`
  );
}

/**
 * Terminoloji sorusu mu? Soru kalıbı varsa ve bilinen bir terim geçiyorsa
 * sözlükten yanıtlanır.
 */
export function sozluktenYanitla(mesaj: string): SozlukYaniti | null {
  const t = asciiKatla(mesaj);

  const soruKalibi =
    /(nedir|ne demek|ne anlama|aciklar misin|anlat|farki|fark[iı]? ne|nasil calisir|tanimi)/.test(
      t,
    );
  if (!soruKalibi) return null;

  // Belirli bir banka soruluyorsa bu bir terim sorusu değil, veri
  // sorusudur. Sözlük devreye girerse "Kuveyt Türk araç finansmanı vade
  // üst sınırı nedir" sorusuna "kredi → finansman" tanımı dönüyordu.
  if (bankaBul(mesaj)) return null;

  // Önce ek kavramlar: bunlar katılım finansına özgü ve daha spesifik.
  for (const kavram of EK_KAVRAMLAR) {
    if (kavram.varyantlar.some((v) => t.includes(asciiKatla(v)))) {
      return {
        terim: kavram.terim,
        message: `**${kavram.terim}**\n\n${kavram.aciklama}`,
      };
    }
  }

  // "faiz ile kâr payı farkı" gibi karşılaştırma soruları
  if (/(faiz)/.test(t) && /(kar pay|kar orani)/.test(t)) {
    const faiz = KATILIM_SOZLUGU.find((k) => k.geleneksel === "faiz");
    if (faiz) {
      return {
        terim: "Faiz / kâr payı",
        message:
          `**Faiz** ile **kâr payı** aynı şey değildir.\n\n` +
          `${faiz.aciklama}\n\n` +
          `Katılım finansındaki karşılığı: ${faiz.katilim}. ` +
          `Denklik: ${DENKLIK_ETIKET[faiz.denklik]}.`,
      };
    }
  }

  // Sözlükte geçen terimler — en uzun eşleşme kazanır ki "kredi" araması
  // "kredi sözleşmesi" kaydını gölgede bırakmasın.
  let enIyi: { kayit: KatilimSozlukKaydi; uzunluk: number } | null = null;
  for (const kayit of KATILIM_SOZLUGU) {
    const adaylar = [
      kayit.geleneksel,
      kayit.katilim,
      ...(kayit.varyantlar || []),
    ];
    for (const aday of adaylar) {
      const norm = asciiKatla(aday);
      if (norm.length < 4 || !t.includes(norm)) continue;
      if (!enIyi || norm.length > enIyi.uzunluk) {
        enIyi = { kayit, uzunluk: norm.length };
      }
    }
  }

  if (!enIyi) return null;
  return {
    terim: enIyi.kayit.katilim,
    message: kayitMetni(enIyi.kayit),
  };
}
