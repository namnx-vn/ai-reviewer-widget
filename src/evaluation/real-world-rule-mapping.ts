export interface RealWorldRuleMapping {
  readonly caseId: string;
  readonly expectationId: string;
  readonly acceptableRuleIds: readonly string[];
  readonly rationale: string;
}

export const REAL_WORLD_RULE_MAPPINGS: readonly RealWorldRuleMapping[] = [
  {
    caseId: "vercel-next-86406-health-endpoint",
    expectationId: "operational-data-exposure",
    acceptableRuleIds: ["security.data.operational-response-exposure"],
    rationale: "The production security rule identifies direct serialization of a health-check result whose type exposes process memory and uptime, matching the adjudicated operational-data exposure.",
  },
  {
    caseId: "vercel-next-96608-csp-segment-nonce",
    expectationId: "missing-segment-script-nonce",
    acceptableRuleIds: ["security.xss.csp-nonce-propagation"],
    rationale: "The production CSP rule identifies a nonce-capable render context whose executable segment script descriptor omits the nonce.",
  },
  {
    caseId: "vercel-next-97043-pages-csp-nonce",
    expectationId: "missing-streaming-nonce",
    acceptableRuleIds: ["security.xss.csp-nonce-propagation"],
    rationale: "The production CSP rule identifies a nonce-capable Pages render path whose streaming renderer options do not forward the nonce.",
  },
  {
    caseId: "vercel-next-95182-edge-action-body-limit",
    expectationId: "unbounded-action-body",
    acceptableRuleIds: ["performance.backpressure.unbounded-queue"],
    rationale: "The production backpressure rule directly identifies the unbounded chunk accumulation that makes the Edge Server Action body-size limit missing in the minimized reproduction.",
  },
  {
    caseId: "tanstack-query-11381-ssr-script-xss",
    expectationId: "unsafe-inline-state-serialization",
    acceptableRuleIds: ["security.xss.raw-json-script-serialization"],
    rationale: "The production XSS rule identifies direct JSON.stringify interpolation into an executable script element without HTML-safe escaping.",
  },
  {
    caseId: "vercel-next-98152-loading-template-csp-nonce",
    expectationId: "missing-boundary-script-nonce",
    acceptableRuleIds: ["security.xss.csp-nonce-propagation"],
    rationale: "The production CSP rule identifies a nonce-capable boundary render context whose executable loading/template script descriptor omits the nonce.",
  },
  {
    caseId: "vercel-next-96580-env-fifo-reload",
    expectationId: "destructive-env-reload",
    acceptableRuleIds: ["security.configuration.destructive-env-reload"],
    rationale: "The production configuration rule identifies environment replacement occurring before replacement dotenv files are read, matching the destructive forced-reload behavior.",
  },
  {
    caseId: "tanstack-query-11270-null-hydration",
    expectationId: "unguarded-hydration-state",
    acceptableRuleIds: ["quality.correctness.nullable-hydration-state"],
    rationale: "The production core AST rule identifies a hydration helper that accepts nullable state but dereferences the nullable root before a guard.",
  },
  {
    caseId: "vercel-next-93154-search-param-cache-collision",
    expectationId: "multi-value-search-param-collision",
    acceptableRuleIds: ["quality.correctness.search-param-multivalue-key"],
    rationale: "The production core AST rule identifies Object.fromEntries(new URLSearchParams(...)) inside cache-key construction, which collapses repeated parameter values and causes the adjudicated key collision.",
  },
];

export function findRealWorldRuleMapping(
  caseId: string,
  expectationId: string,
): RealWorldRuleMapping | undefined {
  return REAL_WORLD_RULE_MAPPINGS.find(
    (mapping) => mapping.caseId === caseId && mapping.expectationId === expectationId,
  );
}
