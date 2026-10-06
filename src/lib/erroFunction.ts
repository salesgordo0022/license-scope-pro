/** Mensagem de erro de uma chamada a Edge Function (o corpo vem no context). */
export async function erroDaFunction(error: unknown, data: { error?: string } | null): Promise<string | undefined> {
  if (data?.error) return data.error;
  if (error && typeof error === 'object' && 'context' in error) {
    try {
      return (await (error as { context: Response }).context.json())?.error;
    } catch {
      /* sem corpo */
    }
  }
  return error instanceof Error ? error.message : undefined;
}
