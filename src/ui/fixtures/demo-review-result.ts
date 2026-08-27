import type { ReviewResult } from "../../domain/review";

export const demoReviewResult: ReviewResult = {
  score: 50,
  decision: "WARN",
  durationMs: 0,
  warnings: [],
  stats: {
    critical: 1,
    high: 1,
    medium: 0,
    low: 1,
    info: 0,
  },
  findings: [
    {
      id: "demo:no-eval",
      ruleId: "security.no-eval",
      title: "Unsafe eval() usage",
      message: "eval() can execute arbitrary code and introduces code injection risks.",
      severity: "critical",
      source: "ast",
      confidence: 1,
      location: { file: "src/utils/parser.ts", line: 3 },
      suggestion: "Replace eval() with explicit parsing or a data-driven implementation.",
    },
    {
      id: "demo:mfe-boundary",
      ruleId: "architecture.mfe.remote-boundary",
      title: "Micro-Frontend boundary violation",
      message: "Remote modules must not import other remote modules directly.",
      severity: "high",
      source: "architecture",
      confidence: 1,
      location: { file: "src/remote/Checkout.tsx", line: 2 },
    },
    {
      id: "demo:no-console",
      ruleId: "quality.no-console",
      title: "Console logging detected",
      message: "Production code should use the application's structured logging mechanism.",
      severity: "low",
      source: "ast",
      confidence: 1,
      location: { file: "src/remote/Checkout.tsx", line: 5 },
    },
  ],
};
