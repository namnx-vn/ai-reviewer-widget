import type { ReviewResult } from "../domain/review";

export function formatReviewComment(result: ReviewResult): string {
  const { score, stats } = result;

  const status =
    score >= 90
      ? "🟢 Excellent"
      : score >= 75
        ? "🟡 Good"
        : score >= 50
          ? "🟠 Needs improvement"
          : "🔴 Changes requested";

  return `
## 🤖 AI Reviewer

### ${status}

**Review Score: ${score}/100**

| Severity | Count |
|---|---:|
| 🚨 Critical | ${stats.critical} |
| 🔴 High | ${stats.high} |
| 🟡 Medium | ${stats.medium} |
| 🔵 Low | ${stats.low} |
| ℹ️ Info | ${stats.info} |

---

### Analysis

- 🧠 AST analysis
- 🏗️ Architecture analysis
- 🤖 AI reasoning

**${result.findings.length} finding(s) detected.**

---

<sub>
AI Reviewer · Automated engineering review
</sub>
`;
}
