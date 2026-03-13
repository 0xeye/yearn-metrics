/**
 * Fee analysis service.
 * Calculates fee revenue from vault harvest reports combined with fee configs.
 * Performance fee revenue = gain × (performanceFee / 10000)
 * Management fee revenue is approximated from TVL × (managementFee / 10000) annualized.
 */
import { db, vaults, vaultSnapshots, feeConfigs, strategyReports } from "@yearn-tvl/db";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import type { VaultCategory } from "@yearn-tvl/shared";
import { CHAIN_NAMES } from "@yearn-tvl/shared";

interface VaultFeeDetail {
  address: string;
  chainId: number;
  name: string | null;
  category: VaultCategory;
  tvlUsd: number;
  performanceFee: number;
  managementFee: number;
  totalGainUsd: number;
  totalLossUsd: number;
  performanceFeeRevenue: number;
  managementFeeRevenue: number;
  totalFeeRevenue: number;
  reportCount: number;
  lastReportTime: string | null;
}

interface FeeSummary {
  totalFeeRevenue: number;
  performanceFeeRevenue: number;
  managementFeeRevenue: number;
  totalGains: number;
  totalLosses: number;
  vaultCount: number;
  reportCount: number;
  byChain: Record<string, { feeRevenue: number; gains: number; vaultCount: number }>;
  byCategory: Record<string, { feeRevenue: number; gains: number; vaultCount: number }>;
}

/** Get fee summary across all active vaults */
export const getFeeSummary = async (since?: number): Promise<FeeSummary> => {
  const vaultFees = await getVaultFees(since);

  const totals = vaultFees.reduce(
    (acc, v) => ({
      totalFeeRevenue: acc.totalFeeRevenue + v.totalFeeRevenue,
      performanceFeeRevenue: acc.performanceFeeRevenue + v.performanceFeeRevenue,
      managementFeeRevenue: acc.managementFeeRevenue + v.managementFeeRevenue,
      totalGains: acc.totalGains + v.totalGainUsd,
      totalLosses: acc.totalLosses + v.totalLossUsd,
      reportCount: acc.reportCount + v.reportCount,
    }),
    { totalFeeRevenue: 0, performanceFeeRevenue: 0, managementFeeRevenue: 0, totalGains: 0, totalLosses: 0, reportCount: 0 },
  );

  const init = () => ({ feeRevenue: 0, gains: 0, vaultCount: 0 });
  const accumulate = (acc: ReturnType<typeof init>, v: VaultFeeDetail) => ({
    feeRevenue: acc.feeRevenue + v.totalFeeRevenue,
    gains: acc.gains + v.totalGainUsd,
    vaultCount: acc.vaultCount + 1,
  });

  const byChain = vaultFees.reduce((acc, v) => {
    const chainName = CHAIN_NAMES[v.chainId] || `Chain ${v.chainId}`;
    return { ...acc, [chainName]: accumulate(acc[chainName] ?? init(), v) };
  }, {} as Record<string, ReturnType<typeof init>>);

  const byCategory = vaultFees.reduce((acc, v) => {
    return { ...acc, [v.category]: accumulate(acc[v.category] ?? init(), v) };
  }, {} as Record<string, ReturnType<typeof init>>);

  return {
    ...totals,
    vaultCount: vaultFees.length,
    byChain,
    byCategory,
  };
};

/** Get per-vault fee breakdown */
export const getVaultFees = async (since?: number): Promise<VaultFeeDetail[]> => {
  const vaultRows = await db
    .select({
      id: vaults.id,
      address: vaults.address,
      chainId: vaults.chainId,
      name: vaults.name,
      category: vaults.category,
      performanceFee: feeConfigs.performanceFee,
      managementFee: feeConfigs.managementFee,
    })
    .from(vaults)
    .innerJoin(feeConfigs, eq(feeConfigs.vaultId, vaults.id))
    .where(eq(vaults.isRetired, false));

  const results: VaultFeeDetail[] = [];

  for (const vault of vaultRows) {
    const [snapshot] = await db
      .select({ tvlUsd: vaultSnapshots.tvlUsd })
      .from(vaultSnapshots)
      .where(eq(vaultSnapshots.vaultId, vault.id))
      .orderBy(desc(vaultSnapshots.id))
      .limit(1);

    const conditions = [eq(strategyReports.vaultId, vault.id)];
    if (since) {
      conditions.push(gte(strategyReports.blockTime, since));
    }

    const [agg] = await db
      .select({
        totalGain: sql<number>`COALESCE(SUM(${strategyReports.gainUsd}), 0)`,
        totalLoss: sql<number>`COALESCE(SUM(${strategyReports.lossUsd}), 0)`,
        count: sql<number>`COUNT(*)`,
        lastReport: sql<number>`MAX(${strategyReports.blockTime})`,
      })
      .from(strategyReports)
      .where(and(...conditions));

    const totalGain = agg?.totalGain || 0;
    const totalLoss = agg?.totalLoss || 0;
    const count = agg?.count || 0;

    const perfFee = vault.performanceFee || 0;
    const perfRevenue = totalGain * (perfFee / 10000);
    const mgmtFee = vault.managementFee || 0;
    const tvlUsd = snapshot?.tvlUsd || 0;

    // Get first report time for management fee duration calc
    const firstTime = count > 0
      ? await db
          .select({ blockTime: strategyReports.blockTime })
          .from(strategyReports)
          .where(eq(strategyReports.vaultId, vault.id))
          .orderBy(strategyReports.blockTime)
          .limit(1)
          .then(([r]) => Number(r?.blockTime || 0))
      : 0;

    const lastTime = agg?.lastReport || 0;

    const mgmtRevenue = mgmtFee > 0 && tvlUsd > 0 && count > 0 && lastTime > firstTime
      ? tvlUsd * (mgmtFee / 10000) * ((lastTime - firstTime) / (365.25 * 24 * 3600))
      : 0;

    if (count === 0 && perfFee === 0 && mgmtFee === 0) continue;

    results.push({
      address: vault.address,
      chainId: vault.chainId,
      name: vault.name,
      category: vault.category as VaultCategory,
      tvlUsd,
      performanceFee: perfFee,
      managementFee: mgmtFee,
      totalGainUsd: totalGain,
      totalLossUsd: totalLoss,
      performanceFeeRevenue: perfRevenue,
      managementFeeRevenue: mgmtRevenue,
      totalFeeRevenue: perfRevenue + mgmtRevenue,
      reportCount: count,
      lastReportTime: agg?.lastReport
        ? new Date(agg.lastReport * 1000).toISOString()
        : null,
    });
  }

  return results.sort((a, b) => b.totalFeeRevenue - a.totalFeeRevenue);
};

interface FeeHistoryBucket {
  period: string;
  gains: number;
  losses: number;
  performanceFeeRevenue: number;
  reportCount: number;
}

const getPeriodKey = (blockTime: number, interval: "weekly" | "monthly"): string => {
  const date = new Date(blockTime * 1000);
  if (interval === "weekly") {
    const day = date.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - diff);
    return monday.toISOString().slice(0, 10);
  }
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** Get fee revenue bucketed by time period (weekly or monthly) */
export const getFeeHistory = async (
  interval: "weekly" | "monthly" = "monthly",
): Promise<FeeHistoryBucket[]> => {
  const feeRates = await db
    .select({ vaultId: feeConfigs.vaultId, performanceFee: feeConfigs.performanceFee })
    .from(feeConfigs);
  const rateMap = new Map(feeRates.map((r) => [r.vaultId, r.performanceFee || 0]));

  const reports = await db
    .select({
      vaultId: strategyReports.vaultId,
      gainUsd: strategyReports.gainUsd,
      lossUsd: strategyReports.lossUsd,
      blockTime: strategyReports.blockTime,
    })
    .from(strategyReports)
    .where(sql`${strategyReports.blockTime} IS NOT NULL`)
    .orderBy(strategyReports.blockTime);

  const buckets = reports
    .filter((r) => r.blockTime)
    .reduce((acc, r) => {
      const period = getPeriodKey(r.blockTime!, interval);
      const bucket = acc.get(period) || { period, gains: 0, losses: 0, performanceFeeRevenue: 0, reportCount: 0 };
      const gain = r.gainUsd || 0;
      const rate = rateMap.get(r.vaultId) || 0;
      acc.set(period, {
        ...bucket,
        gains: bucket.gains + gain,
        losses: bucket.losses + (r.lossUsd || 0),
        performanceFeeRevenue: bucket.performanceFeeRevenue + gain * (rate / 10000),
        reportCount: bucket.reportCount + 1,
      });
      return acc;
    }, new Map<string, FeeHistoryBucket>());

  return [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period));
};
