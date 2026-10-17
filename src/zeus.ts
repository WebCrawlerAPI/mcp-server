import type { Config } from "./config.js";

/** Zeus /markdown waits up to ~85s for the scrape plus up to 25s for cleaning; allow headroom. */
export const ZEUS_TIMEOUT_MS = 120_000;
export const MAX_MARKDOWN_CHARS = 100_000;

export type ZeusResult =
  | { ok: true; markdown: string; truncated: boolean }
  | { ok: false; message: string };

export interface ZeusDeps {
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxChars?: number;
}

const SUPPORT = "support@webcrawlerapi.com";

/** Messages keyed by error codes documented in artemis/content/docs/errors.mdx only. */
const CODE_MESSAGES: Record<string, string> = {
  insufficient_balance:
    "The organization's balance is too low to run this request. Top up at https://dash.webcrawlerapi.com.",
  invalid_request: "The URL was rejected as invalid. Check that it is a public http(s) page.",
  internal_error: `WebCrawlerAPI had an internal error. Try again later or contact ${SUPPORT}.`,
  host_returned_error: "The website returned an unsuccessful HTTP status code for this page.",
  website_access_denied: "The website denied access (HTTP 403) to this page.",
  blocked_by_robots_txt: "The URL is blocked by the website's robots.txt.",
  name_not_resolved: "The website host name could not be resolved. Check the URL for typos.",
  ssl_cert_error:
    "The website's SSL/TLS certificate is invalid, so the page could not be fetched securely.",
  timeout_error: "The website did not respond in time. Try again later.",
  webpage_non_success:
    "The page could not be crawled successfully; it may be empty or protected against bots.",
  llm_max_context_length_error: "The page is too large to process.",
  duplicate_item: "Duplicate content was detected for this page.",
};

const STATUS_MESSAGES: Record<number, string> = {
  400: "The URL was rejected as invalid. Check that it is a public http(s) page.",
  402: CODE_MESSAGES.insufficient_balance as string,
  403: `Access denied: the organization is suspended or this website is blocked. Contact ${SUPPORT} if this is a mistake.`,
  429: "Too many requests running in parallel for this organization. Wait a moment and retry.",
  504: "The request timed out. Try again later.",
};

const GENERIC = `Could not fetch markdown for this URL. Try again later or contact ${SUPPORT}.`;

export function truncateMarkdown(md: string, max: number): { text: string; truncated: boolean } {
  if (md.length <= max) return { text: md, truncated: false };
  return {
    text: `${md.slice(0, max)}\n\n[Content truncated: showing the first ${max} of ${md.length} characters.]`,
    truncated: true,
  };
}

/**
 * Fetch cleaned markdown for `url` on behalf of `orgId`. Never sends the client's token.
 * `callerSignal` (e.g. the MCP request signal) aborts the Zeus request when the client goes away.
 */
export async function fetchMarkdown(
  cfg: Pick<Config, "zeusBaseUrl" | "zeusInternalSecret">,
  orgId: string,
  url: string,
  deps: ZeusDeps = {},
  callerSignal?: AbortSignal,
): Promise<ZeusResult> {
  const doFetch = deps.fetch ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs ?? ZEUS_TIMEOUT_MS);
  const signal = callerSignal ? AbortSignal.any([ctrl.signal, callerSignal]) : ctrl.signal;
  try {
    const res = await doFetch(`${cfg.zeusBaseUrl}/markdown?url=${encodeURIComponent(url)}`, {
      method: "GET",
      headers: {
        "X-Internal-Secret": cfg.zeusInternalSecret,
        "X-Org-Id": orgId,
        Accept: "application/json",
      },
      signal,
    });
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    if (res.ok && b.success === true && typeof b.markdown === "string") {
      const { text, truncated } = truncateMarkdown(b.markdown, deps.maxChars ?? MAX_MARKDOWN_CHARS);
      return { ok: true, markdown: text, truncated };
    }
    // HTTP status wins for 402/403/429 (their codes are not all documented); then documented codes.
    const byStatus = STATUS_MESSAGES[res.status];
    if (byStatus && !res.ok) return { ok: false, message: byStatus };
    const code = typeof b.error_code === "string" ? b.error_code : undefined;
    const byCode = code ? CODE_MESSAGES[code] : undefined;
    return { ok: false, message: byCode ?? GENERIC };
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
      return { ok: false, message: STATUS_MESSAGES[504] as string };
    }
    return { ok: false, message: GENERIC };
  } finally {
    clearTimeout(timer);
  }
}
