import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import { log } from "../log.js";
import { fetchMarkdown, type ZeusDeps } from "../zeus.js";
import { getAuth, type ToolExtra } from "./index.js";

export const GET_MARKDOWN_DESCRIPTION =
  "Scrape a webpage: fetch a public URL and return its main content as clean Markdown (navigation, ads and boilerplate removed). " +
  "Handles JavaScript-rendered pages. Each call is billed to your WebCrawlerAPI organization; see " +
  "https://webcrawlerapi.com/pricing for pricing. Only http(s) URLs are accepted.";

export const getMarkdownInput = {
  url: z
    .string()
    .max(2048)
    .url()
    .refine((v) => /^https?:\/\//i.test(v), "URL must start with http:// or https://")
    .describe("Absolute http(s) URL of the page to convert to Markdown"),
};

export function makeGetMarkdownHandler(cfg: Config, deps: ZeusDeps = {}) {
  return async ({ url }: { url: string }, extra: ToolExtra) => {
    const { orgId } = getAuth(extra);
    const r = await fetchMarkdown(cfg, orgId, url, deps, extra.signal);
    if (!r.ok) {
      log("warn", "get_markdown failed", { orgId });
      return { isError: true, content: [{ type: "text" as const, text: r.message }] };
    }
    return { content: [{ type: "text" as const, text: r.markdown }] };
  };
}

export function registerGetMarkdown(server: McpServer, cfg: Config, deps: ZeusDeps = {}): void {
  server.registerTool(
    "get_markdown",
    {
      title: "Get page as Markdown",
      description: GET_MARKDOWN_DESCRIPTION,
      inputSchema: getMarkdownInput,
      annotations: {
        title: "Get page as Markdown",
        readOnlyHint: true,
        openWorldHint: true,
        idempotentHint: true,
        destructiveHint: false,
      },
    },
    makeGetMarkdownHandler(cfg, deps),
  );
}
