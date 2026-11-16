# blockchainiq-x402-langchain

LangChain tools for [Blockchain IQ](https://www.blockchainiq.co)'s pay-per-call
crypto data API, paid in USDC on Base over the open
[x402](https://www.x402.org) standard.

Blockchain IQ sells crypto market data and research to software agents one
request at a time. There is no account and no API key: an unpaid request
returns HTTP 402 with the price, the agent pays in USDC, and the data comes
back as JSON. This package wraps that flow in four LangChain tools, so any
LangChain agent can buy the data it needs mid-task — and prove what it paid
from the settlement receipt on every response.

## The tools

| Tool | Price | What it returns |
| --- | --- | --- |
| `blockchainiq_market_brief` | $0.01 / call | BTC, ETH, SOL and XRP prices with 24h/7d/30d moves, macro and crypto events in the next 48 hours, and risk flags. Refreshed every minute. |
| `blockchainiq_get_resource` | $0.01–$0.50 / call | Any paid catalogue resource by path — event risk, macro indicators, per-chain network activity, analytics dashboards and more — plus the settlement proof. |
| `blockchainiq_catalog` | free | The full catalogue: every resource, its path, price, parameters and an example response. |
| `blockchainiq_free_sample` | free | Bitcoin network activity for its latest day, unpaid — for verifying the integration before spending. |

Every paid tool returns `{ data, settlement }`, where `settlement` is the
decoded `PAYMENT-RESPONSE` header: payer address, network and the on-chain
transaction hash of the payment.

## Install

```bash
npm install blockchainiq-x402-langchain
# or, from this repository:
npm install
```

## Configure the paying wallet

Paid calls are signed by a wallet holding a little USDC on **Base**
(chain 8453). Settlement is gasless for the payer (x402 `exact` scheme,
EIP-3009), so the wallet needs USDC only — no ETH.

```bash
export AGENT_PRIVATE_KEY=0x...   # a dedicated agent wallet; never a main wallet
```

The key is read once when the tools are created. It is never passed to the
model: the tools close over the paying client, and the LLM only ever sees
tool names, arguments and JSON results.

A spend control is enforced before anything is signed: any single payment
above `maxAmountPerPayment` (default **$0.60** — the dearest call in the
catalogue is $0.50) is refused by the x402 client.

## Quickstart — one paid call

```bash
AGENT_PRIVATE_KEY=0x... npm run example:paid-call
```

This invokes `blockchainiq_market_brief` once: the request is answered 402,
the client signs a $0.01 USDC payment, retries, and prints the brief together
with its settlement proof.

## Use with a LangChain agent

```ts
import { ChatOpenAI } from "@langchain/openai"; // or any chat model
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { createBlockchainIqTools } from "blockchainiq-x402-langchain";

const tools = createBlockchainIqTools({
  // privateKey: "0x...",        // or set AGENT_PRIVATE_KEY
  maxAmountPerPayment: 0.6,      // dollars; default 0.6
});

const agent = createReactAgent({
  llm: new ChatOpenAI({ model: "gpt-4o-mini" }),
  tools,
});

const result = await agent.invoke({
  messages: [
    {
      role: "user",
      content:
        "Read the Blockchain IQ market brief, then check the next 7 days of event risk. What should a trading agent be careful about this week?",
    },
  ],
});
```

The agent discovers the rest itself: `blockchainiq_catalog` is free, so a
model can browse all 27 resources and their prices before it spends a cent.

## Free smoke test

No wallet, no spending — verifies the catalogue, the free sample, and the
402 payment handshake (decodes the `PAYMENT-REQUIRED` header):

```bash
npm run smoke
```

## How the payment works

1. The tool calls the resource with a fetch wrapped by
   [`@x402/fetch`](https://www.npmjs.com/package/@x402/fetch).
2. The API replies `402 Payment Required` with a `PAYMENT-REQUIRED` header
   quoting the price (x402 v2, USDC on Base, `payTo` the seller).
3. The client checks the quote against the spend cap, signs an EIP-3009
   `transferWithAuthorization` with the wallet (`ExactEvmScheme` from
   `@x402/evm`), and retries with the payment attached.
4. The API verifies, settles on-chain, and returns the data with a
   `PAYMENT-RESPONSE` header carrying the transaction hash — decoded into
   the tool result as `settlement`.

Errors and 404s are never charged.

## Catalogue

The live catalogue (free, no key) is the source of truth for resources and
prices: <https://www.blockchainiq.co/api/x402/v1> — 27 resources from $0.01
to $2.00 per call, including macro indicators, an economic & crypto calendar,
sector indices, per-chain network activity for 15 blockchains, analytics
dashboards, reports and chain studies. Background on the API:
<https://www.blockchainiq.co/agents>.

## License

MIT. Market data and analysis from Blockchain IQ are not investment advice;
see their [terms](https://www.blockchainiq.co/terms).
