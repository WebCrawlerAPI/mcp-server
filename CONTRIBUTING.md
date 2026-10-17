# Contributing

Thanks for helping. Bug reports and pull requests are welcome.

## Setup

Requires Node 22 and pnpm.

```bash
pnpm install
cp .env.example .env   # fill in the values
pnpm dev
```

Before opening a pull request:

```bash
pnpm lint && pnpm test && pnpm build
```

## Guidelines

- Keep pull requests small and focused. Open an issue first for new tools, scopes or auth changes.
- Never log tokens, secrets or URLs with query strings.
- Never forward a client's access token to other services.
- Add or update tests in `test/` for behavior changes.
- Update the tool reference in `README.md` when tool inputs or outputs change.

## Layout

- `src/app.ts` Express app: health check, OAuth protected-resource metadata, `/mcp` pipeline.
- `src/auth.ts` token introspection.
- `src/config.ts` environment config, validated with zod.
- `src/tools/` tool definitions. Register new tools in `src/tools/index.ts`.
- `test/` vitest tests.

## Security

Report vulnerabilities as described in [SECURITY.md](SECURITY.md), not in public issues.
