/**
 * Bir alanın gold veri setinde nerede hata yaptığını tek tek listeler.
 *
 *   npm run eval:diagnose -- kar_payi_orani
 *   npm run eval:diagnose -- hedef_kitle --set=set_round1
 *   npm run eval:diagnose -- finansman_tutari --tur=uydurma
 *
 * Hata üç türe ayrılır:
 *   kacirma  — gold'da değer var, sistem susmuş (recall kaybı)
 *   yanlis   — sistem değer üretmiş ama gold'dakinden farklı
 *   uydurma  — gold "bu alan metinde yok" demiş, sistem yine de üretmiş
 *              (precision kaybı; en ciddi hata türü)
 *
 * Ölçüm raporu (`npm run eval:gold`) hangi alanın zayıf olduğunu söyler;
 * bu betik o alanın NEDEN zayıf olduğunu gösterir. Yöntem için:
 * docs/ALAN-IYILESTIRME-YONTEMI.md
 */

import { loadGoldDataset, type GoldKayit } from "../src/server/services/eval/goldDataset";
import {
  OLCULEN_ALANLAR,
  degerUyusuyorMu,
  tahminleriUret,
  type OlculenAlan,
} from "../src/server/services/eval/goldEvaluator";

type HataTuru = "kacirma" | "yanlis" | "uydurma";

function arg(ad: string): string | null {
  const bulunan = process.argv.find((a) => a.startsWith(`--${ad}=`));
  return bulunan ? bulunan.split("=").slice(1).join("=") : null;
}

function kisalt(metin: string | null | undefined, n: number): string {
  if (!metin) return "(yok)";
  const tek = metin.replace(/\s+/g, " ").trim();
  return tek.length > n ? `${tek.slice(0, n)}…` : tek;
}

/** Kaydın metninde alanın gold span'inin geçtiği yerin çevresi. */
function spanCevresi(kayit: GoldKayit, alan: OlculenAlan): string {
  const span = kayit.fieldSpans[alan];
  if (!span) return "(span etiketlenmemiş)";
  return kisalt(span, 220);
}

function main(): void {
  const alan = process.argv[2] as OlculenAlan | undefined;
  if (!alan || !OLCULEN_ALANLAR.includes(alan)) {
    console.error(
      `Kullanım: npm run eval:diagnose -- <alan>\n\nAlanlar:\n  ${OLCULEN_ALANLAR.join("\n  ")}`,
    );
    process.exit(1);
  }

  const setFiltre = arg("set");
  const turFiltre = arg("tur") as HataTuru | null;
  const limit = Number(arg("limit") ?? 20);

  const kayitlar = loadGoldDataset().filter(
    (k) => !setFiltre || k.setGroup === setFiltre,
  );

  const sayac: Record<HataTuru, number> = { kacirma: 0, yanlis: 0, uydurma: 0 };
  let dogru = 0;
  let dogruSusma = 0;
  let gosterilen = 0;

  for (const kayit of kayitlar) {
    const goldVar = Object.prototype.hasOwnProperty.call(kayit.fields, alan);
    const goldYok = kayit.absentFields.includes(alan);
    // Ne değer ne de "yok" etiketi varsa kayıt bu alan için ölçüme girmez.
    if (!goldVar && !goldYok) continue;

    const tahmin = tahminleriUret(kayit.text)[alan];

    let tur: HataTuru | null = null;
    if (goldVar && !tahmin) tur = "kacirma";
    else if (goldVar && tahmin && !degerUyusuyorMu(alan, tahmin.deger, kayit.fields[alan])) {
      tur = "yanlis";
    } else if (!goldVar && tahmin) tur = "uydurma";
    else if (goldVar) dogru += 1;
    else dogruSusma += 1;

    if (!tur) continue;
    sayac[tur] += 1;
    if (turFiltre && tur !== turFiltre) continue;
    if (gosterilen >= limit) continue;
    gosterilen += 1;

    const etiketler = [kayit.setGroup, ...(kayit.hard ? ["zor"] : []), ...kayit.hardTags];
    console.log(`\n[${tur.toUpperCase()}] ${kayit.id.slice(0, 64)}`);
    console.log(`  küme    : ${etiketler.join(", ")}`);
    if (goldVar) console.log(`  gold    : ${JSON.stringify(kayit.fields[alan])}`);
    if (tahmin) console.log(`  tahmin  : ${JSON.stringify(tahmin.deger)}`);
    console.log(`  gold span : ${spanCevresi(kayit, alan)}`);
    if (tahmin) console.log(`  bizim kanıt: ${kisalt(tahmin.kanit, 220)}`);
  }

  const toplamHata = sayac.kacirma + sayac.yanlis + sayac.uydurma;
  console.log(
    `\n=== ${alan}${setFiltre ? ` (${setFiltre})` : ""}\n` +
      `    doğru değer      : ${dogru}\n` +
      `    doğru susma      : ${dogruSusma}\n` +
      `    kaçırma          : ${sayac.kacirma}\n` +
      `    yanlış değer     : ${sayac.yanlis}\n` +
      `    uydurma          : ${sayac.uydurma}\n` +
      `    toplam hata      : ${toplamHata}`,
  );
  if (gosterilen < toplamHata && !turFiltre) {
    console.log(`    (${toplamHata - gosterilen} hata daha var; --limit ile artırın)`);
  }
}

main();
