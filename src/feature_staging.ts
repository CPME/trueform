import type { IntentFeature } from "./ir.js";

export type FeatureStage = "stable" | "staging";

export type FeatureStageEntry = {
  stage: FeatureStage;
  notes?: string;
};

const SURFACE_MODE_FEATURE_KINDS = new Set<string>([
  "feature.extrude",
  "feature.revolve",
  "feature.loft",
  "feature.sweep",
  "feature.pipeSweep",
  "feature.hexTubeSweep",
]);

export const TF_STAGED_FEATURES: Readonly<Record<string, FeatureStageEntry>> = Object.freeze({
  "feature.thread": {
    stage: "staging" as const,
    notes: "Modelled thread output is still under active geometry tuning.",
  },
  "feature.surface": {
    stage: "staging" as const,
    notes: "Surface workflows are supported but still maturing for reliability.",
  },
  "feature.extrude:mode.surface": {
    stage: "staging" as const,
    notes: "Surface-mode extrude remains in staging while robustness improves.",
  },
  "feature.revolve:mode.surface": {
    stage: "staging" as const,
    notes: "Surface-mode revolve remains in staging while robustness improves.",
  },
  "feature.loft:mode.surface": {
    stage: "staging" as const,
    notes: "Surface-mode loft remains in staging while robustness improves.",
  },
  "feature.sweep:mode.surface": {
    stage: "staging" as const,
    notes: "Surface-mode sweep remains in staging while robustness improves.",
  },
  "feature.pipeSweep:mode.surface": {
    stage: "staging" as const,
    notes: "Surface-mode pipe sweep remains in staging while robustness improves.",
  },
  "feature.hexTubeSweep:mode.surface": {
    stage: "staging" as const,
    notes: "Surface-mode hex tube sweep remains in staging while robustness improves.",
  },
});

export function listStagedFeatureKeys(): string[] {
  return Object.keys(TF_STAGED_FEATURES).sort();
}

export function featureStageKey(feature: IntentFeature): string {
  if (
    SURFACE_MODE_FEATURE_KINDS.has(feature.kind) &&
    (feature as { mode?: string }).mode === "surface"
  ) {
    return `${feature.kind}:mode.surface`;
  }
  return feature.kind;
}

export function getFeatureStage(feature: IntentFeature): {
  key: string;
  stage: FeatureStage;
  notes?: string;
} {
  const key = featureStageKey(feature);
  const entry = TF_STAGED_FEATURES[key];
  if (!entry) return { key, stage: "stable" };
  return {
    key,
    stage: entry.stage,
    notes: entry.notes,
  };
}
