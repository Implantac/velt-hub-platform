import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  BrainCircuit,
  FlaskConical,
  History,
  Scale,
  ShieldAlert,
  User,
  Users2,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import type { BrainLabTab } from "./constants";
import { BRAIN_LAB_TABS, brainLabFocusTarget } from "./navigation";

const icons = {
  twin: User,
  skills: BarChart3,
  experiments: FlaskConical,
  decisions: Scale,
  anti_scam: ShieldAlert,
  council: Users2,
  timeline: History,
};

/** Presentation/navigation only. Inactive panels are never mounted here. */
export function BrainLabFrame({
  activeTab,
  onSelect,
  children,
}: {
  activeTab: BrainLabTab;
  onSelect: (tab: BrainLabTab) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation(),
    id = useId(),
    refs = useRef(new Map<BrainLabTab, HTMLButtonElement>());
  const [focused, setFocused] = useState(activeTab);
  useEffect(() => setFocused(activeTab), [activeTab]);
  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        icon={BrainCircuit}
        title={t("brainLabNavigation.title")}
        subtitle={t("brainLabNavigation.subtitle")}
      />
      <p id={`${id}-keyboard`} className="text-xs leading-relaxed text-muted-foreground">
        {t("brainLabNavigation.keyboardHint")}
      </p>
      <div
        role="tablist"
        aria-describedby={`${id}-keyboard`}
        aria-label={t("brainLabNavigation.tabsLabel")}
        aria-orientation="horizontal"
        className="flex min-w-0 flex-wrap gap-2 border-b border-border pb-2"
      >
        {BRAIN_LAB_TABS.map((tab) => {
          const Icon = icons[tab];
          return (
            <button
              key={tab}
              ref={(node) => {
                if (node) refs.current.set(tab, node);
                else refs.current.delete(tab);
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${tab}`}
              aria-selected={activeTab === tab}
              aria-controls={activeTab === tab ? `${id}-panel` : undefined}
              tabIndex={focused === tab ? 0 : -1}
              onFocus={() => setFocused(tab)}
              onKeyDown={(event) => {
                const target = brainLabFocusTarget(tab, event.key);
                if (target) {
                  event.preventDefault();
                  setFocused(target);
                  refs.current.get(target)?.focus();
                }
              }}
              onClick={() => {
                if (activeTab !== tab) onSelect(tab);
              }}
              className={`inline-flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                activeTab === tab
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              {t(`brainLabNavigation.tabs.${tab}`)}
            </button>
          );
        })}
      </div>
      <section
        key={activeTab}
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${activeTab}`}
        tabIndex={0}
        className="min-w-0 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
      >
        {children}
      </section>
    </div>
  );
}
