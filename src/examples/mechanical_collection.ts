import type { PartDefinition } from "./parts/types.js";
import { partRegistry } from "./parts/registry.js";

export type MechanicalExample = PartDefinition;

export const mechanicalCollection: MechanicalExample[] = partRegistry;
