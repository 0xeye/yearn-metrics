import { Hono } from "hono";
import { getFeeSummary, getVaultFees, getFeeHistory } from "../services/fees.js";
import { getFeeStackAnalysis } from "../services/fee-stack.js";
import { rateLimit } from "../middleware/rate-limit.js";

const fees = new Hono();

fees.get("/", async (c) => {
  const since = c.req.query("since") ? Number(c.req.query("since")) : undefined;
  const summary = await getFeeSummary(since);
  return c.json(summary);
});

fees.get("/vaults", async (c) => {
  const since = c.req.query("since") ? Number(c.req.query("since")) : undefined;
  const vaultFees = await getVaultFees(since);
  return c.json({ count: vaultFees.length, vaults: vaultFees });
});

fees.get("/history", async (c) => {
  const interval = c.req.query("interval") === "weekly" ? "weekly" : "monthly";
  const history = await getFeeHistory(interval);
  return c.json({ interval, buckets: history });
});

fees.get("/stack", rateLimit({ windowMs: 60_000, max: 10 }), async (c) => {
  const stack = await getFeeStackAnalysis();
  c.header("Cache-Control", "max-age=300");
  return c.json(stack);
});

export { fees };
