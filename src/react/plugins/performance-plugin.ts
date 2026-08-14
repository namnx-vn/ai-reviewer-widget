import type { ReactPlugin } from "../engine/react-plugin";
import { phase37ReactPerformanceRules } from "../rules/performance/phase-3-7";

export const performancePlugin: ReactPlugin = {
  id: "performance",
  name: "Performance Intelligence",
  version: "3.7.15",
  rules: phase37ReactPerformanceRules,
};
