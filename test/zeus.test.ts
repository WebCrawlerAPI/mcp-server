import { describe, expect, it, vi } from "vitest";
import { fetchMarkdown, truncateMarkdown } from "../src/zeus.js";

const cfg = { zeusBaseUrl: "http://zeus.internal", zeusInternalSecret: "shh" };
const j = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

describe("fetchMarkdown", () => {
  it("sends internal headers, no Authorization, encoded url", async () => {
    const f = vi.fn(async () => j({ success: true, markdown: "# hi" }));
    const r = await fetchMarkdown(cfg, "org_1", "https://a.com/x?y=1&z=2", { fetch: f as never });
    expect(r).toEqual({ ok: true, markdown: "# hi", truncated: false });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://zeus.internal/markdown?url=https%3A%2F%2Fa.com%2Fx%3Fy%3D1%26z%3D2");
    const h = init.headers as Record<string, string>;
    expect(h["X-Internal-Secret"]).toBe("shh");
    expect(h["X-Org-Id"]).toBe("org_1");
    expect(Object.keys(h).map((k) => k.toLowerCase())).not.toContain("authorization");
    expect(init.method).toBe("GET");
  });

  it.each([
    [402, { success: false, error_code: "insufficient_balance" }, /balance/i],
    [403, { success: false, error_code: "access_denied" }, /suspended or this website is blocked/],
    [429, { success: false, error_code: "rate_limit_exceeded" }, /parallel/],
    [400, { success: false, error_code: "invalid_request" }, /invalid/],
    [200, { success: false, error_code: "timeout_error" }, /did not respond/],
    [200, { success: false, error_code: "blocked_by_robots_txt" }, /robots/],
    [200, { success: false, error_code: "totally_new_code" }, /Could not fetch/],
    [500, { weird: true }, /Could not fetch/],
  ])("maps %i %j", async (status, body, re) => {
    const f = vi.fn(async () => j(body, status));
    const r = await fetchMarkdown(cfg, "o", "https://a.com", { fetch: f as never });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(re);
  });

  it("handles non-JSON error body", async () => {
    const f = vi.fn(async () => new Response("<html>", { status: 502 }));
    const r = await fetchMarkdown(cfg, "o", "https://a.com", { fetch: f as never });
    expect(r).toMatchObject({ ok: false });
  });

  it("times out via abort", async () => {
    const f = vi.fn(
      (_u: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          init.signal?.addEventListener("abort", () => rej(new DOMException("x", "AbortError")));
        }),
    );
    const r = await fetchMarkdown(cfg, "o", "https://a.com", { fetch: f as never, timeoutMs: 10 });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.message).toMatch(/timed out/);
  });

  it("truncates with a visible notice", async () => {
    const f = vi.fn(async () => j({ success: true, markdown: "a".repeat(50) }));
    const r = await fetchMarkdown(cfg, "o", "https://a.com", { fetch: f as never, maxChars: 10 });
    expect(r.ok && r.truncated).toBe(true);
    if (r.ok) expect(r.markdown).toContain("[Content truncated");
  });

  it("truncateMarkdown leaves small content alone", () => {
    expect(truncateMarkdown("abc", 10)).toEqual({ text: "abc", truncated: false });
  });
});

describe("fetchMarkdown caller signal", () => {
  it("aborts the Zeus request when the caller signal fires", async () => {
    const f = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          init.signal?.addEventListener("abort", () => rej(new DOMException("x", "AbortError")));
        }),
    );
    const caller = new AbortController();
    const p = fetchMarkdown(cfg, "o", "https://a.com", { fetch: f as never }, caller.signal);
    caller.abort();
    const r = await p;
    expect(r.ok).toBe(false);
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal?.aborted).toBe(true);
  });
});
