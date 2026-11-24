type SessionResult = {
  data: { session: { user: { id: string } } | null };
  error: unknown;
};
/** Fail before RPC if an old observer runs after Auth changes. Server accountId checks close the later race. */
export async function learningAccountRequest<T>(
  userId: string,
  readSession: () => Promise<SessionResult>,
  call: () => Promise<T>,
): Promise<T> {
  const result = await readSession();
  if (result.error || result.data.session?.user.id !== userId)
    throw new Error("Learning account changed or unavailable. Read under the current account.");
  return call();
}
