export type CollectedUniqueSubshape = {
  shape: unknown;
  meta: Record<string, unknown>;
  occurrenceIndices: number[];
};

export function collectUniqueSubshapes(options: {
  occt: unknown;
  shape: unknown;
  shapeKind: unknown;
  metaFactory: (subshape: unknown) => Record<string, unknown>;
  shapeHash: (shape: unknown) => number;
  shapesSame: (a: unknown, b: unknown) => boolean;
}): CollectedUniqueSubshape[] {
  const { occt, shape, shapeKind, metaFactory, shapeHash, shapesSame } = options;
  const module = occt as any;
  const collected: CollectedUniqueSubshape[] = [];
  const seen = new Map<number, CollectedUniqueSubshape[]>();
  const explorer = new module.TopExp_Explorer_1();
  explorer.Init(shape, shapeKind, module.TopAbs_ShapeEnum.TopAbs_SHAPE);
  let occurrenceIndex = 0;
  for (; explorer.More(); explorer.Next(), occurrenceIndex += 1) {
    const current = explorer.Current();
    const hash = shapeHash(current);
    const bucket = seen.get(hash);
    const existing = bucket?.find((candidate) => shapesSame(candidate.shape, current)) ?? null;
    if (existing) {
      existing.occurrenceIndices.push(occurrenceIndex);
      continue;
    }
    const entry: CollectedUniqueSubshape = {
      shape: current,
      meta: metaFactory(current),
      occurrenceIndices: [occurrenceIndex],
    };
    if (bucket) bucket.push(entry);
    else seen.set(hash, [entry]);
    collected.push(entry);
  }
  return collected;
}
