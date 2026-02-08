import type { IntentPart } from "../../dsl.js";

export type PartDefinition = {
  id: string;
  title: string;
  sourcePath?: string;
  part: IntentPart;
  tags?: string[];
};
