import type { SemanticDifferential, SemanticProgram, SemanticPropertyChange } from "./contracts";

export function compareSemanticPrograms(base: SemanticProgram, head: SemanticProgram): SemanticDifferential {
  const ids = [...new Set([...base.caches, ...head.caches].map((item) => item.id))].sort();
  const complete = base.complete && head.complete;
  const changes = ids.flatMap((id) => {
    const before = base.caches.find((item) => item.id === id);
    const after = head.caches.find((item) => item.id === id);
    return (["retention", "cleanup"] as const).map((property): SemanticPropertyChange => {
      const left = before?.[property];
      const right = after?.[property];
      let classification: SemanticPropertyChange["classification"] = "unknown";
      if (complete && left !== "unknown" && right !== "unknown") {
        if (left === undefined) classification = "introduced";
        else if (right === undefined) classification = "removed";
        else if (left === right) classification = "unchanged";
        else if (property === "retention") classification = left === "weak-key" ? "worsened" : "improved";
        else classification = left === "observed-unconditional" ? "removed-observation" : "added-observation";
      }
      return { id, property, base: left, head: right, classification };
    });
  });
  return { complete, changes };
}
