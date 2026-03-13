/**
 * TVL calculation engine.
 * Aggregates vault snapshots, deducts double-counted overlap, produces metrics.
 * Separates active vs retired vault TVL for accurate DefiLlama comparison.
 */
import { db, vaults, vaultSnapshots, strategies, strategyDebts } from "@yearn-tvl/db";
import { eq, and, desc, sql } from "drizzle-orm";
import type { TvlSummary, VaultTvl, OverlapDetail, VaultCategory } from "@yearn-tvl/shared";
import { CHAIN_NAMES } from "@yearn-tvl/shared";

/** Get the latest snapshot for each vault */
const getLatestSnapshots = async () => {
  const latestIds = db
    .select({
      vaultId: vaultSnapshots.vaultId,
      maxId: sql<number>`MAX(${vaultSnapshots.id})`.as("max_id"),
    })
    .from(vaultSnapshots)
    .groupBy(vaultSnapshots.vaultId)
    .as("latest");

  return db
    .select({ vault: vaults, snapshot: vaultSnapshots })
    .from(vaultSnapshots)
    .innerJoin(latestIds, and(
      eq(vaultSnapshots.vaultId, latestIds.vaultId),
      eq(vaultSnapshots.id, latestIds.maxId),
    ))
    .innerJoin(vaults, eq(vaultSnapshots.vaultId, vaults.id));
};

/** Detect allocator→strategy/vault overlap */
const computeOverlap = async (): Promise<OverlapDetail[]> => {
  const allVaults = await db.select({
    id: vaults.id,
    address: vaults.address,
    chainId: vaults.chainId,
    category: vaults.category,
    isRetired: vaults.isRetired,
  }).from(vaults);

  const vaultByAddress = new Map(
    allVaults.map((v) => [`${v.chainId}:${v.address.toLowerCase()}`, v]),
  );

  const allocatorVaults = await db.select({
    id: vaults.id,
    address: vaults.address,
    chainId: vaults.chainId,
    category: vaults.category,
    isRetired: vaults.isRetired,
  }).from(vaults).where(eq(vaults.vaultType, 1));

  const activeAllocators = allocatorVaults.filter((a) => !a.isRetired);

  const results = await Promise.all(
    activeAllocators.map(async (allocator) => {
      const vaultStrategies = await db.select().from(strategies).where(eq(strategies.vaultId, allocator.id));

      const stratOverlaps = await Promise.all(
        vaultStrategies.map(async (strat) => {
          const targetVault = vaultByAddress.get(`${allocator.chainId}:${strat.address.toLowerCase()}`);
          if (!targetVault) return null;

          const [latestDebt] = await db
            .select()
            .from(strategyDebts)
            .where(eq(strategyDebts.strategyId, strat.id))
            .orderBy(desc(strategyDebts.id))
            .limit(1);

          if (!latestDebt?.currentDebtUsd || latestDebt.currentDebtUsd <= 0) return null;

          return {
            sourceVault: allocator.address,
            targetVault: targetVault.address,
            strategyAddress: strat.address,
            overlapUsd: latestDebt.currentDebtUsd,
            sourceCategory: allocator.category as VaultCategory,
            targetCategory: targetVault.category as VaultCategory,
          } satisfies OverlapDetail;
        }),
      );

      return stratOverlaps.filter((o): o is OverlapDetail => o !== null);
    }),
  );

  return results.flat();
};

export const calculateTvl = async (): Promise<TvlSummary> => {
  const snapshots = await getLatestSnapshots();
  const overlaps = await computeOverlap();

  const totalOverlap = overlaps.reduce((sum, o) => sum + o.overlapUsd, 0);

  const initCat = (): Record<VaultCategory, number> => ({ v1: 0, v2: 0, v3: 0, curation: 0 });

  const agg = snapshots.reduce(
    (acc, { vault, snapshot }) => {
      const tvl = snapshot.tvlUsd ?? 0;
      const cat = vault.category as VaultCategory;
      const chainName = CHAIN_NAMES[vault.chainId] || `Chain ${vault.chainId}`;

      const counts = {
        ...acc.vaultCount,
        total: acc.vaultCount.total + 1,
        [cat]: acc.vaultCount[cat] + 1,
        ...(vault.isRetired
          ? { retired: acc.vaultCount.retired + 1 }
          : { active: acc.vaultCount.active + 1 }),
      };

      if (vault.isRetired) {
        return {
          ...acc,
          retiredTvlByCategory: { ...acc.retiredTvlByCategory, [cat]: acc.retiredTvlByCategory[cat] + tvl },
          vaultCount: counts,
        };
      }

      return {
        ...acc,
        tvlByCategory: { ...acc.tvlByCategory, [cat]: acc.tvlByCategory[cat] + tvl },
        tvlByChain: { ...acc.tvlByChain, [chainName]: (acc.tvlByChain[chainName] || 0) + tvl },
        vaultCount: counts,
      };
    },
    {
      tvlByCategory: initCat(),
      retiredTvlByCategory: initCat(),
      tvlByChain: {} as Record<string, number>,
      vaultCount: { total: 0, v1: 0, v2: 0, v3: 0, curation: 0, active: 0, retired: 0 },
    },
  );

  const { tvlByCategory, tvlByChain, vaultCount } = agg;
  const activeRaw = tvlByCategory.v1 + tvlByCategory.v2 + tvlByCategory.v3 + tvlByCategory.curation;

  return {
    totalTvl: activeRaw - totalOverlap,
    v1Tvl: tvlByCategory.v1,
    v2Tvl: tvlByCategory.v2,
    v3Tvl: tvlByCategory.v3,
    curationTvl: tvlByCategory.curation,
    overlapAmount: totalOverlap,
    tvlByChain,
    tvlByCategory,
    vaultCount,
  };
};

export const getVaultTvls = async (filters?: {
  chainId?: number;
  category?: VaultCategory;
  vaultType?: number;
  includeRetired?: boolean;
}): Promise<VaultTvl[]> => {
  const snapshots = await getLatestSnapshots();

  return snapshots
    .filter(({ vault }) => {
      if (!filters?.includeRetired && vault.isRetired) return false;
      if (filters?.chainId && vault.chainId !== filters.chainId) return false;
      if (filters?.category && vault.category !== filters.category) return false;
      if (filters?.vaultType && vault.vaultType !== filters.vaultType) return false;
      return true;
    })
    .map(({ vault, snapshot }) => ({
      address: vault.address,
      chainId: vault.chainId,
      name: vault.name,
      category: vault.category as VaultCategory,
      vaultType: vault.vaultType,
      tvlUsd: snapshot.tvlUsd ?? 0,
      isRetired: vault.isRetired ?? false,
    }))
    .sort((a, b) => b.tvlUsd - a.tvlUsd);
};

export const getOverlapDetails = async (): Promise<OverlapDetail[]> => computeOverlap();
