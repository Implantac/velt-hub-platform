import {
  AlertTriangle,
  Brain,
  Check,
  Lightbulb,
  Minus,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { ElementType } from "react";
import type { COACH_KINDS, JOURNEY_KINDS } from "@/lib/coach/contracts";
type IconMeta = { icon: ElementType; color: string };
export const KIND_META: Record<(typeof COACH_KINDS)[number], IconMeta> = {
  insight: { icon: Lightbulb, color: "text-accent" },
  warning: { icon: AlertTriangle, color: "text-destructive" },
  suggestion: { icon: Sparkles, color: "text-primary" },
  next_action: { icon: Target, color: "text-success" },
};
export const MEMORY_META: Record<(typeof JOURNEY_KINDS)[number], IconMeta> = {
  decision: { icon: Check, color: "text-success" },
  result: { icon: Target, color: "text-primary" },
  pivot: { icon: TrendingUp, color: "text-accent" },
  signal: { icon: Brain, color: "text-muted-foreground" },
  reflection: { icon: Lightbulb, color: "text-accent" },
};
export const SENTIMENT_ICON: Record<string, IconMeta> = {
  positive: { icon: TrendingUp, color: "text-success" },
  neutral: { icon: Minus, color: "text-muted-foreground" },
  negative: { icon: TrendingDown, color: "text-destructive" },
};
