# Archived: Tauri 2 shell

This directory is the previous Tauri 2 / WKWebView desktop shell. Shipping
builds as of 0.3.0-rc.1 use `src-electron/` instead.

Do not add features here. `pnpm desktop:tauri` and `pnpm desktop:build:tauri`
remain for archaeology. The release workflow no longer produces Tauri
artifacts.

**Updater cutover:** 0.2.x clients talk to `releases/latest/download/latest.json`.
0.3.x publishes `latest-mac.yml` / `latest.yml` instead. A 0.2.x install cannot
hot-update to Electron — users must download the new package from GitHub
Releases. The last Tauri release should not be pointed at Electron artifacts.
If `latest.json` is gone or the advertised version is 0.3.x, the archived
updater confirms only by opening the Releases download page (it never installs
an Electron package).
