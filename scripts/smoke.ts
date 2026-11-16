/**
 * Free smoke test — needs no wallet and spends nothing.
 *
 *   npm run smoke
 *
 * 1. Reads the free catalogue.
 * 2. Reads the free sample.
 * 3. Calls the paid market brief WITHOUT paying and checks that the
 *    API answers HTTP 402 with a decodable PAYMENT-REQUIRED header
 *    (x402 v2, USDC on Base) — the handshake the paid tools complete.
 */
import { BIQ_BASE_URL } from "../src/index.js";

let failures = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

// 1. Catalogue (free)
const catRes = await fetch(`${BIQ_BASE_URL}/api/x402/v1`);
const cat = (await catRes.json()) as { data?: unknown[] };
check("catalogue HTTP 200", catRes.status === 200, `status ${catRes.status}`);
check(
  "catalogue lists resources",
  Array.isArray(cat.data) && cat.data.length > 0,
  `${cat.data?.length ?? 0} resources`,
);

// 2. Free sample. The catalogue documents a 503 here as "the figures are
// missing or more than 3 days old" — an upstream data-freshness state,
// not an integration failure. Accept 200, or a 503 saying exactly that.
const sampleRes = await fetch(`${BIQ_BASE_URL}/api/x402/v1/sample`);
const sampleBody = await sampleRes.text();
check(
  "free sample endpoint answers per its contract",
  sampleRes.status === 200 ||
    (sampleRes.status === 503 && sampleBody.includes("more than 3 days old")),
  sampleRes.status === 200
    ? "status 200"
    : `status 503 (upstream data stale: ${sampleBody.slice(0, 120)})`,
);

// 3. Paid brief, unpaid → 402 + PAYMENT-REQUIRED
const briefRes = await fetch(`${BIQ_BASE_URL}/api/x402/v1/brief`);
check("unpaid brief HTTP 402", briefRes.status === 402, `status ${briefRes.status}`);
const header = briefRes.headers.get("payment-required");
check("PAYMENT-REQUIRED header present", !!header);
if (header) {
  const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  const first = decoded?.accepts?.[0];
  console.log(JSON.stringify(decoded, null, 2).slice(0, 900));
  check("x402 version 2", decoded?.x402Version === 2);
  check(
    "first accept is USDC on Base",
    first?.network === "eip155:8453" && typeof first?.payTo === "string",
    first ? `${first.network} → ${first.payTo}` : "no accepts",
  );
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll smoke checks passed.");
