import { extractTitle, htmlToText } from "./html";
import { BROWSER_UA } from "./http";

export type FetchedPage = {
  url: string;
  finalUrl: string;
  status: number;
  title: string;
  text: string;
  error?: string;
};

/**
 * Fetches a URL with a hard timeout and a size cap — safe for Vercel
 * serverless functions (never hangs, never blows the 1 GB memory).
 */
export async function fetchText(
  url: string,
  opts: { timeoutMs?: number; maxChars?: number } = {}
): Promise<FetchedPage> {
  const timeoutMs = opts.timeoutMs ?? 9000;
  const maxChars = opts.maxChars ?? 6000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Only allow http/https targets (model-supplied URLs; blocks file:, ftp:,
    // data:, javascript: and other schemes serverless would mis-handle anyway).
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return { url, finalUrl: url, status: 0, title: "", text: "", error: "invalid URL" };
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { url, finalUrl: url, status: 0, title: "", text: "", error: `scheme ${u.protocol} not allowed` };
    }
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": BROWSER_UA,
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    const ctype = res.headers.get("content-type") || "";
    let raw = "";
    if (/json/i.test(ctype)) {
      raw = JSON.stringify(await res.json(), null, 1);
    } else {
      raw = await res.text();
    }
    const isHtml = /html|xml|json|text/i.test(ctype) || !ctype;
    const title = isHtml ? extractTitle(raw) : "";
    const text = isHtml ? htmlToText(raw) : raw.replace(/\s+/g, " ");
    return {
      url,
      finalUrl: res.url || url,
      status: res.status,
      title,
      text: text.slice(0, maxChars),
    };
  } catch (e: unknown) {
    const err = e as Error;
    return {
      url,
      finalUrl: url,
      status: 0,
      title: "",
      text: "",
      error:
        err.name === "AbortError"
          ? "timeout after " + timeoutMs + "ms"
          : err.message || "fetch failed",
    };
  } finally {
    clearTimeout(timer);
  }
}
