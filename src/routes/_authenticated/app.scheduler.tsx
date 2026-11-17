import { useCurrentWorkspaceId } from "@/lib/workspace/use-workspace";
import { ScheduleComposer } from "@/features/scheduler/components/ScheduleComposer";
import { useWorkspaceAccess } from "@/lib/workspace/use-workspace-access";
import { WorkspaceAccessNotice } from "@/features/shell/components/WorkspaceAccessNotice";
import { QueryErrorState } from "@/features/shell/components/QueryErrorState";
import { modulePageHead } from "@/lib/page-head";
import { useTranslation } from "react-i18next";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Calendar } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/EmptyState";
import { ListSkeleton } from "@/components/app/Skeletons";
import { PageTransition } from "@/components/app/Motion";
import { useWorkspaceMutation, useWorkspaceQuery } from "@/lib/query/use-workspace-query";
import {
  cancelSchedulerJob,
  reconcileSchedulerJob,
  closePublicationReview,
  getSchedulerOverview,
  runSchedulerTickManual,
} from "@/lib/api/scheduler.functions";
import type { SchedulerJob } from "@/lib/api/_types";
import { STATUSES } from "@/features/scheduler/constants";
import { SchedulerFilters } from "@/features/scheduler/components/SchedulerFilters";
import { SchedulerTable } from "@/features/scheduler/components/SchedulerTable";
import { BestTimeCard } from "@/features/scheduler/components/BestTimeCard";
import { localDateTime } from "@/lib/scheduler/scheduling";
import { PublicationReviewDialog } from "@/features/scheduler/components/PublicationReviewDialog";
import { PublishCapabilityStrip } from "@/features/scheduler/components/PublishCapabilityStrip";

export const Route = createFileRoute("/_authenticated/app/scheduler")({
  head: () => modulePageHead("scheduler"),
  component: SchedulerPage,
});

function SchedulerPage() {
  const [workspaceId] = useCurrentWorkspaceId();
  return <SchedulerPageWorkspace key={workspaceId ?? "no-workspace"} />;
}

function SchedulerPageWorkspace() {
  const { t } = useTranslation();
  const access = useWorkspaceAccess();
  const list = useServerFn(getSchedulerOverview);
  const cancel = useServerFn(cancelSchedulerJob);
  const tick = useServerFn(runSchedulerTickManual);
  const check = useServerFn(reconcileSchedulerJob);
  const closeReview = useServerFn(closePublicationReview);
  const [reviewJob, setReviewJob] = useState<SchedulerJob | null>(null);
  const [when, setWhen] = useState(() => localDateTime(new Date(Date.now() + 3600_000)));
  const [suggestedAt, setSuggestedAt] = useState<string | null>(null);
  const [composerPending, setComposerPending] = useState(false);

  const [filter, setFilter] = useState<(typeof STATUSES)[number]>("all");

  const q = useWorkspaceQuery<SchedulerJob[]>(
    (wsId) => ["scheduler", wsId],
    async ({ workspaceId }) => {
      const rows = await list({
        data: {
          workspaceId,
        },
      });
      return rows as unknown as SchedulerJob[];
    },
    { refetchInterval: 30_000 },
  );
  const invalidateKey = q.wsId
    ? [
        ["scheduler", q.wsId],
        ["content", q.wsId],
        ["scheduler-options", q.wsId],
      ]
    : ["scheduler"];
  const visibleJobs = (q.data ?? []).filter(
    (job) =>
      filter === "all" ||
      job.status === filter ||
      (filter === "confirmation_pending" && job.reconcile_state === "pending") ||
      (filter === "confirmation_review" && job.reconcile_state === "review"),
  );

  const cancelMut = useWorkspaceMutation(
    (jobId: string) => cancel({ data: { workspaceId: q.wsId!, jobId } }),
    { invalidate: invalidateKey, successMessage: t("scheduler.canceled") },
  );

  const tickMut = useWorkspaceMutation(() => tick({ data: { workspaceId: q.wsId!, limit: 10 } }), {
    invalidate: invalidateKey,
    successMessage: (r) =>
      t("scheduler.ran", {
        count: r.claimed,
        succeeded: r.succeeded,
        failed: r.failed,
        pending: r.awaitingConfirmation,
        review: r.needsReview,
        confirmed: r.reconciliation.confirmed,
      }),
  });

  const checkMut = useWorkspaceMutation(
    (jobId: string) => check({ data: { workspaceId: q.wsId!, jobId } }),
    {
      invalidate: invalidateKey,
      successMessage: (result) =>
        result.checked === 0 && result.recovered === 0
          ? t("scheduler.noCheckDue")
          : t("scheduler.checkedSummary", {
              queries: result.providerQueries,
              confirmed: result.confirmed,
              pending: result.pending,
              review: result.review,
              requeued: result.safelyRequeued,
            }),
    },
  );
  const closeMut = useWorkspaceMutation(
    (input: { jobId: string; note: string }) =>
      closeReview({
        data: { workspaceId: q.wsId!, ...input, checkedProvider: true },
      }),
    { invalidate: invalidateKey, successMessage: t("scheduler.reviewClosed") },
  );

  const counts = (q.data ?? []).reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1;
    if (j.reconcile_state === "pending")
      acc.confirmation_pending = (acc.confirmation_pending ?? 0) + 1;
    if (j.reconcile_state === "review")
      acc.confirmation_review = (acc.confirmation_review ?? 0) + 1;
    return acc;
  }, {});

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageHeader
          icon={Calendar}
          title={t("scheduler.title")}
          subtitle={t("scheduler.subtitle")}
        />

        <WorkspaceAccessNotice access={access} />
        <ScheduleComposer
          canEdit={access.canEdit}
          when={when}
          suggestedAt={suggestedAt}
          onPendingChange={setComposerPending}
          onWhenChange={(value) => {
            setWhen(value);
            setSuggestedAt(null);
          }}
        />
        <details className="rounded-xl border border-border/60 bg-card/40">
          <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            {t("bestTime.open")}
          </summary>
          <div className="p-2 sm:p-4">
            <BestTimeCard
              canEdit={access.canEdit}
              busy={composerPending}
              onUseTime={(at) => {
                if (
                  !access.canEdit ||
                  composerPending ||
                  !Number.isFinite(Date.parse(at)) ||
                  Date.parse(at) <= Date.now() + 60_000
                )
                  return;
                setWhen(localDateTime(new Date(at)));
                setSuggestedAt(at);
                document.getElementById("schedule-time")?.focus();
              }}
            />
          </div>
        </details>
        <PublishCapabilityStrip />
        <details className="rounded-xl border border-border/60 bg-card/40 px-4">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            {t("scheduler.deliveryHelpTitle")}
          </summary>
          <div className="space-y-3 pb-4 text-sm leading-relaxed text-muted-foreground">
            <p>{t("access.queueHelp")}</p>
            <p>{t("scheduler.reconciliationHelp")}</p>
          </div>
        </details>

        <SchedulerFilters
          filter={filter}
          setFilter={setFilter}
          counts={counts}
          total={q.data?.length ?? 0}
          onTick={() => tickMut.mutate()}
          tickDisabled={
            !access.canManage ||
            !q.wsId ||
            tickMut.isPending ||
            checkMut.isPending ||
            closeMut.isPending
          }
          tickPending={tickMut.isPending}
        />

        {q.isError ? (
          <QueryErrorState onRetry={() => void q.refetch()} pending={q.isFetching} />
        ) : q.isLoading ? (
          <ListSkeleton rows={4} />
        ) : visibleJobs.length === 0 ? (
          <EmptyState
            variant="card"
            icon={Calendar}
            title={t(
              (q.data?.length ?? 0) > 0 ? "scheduler.filteredEmptyTitle" : "scheduler.emptyTitle",
            )}
            text={t(
              (q.data?.length ?? 0) > 0 ? "scheduler.filteredEmptyText" : "scheduler.emptyText",
            )}
            action={
              (q.data?.length ?? 0) > 0 ? (
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className="min-h-11 rounded-md border border-border px-4 py-2 text-sm font-medium"
                >
                  {t("scheduler.clearFilters")}
                </button>
              ) : (
                <Link
                  to="/app/content"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  {t("scheduler.contentLink")}
                </Link>
              )
            }
          />
        ) : (
          <SchedulerTable
            jobs={visibleJobs}
            onCancel={(id) => cancelMut.mutate(id)}
            cancelPending={!access.canEdit || cancelMut.isPending}
            canManage={access.canManage}
            onCheck={(id) => checkMut.mutate(id)}
            checkPending={checkMut.isPending || tickMut.isPending || closeMut.isPending}
            onReview={setReviewJob}
          />
        )}
        {reviewJob && (
          <PublicationReviewDialog
            key={reviewJob.id}
            job={reviewJob}
            pending={closeMut.isPending}
            onCancel={() => setReviewJob(null)}
            onConfirm={(jobId, note) => closeMut.mutateAsync({ jobId, note })}
          />
        )}
      </div>
    </PageTransition>
  );
}
