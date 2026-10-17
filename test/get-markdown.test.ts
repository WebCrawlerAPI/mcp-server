import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Config } from "../src/config.js";
import { createMcpServer } from "../src/server.js";
import { getMarkdownInput, makeGetMarkdownHandler } from "../src/tools/get-markdown.js";

const cfg = { zeusBaseUrl: "http://zeus", zeusInternalSecret: "s" } as Config;
const extra = (orgId?: string) =>
  ({ authInfo: orgId ? { extra: { orgId, userId: "u" } } : undefined }) as never;

describe("get_markdown input", () => {
  const schema = z.object(getMarkdownInput);
  it("accepts http(s)", () => {
    expect(schema.safeParse({ url: "https://example.com/a" }).success).toBe(true);
    expect(schema.safeParse({ url: "http://example.com" }).success).toBe(true);
  });
  it("rejects other schemes and long urls", () => {
    expect(schema.safeParse({ url: "file:///etc/passwd" }).success).toBe(false);
    expect(schema.safeParse({ url: "ftp://x.com" }).success).toBe(false);
    expect(schema.safeParse({ url: "not a url" }).success).toBe(false);
    expect(schema.safeParse({ url: `https://a.com/${"a".repeat(2100)}` }).success).toBe(false);
  });
});

describe("get_markdown handler", () => {
  it("returns markdown text using the org from auth", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ success: true, markdown: "# T" })));
    const h = makeGetMarkdownHandler(cfg, { fetch: f as never });
    const r = await h({ url: "https://a.com" }, extra("org_9"));
    expect(r).toEqual({ content: [{ type: "text", text: "# T" }] });
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)["X-Org-Id"]).toBe("org_9");
  });
  it("returns isError on failure", async () => {
    const f = vi.fn(
      async () =>
        new Response(JSON.stringify({ error_code: "insufficient_balance" }), { status: 402 }),
    );
    const r = (await makeGetMarkdownHandler(cfg, { fetch: f as never })(
      { url: "https://a.com" },
      extra("o"),
    )) as {
      isError?: boolean;
    };
    expect(r.isError).toBe(true);
  });
  it("throws without auth context", async () => {
    await expect(makeGetMarkdownHandler(cfg)({ url: "https://a.com" }, extra())).rejects.toThrow();
  });
});

describe("tools/list", () => {
  it("lists get_markdown with annotations and no prices", async () => {
    const server = createMcpServer(cfg);
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "t", version: "1" });
    await Promise.all([server.connect(a), client.connect(b)]);
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(1);
    const t = tools[0];
    expect(t?.name).toBe("get_markdown");
    expect(t?.annotations).toMatchObject({
      readOnlyHint: true,
      openWorldHint: true,
      idempotentHint: true,
      destructiveHint: false,
    });
    expect(t?.description).toContain("https://webcrawlerapi.com/pricing");
    expect(t?.description).not.toMatch(/\$|\bcent|USD/i);
  });
});
