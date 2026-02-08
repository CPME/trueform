import type { PartDefinition } from "./types.js";
import { bearingHousing } from "./bearing_housing.js";
import { blockBasic } from "./block_basic.js";
import { bossedPlate } from "./bossed_plate.js";
import { hingeKnuckle } from "./hinge_knuckle.js";
import { hexTubeSweepPart } from "../../dsl/examples/hex_tube_sweep.js";
import { impellerHub } from "./impeller_hub.js";
import { lBracketCutout } from "./l_bracket_cutout.js";
import { plateHole } from "./plate_hole.js";
import { pipeAsm } from "./pipe_asm.js";
import { roundedPost } from "./rounded_post.js";
import { steppedPulley } from "./stepped_pulley.js";
import { tSlotCarriage } from "./t_slot_carriage.js";
import { valveBody } from "./valve_body.js";

export const partRegistry: PartDefinition[] = [
  blockBasic,
  plateHole,
  roundedPost,
  bossedPlate,
  lBracketCutout,
  steppedPulley,
  bearingHousing,
  tSlotCarriage,
  hingeKnuckle,
  valveBody,
  impellerHub,
  hexTubeSweepPart,
  pipeAsm,
];

export function partRegistryById(): Map<string, PartDefinition> {
  return new Map(partRegistry.map((entry) => [entry.id, entry]));
}
