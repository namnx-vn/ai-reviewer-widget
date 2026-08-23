import type { AnalyzerContribution } from "./contracts";

interface RegisteredContribution {
  readonly contribution: AnalyzerContribution;
  readonly registrationIndex: number;
}

/** Persistent registry: registering a contribution returns a new snapshot. */
export class AnalyzerContributionRegistry {
  private constructor(
    private readonly registered: readonly RegisteredContribution[],
  ) {}

  static empty(): AnalyzerContributionRegistry {
    return new AnalyzerContributionRegistry([]);
  }

  register(contribution: AnalyzerContribution): AnalyzerContributionRegistry {
    assertContribution(contribution);
    if (this.registered.some(({ contribution: current }) => current.id === contribution.id)) {
      throw new Error(`Analyzer contribution "${contribution.id}" is already registered.`);
    }

    return new AnalyzerContributionRegistry([
      ...this.registered,
      { contribution, registrationIndex: this.registered.length },
    ]);
  }

  registerAll(contributions: readonly AnalyzerContribution[]): AnalyzerContributionRegistry {
    return contributions.reduce<AnalyzerContributionRegistry>(
      (registry, contribution) => registry.register(contribution),
      this,
    );
  }

  snapshot(): readonly AnalyzerContribution[] {
    return Object.freeze(
      [...this.registered]
        .sort((left, right) =>
          left.contribution.order - right.contribution.order
          || left.registrationIndex - right.registrationIndex)
        .map(({ contribution }) => contribution),
    );
  }
}

function assertContribution(contribution: AnalyzerContribution): void {
  if (contribution.id.trim().length === 0) {
    throw new Error("Analyzer contribution id must not be empty.");
  }
  if (!Number.isFinite(contribution.order)) {
    throw new Error(`Analyzer contribution "${contribution.id}" must have a finite order.`);
  }
}
