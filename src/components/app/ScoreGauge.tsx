import { useId } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { EASE } from "./motion-presets";
/** Animated radial gauge for Digital Score (0-100). */
export function ScoreGauge({
  value,
  size = 200,
  label = "Digital Score",
}: {
  value: number;
  size?: number;
  label?: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  const gradientId = `gauge-gradient-${id}`;
  const glowId = `gauge-glow-${id}`;
  const v = Math.max(0, Math.min(100, value));
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - v / 100);
  const tier = t(
    v >= 80
      ? "scoreGauge.excellent"
      : v >= 60
        ? "scoreGauge.good"
        : v >= 40
          ? "scoreGauge.improving"
          : v >= 20
            ? "scoreGauge.beginner"
            : "scoreGauge.starting",
  );
  // Use design tokens directly (project uses oklch — NOT hsl-wrapped).
  const colorVar =
    v >= 80
      ? "var(--success)"
      : v >= 60
        ? "var(--primary)"
        : v >= 40
          ? "var(--accent)"
          : v >= 20
            ? "var(--warning)"
            : "var(--destructive)";
  return (
    <div
      role="img"
      aria-label={t("scoreGauge.accessible", { label, value: Math.round(v), tier })}
      className="relative"
      style={{ width: size, height: size }}
    >
      <svg
        aria-hidden="true"
        width={size}
        height={size}
        className="-rotate-90 drop-shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={colorVar} stopOpacity="1" />
            <stop offset="100%" stopColor={colorVar} stopOpacity="0.45" />
          </linearGradient>
          <filter id={glowId}>
            <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--border)"
          strokeWidth={stroke}
          fill="none"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          filter={`url(#${glowId})`}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: EASE }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5, ease: EASE }}
          className="text-5xl font-bold tracking-tight tabular-nums"
          style={{ color: colorVar }}
        >
          {Math.round(v)}
        </motion.div>
        <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 text-xs font-medium" style={{ color: colorVar }}>
          {tier}
        </div>
      </div>
    </div>
  );
}
