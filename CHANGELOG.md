# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0]

### Added

- Remote MCP server over Streamable HTTP (stateless) at `https://mcp.webcrawlerapi.com/mcp`.
- `get_markdown` tool: fetch a public web page and return its main content as Markdown.
- OAuth 2.1 resource server with protected-resource metadata, scope `markdown:read`.
- Rate limiting per IP and per organization, origin allow-list.
