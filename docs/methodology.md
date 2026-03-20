# Yearn Metrics Methodology

## Overview

This document covers how TVL, fees, comparisons, and analysis are calculated in the yearn-metrics system.

## TVL Calculation

**Formula:**

```
totalTvl = activeTvl + retiredTvl - autoOverlap - registryOverlap - crossChainOverlap
```

### Vault Categories

| Category | Description |
|----------|-------------|
| v1 | Legacy vaults, Ethereum only |
| v2 | Vaults with apiVersion 0.4.x |
| v3 | Vaults where v3=true |
| curation | Morpho/Turtle Club vaults, not sourced from Kong |

### V3 Vault Types

- **Type 1 (Allocator)**: Deposits into strategies.
- **Type 2 (Strategy)**: Receives allocations from allocators.

Only counting both types gives the complete picture. Showing only allocators OR only strategies avoids double-counting.

### Vault Status

- **Active vaults**: Non-retired vaults.
- **Retired vaults**: Vaults marked `isRetired=true` in Kong.

## Overlap Deduction

Three detection methods prevent double-counting when capital flows vault -> strategy -> another vault:

### 1. Auto-detection

Strategy address matches a known vault address on the same chain. The strategy's `currentDebtUsd` is deducted.

### 2. Registry

`STRATEGY_OVERLAP_REGISTRY` lists intermediary depositor contracts that auto-detection misses (4 entries). Each maps a strategy address to its target vault. Deducts `currentDebtUsd`.

### 3. Cross-chain

`CROSS_CHAIN_OVERLAP_REGISTRY` tracks retired vaults whose capital migrated to another chain (e.g., Katana pre-deposits, Turtle Club). Deducts the full `tvlUsd` of the source vault.

All overlap amounts use the latest strategy debt or vault snapshot.

## Fee Revenue Calculation

### Performance Fees

Per harvest report:

```
performanceFeeUsd = gainUsd * (performanceFee / 10000)
```

- Rates are in basis points (1000 = 10%).
- Applied to each strategy report's `gainUsd`.

### Management Fees

Time-weighted calculation:

```
managementFeeUsd = totalAssets * weeklyAssetPrice * (rate / 10000) * (duration / YEAR_SECONDS)
```

- Computed per weekly price segment between first and last harvest report.
- Falls back to `latest TVL * rate * duration` if no weekly price data is available.
- `YEAR_SECONDS = 365.25 * 24 * 3600`

### Report Pricing Priority

When determining the USD value of harvest gains, the following priority is used:

1. **Kong `gainUsd`** -- if non-zero and below the $500K cap.
2. **Cached weekly asset price** (within +/-1 week via `toMondayNoon()`) multiplied by the raw token gain.
3. **Vault snapshot price** (`TVL / totalAssets`) multiplied by the raw token gain.
4. **$500K cap** applied to prevent corrupted values (e.g., the OHM-FRAXBP $4T bug).

## Fee Stacking

When capital flows Vault A -> Strategy -> Vault B -> Strategy -> Vault C, each vault takes fees:

- **Effective performance fee** (compound): `1 - (1 - feeA/10000) * (1 - feeB/10000) * ...` expressed in bps.
- **Effective management fee** (additive): sum of rates across the chain.
- **Depth cap**: max 10 hops, warning logged if exceeded.
- **Cycle detection**: visited set keyed by `chainId:address`.

## DefiLlama Comparison

- V1+V2+V3 vaults are compared against the `yearn-finance` protocol on DefiLlama.
- Curation vaults are compared against the `yearn-curating` protocol.
- Both comparisons deduct overlap per category.
- Differences arise from: timing (our data is latest vs DL snapshots), pricing sources, and retired vault inclusion/exclusion.

## Vault Health Classification

**Eligibility**: `!isRetired && tvlUsd > $10K && category !== "curation" && vaultType !== 2`

| Classification | Criteria |
|----------------|----------|
| Dead | No strategy reports in 365 days |
| Low-yield | `gainToTvlRatio < 0.001` (less than 0.1% gain relative to TVL) |
| Healthy | Has recent reports and meaningful yield |

## Depositor Analysis

- **Source**: Kong transfers API (Ethereum only, ~100 results max per vault, no pagination).
- **Mint transfer** (sender = `0x0`) = deposit; **Burn transfer** (receiver = `0x0`) = withdrawal.
- Net balance tracked per depositor per vault.
- Concentration measured as top depositor's percentage of total vault balance.
- Multi-chain address equivalence is not handled -- the same address on different chains is treated separately.

## Data Sources

| Source | Data | Refresh |
|--------|------|---------|
| Kong REST API | Vaults, strategies, debts, fees, reports, transfers | On-demand via seed scripts |
| DefiLlama Protocol API | TVL snapshots per chain | On-demand |
| DefiLlama Coins API | Current and historical asset prices | On-demand |
| On-chain RPC reads | V1 vaults, curation vaults, V2 fee rates, overlap detection | On-demand |
| Morpho Blue API | Curation vault discovery | On-demand |

## Ignored Vaults

9 vaults are excluded from all calculations:

- DefiLlama blacklisted (corrupted/rekt data)
- Known bad vaults (vyper exploit, price corruption, rekt st-yCRV, rekt lp-yCRV, rekt ERN-USDC)

Listed in `packages/shared/src/constants.ts` as `IGNORED_VAULTS`.

## Supported Chains

| Chain | ID |
|-------|-----|
| Ethereum | 1 |
| Optimism | 10 |
| Polygon | 137 |
| Fantom | 250 |
| Base | 8453 |
| Arbitrum | 42161 |
| Gnosis | 100 |
| Katana | 747474 |
| Hyperliquid | 999 |
| Berachain | 80094 |
| Sonic | 146 |

## Related Documentation

- [Curation Methodology](./curation-methodology.md)
