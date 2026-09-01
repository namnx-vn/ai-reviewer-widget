import { runCli } from "../src/cli/run";
import packageMetadata from "../package.json" with { type: "json" };

const exitCode = runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (message) => process.stdout.write(message),
  stderr: (message) => process.stderr.write(message),
}, { version: packageMetadata.version });

process.exitCode = exitCode;
