import { useId, type ReactNode } from "react";
import { Compass } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/app/PageHeader";

export function NavigatorHeader({ action }: { action?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <PageHeader
      icon={Compass}
      eyebrow={t("navigatorNative.eyebrow")}
      title={t("navigatorNative.title")}
      subtitle={t("navigatorNative.subtitle")}
      action={action}
    />
  );
}
export function Title({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-semibold">{children}</h2>;
}
export function ChoiceCard({
  name,
  value,
  active,
  onChange,
  label,
  desc,
  disabled,
}: {
  name: string;
  value: string;
  active: boolean;
  onChange: () => void;
  label: string;
  desc?: string;
  disabled: boolean;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-4 ${active ? "border-primary bg-primary/10" : "border-border bg-card"}`}
    >
      <input
        id={id}
        name={name}
        type="radio"
        value={value}
        checked={active}
        onChange={onChange}
        disabled={disabled}
        className="mt-1 size-5 shrink-0 accent-primary"
      />
      <span className="min-w-0 [overflow-wrap:anywhere]">
        <span className="block text-sm font-semibold">{label}</span>
        {desc && <span className="mt-1 block text-xs text-muted-foreground">{desc}</span>}
      </span>
    </label>
  );
}
export function Chip({
  active,
  onChange,
  children,
  disabled,
}: {
  active: boolean;
  onChange: () => void;
  children: ReactNode;
  disabled: boolean;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm [overflow-wrap:anywhere] ${active ? "border-primary bg-primary/10" : "border-border"}`}
    >
      <input
        id={id}
        type="checkbox"
        checked={active}
        onChange={onChange}
        disabled={disabled}
        className="size-5 shrink-0 accent-primary"
      />
      <span className="min-w-0">{children}</span>
    </label>
  );
}
export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1 rounded-lg border border-border p-3 [overflow-wrap:anywhere]">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap text-sm font-semibold">{children}</dd>
    </div>
  );
}
