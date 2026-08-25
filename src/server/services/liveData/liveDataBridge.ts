/**
 * Sunucu ile RAG arasında canlı scraper durumunu paylaşır.
 * server.ts kayıt eder; RAG servisleri okur.
 */

export type LiveBankState = {
  id: string;
  bankName: string;
  urls: string[];
  status: "beklemede" | "degismedi" | "guncellendi" | "hata";
  contentHash: string | null;
  lastCheckedAt: string | null;
  lastChangedAt: string | null;
  lastExtractedAt: string | null;
  products: any[];
  error: string | null;
  indexStatus?: string | null;
  indexError?: string | null;
  indexedAt?: string | null;
};

export type LiveDataBridge = {
  getStates: () => LiveBankState[];
  refreshBanks: (opts: {
    force?: boolean;
    bankIds?: string[];
  }) => Promise<LiveBankState[]>;
};

let bridge: LiveDataBridge | null = null;

export function registerLiveDataBridge(next: LiveDataBridge): void {
  bridge = next;
}

export function getLiveDataBridge(): LiveDataBridge | null {
  return bridge;
}

export function getLiveBankStates(): LiveBankState[] {
  return bridge?.getStates() ?? [];
}
