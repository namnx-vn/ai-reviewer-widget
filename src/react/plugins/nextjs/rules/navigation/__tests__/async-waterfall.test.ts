import { describe, expect, it } from "vitest";

import { ReactEngine } from "../../../../../engine/react-engine";
import type { ReactPlugin } from "../../../../../engine/react-plugin";
import type { FrameworkContext } from "../../../../../semantic";
import { nextjsIndependentAwaitWaterfallRule } from "..";

const plugin: ReactPlugin = {
  id: "phase-8-navigation-test",
  name: "Phase 8 navigation test rules",
  version: "8.0.0",
  rules: [nextjsIndependentAwaitWaterfallRule],
};
const framework: FrameworkContext = {
  react: { detected: true, compiler: "unknown" },
  nextjs: { router: "app", cacheComponents: "unknown", runtime: "node" },
};

function analyze(source: string, file = "app/dashboard/page.tsx") {
  return new ReactEngine().analyze({ source, file, plugins: [plugin], framework });
}

describe("nextjsIndependentAwaitWaterfallRule", () => {
  it("detects consecutive independent fetches with static inputs", () => {
    const findings = analyze(`
      export default async function Page() {
        const user = await fetch("https://example.test/user");
        const teams = await fetch("https://example.test/teams");
        return <main>{user.status + teams.status}</main>;
      }
    `);

    expect(findings.map((finding) => finding.ruleId)).toEqual([
      "next.navigation.async-waterfall",
    ]);
    expect(findings[0]?.source).toBe("performance");
  });

  it("allows a later request that depends on the first result", () => {
    const findings = analyze(`
      export default async function Page() {
        const user = await fetch("https://example.test/user");
        const teams = await fetch(user.headers.get("teams-url")!);
        return <main>{teams.status}</main>;
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("allows explicitly concurrent requests", () => {
    const findings = analyze(`
      export default async function Page() {
        const [user, teams] = await Promise.all([
          fetch("https://example.test/user"),
          fetch("https://example.test/teams"),
        ]);
        return <main>{user.status + teams.status}</main>;
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("does not infer independence for non-literal fetch inputs", () => {
    const findings = analyze(`
      export default async function Page({ userUrl, teamsUrl }) {
        const user = await fetch(userUrl);
        const teams = await fetch(teamsUrl);
        return <main>{user.status + teams.status}</main>;
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("only analyzes navigation special files", () => {
    const findings = analyze(`
      export async function loadData() {
        const user = await fetch("https://example.test/user");
        const teams = await fetch("https://example.test/teams");
        return [user, teams];
      }
    `, "src/app/dashboard/data.ts");

    expect(findings).toHaveLength(0);
  });
});
