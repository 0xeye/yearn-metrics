/**
 * Strategy overlap registry: strategies that deposit into another Yearn vault
 * through an intermediary contract (strategy address ≠ target vault address).
 *
 * Auto-detection catches cases where strategy address = vault address.
 * This registry covers intermediary depositor contracts that can't be auto-detected.
 *
 * To find new entries: run `bun run scripts/detect-overlaps.ts`
 */
export interface StrategyOverlap {
  /** The intermediary strategy contract address */
  strategyAddress: `0x${string}`;
  chainId: number;
  /** The Yearn vault this strategy ultimately deposits into */
  targetVaultAddress: `0x${string}`;
  /** Human-readable label */
  label: string;
}

export const STRATEGY_OVERLAP_REGISTRY: StrategyOverlap[] = [
  {
    strategyAddress: "0x39c0aEc5738ED939876245224aFc7E09C8480a52",
    chainId: 1,
    targetVaultAddress: "0x182863131F9a4630fF9E27830d945B1413e347E8",
    label: "unknown → USDS-1 yVault",
  },
  {
    strategyAddress: "0xfF03Dce6d95aa7a30B75EFbaFD11384221B9f9B5",
    chainId: 1,
    targetVaultAddress: "0xBe53A109B494E5c9f97b9Cd39Fe969BE68BF6204",
    label: "unknown → USDC-1 yVault",
  },
  {
    strategyAddress: "0xAeDF7d5F3112552E110e5f9D08c9997Adce0b78d",
    chainId: 1,
    targetVaultAddress: "0x182863131F9a4630fF9E27830d945B1413e347E8",
    label: "unknown → USDS-1 yVault",
  },
  {
    strategyAddress: "0x9e0A5943dFc1A85B48C191aa7c10487297aA675b",
    chainId: 1,
    targetVaultAddress: "0xc9f01b5c6048B064E6d925d1c2d7206d4fEeF8a3",
    label: "unknown → Spark USDS Compounder",
  },
];
