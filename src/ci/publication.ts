import { createCiArtifacts, formatCiSummary, type CiArtifact } from "./artifacts";
import type { CiExecutionResult } from "./contract";
import { createGitHubOutput } from "./github-actions";

export interface CiPublicationWriters {
  readonly writeArtifact: (artifact: CiArtifact) => Promise<void>;
  readonly appendGitHubOutput: (content: string) => Promise<void>;
  readonly appendStepSummary: (content: string) => Promise<void>;
}

export async function publishCiExecution(
  execution: CiExecutionResult,
  writers: CiPublicationWriters,
): Promise<CiExecutionResult> {
  let published = execution;
  for (const artifact of createCiArtifacts(execution)) {
    if (!await writerSucceeded(() => writers.writeArtifact(artifact))) {
      published = publicationFailure(published);
    }
  }

  if (!await writerSucceeded(() => writers.appendStepSummary(formatCiSummary(published)))) {
    published = publicationFailure(published);
  }
  if (!await writerSucceeded(() => writers.appendGitHubOutput(createGitHubOutput(published)))) {
    published = publicationFailure(published);
  }

  if (published !== execution && published.status === "publication_failed") {
    const jsonArtifact = createCiArtifacts(published)[0];
    await writerSucceeded(() => writers.writeArtifact(jsonArtifact));
  }
  return published;
}

function publicationFailure(execution: CiExecutionResult): CiExecutionResult {
  if (execution.status === "analysis_failed" || execution.status === "publication_failed") {
    return execution;
  }
  return {
    schemaVersion: execution.schemaVersion,
    status: "publication_failed",
    exitCode: 2,
    review: execution.review,
    ...(execution.metadata === undefined ? {} : { metadata: execution.metadata }),
    error: { message: "Review publication failed." },
  };
}

async function writerSucceeded(operation: () => Promise<void>): Promise<boolean> {
  try {
    await operation();
    return true;
  } catch {
    return false;
  }
}
