await octokit.checks.create({
  owner,
  repo,
  name: "AI Reviewer",
  head_sha: sha,
  status: "completed",
  conclusion:
    decision === "PASS"
      ? "success"
      : decision === "WARN"
        ? "neutral"
        : "failure",

  output: {
    title: "AI Review",
    summary: markdown,
  },
});
