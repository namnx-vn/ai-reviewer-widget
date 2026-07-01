import type { ArchitectureRule } from "./types";

export const noRemoteToRemoteImport: ArchitectureRule = {
  id: "mfe.no-remote-to-remote",

  description:
    "Remote applications must not directly import another remote application.",

  check(file, importedModule) {
    const isRemote = file.includes("/remote/");

    const importsRemote =
      importedModule.includes("/remote/") ||
      importedModule.includes("@remote/");

    return isRemote && importsRemote;
  },
};