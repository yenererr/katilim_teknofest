/**
 * Chatbot'un cevap üretmek için kullanabileceği yapılandırılmış alanların envanteri.
 * Veri şekli düz ExtractedFinancialRecord: profitRate, maxTermMonths, allocationFeeValue, rewardAmountTl.
 */

const BASE = process.env.ASSISTANT_BASE || "http://localhost:3000";

const r = await fetch(`${BASE}/api/live/products`);
if (!r.ok) {
  console.log(`/api/live/products HTTP ${r.status}`);
  process.exit(1);
}
const d = await r.json();
const kayitlar = d.structuredProducts || [];

console.log(`Toplam yapılandırılmış kayıt: ${kayitlar.length}\n`);

const turSayaci = new Map();
const bankaSayaci = new Map();
let oranVar = 0;
let vadeVar = 0;
let tahsisVar = 0;
let odulVar = 0;

// Banka × ürün türü kırılımında oran doluluğu
const matris = new Map();

for (const k of kayitlar) {
  const tur = k.productType || "bilinmiyor";
  turSayaci.set(tur, (turSayaci.get(tur) || 0) + 1);
  bankaSayaci.set(k.bankId, (bankaSayaci.get(k.bankId) || 0) + 1);

  const oran = k.profitRate;
  if (oran != null && oran > 0) {
    oranVar++;
    const key = `${k.bankId}|${tur}`;
    matris.set(key, (matris.get(key) || 0) + 1);
  }
  if (k.maxTermMonths != null) vadeVar++;
  if (k.allocationFeeValue != null) tahsisVar++;
  if (k.rewardAmountTl != null && k.rewardAmountTl > 0) odulVar++;
}

console.log("--- Ürün türü dağılımı ---");
for (const [k, v] of [...turSayaci.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(k).padEnd(24)} ${v}`);
}

console.log("\n--- Alan doluluk oranı ---");
const yuzde = (n) => `${String(n).padStart(3)} (${((n / kayitlar.length) * 100).toFixed(1)}%)`;
console.log(`  profitRate         : ${yuzde(oranVar)}`);
console.log(`  maxTermMonths      : ${yuzde(vadeVar)}`);
console.log(`  allocationFeeValue : ${yuzde(tahsisVar)}`);
console.log(`  rewardAmountTl     : ${yuzde(odulVar)}`);

console.log("\n--- Banka bazında kayıt sayısı ---");
for (const [k, v] of [...bankaSayaci.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(k).padEnd(20)} ${v}`);
}

console.log("\n--- Oranı OLAN kayıtlar (banka × tür) ---");
if (matris.size === 0) console.log("  (hiç yok)");
for (const [k, v] of [...matris.entries()].sort()) {
  console.log(`  ${k.padEnd(42)} ${v}`);
}

console.log("\n--- KONUT finansmanı kayıtları ---");
const konut = kayitlar.filter((k) => k.productType === "konut_finansmani");
if (konut.length === 0) {
  console.log("  YOK — 'konut finansmanı oranı' sorusuna veriyle cevap verilemez.");
} else {
  for (const k of konut) {
    console.log(
      `  ${k.bankId.padEnd(18)} oran=${k.profitRate} vade=${k.maxTermMonths} tahsis=${k.allocationFeeValue} odul=${k.rewardAmountTl}`,
    );
  }
}

console.log("\n--- Tam dört alanı da dolu olan kayıtlar (senaryo-2 için gerekli) ---");
const tamDolu = kayitlar.filter(
  (k) =>
    k.profitRate != null &&
    k.maxTermMonths != null &&
    k.allocationFeeValue != null &&
    k.rewardAmountTl != null,
);
console.log(`  ${tamDolu.length} kayıt`);
for (const k of tamDolu.slice(0, 10)) {
  console.log(`  ${k.bankId} | ${k.productType} | ${k.productName}`);
}
