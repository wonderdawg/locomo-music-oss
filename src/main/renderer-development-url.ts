const HTTP_AUTHORITY_PATTERN = /^http:\/\/([^/?#]*)(?:[/?#]|$)/i;
const LOOPBACK_AUTHORITY_PATTERN =
  /^(?:(?:localhost|127\.0\.0\.1)(?::\d+)?|\[::1\](?::\d+)?)$/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function resolveRendererDevelopmentUrl(
  overrideUrl: string | undefined,
  isPackaged: boolean,
): string | undefined {
  if (isPackaged || !overrideUrl) return undefined;
  if (
    overrideUrl.trim() !== overrideUrl ||
    CONTROL_CHARACTER_PATTERN.test(overrideUrl)
  ) {
    return undefined;
  }

  const authority = HTTP_AUTHORITY_PATTERN.exec(overrideUrl)?.[1];
  if (!authority || !LOOPBACK_AUTHORITY_PATTERN.test(authority)) {
    return undefined;
  }

  try {
    const url = new URL(overrideUrl);
    if (
      url.protocol !== "http:" ||
      !LOOPBACK_HOSTNAMES.has(url.hostname) ||
      url.username !== "" ||
      url.password !== ""
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}
