import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import type { AuthExtra } from "../auth.js";
import type { Config } from "../config.js";
import { registerGetMarkdown } from "./get-markdown.js";

export type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/** Organization the verified token is pinned to. Use this to call Zeus. */
export function getAuth(extra: ToolExtra): AuthExtra {
  const e = extra.authInfo?.extra as AuthExtra | undefined;
  if (!e?.orgId) throw new Error("Missing auth context");
  return e;
}

/**
 * Register all tools. Returns the number registered.
 */
export function registerTools(server: McpServer, cfg: Config): number {
  registerGetMarkdown(server, cfg);
  return 1;
}
