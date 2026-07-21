import type { TSESTree } from "@typescript-eslint/typescript-estree";

/** Offline package metadata supplied by the repository collection boundary. */
export interface SupplyChainManifest {
  readonly path: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly scripts?: Readonly<Record<string, string>>;
}

export interface SupplyChainLockfile {
  readonly path: string;
  readonly format: "npm" | "yarn" | "pnpm" | "bun" | "other";
}

export interface SupplyChainSourceFile {
  readonly path: string;
  readonly source: string;
  readonly ast?: TSESTree.Program;
}

/**
 * Repository metadata used by the offline supply-chain analyzer.
 * Advisory/CVE data deliberately does not belong in this contract.
 */
export interface SupplyChainRepository {
  readonly manifests: readonly SupplyChainManifest[];
  readonly lockfiles: readonly SupplyChainLockfile[];
  readonly sourceFiles: readonly SupplyChainSourceFile[];
  readonly criticalSources?: readonly string[];
}
