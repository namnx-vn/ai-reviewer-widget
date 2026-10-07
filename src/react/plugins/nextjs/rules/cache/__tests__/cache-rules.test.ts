import { describe, expect, it } from "vitest";

import { ReactEngine } from "../../../../../engine/react-engine";
import type { ReactPlugin } from "../../../../../engine/react-plugin";
import type { FrameworkContext } from "../../../../../semantic";
import {
  nextjsMismatchedCacheTagInvalidationRule,
  nextjsMutationWithoutCacheInvalidationRule,
  nextjsRequestDataInsideCacheRule,
} from "..";

const cachePlugin: ReactPlugin = {
  id: "nextjs-cache-test",
  name: "Next.js cache test plugin",
  version: "8.5.0",
  rules: [
    nextjsRequestDataInsideCacheRule,
    nextjsMutationWithoutCacheInvalidationRule,
    nextjsMismatchedCacheTagInvalidationRule,
  ],
};

const cacheComponentsContext: FrameworkContext = {
  react: {
    detected: true,
    version: "19.2.8",
    compiler: "unknown",
  },
  nextjs: {
    version: "16.0.0",
    router: "app",
    cacheComponents: true,
    runtime: "node",
  },
};

function analyze(
  source: string,
  framework: FrameworkContext = cacheComponentsContext,
) {
  return new ReactEngine().analyze({
    source,
    file: "app/products/actions.ts",
    plugins: [cachePlugin],
    framework,
  });
}

describe("nextjsRequestDataInsideCacheRule", () => {
  it("detects aliased request APIs inside a use cache function", () => {
    const findings = analyze(`
      import { cookies as requestCookies, headers } from "next/headers";

      export async function getProducts() {
        "use cache";
        const session = (await requestCookies()).get("session");
        const locale = (await headers()).get("accept-language");
        return { session, locale };
      }
    `);

    expect(findings.filter(
      (finding) => finding.ruleId === "next.cache.request-data-inside-cache",
    )).toHaveLength(2);
  });

  it("detects a request API in a file-level use cache export", () => {
    const findings = analyze(`
      "use cache";
      import * as requestData from "next/headers";

      export async function getTheme() {
        return (await requestData.cookies()).get("theme");
      }
    `);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "next.cache.request-data-inside-cache",
    );
  });

  it("does not treat use cache private as a shared cache boundary", () => {
    const findings = analyze(`
      import { cookies } from "next/headers";

      export async function getTheme() {
        "use cache: private";
        return (await cookies()).get("theme");
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("does not run when Cache Components capability is unknown", () => {
    const findings = analyze(
      `
        import { cookies } from "next/headers";
        export async function getTheme() {
          "use cache";
          return (await cookies()).get("theme");
        }
      `,
      {
        ...cacheComponentsContext,
        nextjs: {
          ...cacheComponentsContext.nextjs!,
          cacheComponents: "unknown",
        },
      },
    );

    expect(findings).toHaveLength(0);
  });

  it("does not confuse a shadowed request API import with the imported binding", () => {
    const findings = analyze(`
      import { cookies } from "next/headers";

      export async function getTheme(cookies: () => Promise<Map<string, string>>) {
        "use cache";
        return (await cookies()).get("theme");
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("does not confuse a hoisted local function with the imported request API", () => {
    const findings = analyze(`
      import { cookies } from "next/headers";

      export async function getTheme() {
        "use cache";
        function cookies() {
          return new Map([["theme", "dark"]]);
        }
        return cookies().get("theme");
      }
    `);

    expect(findings).toHaveLength(0);
  });
});

describe("nextjsMutationWithoutCacheInvalidationRule", () => {
  it("detects a Prisma mutation in a module-level Server Action without invalidation", () => {
    const findings = analyze(`
      "use server";
      import { PrismaClient } from "@prisma/client";
      import { cacheTag } from "next/cache";
      const database = new PrismaClient();

      async function getProducts() {
        "use cache";
        cacheTag("products");
        return database.product.findMany();
      }

      export async function renameProduct(id: string, name: string) {
        await database.product.update({ where: { id }, data: { name } });
      }
    `);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "next.cache.mutation-without-invalidation",
    );
  });

  it("detects a Prisma mutation in a function-level Server Action", () => {
    const findings = analyze(`
      import { PrismaClient as Client } from "@prisma/client";
      import { cacheTag } from "next/cache";
      const database = new Client();

      async function getProducts() {
        "use cache";
        cacheTag("products");
        return database.product.findMany();
      }

      export async function renameProduct(id: string, name: string) {
        "use server";
        await database.product.update({ where: { id }, data: { name } });
      }
    `);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "next.cache.mutation-without-invalidation",
    );
  });

  it.each(["revalidateTag", "updateTag", "refresh"])(
    "accepts an aliased %s call in the mutating Server Action",
    (apiName) => {
      const findings = analyze(`
        "use server";
        import { PrismaClient } from "@prisma/client";
        import { cacheTag, ${apiName} as invalidate } from "next/cache";
        const database = new PrismaClient();

        async function getProducts() {
          "use cache";
          cacheTag("products");
          return database.product.findMany();
        }

        export async function renameProduct(id: string, name: string) {
          await database.product.update({ where: { id }, data: { name } });
          invalidate(${apiName === "refresh" ? "" : '"products"'});
        }
      `);

      expect(findings).toHaveLength(0);
    },
  );

  it("does not infer a mutation sink from an unrelated object method", () => {
    const findings = analyze(`
      "use server";
      import { repository } from "./repository";

      export async function renameProduct(id: string, name: string) {
        await repository.product.update({ id, name });
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("does not warn for a Prisma action without local cache dependency evidence", () => {
    const findings = analyze(`
      "use server";
      import { PrismaClient } from "@prisma/client";
      const database = new PrismaClient();

      export async function renameProduct(id: string, name: string) {
        await database.product.update({ where: { id }, data: { name } });
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("does not relate a mutation to a cached read of another Prisma model", () => {
    const findings = analyze(`
      "use server";
      import { PrismaClient } from "@prisma/client";
      import { cacheTag } from "next/cache";
      const database = new PrismaClient();

      async function getOrders() {
        "use cache";
        cacheTag("orders");
        return database.order.findMany();
      }

      export async function renameProduct(id: string, name: string) {
        await database.product.update({ where: { id }, data: { name } });
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("does not analyze an ordinary server function as a Server Action", () => {
    const findings = analyze(`
      import { PrismaClient } from "@prisma/client";
      const database = new PrismaClient();

      export async function renameProduct(id: string, name: string) {
        await database.product.update({ where: { id }, data: { name } });
      }
    `);

    expect(findings).toHaveLength(0);
  });
});

describe("nextjsMismatchedCacheTagInvalidationRule", () => {
  it("detects a statically mismatched tag for the same cached Prisma model", () => {
    const findings = analyze(`
      "use server";
      import { PrismaClient } from "@prisma/client";
      import { cacheTag, updateTag } from "next/cache";
      const database = new PrismaClient();

      async function getProducts() {
        "use cache";
        cacheTag("products");
        return database.product.findMany();
      }

      export async function renameProduct(id: string, name: string) {
        await database.product.update({ where: { id }, data: { name } });
        updateTag("orders");
      }
    `);

    expect(findings.map((finding) => finding.ruleId)).toEqual([
      "next.cache.tag-never-invalidated",
    ]);
  });

  it("accepts a matching static tag", () => {
    const findings = analyze(`
      "use server";
      import { PrismaClient } from "@prisma/client";
      import { cacheTag, updateTag } from "next/cache";
      const database = new PrismaClient();

      async function getProducts() {
        "use cache";
        cacheTag("products");
        return database.product.findMany();
      }

      export async function renameProduct(id: string, name: string) {
        await database.product.update({ where: { id }, data: { name } });
        updateTag("products");
      }
    `);

    expect(findings).toHaveLength(0);
  });

  it("does not guess a relation when either tag is dynamic", () => {
    const findings = analyze(`
      "use server";
      import { PrismaClient } from "@prisma/client";
      import { cacheTag, updateTag } from "next/cache";
      const database = new PrismaClient();
      const cachedTag = process.env.PRODUCT_TAG!;
      const invalidatedTag = process.env.INVALIDATION_TAG!;

      async function getProducts() {
        "use cache";
        cacheTag(cachedTag);
        return database.product.findMany();
      }

      export async function renameProduct(id: string, name: string) {
        await database.product.update({ where: { id }, data: { name } });
        updateTag(invalidatedTag);
      }
    `);

    expect(findings).toHaveLength(0);
  });
});
