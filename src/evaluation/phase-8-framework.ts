import type { ReviewUseCases, SourceFile } from "../application/review";
import type { Severity } from "../domain/review";
import type { EvaluationCase, EvaluationCaseReport } from "./contracts";
import { runEvaluationSuite } from "./runner";

export type FrameworkEvidenceFidelity = "synthetic" | "verified-source";

export interface Phase8FrameworkDimensions {
  readonly reactMajor: 18 | 19;
  readonly compiler: "enabled" | "disabled" | "unknown";
  readonly nextMajor?: 15 | 16;
  readonly router: "app" | "pages" | "mixed" | "none";
  readonly appLayout: "app" | "src/app" | "none";
  readonly runtime: "node" | "edge" | "mixed" | "unknown";
}

export interface Phase8FrameworkCase extends EvaluationCase {
  readonly evidence: FrameworkEvidenceFidelity;
  readonly expectation: "positive-defect" | "negative-control";
  readonly protectedRegression: boolean;
  readonly versionGate: boolean;
  readonly dimensions: Phase8FrameworkDimensions;
}

export interface Phase8FrameworkQualificationReport {
  readonly schemaVersion: "1";
  readonly generatedAt: string;
  readonly status: "qualified" | "fail" | "insufficient-evidence";
  readonly rollout: "blocking-eligible" | "advisory";
  readonly reasons: readonly string[];
  readonly caseCount: number;
  readonly metrics: {
    readonly deterministicRepeatability: number;
    readonly ruleCrashRate: number;
    readonly highSeverityPrecision: number | null;
    readonly overallActionablePrecision: number;
    readonly protectedFalsePositiveRegressions: number;
    readonly versionGatingRegressions: number;
  };
}

export interface Phase8FrameworkQualificationOptions {
  readonly generatedAt?: () => string;
}

const packageFile = (
  react: string,
  next?: string,
  compiler?: string,
): SourceFile => ({
  path: "package.json",
  content: JSON.stringify({
    dependencies: { react, ...(next === undefined ? {} : { next }) },
    devDependencies: compiler === undefined ? {} : { "babel-plugin-react-compiler": compiler },
  }),
});

const expected = (ruleId: string, severity: Severity, file: string) => ({
  id: `${ruleId}:${file}`,
  ruleId,
  severity,
  file,
});

export const PHASE_8_FRAMEWORK_CORPUS: readonly Phase8FrameworkCase[] = [
  {
    version: 1,
    id: "react-18-path-negative",
    title: "React 18 app-like path is not Next.js",
    category: "framework-negative-control",
    evidence: "synthetic",
    expectation: "negative-control",
    protectedRegression: true,
    versionGate: true,
    dimensions: {
      reactMajor: 18, compiler: "unknown", router: "none", appLayout: "none", runtime: "unknown",
    },
    files: [
      packageFile("18.3.1"),
      { path: "src/app/page.tsx", content: "export default function Page() { return <main>Safe</main>; }" },
    ],
    expectedFindings: [],
  },
  {
    version: 1,
    id: "react-19-compiler-positive",
    title: "React 19 compiler project retains correctness rules",
    category: "react-19",
    evidence: "synthetic",
    expectation: "positive-defect",
    protectedRegression: false,
    versionGate: false,
    dimensions: {
      reactMajor: 19, compiler: "enabled", router: "none", appLayout: "none", runtime: "unknown",
    },
    files: [
      packageFile("19.2.0", undefined, "1.0.0"),
      {
        path: "src/Effect.tsx",
        content: [
          'import { useEffect } from "react";',
          "export function Effect({ value }: { value: string }) {",
          "  useEffect(() => { JSON.stringify(value); }, []);",
          "  return <div />;",
          "}",
        ].join("\n"),
      },
    ],
    expectedFindings: [expected("react.hooks.missing-deps", "medium", "src/Effect.tsx")],
  },
  {
    version: 1,
    id: "react-19-unknown-clean",
    title: "React 19 unknown compiler state",
    category: "framework-negative-control",
    evidence: "synthetic",
    expectation: "negative-control",
    protectedRegression: true,
    versionGate: true,
    dimensions: {
      reactMajor: 19, compiler: "unknown", router: "none", appLayout: "none", runtime: "unknown",
    },
    files: [packageFile("19.3.0"), { path: "src/Card.tsx", content: "export function Card() { return <article />; }" }],
    expectedFindings: [],
  },
  {
    version: 1,
    id: "next-15-app-node-positive",
    title: "Next.js 15 App Router server component defect",
    category: "next-app-router",
    evidence: "synthetic",
    expectation: "positive-defect",
    protectedRegression: false,
    versionGate: false,
    dimensions: {
      reactMajor: 19, compiler: "disabled", nextMajor: 15, router: "app", appLayout: "app", runtime: "node",
    },
    files: [
      packageFile("19.1.0", "15.5.0"),
      { path: "next.config.ts", content: "export default { reactCompiler: false };" },
      { path: "app/route.ts", content: "export const runtime = 'nodejs';" },
      {
        path: "app/page.tsx",
        content: 'import { useState } from "react";\nexport default function Page() { useState(0); return <main />; }',
      },
    ],
    expectedFindings: [expected("nextjs.app-router.client-hook-in-server-component", "high", "app/page.tsx")],
  },
  {
    version: 1,
    id: "next-15-pages-negative",
    title: "Next.js 15 Pages Router negative control",
    category: "framework-negative-control",
    evidence: "synthetic",
    expectation: "negative-control",
    protectedRegression: true,
    versionGate: true,
    dimensions: {
      reactMajor: 18, compiler: "unknown", nextMajor: 15, router: "pages", appLayout: "none", runtime: "node",
    },
    files: [
      packageFile("18.3.1", "15.5.0"),
      { path: "pages/index.tsx", content: "export default function Home() { return <main />; }" },
      { path: "pages/api/health.ts", content: "export const runtime = 'nodejs'; export default () => null;" },
    ],
    expectedFindings: [],
  },
  {
    version: 1,
    id: "next-16-src-app-edge-positive",
    title: "Next.js 16 src App Router client boundary defect",
    category: "next-app-router",
    evidence: "synthetic",
    expectation: "positive-defect",
    protectedRegression: false,
    versionGate: false,
    dimensions: {
      reactMajor: 19, compiler: "enabled", nextMajor: 16, router: "app", appLayout: "src/app", runtime: "edge",
    },
    files: [
      packageFile("19.3.0", "16.1.0", "1.0.0"),
      {
        path: "src/app/page.tsx",
        content: '"use client";\nimport { cookies } from "next/headers";\nexport const runtime = "edge";\nexport default function Page() { return null; }',
      },
    ],
    expectedFindings: [expected("nextjs.app-router.server-import-in-client-component", "high", "src/app/page.tsx")],
  },
  {
    version: 1,
    id: "next-16-mixed-runtime-negative",
    title: "Next.js 16 mixed router and runtime negative control",
    category: "framework-negative-control",
    evidence: "synthetic",
    expectation: "negative-control",
    protectedRegression: true,
    versionGate: true,
    dimensions: {
      reactMajor: 19, compiler: "unknown", nextMajor: 16, router: "mixed", appLayout: "app", runtime: "mixed",
    },
    files: [
      packageFile("19.3.0", "16.1.0"),
      { path: "app/page.tsx", content: "export const runtime = 'edge'; export default function Page() { return <main />; }" },
      { path: "pages/index.tsx", content: "export const runtime = 'nodejs'; export default function Home() { return <main />; }" },
    ],
    expectedFindings: [],
  },
  {
    version: 1,
    id: "next-16-cache-action-negative",
    title: "Next.js 16 cache and action multi-file negative control",
    category: "framework-negative-control",
    evidence: "synthetic",
    expectation: "negative-control",
    protectedRegression: true,
    versionGate: false,
    dimensions: {
      reactMajor: 19, compiler: "unknown", nextMajor: 16, router: "app", appLayout: "app", runtime: "edge",
    },
    files: [
      packageFile("19.3.0", "16.1.0"),
      { path: "next.config.ts", content: "export default { cacheComponents: true };" },
      { path: "app/data.ts", content: 'export async function readItems() { "use cache"; return []; }' },
      { path: "app/actions.ts", content: '"use server";\nimport { revalidateTag } from "next/cache";\nexport async function save() { revalidateTag("items", "max"); }' },
      { path: "app/page.tsx", content: "export const runtime = 'edge'; export default function Page() { return <main />; }" },
    ],
    expectedFindings: [],
  },
] as const;

export function runPhase8FrameworkQualification(
  reviewUseCases: ReviewUseCases,
  cases: readonly Phase8FrameworkCase[],
  options: Phase8FrameworkQualificationOptions = {},
): Phase8FrameworkQualificationReport {
  const evaluation = runEvaluationSuite(scopeFrameworkFindings(reviewUseCases), cases, {
    repetitions: 2,
    generatedAt: options.generatedAt,
  });
  const crashCount = cases.reduce((count, evaluationCase) => {
    try {
      const result = reviewUseCases.reviewFiles(evaluationCase.files);
      return count + result.warnings.filter((warning) => warning.code === "REACT_RULE_FAILED").length;
    } catch {
      return count + 1;
    }
  }, 0);
  const protectedFalsePositiveRegressions = countCaseFalsePositives(
    cases,
    evaluation.cases,
    (entry) => entry.protectedRegression && entry.expectation === "negative-control",
  );
  const versionGatingRegressions = countCaseFalsePositives(
    cases,
    evaluation.cases,
    (entry) => entry.versionGate,
  );
  const highSeverityPrecision = calculateHighSeverityPrecision(evaluation.cases);
  const failures = [
    ...(evaluation.summary.stability < 1 ? ["Deterministic repeatability below 100%"] : []),
    ...(crashCount > 0 ? ["Framework rules crashed on a supported fixture"] : []),
    ...(protectedFalsePositiveRegressions > 0 ? ["Protected framework false-positive regression"] : []),
    ...(versionGatingRegressions > 0 ? ["Version-gating regression"] : []),
  ];
  const insufficient = [
    ...(cases.some((entry) => entry.evidence !== "verified-source")
      ? ["Synthetic fixtures are not empirical qualification evidence"]
      : []),
    ...(cases.length < 20 ? ["Insufficient independent framework cases"] : []),
  ];
  const precisionFailures = [
    ...(highSeverityPrecision !== null && highSeverityPrecision < 0.98
      ? ["High-severity precision below 98%"]
      : []),
    ...(evaluation.summary.precision < 0.95 ? ["Overall actionable precision below 95%"] : []),
  ];
  const status = failures.length > 0 || precisionFailures.length > 0
    ? "fail"
    : insufficient.length > 0
      ? "insufficient-evidence"
      : "qualified";

  return {
    schemaVersion: "1",
    generatedAt: evaluation.generatedAt,
    status,
    rollout: status === "qualified" ? "blocking-eligible" : "advisory",
    reasons: [...failures, ...precisionFailures, ...insufficient],
    caseCount: cases.length,
    metrics: {
      deterministicRepeatability: evaluation.summary.stability,
      ruleCrashRate: cases.length === 0 ? 0 : crashCount / cases.length,
      highSeverityPrecision,
      overallActionablePrecision: evaluation.summary.precision,
      protectedFalsePositiveRegressions,
      versionGatingRegressions,
    },
  };
}

function scopeFrameworkFindings(reviewUseCases: ReviewUseCases): ReviewUseCases {
  return {
    ...reviewUseCases,
    reviewFiles(files, configuration, incrementalScope) {
      const result = reviewUseCases.reviewFiles(files, configuration, incrementalScope);
      return {
        ...result,
        findings: result.findings.filter((finding) =>
          finding.ruleId.startsWith("react.") || finding.ruleId.startsWith("next")),
      };
    },
  };
}

function countCaseFalsePositives(
  cases: readonly Phase8FrameworkCase[],
  reports: readonly EvaluationCaseReport[],
  predicate: (entry: Phase8FrameworkCase) => boolean,
): number {
  return cases.reduce((count, entry) => {
    if (!predicate(entry)) return count;
    const report = reports.find((candidate) => candidate.caseId === entry.id);
    return count + (report?.metrics.falsePositiveCount ?? 0);
  }, 0);
}

function calculateHighSeverityPrecision(
  reports: readonly EvaluationCaseReport[],
): number | null {
  const correct = reports.reduce((count, report) => count + report.matchResult.matches.filter(
    ({ actual }) => actual.severity === "critical" || actual.severity === "high",
  ).length, 0);
  const falsePositives = reports.reduce((count, report) => count + report.matchResult.falsePositives.filter(
    (actual) => actual.severity === "critical" || actual.severity === "high",
  ).length, 0);
  return correct + falsePositives === 0 ? null : correct / (correct + falsePositives);
}
