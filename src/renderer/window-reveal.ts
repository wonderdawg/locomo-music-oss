export function createOneTimeWindowExpansionRequester(
  expandWindow: () => Promise<void>,
): () => boolean {
  let requested = false;

  return () => {
    if (requested) {
      return false;
    }

    requested = true;
    void expandWindow().catch(() => undefined);
    return true;
  };
}
