import { runIntelligenceCli } from "../src/cli/intelligence";

process.exitCode = await runIntelligenceCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (message) => process.stdout.write(message),
  stderr: (message) => process.stderr.write(message),
});
