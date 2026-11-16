import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SchedulerJob } from "@/lib/api/_types";

type Props = {
  job: SchedulerJob;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (jobId: string, note: string) => Promise<unknown>;
};

/** No arbitrary "mark published" override. Closing retains uncertainty and the audit trail. */
export function PublicationReviewDialog({ job, pending, onCancel, onConfirm }: Props) {
  const { t } = useTranslation();
  const noteId = useId();
  const checkId = useId();
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState(false);
  const valid = checked && note.trim().length >= 20 && note.trim().length <= 1000;
  async function submit() {
    if (!valid || pending) return;
    try {
      await onConfirm(job.id, note.trim());
      onCancel();
    } catch {
      /* Mutation already explains the error; preserve the note and confirmation. */
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("scheduler.closeReviewTitle")}</DialogTitle>
          <DialogDescription>{t("scheduler.closeReviewDescription")}</DialogDescription>
        </DialogHeader>
        <form
          className="min-w-0 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <p className="break-words text-sm font-medium">
            {job.content?.title || t("scheduler.untitled")}
          </p>
          <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm leading-relaxed text-foreground">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <p>{t("scheduler.closeReviewWarning")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={noteId}>{t("scheduler.closeReviewNote")}</Label>
            <Textarea
              id={noteId}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              minLength={20}
              maxLength={1000}
              required
              disabled={pending}
              rows={4}
              aria-describedby={`${noteId}-help`}
            />
            <p id={`${noteId}-help`} className="text-xs text-muted-foreground">
              {t("scheduler.closeReviewNoteHint")}
            </p>
          </div>
          <div className="flex items-start gap-3">
            <input
              id={checkId}
              type="checkbox"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
              disabled={pending}
              className="mt-1 size-4 shrink-0 accent-primary"
            />
            <Label htmlFor={checkId} className="text-sm font-normal leading-relaxed">
              {t("scheduler.closeReviewChecked")}
            </Label>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!valid || pending}>
              {t(pending ? "scheduler.closingReview" : "scheduler.closeReviewConfirm")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
