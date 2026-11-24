import { Megaphone, FileText, Palette, Radio, TrendingUp, type LucideIcon } from "lucide-react";
import type { HealthCategory } from "@/lib/diagnostics/contracts";
export const CAT_META: Record<HealthCategory, LucideIcon> = {
  marketing: Megaphone,
  content: FileText,
  brand: Palette,
  channel: Radio,
  growth: TrendingUp,
};
