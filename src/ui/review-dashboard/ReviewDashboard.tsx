import type { ReviewResult } from "../../domain/review";
import { FindingCard } from "./FindingCard";
import { ScoreCard } from "./ScoreCard";

interface ReviewDashboardProps {
  result: ReviewResult;
}

export function ReviewDashboard({ result }: ReviewDashboardProps) {
  return (
    <main>
      <header>
        <p>AI ENGINEERING PLATFORM</p>

        <h1>
          Review code with
          <br />
          architectural context.
        </h1>

        <p>
          Deterministic AST analysis +
          architecture policies +
          AI reasoning.
        </p>
      </header>

      <ScoreCard score={result.score} />

      <section>
        <h2>Findings</h2>

        {result.findings.map((finding) => (
          <FindingCard key={finding.id} finding={finding} />
        ))}
      </section>
    </main>
  );
}
