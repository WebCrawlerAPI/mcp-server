# WebCrawlerAPI MCP server

[![CI](https://github.com/WebCrawlerAPI/mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/WebCrawlerAPI/mcp-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-com.webcrawlerapi%2Fmcp--server-38bdf8)](https://registry.modelcontextprotocol.io/v0/servers?search=com.webcrawlerapi/mcp-server)

A remote [Model Context Protocol](https://modelcontextprotocol.io) server that lets AI assistants read any web page as
clean Markdown. It runs on WebCrawlerAPI, so JavaScript-rendered pages work and navigation, ads and boilerplate are
stripped. Use it to pull docs, articles and product pages into a knowledge base or into a chat.

- Remote URL: `https://mcp.webcrawlerapi.com/mcp`
- Transport: Streamable HTTP (stateless)
- Sign-in: OAuth 2.1 through `https://auth.webcrawlerapi.com`, no API key to paste
- Tool: `get_markdown`

You need a WebCrawlerAPI account. Sign up at https://dash.webcrawlerapi.com.

## Connect

One-click install: [Add to Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=webcrawlerapi&config=eyJ1cmwiOiAiaHR0cHM6Ly9tY3Aud2ViY3Jhd2xlcmFwaS5jb20vbWNwIn0=) · [Add to VS Code](vscode:mcp/install?%7B%22name%22%3A%22webcrawlerapi%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A//mcp.webcrawlerapi.com/mcp%22%7D)

In every client below, the first request opens a browser window where you sign in and approve access for one of your
organizations. Requests are billed to that organization.

### Claude Code

```bash
claude mcp add --transport http webcrawlerapi https://mcp.webcrawlerapi.com/mcp
```

Then run `/mcp` inside Claude Code, pick `webcrawlerapi` and choose Authenticate.

### Claude.ai and Claude Desktop

1. Open Settings, then Connectors.
2. Choose Add custom connector.
3. Name: `WebCrawlerAPI`. URL: `https://mcp.webcrawlerapi.com/mcp`.
4. Click Connect and approve access in the browser.

### Cursor

Add this to `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{
  "mcpServers": {
    "webcrawlerapi": {
      "url": "https://mcp.webcrawlerapi.com/mcp"
    }
  }
}
```

Open Cursor Settings, then MCP, and click Connect next to `webcrawlerapi`.

### VS Code

Add this to `.vscode/mcp.json` (or run "MCP: Add Server" and choose HTTP):

```json
{
  "servers": {
    "webcrawlerapi": {
      "type": "http",
      "url": "https://mcp.webcrawlerapi.com/mcp"
    }
  }
}
```

Start the server from the CodeLens above the entry and approve access in the browser.

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Pick transport "Streamable HTTP", URL `https://mcp.webcrawlerapi.com/mcp`, then use the OAuth flow in the Auth tab
and call `get_markdown`.

### ChatGPT

1. Open Settings, then Connectors, and turn on Developer mode (Advanced).
2. Create a connector with URL `https://mcp.webcrawlerapi.com/mcp` and authentication set to OAuth.
3. Enable the connector in a chat and approve access in the browser.

Menu names change between ChatGPT plans and releases. Custom connectors may not be available on every plan.

## Tool reference

### `get_markdown`

Fetch a public web page and return its main content as clean Markdown.

| Input | Type   | Required | Description                                       |
|-------|--------|----------|---------------------------------------------------|
| `url` | string | yes      | Absolute `http://` or `https://` URL, up to 2048 characters |

Returns the page as Markdown text. On failure the tool returns an error result with a short human-readable message
(for example an unreachable site, a page blocked by robots.txt, a timeout, or an empty balance).

Annotations: read-only, idempotent, not destructive, open world (it reaches out to the public web).

Each call is billed to your WebCrawlerAPI organization. See https://webcrawlerapi.com/pricing.

## Authentication

The server is an OAuth resource server. Clients discover the authorization server from
`https://mcp.webcrawlerapi.com/.well-known/oauth-protected-resource`, which points to `https://auth.webcrawlerapi.com`.

- Scope: `markdown:read` (the only scope)
- Tokens are bound to the MCP server URL (resource indicator) and to the organization you approve.
- You can review and revoke connected apps in the dashboard under Connected apps.
- The server never forwards your token to other services.

## Privacy and terms

- Privacy policy: https://webcrawlerapi.com/privacy
- Terms of service: https://webcrawlerapi.com/tos

The server receives the URLs you ask it to fetch and returns the page content. It does not log tokens or full URLs
with query strings.

## Pricing

Usage is billed to your organization. Current prices: https://webcrawlerapi.com/pricing

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Changes are listed in
[CHANGELOG.md](CHANGELOG.md).

## Support

support@webcrawlerapi.com. Security reports: see [SECURITY.md](SECURITY.md).

## Development

Requires Node 22 and pnpm.

```bash
pnpm install
cp .env.example .env   # fill in the values
pnpm dev               # tsx watch
pnpm lint && pnpm test && pnpm build
```

Configuration is via environment variables, see `.env.example` and [CONTRIBUTING.md](CONTRIBUTING.md). Registry publishing
steps are in [docs/registry-verification.md](docs/registry-verification.md).

## License

MIT, see [LICENSE](LICENSE).
