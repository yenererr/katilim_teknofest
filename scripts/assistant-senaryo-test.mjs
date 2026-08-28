/**
 * Senaryo denetimi: tek banka bilgi sorgusu ve iki banka karşılaştırması.
 * Kullanım: node scripts/assistant-senaryo-test.mjs
 */

const BASE = process.env.ASSISTANT_BASE || "http://localhost:3000";

const SENARYOLAR = [
  {
    ad: "S1a — Tek banka, konut oranı (finansman modu)",
    mode: "finansman",
    mesaj: "Kuveyt Türk'ün konut finansmanı oranı ne?",
  },
  {
    ad: "S1b — Tek banka, konut oranı (rag modu)",
    mode: "rag",
    mesaj: "Kuveyt Türk'ün konut finansmanı oranı ne?",
  },
  {
    ad: "S1c — Tek banka + vade beklentisi",
    mode: "finansman",
    mesaj: "Vakıf Katılım konut finansmanında kâr payı oranı ve vadesi nedir?",
  },
  {
    ad: "S2a — İki banka karşılaştırma (finansman modu)",
    mode: "finansman",
    mesaj: "Kuveyt Türk mü daha avantajlı, Ziraat Katılım mı?",
  },
  {
    ad: "S2b — İki banka karşılaştırma (rag modu)",
    mode: "rag",
    mesaj: "Kuveyt Türk mü daha avantajlı, Ziraat Katılım mı?",
  },
  {
    ad: "S2c — İki banka, konut finansmanı özelinde",
    mode: "rag",
    mesaj:
      "Konut finansmanında Vakıf Katılım ile Kuveyt Türk'ü karşılaştır: oran, vade, masraf ve ödül",
  },
];

function kisalt(s, n = 1400) {
  if (typeof s !== "string") return JSON.stringify(s);
  return s.length > n ? `${s.slice(0, n)}\n…[${s.length} karakter, kısaltıldı]` : s;
}

for (const s of SENARYOLAR) {
  console.log("\n" + "=".repeat(78));
  console.log(`${s.ad}\n[mode=${s.mode}] SORU: ${s.mesaj}`);
  console.log("=".repeat(78));

  try {
    const r = await fetch(`${BASE}/api/assistant/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: s.mesaj,
        mode: s.mode,
        conversationId: `senaryo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      }),
    });

    if (!r.ok) {
      console.log(`HTTP ${r.status}\n${kisalt(await r.text(), 600)}`);
      continue;
    }

    const d = await r.json();
    const cevap = d.assistantMessage ?? d.answer ?? "(yanıt alanı yok)";
    console.log("\n--- YANIT ---");
    console.log(kisalt(cevap));

    if (Array.isArray(d.exactMatches)) {
      console.log(`\n--- exactMatches (${d.exactMatches.length}) ---`);
      for (const m of d.exactMatches.slice(0, 5)) {
        console.log(
          `  ${m.bankName} | oran=${m.profitRate} (${m.ratePeriod}) | vade=${m.termMonths} | tahsis=${m.allocationFeeTl} | odul=${m.rewardAmountTl ?? "—"}`,
        );
      }
    }
    if (Array.isArray(d.products) && d.products.length) {
      console.log(`\n--- products (${d.products.length}) ---`);
      for (const p of d.products.slice(0, 5)) {
        console.log(`  ${JSON.stringify(p).slice(0, 220)}`);
      }
    }
    if (d.comparison) {
      console.log(`\n--- comparison ---\n  ${JSON.stringify(d.comparison)}`);
    }
    console.log(
      `\n[meta] turn=${d.turn ?? "—"} intent=${d.observability?.intent ?? d.intent ?? "—"} status=${d.status ?? "—"} warnings=${JSON.stringify(d.warnings ?? [])}`,
    );
  } catch (err) {
    console.log(`HATA: ${err.message}`);
  }
}

console.log("\n" + "=".repeat(78));
console.log("Denetim tamamlandı.");
