import type { ReviewFinding } from "../../domain/review";
import type {
  HistoricalFindingMatch,
  PersistedFindingSnapshot,
} from "./contracts";

export function createFindingIdentity(finding: Pick<
  ReviewFinding,
  "ruleId" | "title" | "message" | "source" | "location"
>): string {
  return [
    finding.source,
    finding.ruleId,
    normalize(finding.location?.file),
    finding.location?.line ?? "",
    finding.title.trim(),
    finding.message.trim(),
  ].join("\u0000");
}

export function compareFindingHistory(
  current: readonly PersistedFindingSnapshot[],
  previous: readonly PersistedFindingSnapshot[],
): readonly HistoricalFindingMatch[] {
  const previousByIdentity = new Map(previous.map((finding) => [finding.identity, finding]));
  const currentByIdentity = new Map(current.map((finding) => [finding.identity, finding]));
  const matches: HistoricalFindingMatch[] = [];

  for (const finding of current) {
    const prior = previousByIdentity.get(finding.identity);
    matches.push({
      state: prior === undefined ? "new" : "existing",
      identity: finding.identity,
      current: finding,
      previous: prior,
    });
  }

  for (const finding of previous) {
    if (currentByIdentity.has(finding.identity)) continue;
    matches.push({
      state: "resolved",
      identity: finding.identity,
      previous: finding,
    });
  }

  return matches;
}

function normalize(value: string | undefined): string {
  return value?.replace(/\\/g, "/") ?? "";
}
