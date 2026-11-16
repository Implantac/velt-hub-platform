import { useTranslation } from "react-i18next";
import { AlertTriangle, Link2, Trash2, Unlink } from "lucide-react";
import { PLATFORMS, getPlatformIcon } from "@/components/app/platform-meta";
import type { Channel } from "@/lib/api/_types";
import { BusinessLocationPicker } from "./BusinessLocationPicker";

type Props = {
  channel: Channel;
  disabled: boolean;
  workspaceId: string | null | undefined;
  onDelete: () => void;
  onDisconnect: () => void;
  onConnect: (oauth: string, channelId?: string) => void;
};

export function ChannelCard({
  channel: c,
  disabled,
  workspaceId,
  onDelete,
  onDisconnect,
  onConnect,
}: Props) {
  const { t } = useTranslation();
  const isGbp = c.platform === "google_business";
  const locationName =
    (c as { metadata?: { location_name?: string } }).metadata?.location_name ?? null;
  const meta = PLATFORMS.find((p) => p.id === c.platform);
  const Icon = getPlatformIcon(c.platform);
  const isConnected = c.status === "connected";
  const reconnect = !isConnected && Boolean(c.external_id);
  const canDisconnect = isConnected || (reconnect && c.status !== "disconnected");
  const issue =
    c.authorization_issue && c.status === "expired"
      ? t(`channels.authorizationIssues.${c.authorization_issue}`, {
          defaultValue: t("channels.authorizationIssues.invalid_token"),
        })
      : null;

  return (
    <div className="section-card hover-lift p-5 sm:p-6 group">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-secondary/50 group-hover:bg-primary/10 transition-colors">
            <Icon className="size-5" />
          </div>
          <div className="min-w-0 break-words">
            <div className="font-bold capitalize text-foreground group-hover:text-primary transition-colors">
              {meta?.label ?? c.platform}
            </div>
            <div className="text-sm text-muted-foreground">{c.handle ?? c.external_id ?? "—"}</div>
          </div>
        </div>
        <button
          type="button"
          aria-label={t("channels.delete", { platform: meta?.label ?? c.platform })}
          onClick={() => {
            if (window.confirm(t("channels.confirmDelete"))) onDelete();
          }}
          disabled={disabled}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-destructive disabled:opacity-50"
          title={t("channels.deleteTitle")}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <span
          className={`rounded-full px-2 py-0.5 ${isConnected ? "bg-success/20 text-success" : "bg-secondary text-secondary-foreground"}`}
        >
          {isGbp && isConnected && !locationName
            ? t("channels.selectLocation")
            : t(`channels.${c.status}`, { defaultValue: c.status })}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">{c.brand?.name ?? t("channels.noBrand")}</span>
          {canDisconnect && (
            <button
              disabled={disabled}
              onClick={() => {
                if (window.confirm(t("channels.confirmDisconnect"))) onDisconnect();
              }}
              className="inline-flex min-h-11 items-center gap-1 rounded-md border border-border px-3 py-2 hover:bg-secondary"
            >
              <Unlink aria-hidden="true" className="size-3" /> {t("channels.disconnect")}
            </button>
          )}
          {!isConnected && meta && (
            <button
              disabled={disabled}
              onClick={() => onConnect(meta.oauth, c.external_id ? c.id : undefined)}
              className="inline-flex min-h-11 items-center gap-1 rounded-md border border-border px-3 py-2 hover:bg-primary/5"
            >
              <Link2 aria-hidden="true" className="size-3" />{" "}
              {t(reconnect ? "channels.reconnect" : "channels.connect")}
            </button>
          )}
        </div>
      </div>

      {issue && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-foreground">
          <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-amber-500" />
          <span>{issue}</span>
        </p>
      )}

      {/* Google Business: an account can hold many stores. The channel is only
          usable once a location is bound — never guess on the user's behalf. */}
      {isGbp && isConnected && workspaceId && !disabled && (
        <div className="mt-4">
          <BusinessLocationPicker
            workspaceId={workspaceId}
            channelId={c.id}
            currentLocationId={c.external_id}
          />
        </div>
      )}
    </div>
  );
}
