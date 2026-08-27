/** Kampanya kaydından tek cümlelik kısa özet (UI / asistan ortak). */

function kisaltMetin(metin: string, max = 140): string {
  const temiz = metin.replace(/\s+/g, " ").trim();
  if (temiz.length <= max) return temiz;
  const kes = temiz.slice(0, max - 1);
  const sonBosluk = kes.lastIndexOf(" ");
  return `${(sonBosluk > 80 ? kes.slice(0, sonBosluk) : kes).trim()}…`;
}

function asciiKatla(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

export type KampanyaOzetKaynak = {
  title?: string | null;
  productName?: string | null;
  conditions?: string[] | null;
  evidence?: Array<string | { text?: unknown; field?: unknown }> | null;
  installmentCount?: number | null;
  maxTermMonths?: number | null;
  minAmountTl?: number | null;
  maxAmountTl?: number | null;
  rewardAmountTl?: number | null;
  rewardType?: string | null;
  participationMethod?: string | null;
};

/** Koşul / kanıt / yapılandırılmış alan veya başlık ipucundan kısa açıklama. */
export function kisaKampanyaAciklama(c: KampanyaOzetKaynak): string | null {
  const conditions = Array.isArray(c.conditions)
    ? c.conditions.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  if (conditions[0]) return kisaltMetin(conditions[0]);

  const evidence = Array.isArray(c.evidence) ? c.evidence : [];
  for (const ev of evidence) {
    if (typeof ev === "string" && ev.trim()) return kisaltMetin(ev);
    if (ev && typeof ev === "object" && "text" in ev) {
      const t = String(ev.text || "").trim();
      if (t) return kisaltMetin(t);
    }
  }

  const parts: string[] = [];
  const taksit = c.installmentCount ?? c.maxTermMonths;
  if (taksit != null && Number(taksit) > 0) {
    parts.push(`vade farksız ${Number(taksit)} taksit`);
  }
  const minTl = c.minAmountTl != null ? Number(c.minAmountTl) : null;
  const maxTl = c.maxAmountTl != null ? Number(c.maxAmountTl) : null;
  if (minTl != null && maxTl != null && !Number.isNaN(minTl) && !Number.isNaN(maxTl)) {
    parts.push(
      `${minTl.toLocaleString("tr-TR")}–${maxTl.toLocaleString("tr-TR")} TL arası`,
    );
  } else if (maxTl != null && !Number.isNaN(maxTl)) {
    parts.push(`${maxTl.toLocaleString("tr-TR")} TL'ye kadar`);
  }
  if (c.rewardAmountTl != null && !Number.isNaN(Number(c.rewardAmountTl))) {
    const tip = String(c.rewardType || "ödül").trim();
    parts.push(`${Number(c.rewardAmountTl).toLocaleString("tr-TR")} TL ${tip}`);
  }
  if (c.participationMethod) {
    parts.push(String(c.participationMethod).trim());
  }
  if (parts.length) return kisaltMetin(parts.join("; "));

  const baslik = asciiKatla(String(c.title || c.productName || ""));
  if (/kirtasiye/.test(baslik) && /taksit/.test(baslik)) {
    return "Uygun kırtasiye harcamalarında vade farksız taksit.";
  }
  if (/egitim|okul/.test(baslik) && /taksit/.test(baslik)) {
    return "Uygun eğitim/okul harcamalarında vade farksız taksit.";
  }
  if (/okula\s*don/.test(baslik)) {
    return "Okula dönüş dönemine özel kart/kampanya avantajı.";
  }
  if (/vade\s*farksiz/.test(baslik)) {
    return "Seçili harcamalarda vade farksız taksit veya finansman desteği.";
  }
  if (/davet/.test(baslik)) {
    return "Arkadaş davetiyle puan veya nakit ödül kampanyası.";
  }
  if (/finansman\s*kampanya/.test(baslik)) {
    return "Güncel finansman oran ve vade avantajları.";
  }
  if (/umre|hac/.test(baslik)) {
    return "Hac / umre harcamalarına özel taksit veya finansman kampanyası.";
  }
  if (/yeni\s*musteri|hos\s*geldin/.test(baslik)) {
    return "Yeni müşterilere özel oran, puan veya finansman avantajı.";
  }
  return null;
}
