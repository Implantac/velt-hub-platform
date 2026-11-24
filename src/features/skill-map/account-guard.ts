type SessionResult = { data: { session: { user: { id: string } } | null }; error: unknown };
/** Avoid an old observer dispatching under new Auth; server account checks also cover a later token race. */
export async function skillAccountRequest<T>(
  userId: string,
  readSession: () => Promise<SessionResult>,
  call: () => Promise<T>,
): Promise<T> {
  const result = await readSession();
  if (result.error || result.data.session?.user.id !== userId)
    throw new Error("Skill Map account changed or unconfirmed. Read with the current account.");
  return call();
}
