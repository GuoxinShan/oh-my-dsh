# 2026-08-22 — Desktop app branding

## Decision

The desktop product name is **Oh My DSH**. Tauri's `productName`, the native window title, boot failure dialog, and the DMG installation background use that name.

The internal crate name, executable name, `dev.dsh.desktop` identifier, `window.__DSH_DESKTOP__` shell value, IPC command names, log prefixes, and plugin package IDs remain unchanged. They are runtime compatibility identifiers rather than user-facing branding.

## Packaging impact

Tauri derives the visible `.app`, DMG, NSIS, and macOS updater archive names from `productName`. The macOS release job therefore discovers the single generated `.app.tar.gz`, URL-encodes its asset name in `latest-darwin.json`, and publishes archive globs instead of the old fixed `dsh-desktop` filenames.
