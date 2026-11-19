import { Compass, Flag, Lightbulb, Star, Target, TrendingUp } from "lucide-react";
import type { ElementType } from "react";
import { BRAIN_MEMORY_KINDS, type MemoryKind } from "@/lib/brain/native";
export type { MemoryKind, RecStatus } from "@/lib/brain/native";

export const MEMORY_META: Record<MemoryKind, { icon: ElementType; color: string }> = {
  goal: { icon: Flag, color: "text-primary" },
  fact: { icon: Compass, color: "text-accent" },
  preference: { icon: Star, color: "text-success" },
  strategy: { icon: Target, color: "text-primary" },
  signal: { icon: Lightbulb, color: "text-accent" },
  outcome: { icon: TrendingUp, color: "text-success" },
};
export const MEMORY_KINDS = BRAIN_MEMORY_KINDS;
