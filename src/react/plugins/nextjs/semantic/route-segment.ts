export type AppRouterSpecialFileRole =
  | "layout"
  | "page"
  | "template"
  | "loading"
  | "error"
  | "not-found"
  | "route";

const SPECIAL_FILE_PATTERN =
  /(?:^|\/)(?:src\/)?app\/(?:.*\/)?(layout|page|template|loading|error|not-found|route)\.(?:js|jsx|ts|tsx)$/;

export function getAppRouterSpecialFileRole(
  file: string,
): AppRouterSpecialFileRole | undefined {
  const match = SPECIAL_FILE_PATTERN.exec(normalizePath(file));
  const role = match?.[1];

  return isAppRouterSpecialFileRole(role) ? role : undefined;
}

function isAppRouterSpecialFileRole(
  value: string | undefined,
): value is AppRouterSpecialFileRole {
  return value === "layout" ||
    value === "page" ||
    value === "template" ||
    value === "loading" ||
    value === "error" ||
    value === "not-found" ||
    value === "route";
}

function normalizePath(file: string): string {
  return file.replace(/\\/g, "/").replace(/^\.\//, "");
}
