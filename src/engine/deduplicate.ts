import type {
  ReviewFinding,
} from "../domain/review";

function normalize(
  value: string,
): string {
  return value
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " ",
    )
    .trim();
}

function isSameFinding(
  a: ReviewFinding,
  b: ReviewFinding,
): boolean {
  if (
    a.location?.file !==
    b.location?.file
  ) {
    return false;
  }

  if (
    a.location?.line !==
    b.location?.line
  ) {
    return false;
  }

  return (
    normalize(a.title) ===
    normalize(b.title)
  );
}

export function deduplicateFindings(
  findings: ReviewFinding[],
): ReviewFinding[] {
  const result: ReviewFinding[] = [];

  for (const finding of findings) {
    const duplicate =
      result.find((existing) =>
        isSameFinding(
          existing,
          finding,
        ),
      );

    if (!duplicate) {
      result.push(finding);
      continue;
    }

    // Deterministic analysis wins.
    if (
      duplicate.source === "ai" &&
      finding.source !== "ai"
    ) {
      const index =
        result.indexOf(
          duplicate,
        );

      result[index] = finding;
    }
  }

  return result;
}