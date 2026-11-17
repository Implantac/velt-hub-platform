import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { FILTERS, type FilterValue } from "../constants";

interface ContentFiltersProps {
  filter: FilterValue;
  onFilterChange: (f: FilterValue) => void;
  search: string;
  onSearchChange: (s: string) => void;
  counts?: Record<string, number>;
  disabled?: boolean;
}

export function ContentFilters({
  filter,
  onFilterChange,
  search,
  onSearchChange,
  counts,
  disabled = false,
}: ContentFiltersProps) {
  const { t } = useTranslation();
  return (
    <section className="space-y-3" aria-label={t("content.libraryFilters")}>
      <div className="relative w-full sm:max-w-md">
        <Search
          aria-hidden="true"
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          id="content-library-search"
          type="search"
          maxLength={200}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          disabled={disabled}
          aria-label={t("content.search")}
          aria-describedby="content-search-hint"
          placeholder={t("content.searchPlaceholder")}
          className="min-h-11 w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm disabled:opacity-50"
        />
      </div>
      <p id="content-search-hint" className="text-xs text-muted-foreground">
        {t("content.globalSearchHint")}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onFilterChange(f)}
            disabled={disabled}
            aria-pressed={filter === f}
            className={`min-h-11 rounded-md border px-3 py-2 text-xs font-medium transition disabled:opacity-50 ${filter === f ? "border-primary bg-primary/10 text-primary" : "border-border bg-card/40 text-muted-foreground hover:text-foreground"}`}
          >
            {t(`content.${f}`)}{" "}
            <span className="ml-1 text-muted-foreground">{counts?.[f] ?? "—"}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
