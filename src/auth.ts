import { createHash } from "node:crypto";
import { InvalidTokenError, ServerError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Config } from "./config.js";

export const REQUIRED_SCOPE = "markdown:read";
export const MAX_CACHE_TTL_MS = 30_000;
export const NEG_CACHE_TTL_MS = 5_000;
const MAX_CACHE_ENTRIES = 5_000;

interface IntrospectResponse {
  active?: boolean;
  client_id?: string;
  org_id?: string;
  user_id?: string;
  scope?: string;
  resource?: string;
  exp?: number;
  token_type?: string;
}

/** Shape of `authInfo.extra` handed to tool handlers. */
export interface AuthExtra extends Record<string, unknown> {
  orgId: string;
  userId?: string;
}

type Options = {
  fetch?: typeof fetch;
  now?: () => number;
};

function sameResource(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const norm = (s: string) => s.replace(/#.*$/, "").replace(/\/$/, "");
  return norm(a) === norm(b);
}

export class IntrospectionVerifier implements OAuthTokenVerifier {
  /** Positive entries carry `info`; negative entries (rejected tokens) carry `deny`. */
  private readonly cache = new Map<string, { until: number; info?: AuthInfo; deny?: string }>();
  private readonly doFetch: typeof fetch;
  private readonly now: () => number;

  constructor(
    private readonly cfg: Pick<Config, "introspectUrl" | "introspectSecret" | "resourceUri">,
    opts: Options = {},
  ) {
    this.doFetch = opts.fetch ?? fetch;
    this.now = opts.now ?? Date.now;
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const key = createHash("sha256").update(token).digest("hex");
    const now = this.now();
    const hit = this.cache.get(key);
    if (hit) {
      if (hit.until > now) {
        if (hit.info) return hit.info;
        throw new InvalidTokenError(hit.deny ?? "Token is not active");
      }
      this.cache.delete(key);
    }

    let res: Response;
    try {
      res = await this.doFetch(this.cfg.introspectUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.cfg.introspectSecret}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ token }).toString(),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new ServerError("Token introspection unavailable");
    }
    if (!res.ok) throw new ServerError("Token introspection failed");

    let body: IntrospectResponse;
    try {
      body = (await res.json()) as IntrospectResponse;
    } catch {
      throw new ServerError("Token introspection returned invalid response");
    }

    if (body.active !== true) throw this.deny(key, "Token is not active", now);
    const scopes = (body.scope ?? "").split(/\s+/).filter(Boolean);
    if (!scopes.includes(REQUIRED_SCOPE)) throw this.deny(key, "Token lacks required scope", now);
    if (!sameResource(body.resource, this.cfg.resourceUri)) {
      throw this.deny(key, "Token was not issued for this resource", now);
    }
    if (!body.org_id || !body.client_id) throw new InvalidTokenError("Token is missing claims");
    if (typeof body.exp !== "number" || body.exp * 1000 <= now) {
      throw new InvalidTokenError("Token has expired");
    }

    const extra: AuthExtra = { orgId: body.org_id, userId: body.user_id };
    const info: AuthInfo = {
      token,
      clientId: body.client_id,
      scopes,
      expiresAt: body.exp,
      resource: new URL(this.cfg.resourceUri),
      extra,
    };

    this.store(key, { info, until: Math.min(now + MAX_CACHE_TTL_MS, body.exp * 1000) });
    return info;
  }

  /** Caches a rejection for a short time so repeated bad tokens do not hammer introspection. */
  private deny(key: string, message: string, now: number): InvalidTokenError {
    this.store(key, { deny: message, until: now + NEG_CACHE_TTL_MS });
    return new InvalidTokenError(message);
  }

  private store(key: string, entry: { until: number; info?: AuthInfo; deny?: string }): void {
    if (this.cache.size >= MAX_CACHE_ENTRIES) this.cache.clear();
    this.cache.set(key, entry);
  }
}
