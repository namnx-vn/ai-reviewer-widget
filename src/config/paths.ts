import type { ResolvedReviewConfiguration } from "./contracts";

export function isPathIncluded(path: string, config: ResolvedReviewConfiguration): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  return config.include.some((pattern) => matchesGlob(normalized, pattern))
    && !config.exclude.some((pattern) => matchesGlob(normalized, pattern));
}

function matchesGlob(path: string, pattern: string): boolean {
  const normalized = pattern.replace(/\\/g, "/").replace(/^\.\//, "");
  return new RegExp(`^${globExpression(normalized)}$`).test(path);
}

function globExpression(pattern: string): string {
  let expression = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index] ?? "";
    const next = pattern[index + 1];
    if (character === "*" && next === "*") {
      const followedBySlash = pattern[index + 2] === "/";
      expression += followedBySlash ? "(?:.*/)?" : ".*";
      index += followedBySlash ? 2 : 1;
    } else if (character === "*") expression += "[^/]*";
    else if (character === "?") expression += "[^/]";
    else if (character === "{") {
      const close = pattern.indexOf("}", index + 1);
      if (close === -1) expression += "\\{";
      else {
        const alternatives = pattern.slice(index + 1, close).split(",").map(escapeRegex);
        expression += `(?:${alternatives.join("|")})`;
        index = close;
      }
    } else expression += escapeRegex(character);
  }
  return expression;
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.-]/g, "\\$&");
}
