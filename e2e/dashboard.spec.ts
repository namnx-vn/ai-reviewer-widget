import { expect, test } from "@playwright/test";

test("renders the deterministic review dashboard", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /review code with/i })).toBeVisible();
  await expect(page.getByText("Review Score")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Findings" })).toBeVisible();
  await expect(page.getByText("Unsafe eval() usage")).toBeVisible();
});
