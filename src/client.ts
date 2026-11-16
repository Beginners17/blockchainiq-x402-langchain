import { privateKeyToAccount } from "viem/accounts";
import {
  wrapFetchWithPayment,
  x402Client,
  decodePaymentResponseHeader,
} from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";

export const BIQ_BASE_URL = "https://www.blockchainiq.co";

export interface BiqClientOptions {
  /**
   * Private key of the wallet that pays for calls (USDC on Base).
   * Defaults to process.env.AGENT_PRIVATE_KEY. Settlement is gasless
   * for the payer — the wallet needs USDC, not ETH.
   */
  privateKey?: string;
  /**
   * Spend control: refuse any single payment above this many dollars.
   * The dearest Blockchain IQ call is $0.50, so the default is 0.6.
   */
  maxAmountPerPayment?: number;
  /** API origin. Defaults to https://www.blockchainiq.co */
  baseUrl?: string;
}

export interface PaidResult<T = unknown> {
  data: T;
  /** Decoded PAYMENT-RESPONSE header: payer, network and transaction hash. */
  settlement: unknown | null;
  status: number;
}

export interface BlockchainIqClient {
  /** Address of the paying wallet. */
  address: string;
  /** GET a paid resource; pays via x402 on HTTP 402 and retries automatically. */
  getPaid: <T = unknown>(path: string) => Promise<PaidResult<T>>;
  /** GET a free resource (catalogue, sample, free dashboards). */
  getFree: <T = unknown>(path: string) => Promise<T>;
}

/**
 * Create a Blockchain IQ client whose fetch pays x402 invoices in USDC
 * on Base. An unpaid request returns HTTP 402 with a PAYMENT-REQUIRED
 * header; the wrapper signs a payment for that amount and retries.
 */
export function createBlockchainIqClient(
  opts: BiqClientOptions = {},
): BlockchainIqClient {
  const key = opts.privateKey ?? process.env.AGENT_PRIVATE_KEY;
  if (!key) {
    throw new Error(
      "No paying wallet configured: pass { privateKey } or set AGENT_PRIVATE_KEY " +
        "to the private key of a wallet holding a little USDC on Base.",
    );
  }
  const account = privateKeyToAccount(key as `0x${string}`);
  const client = x402Client.fromConfig({
    schemes: [{ network: "eip155:*", client: new ExactEvmScheme(account) }],
    spendControls: { maxAmountPerPayment: opts.maxAmountPerPayment ?? 0.6 },
  });
  const payFetch = wrapFetchWithPayment(fetch, client);
  const baseUrl = (opts.baseUrl ?? BIQ_BASE_URL).replace(/\/$/, "");

  async function getPaid<T = unknown>(path: string): Promise<PaidResult<T>> {
    const res = await payFetch(`${baseUrl}${path}`);
    if (!res.ok) {
      throw new Error(
        `Blockchain IQ ${path} failed: HTTP ${res.status} ${await res.text()}`,
      );
    }
    const header = res.headers.get("payment-response");
    return {
      data: (await res.json()) as T,
      settlement: header ? decodePaymentResponseHeader(header) : null,
      status: res.status,
    };
  }

  async function getFree<T = unknown>(path: string): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`);
    if (!res.ok) {
      throw new Error(
        `Blockchain IQ ${path} failed: HTTP ${res.status} ${await res.text()}`,
      );
    }
    return (await res.json()) as T;
  }

  return { address: account.address, getPaid, getFree };
}
