import assert from "node:assert/strict";
import test from "node:test";
import { DEVELOPER_APIS, classifyError, developerErrors, developerStats, groupErrors, integrationFindings, observeCall, reliability } from "./developerView";

test("paths classify to real groups and drop query strings", () => {
  const call = observeCall({
    at: "2026-10-02T00:00:00.000Z",
    path: "/api/v1/dex/aggregator/quote?userWalletAddress=0xabc&amount=1",
    status: 200,
    ttfbMs: 180,
    ok: true,
  });
  assert.equal(call.path.includes("?"), false);
  assert.equal(call.path.includes("0xabc"), false);
  assert.equal(call.group, "Quote / Routing");
  assert.equal(call.operation, "read");
  assert.equal(call.retries, null);
});

test("latency stats stay blank until real samples exist", () => {
  const empty = developerStats([]);
  assert.equal(empty.count, 0);
  assert.equal(empty.medianMs, null);
  assert.equal(empty.p95Ms, null);
  assert.equal(empty.success, 0);
  const one = developerStats([observeCall({ at: "a", path: "/api/v1/dex/aggregator/quote", status: 200, ttfbMs: 180, ok: true })]);
  assert.equal(one.medianMs, 180);
  assert.equal(one.p95Ms, null);
  const many = Array.from({ length: 20 }, (_, index) =>
    observeCall({ at: `t${index}`, path: "/api/v1/dex/pre-transaction/simulate", status: 200, ttfbMs: 100 + index, ok: true }),
  );
  assert.equal(developerStats(many).p95Ms != null, true);
});

test("failures classify only when the recorded code or note supports it", () => {
  const expiry = observeCall({ at: "b", path: "/api/v1/dex/aggregator/quote", ok: false, errorCode: 40401, note: "Quote expired" });
  const hours = observeCall({ at: "c", path: "/api/v1/dex/aggregator/quote", ok: false, errorCode: 40367, note: "US hours" });
  const network = observeCall({ at: "d", path: "/api/v1/dex/aggregator/quote", ok: false, status: 0, note: "network error" });
  assert.equal(classifyError(expiry), "quote_expiry");
  assert.equal(classifyError(hours), "provider");
  assert.equal(classifyError(network), "unknown");
  const groups = groupErrors([expiry, hours]);
  assert.equal(groups.find((row) => row.category === "timeout"), undefined);
  assert.equal(groups.find((row) => row.category === "quote_expiry")?.count, 1);
  const none = reliability([]);
  assert.equal(none.observed, false);
  assert.equal(none.successRate, null);
  assert.equal(none.medianMs, null);
  const few = reliability([observeCall({ at: "a", path: "/api/v1/dex/aggregator/quote", status: 200, ttfbMs: 10, ok: true })]);
  assert.equal(few.observed, true);
  assert.equal(few.successRate, null);
  const findings = integrationFindings([hours], [{ networkFeeUsd: 0.02, gasEstimateUsd: null, priceImpactPct: null }]);
  assert.equal(findings.length >= 2, true);
  assert.equal(findings.some((row) => row.observation.includes("gas")), true);
});

test("errors are only calls that failed or retried", () => {
  const ok = observeCall({ at: "a", path: "/api/quote", status: 200, ok: true });
  const bad = observeCall({ at: "b", path: "/api/v1/dex/aggregator/quote", status: 200, ok: false, errorCode: 40367, note: "US hours" });
  const retry = observeCall({ at: "c", path: "/api/v1/dex/aggregator/quote", kind: "rate_limit", status: 429, retries: 1, note: "retry 1 of 3" });
  const errors = developerErrors([ok, bad, retry]);
  assert.deepEqual(errors.map((row) => row.at), ["b", "c"]);
  assert.equal(DEVELOPER_APIS.some((row) => row.path === "/api/v1/dex/pre-transaction/simulate"), true);
  assert.equal(DEVELOPER_APIS.some((row) => row.path.includes("not-a-real-api")), false);
});
