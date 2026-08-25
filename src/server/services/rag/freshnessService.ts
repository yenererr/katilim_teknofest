import type { LiveBankState } from "../liveData/liveDataBridge";
import type { FreshnessStatus } from "./ragTypes";

export function getFreshnessMinutes(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const n = Number(env.DATA_FRESHNESS_MINUTES || 40);
  return Number.isFinite(n) && n > 0 ? n : 40;
}

export function getExpiredMinutes(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const n = Number(env.DATA_EXPIRED_MINUTES || 180);
  return Number.isFinite(n) && n > 0 ? n : 180;
}

export function getMaxSyncRefresh(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const n = Number(env.MAX_SYNC_REFRESH_SOURCES || 3);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10) : 3;
}

/**
 * Banka durumundan güncellik etiketi üretir.
 */
export function evaluateFreshness(
  state: Pick<LiveBankState, "lastCheckedAt" | "status" | "error"> | null | undefined,
  nowMs: number = Date.now(),
  freshMinutes: number = getFreshnessMinutes(),
  expiredMinutes: number = getExpiredMinutes(),
): FreshnessStatus {
  if (!state) return "UNKNOWN";
  if (state.status === "hata" || state.error) return "FAILED";
  if (!state.lastCheckedAt) return "UNKNOWN";

  const checked = Date.parse(state.lastCheckedAt);
  if (!Number.isFinite(checked)) return "UNKNOWN";

  const ageMin = (nowMs - checked) / 60_000;
  if (ageMin <= freshMinutes) return "FRESH";
  if (ageMin <= expiredMinutes) return "STALE";
  return "EXPIRED";
}

export function freshnessLabel(status: FreshnessStatus): string {
  switch (status) {
    case "FRESH":
      return "Son kontrol yakın zamanda yapıldı";
    case "STALE":
      return "Veri eskimiş olabilir; son kontrol zamanına aittir";
    case "EXPIRED":
      return "Veri güncelliğini yitirmiş olabilir";
    case "FAILED":
      return "Son yenileme başarısız";
    default:
      return "Güncellik bilinmiyor";
  }
}

/**
 * Plan için yenilenmesi gereken banka id'lerini seçer (üst sınırlı).
 */
export function selectBanksToRefresh(
  states: LiveBankState[],
  preferredIds: string[] | undefined,
  maxCount: number = getMaxSyncRefresh(),
): string[] {
  const candidates = preferredIds?.length
    ? states.filter((s) => preferredIds.includes(s.id))
    : states;

  const stale = candidates.filter((s) => {
    const f = evaluateFreshness(s);
    return f === "STALE" || f === "EXPIRED" || f === "UNKNOWN" || f === "FAILED";
  });

  return stale.slice(0, maxCount).map((s) => s.id);
}
