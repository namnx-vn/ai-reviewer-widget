import type {
  AIProvider,
  AIReviewAgentId,
  AIReviewFinding,
  AIReviewFocus,
  AIReviewInput,
  AIReviewResult,
  AIReviewWarning,
} from "./types";

export const DEFAULT_AI_REVIEW_AGENTS: readonly AIReviewFocus[] = [
  {
    agent: "security",
    role: "Staff Application Security Engineer",
    concerns: [
      "authentication, authorization and privilege boundaries",
      "injection, XSS, SSRF and unsafe code execution",
      "secrets, sensitive data exposure and cryptographic misuse",
      "session, token, transport and dependency security",
    ],
  },
  {
    agent: "react",
    role: "Staff React Engineer",
    concerns: [
      "hooks correctness, stale closures and effect lifecycle",
      "rendering behavior, state ownership and unnecessary rerenders",
      "React Server Components and client/server boundaries",
      "accessibility and user-visible React regressions",
    ],
  },
  {
    agent: "architecture",
    role: "Staff Software Architect",
    concerns: [
      "module boundaries, dependency direction and coupling",
      "API contracts and cross-layer responsibility leaks",
      "micro-frontend boundaries and integration risks",
      "maintainability risks caused by structural design changes",
    ],
  },
];

export class MultiAgentAIProvider implements AIProvider {
  readonly name: string;

  constructor(
    private readonly provider: AIProvider,
    private readonly agents: readonly AIReviewFocus[] = DEFAULT_AI_REVIEW_AGENTS,
  ) {
    if (agents.length === 0) {
      throw new Error("Multi-agent review requires at least one specialist agent.");
    }

    this.name = `${provider.name}:multi-agent`;
  }

  async review(input: AIReviewInput): Promise<AIReviewResult> {
    const reviews = await Promise.allSettled(
      this.agents.map((agent) =>
        this.provider.review({
          ...input,
          focus: agent,
        })),
    );

    const findings: AIReviewFinding[] = [];
    const warnings: AIReviewWarning[] = [];
    let successfulAgents = 0;

    reviews.forEach((review, index) => {
      const agent = this.agents[index];
      if (!agent) return;

      if (review.status === "rejected") {
        warnings.push(createAgentFailureWarning(agent.agent));
        return;
      }

      successfulAgents += 1;
      findings.push(
        ...review.value.findings.map((finding) => ({
          ...finding,
          agent: agent.agent,
        })),
      );
      warnings.push(...(review.value.warnings ?? []));
    });

    if (successfulAgents === 0) {
      throw new Error("All specialist AI review agents failed.");
    }

    return {
      findings: mergeAgentFindings(findings),
      warnings,
    };
  }
}

function createAgentFailureWarning(agent: AIReviewAgentId): AIReviewWarning {
  return {
    code: "AI_AGENT_FAILED",
    agent,
    message: `${agent} AI review agent was unavailable; other review results were retained.`,
  };
}

function mergeAgentFindings(
  findings: readonly AIReviewFinding[],
): AIReviewFinding[] {
  const merged = new Map<string, AIReviewFinding>();

  for (const finding of findings) {
    const key = findingKey(finding);
    const existing = merged.get(key);

    if (!existing || finding.confidence > existing.confidence) {
      merged.set(key, finding);
    }
  }

  return [...merged.values()];
}

function findingKey(finding: AIReviewFinding): string {
  return [
    finding.file ?? "",
    finding.line ?? "",
    normalizeTitle(finding.title),
  ].join("\u0000");
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
