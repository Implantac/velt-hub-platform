import { useId } from "react";
import { Brain, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SectionCard } from "@/components/app/SectionCard";
import { brainMemoryInputSchema, type MemoryKind, type NativeMemories } from "@/lib/brain/native";
import { MEMORY_KINDS, MEMORY_META } from "../constants";
import { brainDate, brainLanguage, brainReadState } from "../presentation";
import { ReadFeedback } from "./ReadFeedback";

type Props = {
  data: NativeMemories | undefined;
  isError: boolean;
  isFetching: boolean;
  canEdit: boolean;
  canWrite: boolean;
  memText: string;
  setMemText: (value: string) => void;
  memKind: MemoryKind;
  setMemKind: (value: MemoryKind) => void;
  onSubmit: () => void;
  isPending: boolean;
  isSaving: boolean;
  onRetry: () => void;
};
export function MemoryPanel({
  data,
  isError,
  isFetching,
  canEdit,
  canWrite,
  memText,
  setMemText,
  memKind,
  setMemKind,
  onSubmit,
  isPending,
  isSaving,
  onRetry,
}: Props) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const valid = brainMemoryInputSchema.safeParse({ kind: memKind, content: memText }).success;
  const number = new Intl.NumberFormat(brainLanguage(i18n.language));
  return (
    <SectionCard className="min-w-0 lg:col-span-2" icon={Brain} title={t("brainNative.memories")}>
      {canEdit && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && canWrite && !isPending) onSubmit();
          }}
          className="mb-5 space-y-3"
        >
          <fieldset disabled={isPending} className="space-y-3">
            <legend className="mb-2 text-sm font-medium">{t("brainNative.memoryKind")}</legend>
            <div className="flex flex-wrap gap-2">
              {MEMORY_KINDS.map((kind) => (
                <label
                  key={kind}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-xs"
                >
                  <input
                    type="radio"
                    name={`${id}-kind`}
                    value={kind}
                    checked={kind === memKind}
                    onChange={() => setMemKind(kind)}
                    className="accent-primary"
                  />
                  {t(`brainNative.kind.${kind}`)}
                </label>
              ))}
            </div>
            <label htmlFor={`${id}-content`} className="block text-sm font-medium">
              {t("brainNative.memoryText")}
            </label>
            <textarea
              id={`${id}-content`}
              value={memText}
              onChange={(event) => setMemText(event.target.value)}
              maxLength={4000}
              rows={3}
              aria-invalid={memText.length > 0 && !valid}
              aria-describedby={`${id}-hint`}
              placeholder={t("brainNative.memoryPlaceholder")}
              className="block w-full min-w-0 resize-y rounded-xl border border-input bg-background/50 p-3 text-sm"
            />
            <p id={`${id}-hint`} className="text-xs text-muted-foreground">
              {t("brainNative.memoryHint", { count: memText.length })}
            </p>
            <button
              type="submit"
              disabled={!valid || !canWrite || isPending}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Plus aria-hidden="true" className="size-4" />
              {t(isSaving ? "brainNative.saving" : "brainNative.saveMemory")}
            </button>
          </fieldset>
        </form>
      )}
      <ReadFeedback
        state={brainReadState({ data, isError })}
        label={t("brainNative.memories")}
        isFetching={isFetching}
        onRetry={onRetry}
      >
        {data && (
          <>
            <p className="text-xs text-muted-foreground">
              {t("brainNative.preview", {
                shown: number.format(data.items.length),
                total: number.format(data.total),
                limit: data.limit,
              })}
            </p>
            {data.items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                {t("brainNative.noMemories")}
              </p>
            ) : (
              <ul className="space-y-3">
                {data.items.map((memory) => {
                  const meta = MEMORY_META[memory.kind];
                  const Icon = meta.icon;
                  return (
                    <li
                      key={memory.id}
                      className="min-w-0 rounded-xl border border-border/60 bg-background/30 p-3"
                    >
                      <p
                        className={`mb-2 flex items-center gap-2 text-xs font-medium ${meta.color}`}
                      >
                        <Icon aria-hidden="true" className="size-4" />
                        {t(`brainNative.kind.${memory.kind}`)}
                      </p>
                      <p className="whitespace-pre-wrap break-words text-sm">{memory.content}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        <time dateTime={memory.created_at}>
                          {brainDate(memory.created_at, i18n.language)}
                        </time>
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              {t("brainNative.checkedAt", { date: brainDate(data.checkedAt, i18n.language) })}
            </p>
          </>
        )}
      </ReadFeedback>
    </SectionCard>
  );
}
