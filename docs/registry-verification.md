# MCP Registry namespace verification

Goal: publish `com.webcrawlerapi/mcp-server` to the official MCP Registry. The `com.webcrawlerapi` namespace is proven
by a DNS TXT record on the apex of `webcrawlerapi.com`. These are manual steps; nothing here is automated.

Source: https://github.com/modelcontextprotocol/registry (docs: authentication). Re-check it before running, the
registry is in preview.

## 1. Install the publisher CLI

```bash
brew install mcp-publisher
```

## 2. Generate a key pair (Ed25519, needs OpenSSL 3)

On macOS the system `openssl` is LibreSSL and has no Ed25519. Use `brew install openssl@3` and call
`/opt/homebrew/opt/openssl@3/bin/openssl` instead of `openssl`.

```bash
MY_DOMAIN="webcrawlerapi.com"
openssl genpkey -algorithm Ed25519 -out mcp-registry-key.pem
PUBLIC_KEY="$(openssl pkey -in mcp-registry-key.pem -pubout -outform DER | tail -c 32 | base64)"
echo "${MY_DOMAIN}. IN TXT \"v=MCPv1; k=ed25519; p=${PUBLIC_KEY}\""
```

Store `mcp-registry-key.pem` in a password manager or the macOS Keychain. Never commit it. Do not put it in this repo.

## 3. Add the TXT record in Cloudflare

- Zone: `webcrawlerapi.com`
- Type: `TXT`
- Name: `@` (the apex, NOT `_mcp-auth` or any other selector)
- Content: `v=MCPv1; k=ed25519; p=<PUBLIC_KEY from step 2>`
- Proxy: not applicable (TXT records are DNS only)

Keep existing TXT records at the apex (SPF etc.). Adding one more is fine. If the key is ever rotated, delete the old
MCP TXT record, a stale one breaks verification.

Check propagation:

```bash
dig +short TXT webcrawlerapi.com | grep MCPv1
```

## 4. Log in and publish

From the `mcp/` directory (where `server.json` lives):

```bash
PRIVATE_KEY="$(openssl pkey -in mcp-registry-key.pem -noout -text | grep -A3 "priv:" | tail -n +2 | tr -d ' :\n')"
mcp-publisher login dns --domain="webcrawlerapi.com" --private-key="${PRIVATE_KEY}"
mcp-publisher publish
```

If `mcp-publisher login dns --help` shows different flags, follow the help output.

## 5. Verify

```bash
curl "https://registry.modelcontextprotocol.io/v0/servers?search=com.webcrawlerapi/mcp-server"
```

## Notes

- `server.json` `version` must be bumped for every publish (versions are immutable).
- Pure remote servers do not need a package or `mcpName` in `package.json`.
- The `icons` URL in `server.json` (`https://webcrawlerapi.com/mcp-icon.svg`) must exist. Copy `icon.svg` to
  the website's `public/mcp-icon.svg` or change the URL.
- The repo URL in `server.json` should be public before publishing, or drop the `repository` block.
