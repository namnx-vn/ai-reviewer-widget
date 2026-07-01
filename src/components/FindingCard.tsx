import type { ReviewFinding } from "../review/types";

interface FindingCardProps {
  finding: ReviewFinding;
}

export function FindingCard({
  finding,
}: FindingCardProps) {
  return (
    <article>
      <header>
        <strong>{finding.title}</strong>

        <span>
          {finding.severity.toUpperCase()}
        </span>
      </header>

      <p>{finding.message}</p>

      {finding.location && (
        <small>
          {finding.location.file}
          {finding.location.line
            ? `:${finding.location.line}`
            : ""}
        </small>
      )}

      {finding.suggestion && (
        <p>
          <strong>Suggestion:</strong>{" "}
          {finding.suggestion}
        </p>
      )}
    </article>
  );
}