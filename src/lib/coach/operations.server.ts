import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { buildDiagnostics } from "@/lib/diagnostics/build.server";
import { WORKSPACE_EDIT_ROLES } from "@/lib/workspace/permissions";
import { requireWorkspaceRole } from "@/lib/api/_workspace";
import { throwIfError } from "@/lib/api/_supabase";
import {
  COACH_PAGE_SIZE,
  COACH_READ_ROLES,
  confirmCoachPage,
  confirmJourneyPage,
  confirmSavedCoachBatch,
  coachListInputSchema,
  journeyListInputSchema,
  journeyRecordSchema,
  type CoachGenerateInput,
} from "./contracts";
import { coachRecommendations } from "./model";

type Client = SupabaseClient<Database>;
type PageResult = {
  data: unknown;
  count: number | null;
  error: { message: string; code?: string } | null;
};
const exactCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
/** A rejected later range is empty only after an independent same-filter exact count proves it. */
async function checkedSlice(
  result: PageResult,
  recount: () => PromiseLike<PageResult>,
  page: number,
) {
  if (result.error?.code === "PGRST103" && page > 1) {
    const counted = await recount();
    throwIfError(counted.error);
    const total = exactCount.parse(counted.count);
    if (total > (page - 1) * COACH_PAGE_SIZE) throwIfError(result.error);
    return { items: [], total };
  }
  throwIfError(result.error);
  return { items: result.data, total: exactCount.parse(result.count) };
}
export async function readCoachRecommendations(
  supabase: Client,
  userId: string,
  input: z.infer<typeof coachListInputSchema>,
) {
  await requireWorkspaceRole(supabase, input.workspaceId, userId, COACH_READ_ROLES);
  const checkedAt = new Date().toISOString();
  const scoped = (head: boolean) => {
    let query = supabase
      .from("coach_recommendations")
      .select("*", { count: "exact", head })
      .eq("workspace_id", input.workspaceId);
    if (input.status === "open") query = query.is("completed_at", null).is("dismissed_at", null);
    if (input.status === "completed")
      query = query.not("completed_at", "is", null).is("dismissed_at", null);
    if (input.status === "dismissed")
      query = query.not("dismissed_at", "is", null).is("completed_at", null);
    if (input.status === "conflicted")
      query = query.not("completed_at", "is", null).not("dismissed_at", "is", null);
    return query;
  };
  const offset = (input.page - 1) * COACH_PAGE_SIZE;
  const result = await scoped(false)
    .order("created_at", { ascending: false })
    .order("score", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + COACH_PAGE_SIZE - 1);
  const slice = await checkedSlice(result, () => scoped(true), input.page);
  return confirmCoachPage(
    {
      workspaceId: input.workspaceId,
      status: input.status,
      page: input.page,
      pageSize: COACH_PAGE_SIZE,
      checkedAt,
      ...slice,
    },
    input,
  );
}
export async function readCoachJourney(
  supabase: Client,
  userId: string,
  input: z.infer<typeof journeyListInputSchema>,
) {
  await requireWorkspaceRole(supabase, input.workspaceId, userId, COACH_READ_ROLES);
  const checkedAt = new Date().toISOString();
  const scoped = (head: boolean) =>
    supabase
      .from("brain_memory_events")
      .select("*", { count: "exact", head })
      .eq("workspace_id", input.workspaceId);
  const offset = (input.page - 1) * COACH_PAGE_SIZE;
  const result = await scoped(false)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + COACH_PAGE_SIZE - 1);
  const slice = await checkedSlice(result, () => scoped(true), input.page);
  return confirmJourneyPage(
    {
      workspaceId: input.workspaceId,
      page: input.page,
      pageSize: COACH_PAGE_SIZE,
      checkedAt,
      ...slice,
    },
    input,
  );
}
/** Both the native Coach endpoint and legacy brainRecommend entry delegate here. */
export async function generateCoachBatch(
  supabase: Client,
  userId: string,
  input: CoachGenerateInput,
) {
  await requireWorkspaceRole(supabase, input.workspaceId, userId, WORKSPACE_EDIT_ROLES);
  const calculation = await buildDiagnostics(supabase, {
    workspaceId: input.workspaceId,
    calculationId: input.batchId,
  });
  const expected = coachRecommendations(calculation, input, userId, randomUUID);
  // Additive single batch. Never dismiss/delete previous open history before or after an insert.
  const result = await supabase.from("coach_recommendations").insert(expected).select("*");
  throwIfError(result.error);
  const receipt = confirmSavedCoachBatch(
    result.data,
    expected,
    input,
    userId,
    calculation.diagnostic,
  );
  let eventRecorded = false;
  try {
    const eventId = randomUUID();
    const event = await supabase
      .from("brain_memory_events")
      .insert({
        id: eventId,
        workspace_id: input.workspaceId,
        user_id: userId,
        kind: "signal",
        subject: "Coach registrou um novo lote de recomendações",
        payload: { source: "velt-coach-v2", batchId: input.batchId, count: receipt.generated },
        sentiment: null,
        created_at: calculation.diagnostic.finishedAt,
      })
      .select("*")
      .single();
    const row = journeyRecordSchema.safeParse(event.data);
    if (!event.error && row.success) {
      const payload = z
        .object({
          source: z.literal("velt-coach-v2"),
          batchId: z.literal(input.batchId),
          count: z.literal(receipt.generated),
        })
        .safeParse(row.data.payload);
      eventRecorded =
        row.data.id === eventId &&
        row.data.workspace_id === input.workspaceId &&
        row.data.user_id === userId &&
        row.data.kind === "signal" &&
        row.data.subject === "Coach registrou um novo lote de recomendações" &&
        Date.parse(row.data.created_at) === Date.parse(calculation.diagnostic.finishedAt) &&
        payload.success;
    }
  } catch {
    /* Confirmed batch remains saved even when its secondary journey event is unconfirmed. */
  }
  return { ...receipt, eventRecorded };
}
