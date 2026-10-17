import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "./config.js";
import { registerTools } from "./tools/index.js";

/** Build a fresh MCP server (stateless: one per request). */
export function createMcpServer(cfg: Config): McpServer {
  const server = new McpServer({ name: "webcrawlerapi", version: "0.1.0" });
  const count = registerTools(server, cfg);
  if (count === 0) {
    // No tools yet: still answer tools/list cleanly with an empty list.
    server.server.registerCapabilities({ tools: {} });
    server.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));
  }
  return server;
}
