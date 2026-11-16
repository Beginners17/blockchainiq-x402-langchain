import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import {
  createBlockchainIqClient,
  type BiqClientOptions,
} from "./client.js";

/**
 * LangChain tools for Blockchain IQ's x402 API.
 *
 * Paid tools settle in USDC on Base through x402: the first request gets
 * HTTP 402, the client signs a payment for the quoted amount and retries.
 * The paying wallet is configured once, here — the model using the tools
 * never sees the key. A per-payment spend cap (default $0.60) is enforced
 * by the x402 client before anything is signed.
 *
 * Prices (from the free catalogue at /api/x402/v1):
 *   blockchainiq_market_brief   $0.01 per call
 *   blockchainiq_get_resource   $0.01–$0.50 per call, by resource
 *   blockchainiq_catalog        free
 *   blockchainiq_free_sample    free
 */
export function createBlockchainIqTools(
  opts: BiqClientOptions = {},
): StructuredToolInterface[] {
  const client = createBlockchainIqClient(opts);

  const marketBrief = tool(
    async () => {
      const { data, settlement } = await client.getPaid(
        "/api/x402/v1/brief",
      );
      return JSON.stringify({ data, settlement }, null, 2);
    },
    {
      name: "blockchainiq_market_brief",
      description:
        "Blockchain IQ crypto market brief ($0.01 per call, paid in USDC on Base via x402): BTC, ETH, SOL and XRP prices with 24h, 7d and 30d moves and rank, scheduled macro and crypto events in the next 48 hours, and short risk flags. Refreshed every minute. Use as the opening call of a trading, portfolio or research agent loop.",
      schema: z.object({}),
    },
  );

  const getResource = tool(
    async ({ path }: { path: string }) => {
      if (!path.startsWith("/api/x402/v1/")) {
        throw new Error(
          `Refusing path outside the Blockchain IQ catalogue: ${path}. ` +
            "Call blockchainiq_catalog to list valid paths.",
        );
      }
      const { data, settlement } = await client.getPaid(path);
      return JSON.stringify({ data, settlement }, null, 2);
    },
    {
      name: "blockchainiq_get_resource",
      description:
        "Fetch any paid Blockchain IQ x402 resource by catalogue path and return its JSON plus the settlement proof (payer, network, transaction hash). Prices run $0.01–$0.50 per call, paid in USDC on Base via x402. Examples: /api/x402/v1/event-risk?days=7 (scheduled market-moving events), /api/x402/v1/macro (US macro indicators), /api/x402/v1/network/bitcoin-network (one chain's activity), /api/x402/v1/dashboards/bitcoin-network (analytics dashboard). Call blockchainiq_catalog first to see every path, price and parameter.",
      schema: z.object({
        path: z
          .string()
          .describe(
            "Catalogue path including any query string, e.g. /api/x402/v1/event-risk?days=7",
          ),
      }),
    },
  );

  const catalog = tool(
    async () => JSON.stringify(await client.getFree("/api/x402/v1"), null, 2),
    {
      name: "blockchainiq_catalog",
      description:
        "Free: the full Blockchain IQ x402 catalogue — every resource with its id, method, path, price, description, parameters and an example response. Call this first to discover what is for sale before spending on a paid resource.",
      schema: z.object({}),
    },
  );

  const freeSample = tool(
    async () =>
      JSON.stringify(await client.getFree("/api/x402/v1/sample"), null, 2),
    {
      name: "blockchainiq_free_sample",
      description:
        "Free sample: Bitcoin's network activity, unpaid — transactions, active addresses and fees in BTC for its latest single day, from AWS Public Blockchain Data. Use to verify the integration end to end before paying for anything.",
      schema: z.object({}),
    },
  );

  return [marketBrief, getResource, catalog, freeSample];
}
