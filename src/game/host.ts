/** Lexicographically lowest id becomes host. */
export function electHost(ids: string[]): string {
  return [...ids].sort()[0]!
}
