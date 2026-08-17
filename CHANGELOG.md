# Changelog

All notable changes to this project are documented in this file.

## [0.2.0] - 2026-08-17

### Added

- Added `authorizationCredentialRef` for Streamable HTTP servers. The manager resolves the DSH credential reference into a Bearer `Authorization` header only when composing the MCP client.
- Added `envCredentialRefs` for stdio servers. Each child environment variable can now reference a DSH-managed credential without storing its value in `mcp.servers`.
- Added Form and JSON editor support, validation, and round-trip coverage for both credential-reference forms.
- Added `pnpm run dev:web` for package-local Host and Client bundle watching during DSH Web development.

### Changed

- Credential reference names now follow the DSH portable environment-variable contract: `[A-Za-z_][A-Za-z0-9_]*`.
- Credential updates restart only MCP servers that reference the changed value, allowing rotations to reach the next process or HTTP connection without editing settings.
- Independent server credentials resolve concurrently so a slow credential source does not block unrelated MCP servers.
- The transport selector now uses the shared DSH menu and icon controls.
- When `authorizationCredentialRef` is configured, its resolved Bearer header replaces every case variant of a literal `Authorization` header.

### Fixed

- Prevented pending credential resolution from spawning an untracked MCP client after manager disposal or HMR unload.
- Reported stdio environment and credential-reference map errors on their respective fields.
- Preserved credential references across Form and JSON editor transitions.

### Verification

- TypeScript project typecheck.
- 56 Vitest tests, including credential projection, rotation, validation, editor round trips, and delayed-resolution disposal.
- Production bundle and JavaScript smoke checks.
- Packed-distribution inspection and `git diff --check`.
