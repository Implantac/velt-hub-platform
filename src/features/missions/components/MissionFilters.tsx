import { useId } from "react";
import { useTranslation } from "react-i18next";
import { MISSION_STATUSES, type MissionFilter } from "@/lib/missions/contracts";

export function MissionFilters({
  value,
  disabled,
  onChange,
}: {
  value: MissionFilter;
  disabled: boolean;
  onChange: (status: MissionFilter) => void;
}) {
  const { t } = useTranslation();
  const name = useId();
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-2 text-sm font-medium">{t("missionsNative.filterLabel")}</legend>
      <div className="flex flex-wrap gap-2">
        {(["all", ...MISSION_STATUSES] as const).map((status) => (
          <label
            key={status}
            className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${value === status ? "border-primary bg-primary/10 font-semibold" : "border-border bg-background"} ${disabled ? "cursor-wait opacity-50" : ""}`}
          >
            <input
              type="radio"
              name={name}
              value={status}
              checked={value === status}
              onChange={() => onChange(status)}
              className="size-4 accent-primary"
            />
            {t(status === "all" ? "missionsNative.allStatuses" : `missionsNative.status.${status}`)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
