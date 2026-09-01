import { chmodSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [{
    name: "cli-executable-permissions",
    closeBundle() {
      chmodSync(resolve("dist/cli/ai-reviewer.js"), 0o755);
    },
  }],
  ssr: {
    noExternal: true,
  },
  build: {
    ssr: "scripts/ai-reviewer.ts",
    outDir: "dist/cli",
    copyPublicDir: false,
    rollupOptions: {
      external: [/^node:/],
      output: {
        banner: [
          "#!/usr/bin/env node",
          'import { fileURLToPath as __cliFileURLToPath } from "node:url";',
          'import { dirname as __cliDirname } from "node:path";',
          "const __filename = __cliFileURLToPath(import.meta.url);",
          "const __dirname = __cliDirname(__filename);",
        ].join("\n"),
        entryFileNames: "ai-reviewer.js",
      },
    },
  },
});
