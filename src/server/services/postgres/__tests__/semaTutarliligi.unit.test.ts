import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * Şema sürüklenmesi (drift) koruması.
 *
 * Şema iki yerde tanımlı: `migrations/*.sql` (mevcut kuruluma elle
 * uygulanır) ve `store.ts` içindeki inline `CREATE TABLE` (boş bir
 * veritabanında uygulamayı ayağa kaldırır). İkisi ayrışırsa hata sessiz
 * olur: `updated_at` sütunu yalnızca sorguda vardı, hiçbir şemada yoktu ve
 * çöp temizleme sorgusu her açılışta hata verip atlanıyordu.
 *
 * Bu test ikisinin aynı sütun kümesini tanımladığını doğrular.
 */

const kok = process.cwd();

function oku(...parcalar: string[]): string {
  return fs.readFileSync(path.join(kok, ...parcalar), "utf8");
}

/** `CREATE TABLE <ad> ( ... )` gövdesindeki sütun adlarını çıkarır. */
function createTableKolonlari(sql: string, tablo: string): Set<string> {
  const re = new RegExp(
    `CREATE TABLE IF NOT EXISTS ${tablo}\\s*\\(([\\s\\S]*?)\\n\\s*\\);`,
    "i",
  );
  const govde = sql.match(re)?.[1];
  if (!govde) return new Set();

  const kolonlar = new Set<string>();
  for (const satir of govde.split("\n")) {
    const temiz = satir.trim();
    if (!temiz || temiz.startsWith("--")) continue;
    // Tablo düzeyi kısıtlar sütun değildir.
    if (/^(UNIQUE|PRIMARY KEY|FOREIGN KEY|CONSTRAINT|CHECK)\b/i.test(temiz)) continue;
    const ad = temiz.match(/^([a-z_][a-z0-9_]*)\s/i)?.[1];
    if (ad) kolonlar.add(ad.toLowerCase());
  }
  return kolonlar;
}

/** `ALTER TABLE <ad> ADD COLUMN IF NOT EXISTS <kolon>` satırlarını toplar. */
function alterKolonlari(sql: string, tablo: string): Set<string> {
  const kolonlar = new Set<string>();
  const re = new RegExp(
    `ALTER TABLE\\s+${tablo}\\s+ADD COLUMN IF NOT EXISTS\\s+([a-z_][a-z0-9_]*)`,
    "gi",
  );
  for (const m of sql.matchAll(re)) kolonlar.add(m[1].toLowerCase());
  return kolonlar;
}

describe("şema tutarlılığı", () => {
  const migration001 = oku("migrations", "001_katilim_finans.sql");
  const migration002 = oku("migrations", "002_sartname_alanlari.sql");
  const store = oku("src", "server", "services", "postgres", "store.ts");

  for (const tablo of ["campaigns", "products"]) {
    it(`${tablo}: migration ve store.ts aynı sütunları tanımlar`, () => {
      const migrationKolonlari = new Set([
        ...createTableKolonlari(migration001, tablo),
        ...alterKolonlari(migration002, tablo),
      ]);
      const storeKolonlari = new Set([
        ...createTableKolonlari(store, tablo),
        ...alterKolonlari(store, tablo),
      ]);

      expect(migrationKolonlari.size).toBeGreaterThan(5);
      const eksik = [...migrationKolonlari].filter((k) => !storeKolonlari.has(k));
      const fazla = [...storeKolonlari].filter((k) => !migrationKolonlari.has(k));
      expect({ storeTaEksik: eksik, migrationDaEksik: fazla }).toEqual({
        storeTaEksik: [],
        migrationDaEksik: [],
      });
    });
  }

  it("sorgularda geçen sütunlar şemada tanımlıdır", () => {
    // updated_at hatası tam olarak burada yakalanırdı: sorgu vardı, şema yoktu.
    const semadaki = new Set([
      ...createTableKolonlari(store, "campaigns"),
      ...alterKolonlari(store, "campaigns"),
    ]);
    for (const kolon of ["updated_at", "campaign_type", "target_segments", "campaign_end"]) {
      expect(semadaki.has(kolon), `campaigns.${kolon}`).toBe(true);
    }
  });
});
