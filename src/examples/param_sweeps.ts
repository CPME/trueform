import type { ParamOverrides } from "../params.js";

export type ParamSweep = {
  id: string;
  title: string;
  partId: string;
  overrides: ParamOverrides[];
};

export const paramSweeps: ParamSweep[] = [
  {
    id: "block-basic-sweep",
    title: "Block Basic Size Sweep",
    partId: "block-basic",
    overrides: [
      { w: 40, h: 24, d: 12 },
      { w: 60, h: 40, d: 20 },
      { w: 80, h: 36, d: 18 },
      { w: 100, h: 50, d: 30 },
    ],
  },
];
