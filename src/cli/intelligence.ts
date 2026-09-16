import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLearningService, parseLearningEvent, type LearningEvent, type LearningService } from "../application/improvement";
import { createDefaultReviewUseCases } from "../application/review";
import { fingerprintReviewFinding } from "../domain/review";
import { evaluatePromotionQuality, parsePromotionQualityInput } from "../evaluation";
import { evaluatePullRequestReview, evaluateRepositoryReview, parsePullRequestReviewInput, parseRepositoryReviewInput } from "../evaluation/repository-review";
import { collectWorkspaceFiles } from "./files";
import { createFileLearningStore } from "./improvement-store";
import { createFilePromotionQualityPort, verifyQualitySourceEvidence } from "./intelligence-quality";
import { assertApprovedPromotionPolicy } from "./promotion-policy";
import type { CliIO } from "./run";

let runtimeDigest: string | undefined;
function baselineDigest(): string {
  if (runtimeDigest !== undefined) return runtimeDigest;
  const hash = createHash("sha256");
  const root = fileURLToPath(new URL("../", import.meta.url));
  for (const file of collectWorkspaceFiles(root).filter(({ path }) => !path.includes("__tests__/")).sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path).update("\0").update(file.content).update("\0");
  }
  runtimeDigest = hash.digest("hex");
  return runtimeDigest;
}

function readJson(path: string, cwd: string): unknown {
  return JSON.parse(readFileSync(resolve(cwd, path), "utf8"));
}

async function service(directory: string, io: CliIO, flags: readonly string[]): Promise<LearningService> {
  const store = createFileLearningStore(resolve(io.cwd, directory));
  const genesis = (await store.read()).events.find((event) => event.kind === "baseline");
  const initialProduction = genesis?.kind === "baseline"
    ? { version: genesis.productionVersion, candidateId: genesis.candidateId, artifactDigest: genesis.artifactDigest }
    : { version: 0, candidateId: "baseline-runtime", artifactDigest: baselineDigest() };
  const audited = flags.includes("--authorize-adjudication");
  return createLearningService({
    store, initialProduction,
    minimumShadowReviews: 3, maximumShadowDurationMs: 5000,
    quality: createFilePromotionQualityPort({ cwd: io.cwd, store, evidenceAuthorized: flags.includes("--authorize-quality-evidence") }),
    adjudication: { verifyOutcome: async () => audited, verifyRegression: async () => audited },
    shadow: { verify: async () => flags.includes("--authorize-shadow") },
    authorization: { authorize: async () => flags.includes("--authorize-release") },
  });
}

async function dispatchEvent(event: LearningEvent, learning: LearningService, cwd: string): Promise<unknown> {
  switch (event.kind) {
    case "review": return learning.recordReview(event);
    case "outcome": return learning.recordOutcome(event);
    case "candidate": {
      const digest = createHash("sha256").update(readFileSync(resolve(cwd, event.artifactRef))).digest("hex");
      if (digest !== event.artifactDigest) throw new Error("Candidate artifact digest mismatch.");
      return learning.propose(event);
    }
    case "regression": return learning.verifyRegression(event);
    case "evaluation": return learning.evaluate({ eventId: event.eventId, recordedAt: event.recordedAt,
      candidateId: event.candidateId, artifactDigest: event.artifactDigest, baselineVersion: event.baselineVersion,
      evaluationRef: event.evaluationRef, datasetVersion: event.datasetVersion, policyVersion: event.policyVersion });
    case "shadow": return learning.recordShadow(event);
    case "baseline": case "release": throw new Error("Baseline and release events are owned by initialize/promote/rollback operations.");
  }
}

async function review(command: string, path: string, learning: LearningService, io: CliIO): Promise<number> {
  const useCases = createDefaultReviewUseCases();
  const value = readJson(path, io.cwd);
  const report = command === "repository"
    ? await evaluateRepositoryReview(useCases, parseRepositoryReviewInput(value))
    : await evaluatePullRequestReview(useCases, parsePullRequestReviewInput(value));
  const head = "head" in report ? report.head : report;
  const reviewRunId = randomUUID();
  await learning.recordReview({ eventId: randomUUID(), recordedAt: new Date().toISOString(), reviewRunId,
    repositoryId: head.repositoryId, snapshotRef: head.snapshotId,
    mode: command === "repository" ? "repository" : "pull-request",
    findingFingerprints: head.result.findings.map((finding) => fingerprintReviewFinding(finding)) });
  io.stdout(`${JSON.stringify({ ...report, reviewRunId }, null, 2)}\n`);
  return report.status === "passed" ? 0 : 1;
}

function flagsOnly(flags: readonly string[]): void {
  const allowed = ["--authorize-adjudication", "--authorize-shadow", "--authorize-quality-evidence", "--authorize-release"];
  if (flags.some((flag) => !allowed.includes(flag)) || new Set(flags).size !== flags.length) throw new Error("Unknown or repeated intelligence option.");
}

async function quality(path: string, flags: readonly string[], io: CliIO): Promise<number> {
  flagsOnly(flags);
  const input = parsePromotionQualityInput(readJson(path, io.cwd));
  assertApprovedPromotionPolicy(input.policy);
  const result = evaluatePromotionQuality(input);
  const verified = flags.includes("--authorize-quality-evidence") && await verifyQualitySourceEvidence(input, io.cwd);
  const qualificationStatus = verified ? result.qualityStatus : "insufficient-evidence";
  io.stdout(`${JSON.stringify({ ...result, evidenceVerified: verified, qualificationStatus }, null, 2)}\n`);
  return qualificationStatus === "pass" && result.operationalStatus === "pass" ? 0 : 1;
}

async function release(command: string, parameters: readonly string[], io: CliIO): Promise<number> {
  const [directory, target, actorId, authorizationRef, ...flags] = parameters;
  if (!directory || !target || !actorId || !authorizationRef) throw new Error("Release requires store, candidate/target version, actor and authorization reference.");
  flagsOnly(flags);
  if (!flags.includes("--authorize-release")) throw new Error("Explicit --authorize-release is required.");
  const learning = await service(directory, io, flags);
  const identity = { eventId: randomUUID(), recordedAt: new Date().toISOString(), actorId, authorizationRef };
  let result;
  if (command === "promote") result = await learning.promote({ ...identity, candidateId: target });
  else {
    if (!/^\d+$/.test(target) || !Number.isSafeInteger(Number(target))) throw new Error("Invalid rollback version.");
    result = await learning.rollback({ ...identity, targetVersion: Number(target) });
  }
  io.stdout(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

export async function runIntelligenceCli(args: readonly string[], io: CliIO): Promise<number> {
  try {
    const [command, ...parameters] = args;
    if (command === undefined || command === "--help") {
      io.stdout("review-intelligence repository|pr <manifest.json> <store>\nreview-intelligence quality <bundle.json> [--authorize-quality-evidence]\nreview-intelligence event <metadata.json> <store> [--authorize-adjudication|--authorize-shadow|--authorize-quality-evidence]\nreview-intelligence failures|production <store> [repository]\nreview-intelligence promote|rollback <store> <candidate|version> <actor> <authorization-ref> --authorize-release\n");
      return 0;
    }
    if (command === "quality" && parameters[0]) return await quality(parameters[0], parameters.slice(1), io);
    if (command === "promote" || command === "rollback") return await release(command, parameters, io);
    if (command === "failures" || command === "production") {
      const [directory, repositoryId, ...extra] = parameters;
      if (!directory || extra.length || (command === "failures" && !repositoryId) || (command === "production" && repositoryId)) throw new Error("Invalid intelligence query arguments.");
      const learning = await service(directory, io, []);
      io.stdout(`${JSON.stringify(command === "production" ? await learning.production() : await learning.mineFailures(repositoryId), null, 2)}\n`);
      return 0;
    }
    const [path, directory, ...flags] = parameters;
    flagsOnly(flags);
    if (!path || !directory || !["repository", "pr", "event"].includes(command ?? "")) throw new Error("Invalid intelligence operation. Use --help.");
    if (command === "event") {
      const event = parseLearningEvent(readJson(path, io.cwd));
      io.stdout(`${JSON.stringify(await dispatchEvent(event, await service(directory, io, flags), io.cwd), null, 2)}\n`);
      return 0;
    }
    return await review(command ?? "", path, await service(directory, io, flags), io);
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : "Review intelligence operation failed."}\n`);
    return 2;
  }
}
