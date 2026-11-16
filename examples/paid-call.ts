/**
 * The qualifying demo: ONE paid call through x402, made with the
 * LangChain market-brief tool ($0.01, settled in USDC on Base).
 *
 *   AGENT_PRIVATE_KEY=0x... npm run example:paid-call
 *
 * The wallet needs a little USDC on Base. Settlement is gasless for
 * the payer, so no ETH is required. The tool returns the brief's JSON
 * plus the settlement proof (payer, network, transaction hash) decoded
 * from the PAYMENT-RESPONSE header.
 */
import { createBlockchainIqTools } from "../src/index.js";

const [marketBrief] = createBlockchainIqTools();
const out = await marketBrief.invoke({});
console.log(out);
