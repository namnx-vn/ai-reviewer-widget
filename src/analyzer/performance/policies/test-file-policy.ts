const TEST_FILE_RUNTIME_LIFECYCLE_RULES: ReadonlySet<string> = new Set([
  "performance.async.fire-and-forget-resource-work",
  "performance.memory.listener-leak",
  "performance.memory.timer-leak",
  "performance.resource.missing-cleanup",
]);

export function isPerformanceTestFile(file: string): boolean {
  const normalized = file.replaceAll("\\", "/");
  return normalized.includes("/__tests__/")
    || /(?:^|\/)tests?\//u.test(normalized)
    || /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(normalized);
}

export function shouldRunPerformanceRuleForFile(
  ruleId: string,
  file: string,
): boolean {
  return !isPerformanceTestFile(file)
    || !TEST_FILE_RUNTIME_LIFECYCLE_RULES.has(ruleId);
}
