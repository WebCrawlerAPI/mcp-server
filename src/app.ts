import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { rateLimit } from "express-rate-limit";
import { REQUIRED_SCOPE } from "./auth.js";
import type { Config } from "./config.js";
import { log } from "./log.js";
import { createMcpServer } from "./server.js";
import { GET_MARKDOWN_DESCRIPTION } from "./tools/get-markdown.js";

const BODY_LIMIT = "256kb";

export function originGuard(allowed: string[]): RequestHandler {
  return (req, res, next) => {
    const origin = req.headers.origin;
    // Non-browser clients send no Origin; browsers must be allow-listed (DNS rebinding protection).
    if (origin === undefined || allowed.includes(origin.replace(/\/+$/, ""))) return next();
    res
      .status(403)
      .json({ jsonrpc: "2.0", error: { code: -32000, message: "Origin not allowed" }, id: null });
  };
}

function clientIp(req: Request): string {
  const cf = req.headers["cf-connecting-ip"];
  return (typeof cf === "string" && cf) || req.ip || "unknown";
}

export function createApp(cfg: Config, verifier: OAuthTokenVerifier) {
  const app = express();
  app.disable("x-powered-by");
  // Behind Cloudflare (and the k8s NodePort): trust forwarded headers for the client IP.
  app.set("trust proxy", true);

  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      if (req.path === "/healthz") return;
      log("info", "request", {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - start,
        org: req.auth?.extra?.orgId,
      });
    });
    next();
  });

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  const metadata = {
    resource: cfg.resourceUri,
    authorization_servers: [cfg.oauthIssuer],
    scopes_supported: [REQUIRED_SCOPE],
    resource_name: "WebCrawlerAPI",
    bearer_methods_supported: ["header"],
  };
  const sendMetadata: RequestHandler = (_req, res) => {
    res.set("Cache-Control", "public, max-age=300").json(metadata);
  };
  app.get("/.well-known/oauth-protected-resource", sendMetadata);
  app.get("/.well-known/oauth-protected-resource/mcp", sendMetadata);

  // Static server card so directories can list the tools without completing OAuth.
  const serverCard = {
    serverInfo: { name: "WebCrawlerAPI", version: "0.1.0" },
    authentication: { required: true, schemes: ["oauth2"] },
    tools: [
      {
        name: "get_markdown",
        title: "Get page as Markdown",
        description: GET_MARKDOWN_DESCRIPTION,
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              maxLength: 2048,
              description: "Absolute http(s) URL of the page to convert to Markdown",
            },
          },
          required: ["url"],
        },
      },
    ],
  };
  app.get("/.well-known/mcp/server-card.json", (_req, res) => {
    res.set("Cache-Control", "public, max-age=300").json(serverCard);
  });

  const ipLimiter = rateLimit({
    windowMs: 60_000,
    limit: 300,
    keyGenerator: clientIp,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    validate: false,
  });
  const orgLimiter = rateLimit({
    windowMs: 60_000,
    limit: 120,
    keyGenerator: (req) => String(req.auth?.extra?.orgId ?? clientIp(req)),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    validate: false,
  });

  const bearer = requireBearerAuth({
    verifier,
    requiredScopes: [REQUIRED_SCOPE],
    resourceMetadataUrl: cfg.resourceMetadataUrl,
    expectedResource: new URL(cfg.resourceUri),
  });

  const handleMcp: RequestHandler = async (req, res) => {
    if (req.method !== "POST") {
      // Stateless: no server-initiated SSE stream, no sessions to delete.
      res
        .set("Allow", "POST")
        .status(405)
        .json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Method not allowed" },
          id: null,
        });
      return;
    }
    const server = createMcpServer(cfg);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    // The transport forwards req.auth to handlers as extra.authInfo.
    await transport.handleRequest(req, res, req.body);
  };

  app.all(
    "/mcp",
    originGuard(cfg.allowedOrigins),
    ipLimiter,
    bearer,
    orgLimiter,
    express.json({ limit: BODY_LIMIT }),
    handleMcp,
  );

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const e = err as { status?: number; type?: string };
    if (e?.type === "entity.too.large") {
      res.status(413).json({ error: "payload_too_large" });
      return;
    }
    if (e?.status && e.status >= 400 && e.status < 500) {
      res.status(e.status).json({ error: "bad_request" });
      return;
    }
    log("error", "unhandled", { name: err instanceof Error ? err.name : "unknown" });
    if (!res.headersSent) res.status(500).json({ error: "internal_error" });
  });

  return app;
}
