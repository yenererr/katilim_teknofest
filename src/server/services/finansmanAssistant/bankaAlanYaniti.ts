/**
 * Tek bankaya ait alan sorgusu yanıtı.
 * "X'in konut finansmanı oranı ne?" → oran + varsa vade/masraf/ödül cümlesi.
 */

import type {
  BankaAdayi,
  KarsilastirmaBoyutu,
} from "../tools/cokBoyutluKarsilastirma";

const SESLI = "aeıioöuüAEIİOÖUÜ";

/** Türkçe ilgi (genitive) eki: "Kuveyt Türk'ün", "Albaraka'nın" */
export function iyelikEki(ad: string): string {
  const harfler = [...ad.trim()];
  let sonSesli = "";
  for (let i = harfler.length - 1; i >= 0; i--) {
    if (SESLI.includes(harfler[i])) {
      sonSesli = harfler[i].toLocaleLowerCase("tr-TR");
      break;
    }
  }
  const sonHarf = harfler[harfler.length - 1] ?? "";
  const sesliBitis = SESLI.includes(sonHarf);

  let ek: string;
  if (sonSesli === "a" || sonSesli === "ı") ek = "ın";
  else if (sonSesli === "e" || sonSesli === "i") ek = "in";
  else if (sonSesli === "o" || sonSesli === "u") ek = "un";
  else if (sonSesli === "ö" || sonSesli === "ü") ek = "ün";
  else ek = "in";

  return sesliBitis ? `'n${ek}` : `'${ek}`;
}

const trSayi = (n: number, ondalik = 2) =>
  n.toLocaleString("tr-TR", {
    minimumFractionDigits: ondalik,
    maximumFractionDigits: ondalik,
  });

const tlBicim = (n: number) =>
  `${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TL`;

export type AlanYanitiSonucu = {
  mesaj: string;
  /** En az bir alan gerçek veriyle cevaplandı mı? */
  cevaplandi: boolean;
  eksikAlanlar: KarsilastirmaBoyutu[];
};

export function bankaAlanMesaji(opts: {
  aday: BankaAdayi;
  urunEtiketi: string;
  /** Kullanıcının açıkça sorduğu alanlar; eksikse rapor edilir */
  alanlar: KarsilastirmaBoyutu[];
  /** Verisi varsa eklenen, yoksa sessizce atlanan alanlar */
  ekAlanlar?: KarsilastirmaBoyutu[];
  varsayimlar?: string[];
  tutarTl?: number | null;
}): AlanYanitiSonucu {
  const { aday, urunEtiketi } = opts;
  const sorulan = opts.alanlar.length
    ? opts.alanlar
    : (["kar_payi", "vade"] as KarsilastirmaBoyutu[]);
  const ek = (opts.ekAlanlar ?? []).filter((a) => !sorulan.includes(a));
  const alanlar = [...sorulan, ...ek];

  const ad = aday.bankName;
  const urun = urunEtiketi.toLocaleLowerCase("tr-TR");
  const cumleler: string[] = [];
  const eksikAlanlar: KarsilastirmaBoyutu[] = [];

  // Ana cümle: sorulan ilk alan
  if (alanlar.includes("kar_payi")) {
    if (aday.aylikKarPayiOrani != null) {
      cumleler.push(
        `${ad}${iyelikEki(ad)} ${urun} kâr payı oranı **%${trSayi(
          aday.aylikKarPayiOrani * 100,
        )}** (aylık) olarak sunulmaktadır.`,
      );
    } else {
      eksikAlanlar.push("kar_payi");
    }
  }

  if (alanlar.includes("vade")) {
    if (aday.azamiVadeAy != null) {
      const bas = cumleler.length ? "Ayrıca bu üründe" : `${ad}${iyelikEki(ad)} ${urun} ürününde`;
      cumleler.push(`${bas} **${aday.azamiVadeAy} aya kadar** vade imkânı bulunmaktadır.`);
    } else {
      eksikAlanlar.push("vade");
    }
  }

  if (alanlar.includes("masraf")) {
    if (aday.masrafMuafiyetiTl != null) {
      cumleler.push(
        `Masraf tarafında **${tlBicim(aday.masrafMuafiyetiTl)}'ye kadar dosya masrafı alınmamaktadır**.`,
      );
    } else if (aday.masrafTl != null) {
      cumleler.push(
        aday.masrafTl === 0
          ? `Bu üründe tahsis/dosya masrafı alınmamaktadır.`
          : `Tahsis ücreti **${tlBicim(aday.masrafTl)}** olarak hesaplanmaktadır.`,
      );
    } else if (aday.masrafOrani != null) {
      cumleler.push(
        `Tahsis ücreti finansman tutarının **binde ${trSayi(
          aday.masrafOrani * 1000,
          0,
        )}** oranındadır.`,
      );
    } else {
      eksikAlanlar.push("masraf");
    }
  }

  if (alanlar.includes("odul")) {
    if (aday.odulAciklamasi) {
      cumleler.push(`Kampanya ek ödülü: **${aday.odulAciklamasi}**.`);
    } else if (aday.odulTl != null) {
      cumleler.push(`Kampanya ek ödülü **${tlBicim(aday.odulTl)}** değerindedir.`);
    } else {
      eksikAlanlar.push("odul");
    }
  }

  // Fırsatçı ek alanların eksikliği kullanıcıya rapor edilmez.
  const raporlanacakEksikler = eksikAlanlar.filter((a) => sorulan.includes(a));
  eksikAlanlar.length = 0;
  eksikAlanlar.push(...raporlanacakEksikler);

  const cevaplandi = cumleler.length > 0;

  if (!cevaplandi) {
    return {
      mesaj:
        `${ad} için ${urun} kaleminde doğrulanmış veri bulamadım. ` +
        `Tutar ve vade yazarsanız bankanın kendi hesaplama aracından canlı oran çekebilirim — ` +
        `örneğin “${ad} 500.000 TL ${urun}, 36 ay”.`,
      cevaplandi: false,
      eksikAlanlar,
    };
  }

  const parcalar = [cumleler.join(" ")];

  if (eksikAlanlar.length) {
    const etiket: Record<KarsilastirmaBoyutu, string> = {
      kar_payi: "kâr payı oranı",
      vade: "azami vade",
      masraf: "masraf bilgisi",
      odul: "ek ödül bilgisi",
    };
    parcalar.push(
      `Doğrulanmış kaynakta ${eksikAlanlar
        .map((a) => etiket[a])
        .join(", ")} yer almıyor; bu kalem için bankadan teklif alınmalı.`,
    );
  }

  if (opts.varsayimlar?.length) {
    parcalar.push(opts.varsayimlar.map((v) => `_${v}_`).join("\n"));
  }

  return { mesaj: parcalar.join("\n\n"), cevaplandi: true, eksikAlanlar };
}
