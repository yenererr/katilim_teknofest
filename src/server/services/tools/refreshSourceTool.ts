import {
  getLiveBankStates,
  getLiveDataBridge,
  type LiveBankState,
} from "../liveData/liveDataBridge";
import { evaluateFreshness, selectBanksToRefresh } from "../rag/freshnessService";
import type { FreshnessStatus } from "../rag/ragTypes";

export type RefreshSourceResult = {
  refreshed: string[];
  skipped: string[];
  freshnessByBank: Record<string, FreshnessStatus>;
  warnings: string[];
};

/**
 * İlgili kaynakları sınırlı sayıda yeniler. Tüm bankaları sınırsız taramaz.
 */
export async function refreshSourcesForQuery(opts: {
  bankIds?: string[];
  force?: boolean;
}): Promise<RefreshSourceResult> {
  const bridge = getLiveDataBridge();
  const states = getLiveBankStates();
  const warnings: string[] = [];

  if (!bridge) {
    return {
      refreshed: [],
      skipped: states.map((s) => s.id),
      freshnessByBank: Object.fromEntries(
        states.map((s) => [s.id, evaluateFreshness(s)]),
      ),
      warnings: [
        "Canlı veri köprüsü hazır değil; mevcut önbellek kullanılacak.",
      ],
    };
  }

  const toRefresh = opts.force
    ? (opts.bankIds?.length ? opts.bankIds : states.map((s) => s.id)).slice(0, 3)
    : selectBanksToRefresh(states, opts.bankIds);

  const skipped = states
    .map((s) => s.id)
    .filter((id) => !toRefresh.includes(id));

  let after: LiveBankState[] = states;
  if (toRefresh.length) {
    try {
      after = await bridge.refreshBanks({
        force: Boolean(opts.force),
        bankIds: toRefresh,
      });
    } catch (err) {
      warnings.push(
        `Kaynak yenileme başarısız: ${err instanceof Error ? err.message : "bilinmeyen hata"}. Eski veri güncelmiş gibi sunulmayacak.`,
      );
    }
  }

  const freshnessByBank: Record<string, FreshnessStatus> = {};
  for (const s of after) {
    freshnessByBank[s.id] = evaluateFreshness(s);
    if (freshnessByBank[s.id] === "FAILED") {
      warnings.push(
        `${s.bankName}: son yenileme başarısız (son kontrol: ${s.lastCheckedAt ?? "yok"}).`,
      );
    }
  }

  return {
    refreshed: toRefresh,
    skipped,
    freshnessByBank,
    warnings,
  };
}
