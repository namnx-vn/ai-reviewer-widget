import type { ReactRule } from "./react-rule";

export interface ReactPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly rules: readonly ReactRule[];
}