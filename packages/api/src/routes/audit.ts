import { Hono } from "hono";
import { getAuditTree } from "../services/audit.js";

const audit = new Hono();

audit.get("/tree", async (c) => {
  const chainId = c.req.query("chainId") ? Number(c.req.query("chainId")) : undefined;
  const tree = await getAuditTree({ chainId });
  return c.json(tree);
});

export { audit };
