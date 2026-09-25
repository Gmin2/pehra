import type { Transition } from "framer-motion";

export type SceneKind = "guard" | "key" | "trust";
export type SceneProps = {
  kind: SceneKind;
  phase: number;
  accent: string;
  stroke: number;
  transition: Transition;
};
export const RED = "#BD6976";
export const GREEN = "#548976";
