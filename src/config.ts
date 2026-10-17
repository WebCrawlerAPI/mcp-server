import { z } from "zod";

const httpUrl = z
  .string()
  .url()
  .refine((v) => /^https?:\/\//.test(v), "must be http(s)");

const schema = z.object({
  MCP_PUBLIC_URL: httpUrl,
  OAUTH_ISSUER: httpUrl,
  OAUTH_INTROSPECT_URL: httpUrl,
  OAUTH_INTROSPECT_SECRET: z.string().min(1),
  ZEUS_BASE_URL: httpUrl,
  ZEUS_INTERNAL_SECRET: z.string().min(1),
  MCP_ALLOWED_ORIGINS: z.string().default(""),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
});

export interface Config {
  /** Public base URL without trailing slash, e.g. https://mcp.webcrawlerapi.com */
  publicUrl: string;
  /** Canonical MCP resource URI (audience), `${publicUrl}/mcp`. */
  resourceUri: string;
  /** URL of the protected-resource metadata document, used in WWW-Authenticate. */
  resourceMetadataUrl: string;
  oauthIssuer: string;
  introspectUrl: string;
  introspectSecret: string;
  zeusBaseUrl: string;
  zeusInternalSecret: string;
  allowedOrigins: string[];
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    // Only variable names and messages; never values.
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid configuration: ${problems.join("; ")}`);
  }
  const e = parsed.data;
  const publicUrl = e.MCP_PUBLIC_URL.replace(/\/+$/, "");
  return {
    publicUrl,
    resourceUri: `${publicUrl}/mcp`,
    resourceMetadataUrl: `${publicUrl}/.well-known/oauth-protected-resource/mcp`,
    oauthIssuer: e.OAUTH_ISSUER.replace(/\/+$/, ""),
    introspectUrl: e.OAUTH_INTROSPECT_URL,
    introspectSecret: e.OAUTH_INTROSPECT_SECRET,
    zeusBaseUrl: e.ZEUS_BASE_URL.replace(/\/+$/, ""),
    zeusInternalSecret: e.ZEUS_INTERNAL_SECRET,
    allowedOrigins: e.MCP_ALLOWED_ORIGINS.split(",")
      .map((s) => s.trim().replace(/\/+$/, ""))
      .filter(Boolean),
    port: e.PORT,
  };
}
