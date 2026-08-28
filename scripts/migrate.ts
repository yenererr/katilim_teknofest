/**
 * Veritabanı şema göçlerini uygular.
 *
 *   npm run db:migrate           — bekleyen göçleri uygular
 *   npm run db:migrate -- --dry  — uygular, sonucu gösterir, GERİ ALIR
 *
 * `migrations/` altındaki .sql dosyaları ada göre sıralı çalıştırılır.
 * Uygulananlar `schema_migrations` tablosunda tutulur, ikinci kez
 * çalıştırılmaz. Her göç kendi transaction'ında uygulanır: hata olursa o
 * göç tamamen geri alınır, yarım şema kalmaz.
 *
 * psql kurulumu gerektirmez — bağlantı uygulamanın kendi `pg` istemcisiyle
 * kurulur, `DATABASE_URL` ortam değişkeni yeterlidir.
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { Pool } from "pg";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");
const kuruProva = process.argv.includes("--dry");

function migrationDosyalari(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/**
 * Dosyadaki BEGIN/COMMIT satırları ayıklanır: transaction'ı çalıştırıcı
 * yönetir, böylece kuru prova modunda tamamı geri alınabilir.
 */
function govde(dosya: string): string {
  return fs
    .readFileSync(path.join(MIGRATIONS_DIR, dosya), "utf8")
    .replace(/^[ \t]*BEGIN;[ \t]*$/gm, "")
    .replace(/^[ \t]*COMMIT;[ \t]*$/gm, "");
}

async function main(): Promise<void> {
  const baglanti = process.env.DATABASE_URL?.trim();
  if (!baglanti) {
    console.error(
      "DATABASE_URL tanımlı değil. .env dosyasına ekleyin veya ortam değişkeni olarak verin.",
    );
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: baglanti,
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  const hedef = new URL(baglanti);
  console.log(
    `Veritabanı: ${hedef.hostname}:${hedef.port || 5432}${hedef.pathname}` +
      (kuruProva ? "  [KURU PROVA — değişiklik kalıcı olmayacak]" : ""),
  );

  const c = await pool.connect();
  try {
    await c.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const uygulanan = new Set(
      (await c.query<{ filename: string }>("SELECT filename FROM schema_migrations"))
        .rows.map((r) => r.filename),
    );

    const bekleyen = migrationDosyalari().filter((f) => !uygulanan.has(f));
    if (bekleyen.length === 0) {
      console.log("Bekleyen göç yok — şema güncel.");
      return;
    }

    for (const dosya of bekleyen) {
      process.stdout.write(`→ ${dosya} ... `);
      await c.query("BEGIN");
      try {
        await c.query(govde(dosya));
        await c.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
          [dosya],
        );
        if (kuruProva) {
          await c.query("ROLLBACK");
          console.log("başarılı (geri alındı)");
        } else {
          await c.query("COMMIT");
          console.log("uygulandı");
        }
      } catch (err) {
        await c.query("ROLLBACK");
        console.log("HATA");
        console.error(err instanceof Error ? err.message : err);
        process.exitCode = 1;
        return;
      }
    }

    if (!kuruProva) {
      const ozet = await c.query(`
        SELECT
          (SELECT count(*)::int FROM campaigns WHERE campaign_type IS NOT NULL) AS tur_dolu,
          (SELECT count(*)::int FROM campaigns WHERE campaign_end IS NOT NULL) AS bitis_dolu,
          (SELECT count(*)::int FROM campaigns WHERE is_active) AS aktif_kampanya
      `);
      console.log("Durum:", ozet.rows[0]);
    }
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
