import { runCli } from "../src/cli/run";

const exitCode = runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (message) => process.stdout.write(message),
  stderr: (message) => process.stderr.write(message),
});

process.exitCode = exitCode;
