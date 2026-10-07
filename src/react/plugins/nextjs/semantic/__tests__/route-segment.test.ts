import { describe, expect, it } from "vitest";

import { getAppRouterSpecialFileRole } from "../route-segment";

describe("getAppRouterSpecialFileRole", () => {
  it.each([
    ["app/layout.tsx", "layout"],
    ["src/app/account/page.tsx", "page"],
    ["app/api/users/route.ts", "route"],
    ["src/app/loading.js", "loading"],
    ["app/error.jsx", "error"],
    ["app/not-found.tsx", "not-found"],
    ["app/template.tsx", "template"],
  ] as const)("classifies %s as %s", (file, role) => {
    expect(getAppRouterSpecialFileRole(file)).toBe(role);
  });

  it.each([
    "src/components/page.tsx",
    "pages/account/page.tsx",
    "application/page.tsx",
    "app/account/page.test.tsx",
  ])("does not classify ordinary file %s", (file) => {
    expect(getAppRouterSpecialFileRole(file)).toBeUndefined();
  });
});
