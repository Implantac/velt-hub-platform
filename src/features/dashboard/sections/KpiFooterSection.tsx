import { motion } from "framer-motion";
import { Calendar, FileText, Palette, Radio } from "lucide-react";
import { useTranslation } from "react-i18next";
import { stagger } from "@/components/app/motion-presets";
import { KpiCard } from "../components/atoms";

type Props = {
  brands: number;
  channelsConnected: number;
  channels: number;
  content: number;
  scheduled: number;
};
export function KpiFooterSection({
  brands,
  channelsConnected,
  channels,
  content,
  scheduled,
}: Props) {
  const { t, i18n } = useTranslation();
  const number = (n: number) => new Intl.NumberFormat(i18n.language).format(n);
  return (
    <motion.section
      aria-label={t("dashboard.savedTotals")}
      variants={stagger}
      className="grid grid-cols-2 gap-3 md:grid-cols-4"
    >
      <KpiCard
        icon={Palette}
        label={t("dashboard.stats.brands")}
        value={number(brands)}
        to="/app/brands"
      />
      <KpiCard
        icon={Radio}
        label={t("dashboard.stats.channels")}
        value={`${number(channelsConnected)}/${number(channels)}`}
        hint={t("dashboard.stats.connected")}
        to="/app/channels"
      />
      <KpiCard
        icon={FileText}
        label={t("dashboard.stats.content")}
        value={number(content)}
        to="/app/content"
      />
      <KpiCard
        icon={Calendar}
        label={t("dashboard.futurePending")}
        value={number(scheduled)}
        to="/app/scheduler"
      />
    </motion.section>
  );
}
