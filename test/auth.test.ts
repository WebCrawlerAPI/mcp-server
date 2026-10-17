import { describe, expect, it, vi } from "vitest";
import { IntrospectionVerifier } from "../src/auth.js";

const cfg = {
  introspectUrl: "http://oauth.internal/introspect",
  introspectSecret: "s3cret",
  resourceUri: "https://mcp.example.com/mcp",
};

function resp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function setup(body: unknown, startMs = 1_000_000_000_000) {
  let t = startMs;
  const fetchMock = vi.fn(async () => resp(body));
  const v = new IntrospectionVerifier(cfg, { fetch: fetchMock as never, now: () => t });
  return { v, fetchMock, advance: (ms: number) => (t += ms), now: () => t };
}

const good = (exp: number) => ({
  active: true,
  client_id: "c1",
  org_id: "org_1",
  user_id: "u1",
  scope: "markdown:read",
  resource: "https://mcp.example.com/mcp",
  exp,
  token_type: "Bearer",
});

describe("IntrospectionVerifier", () => {
  it("accepts an active token and exposes org_id", async () => {
    const { v, fetchMock } = setup(good(1_000_000_000 + 3600));
    const info = await v.verifyAccessToken("tok");
    expect(info.extra).toMatchObject({ orgId: "org_1", userId: "u1" });
    expect(info.scopes).toEqual(["markdown:read"]);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe(cfg.introspectUrl);
    expect(call[1].body).toBe("token=tok");
    expect((call[1].headers as Record<string, string>).Authorization).toBe("Bearer s3cret");
    expect((call[1].headers as Record<string, string>)["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
  });

  it("rejects inactive tokens", async () => {
    const { v } = setup({ active: false });
    await expect(v.verifyAccessToken("tok")).rejects.toThrow(/not active/);
  });

  it("rejects wrong scope", async () => {
    const { v } = setup({ ...good(1_000_000_000 + 3600), scope: "other" });
    await expect(v.verifyAccessToken("tok")).rejects.toThrow(/scope/);
  });

  it("rejects wrong resource", async () => {
    const { v } = setup({ ...good(1_000_000_000 + 3600), resource: "https://evil.example/mcp" });
    await expect(v.verifyAccessToken("tok")).rejects.toThrow(/resource/);
  });

  it("rejects expired tokens", async () => {
    const { v } = setup(good(1_000_000_000 - 1));
    await expect(v.verifyAccessToken("tok")).rejects.toThrow(/expired/);
  });

  it("caches for at most 30s, then re-introspects", async () => {
    const { v, fetchMock, advance } = setup(good(1_000_000_000 + 3600));
    await v.verifyAccessToken("tok");
    advance(29_000);
    await v.verifyAccessToken("tok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    advance(2_000);
    await v.verifyAccessToken("tok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never caches beyond exp", async () => {
    const { v, fetchMock, advance } = setup(good(1_000_000_000 + 5));
    await v.verifyAccessToken("tok");
    advance(6_000);
    await expect(v.verifyAccessToken("tok")).rejects.toThrow(/expired/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caches negative results for 5s, then re-introspects", async () => {
    const { v, fetchMock, advance } = setup({ active: false });
    await expect(v.verifyAccessToken("tok")).rejects.toThrow(/not active/);
    advance(4_000);
    await expect(v.verifyAccessToken("tok")).rejects.toThrow(/not active/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    advance(2_000);
    await expect(v.verifyAccessToken("tok")).rejects.toThrow(/not active/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caches wrong-scope and wrong-resource rejections", async () => {
    const { v, fetchMock } = setup({ ...good(1_000_000_000 + 3600), scope: "other" });
    await expect(v.verifyAccessToken("tok")).rejects.toThrow(/scope/);
    await expect(v.verifyAccessToken("tok")).rejects.toThrow(/scope/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const r = setup({ ...good(1_000_000_000 + 3600), resource: "https://evil.example/mcp" });
    await expect(r.v.verifyAccessToken("tok")).rejects.toThrow(/resource/);
    await expect(r.v.verifyAccessToken("tok")).rejects.toThrow(/resource/);
    expect(r.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache 5xx responses or transport errors", async () => {
    const f = vi.fn(async () => new Response("boom", { status: 500 }));
    const v = new IntrospectionVerifier(cfg, { fetch: f as never, now: () => 1_000_000_000_000 });
    await expect(v.verifyAccessToken("tok")).rejects.toThrow(/failed/);
    await expect(v.verifyAccessToken("tok")).rejects.toThrow(/failed/);
    expect(f).toHaveBeenCalledTimes(2);

    const g = vi.fn(async () => {
      throw new Error("down");
    });
    const w = new IntrospectionVerifier(cfg, { fetch: g as never, now: () => 1_000_000_000_000 });
    await expect(w.verifyAccessToken("tok")).rejects.toThrow(/unavailable/);
    await expect(w.verifyAccessToken("tok")).rejects.toThrow(/unavailable/);
    expect(g).toHaveBeenCalledTimes(2);
  });

  it("fails closed when introspection is unreachable", async () => {
    const v = new IntrospectionVerifier(cfg, {
      fetch: (async () => {
        throw new Error("down");
      }) as never,
    });
    await expect(v.verifyAccessToken("tok")).rejects.toThrow(/unavailable/);
  });
});
