import { Hono } from "hono";
import { getProfitability, getProfitabilityTrends } from "../services/profitability.js";

const profitability = new Hono();

profitability.get("/", async (c) => {
  const data = await getProfitability();
  return c.json(data);
});

profitability.get("/trends", async (c) => {
  const period = c.req.query("period");
  const periodDays = period === "90d" ? 90 : period === "180d" ? 180 : period === "7d" ? 7 : 30;
  const data = await getProfitabilityTrends(periodDays);
  return c.json(data);
});

export { profitability };
