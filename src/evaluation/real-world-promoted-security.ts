import type { RealWorldSeedDefinition } from "./real-world";

const BUNDLE_PATH = "evaluation/fixtures/real-world/promoted-security-batch-1.json";

export const PROMOTED_SECURITY_SEEDS: readonly RealWorldSeedDefinition[] = [
  {
    id: "vercel-next-96608-csp-segment-nonce",
    title: "App Router segment scripts omit the request CSP nonce",
    category: "security-csp",
    fixturePath: "evaluation/fixtures/real-world/virtual/vercel-next-96608-csp-segment-nonce.ts",
    fixtureBundle: { path: BUNDLE_PATH, key: "vercel-next-96608-csp-segment-nonce" },
    source: {
      repository: "vercel/next.js",
      number: 96608,
      url: "https://github.com/vercel/next.js/pull/96608",
      headSha: "9d5b9b2b543d3e0cd050fb1fdbfea0ca5423cb82",
    },
    expectations: [
      {
        id: "missing-segment-script-nonce",
        kind: "must-find",
        title: "Preserve the CSP nonce on executable segment scripts",
        severity: "medium",
        rationale: "The PR fixes script tags emitted for loading/template/error segments that omitted ctx.nonce and were blocked under strict nonce CSPs.",
      },
    ],
  },
  {
    id: "vercel-next-97043-pages-csp-nonce",
    title: "Pages Router streaming fails to forward the CSP nonce",
    category: "security-csp",
    fixturePath: "evaluation/fixtures/real-world/virtual/vercel-next-97043-pages-csp-nonce.ts",
    fixtureBundle: { path: BUNDLE_PATH, key: "vercel-next-97043-pages-csp-nonce" },
    source: {
      repository: "vercel/next.js",
      number: 97043,
      url: "https://github.com/vercel/next.js/pull/97043",
      headSha: "5b75881c54e8798fc92ec4065fe2e616410cb46c",
    },
    expectations: [
      {
        id: "missing-streaming-nonce",
        kind: "must-find",
        title: "Forward the CSP nonce into the React streaming renderer",
        severity: "medium",
        rationale: "Without streamOptions.nonce, inline completion scripts for large Suspense boundaries are emitted without the request nonce.",
      },
    ],
  },
  {
    id: "vercel-next-95182-edge-action-body-limit",
    title: "Edge Server Actions accept request bodies without the configured size limit",
    category: "security-resource-limits",
    fixturePath: "evaluation/fixtures/real-world/virtual/vercel-next-95182-edge-action-body-limit.ts",
    fixtureBundle: { path: BUNDLE_PATH, key: "vercel-next-95182-edge-action-body-limit" },
    source: {
      repository: "vercel/next.js",
      number: 95182,
      url: "https://github.com/vercel/next.js/pull/95182",
      headSha: "bc500531fec1df7e3c0eb160cade6ac65575ba94",
    },
    expectations: [
      {
        id: "unbounded-action-body",
        kind: "must-find",
        title: "Enforce Server Action body limits while consuming Edge request streams",
        severity: "medium",
        rationale: "The affected Edge path consumed multipart and non-multipart bodies without honoring serverActions.bodySizeLimit, unlike the Node path.",
      },
    ],
  },
  {
    id: "tanstack-query-11381-ssr-script-xss",
    title: "SSR documentation embeds raw JSON inside an executable script",
    category: "security-xss",
    fixturePath: "evaluation/fixtures/real-world/virtual/tanstack-query-11381-ssr-script-xss.ts",
    fixtureBundle: { path: BUNDLE_PATH, key: "tanstack-query-11381-ssr-script-xss" },
    source: {
      repository: "TanStack/query",
      number: 11381,
      url: "https://github.com/TanStack/query/pull/11381",
      headSha: "0e804997745b012d44920fccee39c721ec80bfc0",
    },
    expectations: [
      {
        id: "unsafe-inline-state-serialization",
        kind: "must-find",
        title: "Do not embed raw JSON.stringify output directly into a script tag",
        severity: "high",
        rationale: "The merged follow-up explicitly removed an example where attacker-controlled serialized state could break out of the script element.",
      },
    ],
  },
  {
    id: "vercel-next-98105-action-decode-status",
    title: "Malformed Server Action input is classified as an internal server error",
    category: "security-input-validation",
    fixturePath: "evaluation/fixtures/real-world/virtual/vercel-next-98105-action-decode-status.ts",
    fixtureBundle: { path: BUNDLE_PATH, key: "vercel-next-98105-action-decode-status" },
    source: {
      repository: "vercel/next.js",
      number: 98105,
      url: "https://github.com/vercel/next.js/pull/98105",
      headSha: "eac661c587273328df7d7f1407f0d3c09f31c98f",
    },
    expectations: [
      {
        id: "decode-error-classification",
        kind: "advisory",
        title: "Classify malformed request bodies separately from action execution failures",
        severity: "low",
        rationale: "The PR separates decode errors from genuine server faults so malformed input returns a client error instead of polluting 5xx monitoring.",
      },
    ],
  },
  {
    id: "vercel-next-98265-image-redirect-guard",
    title: "Image redirect handling preserves the external SSRF guard",
    category: "security-negative",
    fixturePath: "evaluation/fixtures/real-world/virtual/vercel-next-98265-image-redirect-guard.ts",
    fixtureBundle: { path: BUNDLE_PATH, key: "vercel-next-98265-image-redirect-guard" },
    source: {
      repository: "vercel/next.js",
      number: 98265,
      url: "https://github.com/vercel/next.js/pull/98265",
      headSha: "82b5304c3f6b719706d2ef3aeb756a065216c080",
    },
    expectations: [
      {
        id: "preserve-ssrf-guard",
        kind: "must-not-find",
        title: "Do not flag redirect handling that delegates cross-origin targets to the guarded external fetch path",
        rationale: "The reviewed change intentionally keeps private-IP validation on cross-origin redirects and bounds redirect depth.",
      },
    ],
  },
  {
    id: "vercel-next-95238-bounded-resume-decompression",
    title: "PPR resume decompression is explicitly output-bounded",
    category: "security-negative",
    fixturePath: "evaluation/fixtures/real-world/virtual/vercel-next-95238-bounded-resume-decompression.ts",
    fixtureBundle: { path: BUNDLE_PATH, key: "vercel-next-95238-bounded-resume-decompression" },
    source: {
      repository: "vercel/next.js",
      number: 95238,
      url: "https://github.com/vercel/next.js/pull/95238",
      headSha: "42d997da821c761e490350032b14c56c68e736ca",
    },
    expectations: [
      {
        id: "bounded-decompression",
        kind: "must-not-find",
        title: "Do not report zip-bomb risk when decompression enforces maxOutputLength",
        rationale: "The reviewed fix handles gzip/deflate/brotli while applying an explicit decompressed-output bound.",
      },
    ],
  },
  {
    id: "vercel-next-95123-dev-origin-inheritance",
    title: "Development-only trusted origins are merged without affecting production",
    category: "security-negative",
    fixturePath: "evaluation/fixtures/real-world/virtual/vercel-next-95123-dev-origin-inheritance.ts",
    fixtureBundle: { path: BUNDLE_PATH, key: "vercel-next-95123-dev-origin-inheritance" },
    source: {
      repository: "vercel/next.js",
      number: 95123,
      url: "https://github.com/vercel/next.js/pull/95123",
      headSha: "3a6198238b13a6d9fc28aa5cf70ee2c1ba68fe6d",
    },
    expectations: [
      {
        id: "dev-only-origin-policy",
        kind: "must-not-find",
        title: "Do not flag development-only origin inheritance as production CSRF relaxation",
        rationale: "The reviewed change merges allowedDevOrigins only during development and leaves production resolution untouched.",
      },
    ],
  },
  {
    id: "vercel-next-97252-pr-adopt-confirmation",
    title: "Fork PR adoption exposes a deliberate privileged-code trust boundary",
    category: "security-workflow",
    fixturePath: "evaluation/fixtures/real-world/virtual/vercel-next-97252-pr-adopt-confirmation.ts",
    fixtureBundle: { path: BUNDLE_PATH, key: "vercel-next-97252-pr-adopt-confirmation" },
    source: {
      repository: "vercel/next.js",
      number: 97252,
      url: "https://github.com/vercel/next.js/pull/97252",
      headSha: "a48007ce0446ead2f2f86974eb27d199d494abd0",
    },
    expectations: [
      {
        id: "interactive-adoption-gate",
        kind: "must-not-find",
        title: "Do not report the guarded adoption flow as silently granting fork code secrets",
        rationale: "The script refuses non-interactive input and requires retyping the contributor handle before pushing code into a secrets-enabled branch.",
      },
      {
        id: "privileged-fork-adoption",
        kind: "advisory",
        title: "Keep explicit review attention on the fork-to-privileged-branch transition",
        severity: "medium",
        rationale: "Even with a confirmation gate, adopting fork code changes the trust boundary and deserves human review.",
      },
    ],
  },
  {
    id: "vercel-next-97027-bounded-websocket-transport",
    title: "WebSocket transport rejects invalid handshakes and oversized messages before acceptance",
    category: "security-negative",
    fixturePath: "evaluation/fixtures/real-world/virtual/vercel-next-97027-bounded-websocket-transport.ts",
    fixtureBundle: { path: BUNDLE_PATH, key: "vercel-next-97027-bounded-websocket-transport" },
    source: {
      repository: "vercel/next.js",
      number: 97027,
      url: "https://github.com/vercel/next.js/pull/97027",
      headSha: "7457f3774cfbeeca1c1c191b6574887fde5c87ab",
    },
    expectations: [
      {
        id: "bounded-websocket-transport",
        kind: "must-not-find",
        title: "Do not flag the transport merely for handling raw WebSocket frames when origin and payload bounds are explicit",
        rationale: "The reviewed transport validates upgrade metadata and applies fixed per-connection payload and queue limits.",
      },
    ],
  },
];
