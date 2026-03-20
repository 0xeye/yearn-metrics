/**
 * Fee stacking analysis service.
 * When capital flows Vault A → Strategy → Vault B → Strategy → Vault C,
 * each vault takes fees. This service computes the effective compound fee
 * rate and total Yearn capture for each such chain.
 */
import { db, feeConfigs } from "@yearn-tvl/db";
import { eq, and } from "drizzle-orm";
import type { FeeStackHop, FeeStackChain, FeeStackSummary } from "@yearn-tvl/shared";
import { getAuditTree, type AuditVault, type AuditStrategy } from "./audit.js";
import { latestFeeConfigIds } from "./queries.js";

const MAX_DEPTH = 10;

interface FeeRate {
  performanceFee: number;
  managementFee: number;
}

/** Load latest fee configs for all vaults, keyed by vaultId */
async function loadFeeRates(): Promise<Map<number, FeeRate>> {
  const latestFees = latestFeeConfigIds();
  const rows = await db
    .select({
      vaultId: feeConfigs.vaultId,
      performanceFee: feeConfigs.performanceFee,
      managementFee: feeConfigs.managementFee,
    })
    .from(feeConfigs)
    .innerJoin(latestFees, and(
      eq(feeConfigs.vaultId, latestFees.vaultId),
      eq(feeConfigs.id, latestFees.maxId),
    ));

  return new Map(rows.map((r) => [
    r.vaultId,
    { performanceFee: r.performanceFee || 0, managementFee: r.managementFee || 0 },
  ]));
}

/** Build a lookup map of chainId:address → AuditVault */
function buildVaultLookup(vaults: AuditVault[]): Map<string, AuditVault> {
  return new Map(vaults.map((v) => [`${v.chainId}:${v.address.toLowerCase()}`, v]));
}

/** Build a lookup map of chainId:address → vaultId (numeric) for fee config lookup */
function buildVaultIdLookup(vaults: AuditVault[]): Map<string, number> {
  // We don't have vaultId in AuditVault — use address-based fee lookup instead
  // Actually the fee rates are keyed by vaultId which we don't have. Let's load them separately.
  return new Map();
}

/**
 * Walk from a root vault through strategy→vault chains, collecting fee hops.
 * Uses memoization + cycle detection via visited set.
 */
function walkChain(
  root: AuditVault,
  vaultLookup: Map<string, AuditVault>,
  feeByAddress: Map<string, FeeRate>,
  visited: Set<string>,
  depth: number,
): FeeStackHop[] {
  if (depth >= MAX_DEPTH) {
    console.warn(`Fee stack depth cap (${MAX_DEPTH}) hit at ${root.name || root.address}`);
    return [];
  }

  const hops: FeeStackHop[] = [];
  const rootKey = `${root.chainId}:${root.address.toLowerCase()}`;

  for (const strat of root.strategies) {
    if (!strat.detectionMethod || !strat.targetVaultAddress) continue;

    const targetKey = `${strat.targetVaultChainId || root.chainId}:${strat.targetVaultAddress.toLowerCase()}`;
    if (visited.has(targetKey)) continue; // cycle detection

    const targetVault = vaultLookup.get(targetKey);
    if (!targetVault) continue;

    const fees = feeByAddress.get(targetKey) || { performanceFee: 0, managementFee: 0 };

    hops.push({
      vault: {
        address: targetVault.address,
        chainId: targetVault.chainId,
        name: targetVault.name,
      },
      perfFee: fees.performanceFee,
      mgmtFee: fees.managementFee,
      capitalUsd: strat.debtUsd,
    });

    // Recurse into the target vault
    visited.add(targetKey);
    const deeper = walkChain(targetVault, vaultLookup, feeByAddress, visited, depth + 1);
    hops.push(...deeper);
  }

  return hops;
}

/** Compute effective compound performance fee: 1 - product of (1 - fee/10000) */
function compoundPerfFee(hops: FeeStackHop[]): number {
  if (hops.length === 0) return 0;
  const product = hops.reduce((acc, h) => acc * (1 - h.perfFee / 10000), 1);
  return Math.round((1 - product) * 10000);
}

/** Compute additive management fee */
function additiveMgmtFee(hops: FeeStackHop[]): number {
  return hops.reduce((sum, h) => sum + h.mgmtFee, 0);
}

export async function getFeeStackAnalysis(): Promise<FeeStackSummary> {
  const auditTree = await getAuditTree();
  const vaultLookup = buildVaultLookup(auditTree.vaults);

  // Load fee rates keyed by vaultId, then build address-based lookup
  const feeRatesById = await loadFeeRates();

  // We need to map addresses to vault IDs. Load all vaults for this.
  const allVaults = await db.query.vaults.findMany();
  const vaultIdByAddress = new Map(
    allVaults.map((v) => [`${v.chainId}:${v.address.toLowerCase()}`, v.id]),
  );

  // Build address → fee rate map
  const feeByAddress = new Map<string, FeeRate>();
  for (const [addrKey, vaultId] of vaultIdByAddress) {
    const rate = feeRatesById.get(vaultId);
    if (rate) feeByAddress.set(addrKey, rate);
  }

  const chains: FeeStackChain[] = [];

  for (const vault of auditTree.vaults) {
    // Only consider vaults that have strategies depositing into other vaults
    const hasOverlap = vault.strategies.some((s) => s.detectionMethod != null);
    if (!hasOverlap) continue;

    const rootKey = `${vault.chainId}:${vault.address.toLowerCase()}`;
    const rootFees = feeByAddress.get(rootKey) || { performanceFee: 0, managementFee: 0 };

    // Start walk from root
    const visited = new Set<string>([rootKey]);
    const hops = walkChain(vault, vaultLookup, feeByAddress, visited, 0);

    if (hops.length === 0) continue;

    // Include root vault as first hop
    const allHops: FeeStackHop[] = [
      {
        vault: { address: vault.address, chainId: vault.chainId, name: vault.name },
        perfFee: rootFees.performanceFee,
        mgmtFee: rootFees.managementFee,
        capitalUsd: vault.tvlUsd,
      },
      ...hops,
    ];

    const depth = allHops.length;
    const effectivePerfFee = compoundPerfFee(allHops);
    const effectiveMgmtFee = additiveMgmtFee(allHops);

    // Estimate total Yearn capture from this chain
    // Use the root vault's capital × effective performance rate as rough estimate
    const totalYearnCapture = vault.tvlUsd * (effectivePerfFee / 10000) * 0.1; // rough 10% gain assumption

    chains.push({
      rootVault: { address: vault.address, chainId: vault.chainId, name: vault.name },
      hops: allHops,
      depth,
      effectivePerfFee,
      effectiveMgmtFee,
      totalYearnCapture,
    });
  }

  // Sort by effective performance fee descending
  chains.sort((a, b) => b.effectivePerfFee - a.effectivePerfFee);

  const maxDepth = chains.reduce((m, c) => Math.max(m, c.depth), 0);
  const maxEffectivePerfFee = chains.reduce((m, c) => Math.max(m, c.effectivePerfFee), 0);
  const avgEffectivePerfFee = chains.length > 0
    ? Math.round(chains.reduce((s, c) => s + c.effectivePerfFee, 0) / chains.length)
    : 0;
  const totalStackedCapital = chains.reduce((s, c) => s + c.rootVault.address ? c.hops[0]?.capitalUsd || 0 : 0, 0);

  return {
    chains,
    maxDepth,
    maxEffectivePerfFee,
    avgEffectivePerfFee,
    totalStackedCapital,
  };
}
