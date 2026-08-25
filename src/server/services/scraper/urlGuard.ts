import {
  BANK_SOURCE_CONFIGS,
  BLOCKED_CONVENTIONAL_DOMAINS,
  getAllAllowedDomains,
  type BankSourceConfig,
} from "./bankSourceConfig";

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^metadata\.google/i,
];

export type UrlValidationResult =
  | { ok: true; url: URL; bankId: string; hostname: string }
  | { ok: false; reason: string };

function normalizeHost(host: string): string {
  return host.replace(/^www\./i, "").toLowerCase();
}

export function findBankByHostname(hostname: string): BankSourceConfig | undefined {
  const host = hostname.toLowerCase();
  const bare = normalizeHost(host);
  return BANK_SOURCE_CONFIGS.find((b) =>
    b.allowedDomains.some((d) => {
      const allowed = d.toLowerCase();
      return host === allowed || bare === normalizeHost(allowed);
    }),
  );
}

export function isBlockedConventionalDomain(hostname: string): boolean {
  const bare = normalizeHost(hostname);
  return BLOCKED_CONVENTIONAL_DOMAINS.some(
    (d) => bare === d || bare.endsWith(`.${d}`),
  );
}

export function isPrivateOrLocalHost(hostname: string): boolean {
  return PRIVATE_HOST_PATTERNS.some((p) => p.test(hostname));
}

/**
 * SSRF + katılım bankası domain doğrulaması.
 * VakıfBank / Ziraat Bankası gibi konvansiyonel domainleri reddeder.
 */
export function validateOfficialBankUrl(
  rawUrl: string,
  expectedBankId?: string,
): UrlValidationResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Geçersiz URL." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Yalnızca http/https protokollerine izin verilir." };
  }

  if (isPrivateOrLocalHost(url.hostname)) {
    return { ok: false, reason: "Özel/local adreslere erişim engellendi (SSRF)." };
  }

  if (isBlockedConventionalDomain(url.hostname)) {
    return {
      ok: false,
      reason:
        "Konvansiyonel banka domaini reddedildi. Yalnızca katılım bankası resmî siteleri kabul edilir.",
    };
  }

  const bank = findBankByHostname(url.hostname);
  if (!bank) {
    return {
      ok: false,
      reason: `İzin verilmeyen domain: ${url.hostname}. Üçüncü taraf kaynaklar kabul edilmez.`,
    };
  }

  if (expectedBankId && bank.bankId !== expectedBankId) {
    return {
      ok: false,
      reason: `Domain ${url.hostname} banka ${expectedBankId} ile eşleşmiyor (${bank.bankId}).`,
    };
  }

  const path = url.pathname.toLowerCase();
  if (bank.excludedPathPatterns.some((p) => path.includes(p.toLowerCase()))) {
    return { ok: false, reason: `Hariç tutulan yol: ${url.pathname}` };
  }

  return {
    ok: true,
    url,
    bankId: bank.bankId,
    hostname: url.hostname,
  };
}

export function assertAllowedFinalUrl(
  finalUrl: string,
  bankId: string,
): UrlValidationResult {
  return validateOfficialBankUrl(finalUrl, bankId);
}

export function listAllowedDomainsForTests(): string[] {
  return getAllAllowedDomains();
}
