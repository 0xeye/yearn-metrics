/**
 * Shared query helpers for API services.
 * Centralizes the "latest snapshot per vault" pattern used across services.
 */
import { db, vaults, vaultSnapshots } from "@yearn-tvl/db";
import { eq, and, sql } from "drizzle-orm";

/** Subquery returning the latest snapshot ID per vault. Use in custom joins. */
export const latestSnapshotIds = () =>
  db
    .select({
      vaultId: vaultSnapshots.vaultId,
      maxId: sql<number>`MAX(${vaultSnapshots.id})`.as("max_id"),
    })
    .from(vaultSnapshots)
    .groupBy(vaultSnapshots.vaultId)
    .as("latest");

/** Latest vault + snapshot rows. Awaitable query used by tvl.ts and profitability.ts. */
export const getLatestSnapshots = () => {
  const latestIds = latestSnapshotIds();
  return db
    .select({ vault: vaults, snapshot: vaultSnapshots })
    .from(vaultSnapshots)
    .innerJoin(latestIds, and(
      eq(vaultSnapshots.vaultId, latestIds.vaultId),
      eq(vaultSnapshots.id, latestIds.maxId),
    ))
    .innerJoin(vaults, eq(vaultSnapshots.vaultId, vaults.id));
};
