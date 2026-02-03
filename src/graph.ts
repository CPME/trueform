import { FeatureIR, Graph, ID, PartIR } from "./ir.js";

export class CompileError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function buildDependencyGraph(part: PartIR): Graph {
  const nodes = part.features.map((f) => f.id);
  const edges: Array<{ from: ID; to: ID }> = [];
  for (const feature of part.features) {
    if (!feature.deps || feature.deps.length === 0) continue;
    for (const dep of feature.deps) {
      edges.push({ from: dep, to: feature.id });
    }
  }
  return { nodes, edges };
}

export function topoSortDeterministic(features: FeatureIR[], graph: Graph): ID[] {
  const indegree = new Map<ID, number>();
  for (const node of graph.nodes) indegree.set(node, 0);
  for (const edge of graph.edges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const byId = new Map<ID, FeatureIR>(features.map((f) => [f.id, f]));
  const queue: ID[] = [];
  for (const [id, deg] of indegree) {
    if (deg === 0) queue.push(id);
  }
  queue.sort();

  const result: ID[] = [];
  while (queue.length > 0) {
    const id = queue.shift() as ID;
    result.push(id);
    for (const edge of graph.edges) {
      if (edge.from !== id) continue;
      const next = edge.to;
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if (indegree.get(next) === 0) {
        queue.push(next);
        queue.sort();
      }
    }
  }

  if (result.length !== graph.nodes.length) {
    const missing = graph.nodes.filter((n) => !result.includes(n));
    throw new CompileError(
      "cycle",
      `Dependency cycle detected: ${missing.join(", ")}`
    );
  }

  // Enforce stable tie-breaker on deterministic, lexicographic feature IDs.
  for (const id of result) {
    if (!byId.has(id)) {
      throw new CompileError("missing_feature", `Missing feature ${id}`);
    }
  }

  return result;
}
