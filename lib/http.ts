/** Shared HTTP helpers — browser user-agent and timeout wrapper. */

export const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Runs `fn` with an AbortSignal that fires after `ms` milliseconds. */
export function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fn(controller.signal).finally(() => clearTimeout(timer));
}
