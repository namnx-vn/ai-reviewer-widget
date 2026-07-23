/**
 * Same-file interprocedural taint analysis.
 *
 * Cross-module resolution intentionally remains out of this first bounded
 * implementation: callers need only supply a parsed program and the existing
 * flow adapter, so no filesystem or module-loader capability is introduced.
 */
export { analyzeInterproceduralTaint } from "../flow";
