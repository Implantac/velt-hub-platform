import { useCurrentWorkspaceId } from "@/lib/workspace/use-workspace";
import { WorkspaceAccessNotice } from "@/features/shell/components/WorkspaceAccessNotice";
import { modulePageHead } from "@/lib/page-head";
import { useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { PageTransition } from "@/components/app/Motion";
import { ContentComposer } from "@/features/content/components/ContentComposer";
import { ContentFilters } from "@/features/content/components/ContentFilters";
import { BulkActionBar } from "@/features/content/components/BulkActionBar";
import { ContentList } from "@/features/content/components/ContentList";
import { ContentPagination } from "@/features/content/components/ContentPagination";
import { useContentPage } from "@/features/content/hooks/useContentPage";
import { usePreflight } from "@/features/content/hooks/usePreflight";
import { PreflightPanel } from "@/features/content/components/PreflightPanel";
import { CoachCard } from "@/features/content/components/CoachCard";
import { useCoach } from "@/features/content/hooks/useCoach";
import { StudioPanel } from "@/features/content/components/StudioPanel";

export const Route = createFileRoute("/_authenticated/app/content")({
  head: () => modulePageHead("content"),
  component: ContentPage,
});

function ContentPage() {
  const [workspaceId] = useCurrentWorkspaceId();
  return <ContentPageWorkspace key={workspaceId ?? "no-workspace"} />;
}

function ContentPageWorkspace() {
  const { t } = useTranslation();
  const p = useContentPage();
  const pre = usePreflight(p.body, p.title);
  // Explicit-trigger AI: never runs on its own, because each call is billed.
  const coach = useCoach(p.body, p.title);

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageHeader icon={FileText} title={t("content.title")} subtitle={t("content.subtitle")} />

        <WorkspaceAccessNotice access={p.access} />

        {/* Composer + live preflight: the audit runs while you type, so the
            draft never reaches the queue with a limit violation. */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <ContentComposer
            title={p.title}
            body={p.body}
            mediaInput={p.mediaInput}
            onMediaInputChange={p.setMediaInput}
            onTitleChange={p.setTitle}
            onBodyChange={p.setBody}
            onSubmit={p.createDraft}
            submitDisabled={p.actionsDisabled}
            isPending={p.createMut.isPending}
            disabled={!p.access.canEdit}
            canPublish={pre.result?.canPublish ?? true}
          />
          <div className="space-y-4">
            <PreflightPanel
              result={pre.result}
              loading={pre.loading}
              hookSuggestions={pre.hooks}
              platformLabel={pre.platformLabel}
              onUseHook={(text) =>
                p.setBody(`${text}\n\n${p.body.split(/\n\n/).slice(1).join("\n\n")}`.trim())
              }
            />
            <CoachCard coach={coach} onUseSuggestion={(text) => p.setBody(text)} />
          </div>
        </div>

        {p.access.canEdit && (
          <details className="section-card overflow-hidden">
            <summary className="min-h-11 cursor-pointer px-5 py-4 text-sm font-semibold marker:text-primary">
              {t("content.advanced")}{" "}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {t("content.optional")}
              </span>
            </summary>
            <StudioPanel
              key={p.q.wsId ?? "no-workspace"}
              workspaceId={p.q.wsId}
              items={p.items}
              sourcePending={p.readPending || p.q.isError || p.operationsPending}
            />
          </details>
        )}

        <ContentFilters
          filter={p.filter}
          onFilterChange={p.setFilter}
          search={p.search}
          onSearchChange={p.setSearch}
          counts={p.counts}
          disabled={p.operationsPending}
        />

        {p.selected.size > 0 && (
          <BulkActionBar
            count={p.selected.size}
            disabled={p.actionsDisabled}
            onMoveTo={p.runBulkStatus}
            onDelete={p.runBulkDelete}
            onClear={p.clearSelection}
          />
        )}

        <ContentList
          disabled={p.actionsDisabled}
          items={p.items}
          workspaceTotal={p.workspaceTotal}
          isLoading={p.q.isPending || p.searchPending}
          isError={p.q.isError}
          retryPending={p.q.isFetching}
          onRetry={() => void p.q.refetch()}
          selected={p.selected}
          selectableCount={p.selectableCount}
          allVisibleSelected={p.allVisibleSelected}
          onToggleAll={p.toggleAll}
          onToggleOne={p.toggleOne}
          onStatusChange={p.changeStatus}
          onClearFilters={p.clearFilters}
        />
        <ContentPagination
          pageNumber={p.pageNumber}
          shown={p.items.length}
          total={p.counts?.[p.filter]}
          workspaceTotal={p.q.isSuccess ? p.workspaceTotal : undefined}
          pending={p.readPending}
          disabled={p.navigationDisabled}
          hasPrevious={p.hasPrevious}
          hasNext={p.hasNext}
          onPrevious={p.previousPage}
          onNext={p.nextPage}
          onRefresh={() => void p.q.refetch()}
        />
      </div>
    </PageTransition>
  );
}
