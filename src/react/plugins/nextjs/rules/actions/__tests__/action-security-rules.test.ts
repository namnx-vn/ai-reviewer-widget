import { describe, expect, it } from "vitest";

import { ReactEngine } from "../../../../../engine/react-engine";
import type { ReactPlugin } from "../../../../../engine/react-plugin";
import type { FrameworkContext } from "../../../../../semantic";
import { nextjsServerActionSecurityRules } from "..";

const plugin: ReactPlugin = {
  id: "nextjs-server-actions-test",
  name: "Next.js Server Actions test plugin",
  version: "8.6.0",
  rules: nextjsServerActionSecurityRules,
};

const nextAppContext: FrameworkContext = {
  react: {
    detected: true,
    version: "19.2.8",
    compiler: "unknown",
  },
  nextjs: {
    version: "16.0.0",
    router: "app",
    cacheComponents: "unknown",
    runtime: "unknown",
  },
};

function analyze(
  source: string,
  framework: FrameworkContext | undefined = nextAppContext,
) {
  return new ReactEngine().analyze({
    source,
    file: "app/account/actions.ts",
    plugins: [plugin],
    framework,
  });
}

function ruleIds(source: string, framework?: FrameworkContext) {
  return analyze(source, framework).map((finding) => finding.ruleId);
}

describe("Next.js Server Action security rules", () => {
  it("detects unvalidated FormData flowing to an established persistence mutation", () => {
    const findings = analyze(`
      "use server";

      export async function updateProfile(formData: FormData) {
        const displayName = formData.get("displayName");
        await db.user.update({
          where: { id: "known-user" },
          data: { displayName },
        });
      }
    `);

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: "nextjs.actions.unvalidated-mutation-input",
        severity: "info",
        confidence: 1,
        source: "security",
      }),
    ]));
  });

  it("accepts action input parsed by an explicit schema before mutation", () => {
    expect(ruleIds(`
      "use server";

      export async function updateProfile(formData: FormData) {
        const input = profileSchema.parse({
          displayName: formData.get("displayName"),
        });
        await db.user.update({
          where: { id: "known-user" },
          data: input,
        });
      }
    `)).not.toContain("nextjs.actions.unvalidated-mutation-input");
  });

  it("does not treat authentication or authorization naming as input validation", () => {
    expect(ruleIds(`
      export async function updateProfile(formData: FormData) {
        "use server";
        await authenticateUser();
        await authorizeUser();
        await db.user.update({
          where: { id: "known-user" },
          data: { displayName: formData.get("displayName") },
        });
      }
    `)).toContain("nextjs.actions.unvalidated-mutation-input");
  });

  it("detects direct client-controlled ownership assignment at a mutation boundary", () => {
    expect(ruleIds(`
      "use server";

      export async function createDocument(input: { ownerId: string; title: string }) {
        const parsed = documentSchema.parse(input);
        await prisma.document.create({
          data: { ownerId: parsed.ownerId, title: parsed.title },
        });
      }
    `)).toContain("nextjs.actions.client-controlled-owner");
  });

  it("allows ownership identifiers derived from server-side session state", () => {
    expect(ruleIds(`
      "use server";

      export async function createDocument(input: { title: string }) {
        const parsed = documentSchema.parse(input);
        const session = await getServerSession();
        await prisma.document.create({
          data: { ownerId: session.user.id, title: parsed.title },
        });
      }
    `)).not.toContain("nextjs.actions.client-controlled-owner");
  });

  it("does not infer a dangerous mutation from an unresolved business helper", () => {
    expect(analyze(`
      "use server";

      export async function updatePreferences(input: unknown) {
        await savePreferences(input);
      }
    `)).toHaveLength(0);
  });

  it("detects a statically obvious secret returned across an action boundary", () => {
    expect(ruleIds(`
      "use server";

      export async function createSession(input: { email: string }) {
        const accessToken = await sessionService.issueAccessToken(input.email);
        return { accessToken };
      }
    `)).toContain("nextjs.actions.sensitive-return");
  });

  it("allows redacted values and ordinary serializable action results", () => {
    expect(analyze(`
      "use server";

      export async function createSession(input: { email: string }) {
        const accessToken = await sessionService.issueAccessToken(input.email);
        return {
          accessToken: redact(accessToken),
          privateKey: null,
          tokenPreview: redact(accessToken),
          hasToken: Boolean(accessToken),
          ok: true,
        };
      }
    `)).toHaveLength(0);
  });

  it("requires a valid Server Action declaration and established App Router context", () => {
    const source = `
      export async function updateProfile(input: unknown) {
        await db.user.update({ data: input });
        return { accessToken: "opaque" };
      }
    `;

    expect(analyze(source)).toHaveLength(0);
    expect(analyze(`"use server";${source}`, {
      react: { detected: true, compiler: "unknown" },
    })).toHaveLength(0);
    expect(analyze(`"use server";${source}`, {
      react: { detected: true, compiler: "unknown" },
      nextjs: {
        router: "pages",
        cacheComponents: "unknown",
        runtime: "unknown",
      },
    })).toHaveLength(0);
  });

  it("ignores non-exported helpers in a module-level use server file", () => {
    expect(analyze(`
      "use server";

      async function internalHelper(input: unknown) {
        await db.user.update({ data: input });
        return { accessToken: "opaque" };
      }
    `)).toHaveLength(0);
  });
});
