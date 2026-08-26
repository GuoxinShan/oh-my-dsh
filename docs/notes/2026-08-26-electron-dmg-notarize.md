# 2026-08-26 — Electron 必须单独公证 DMG

`v0.3.0-rc.1` 第二次 Release 过了 Finder 布局校验，卡在 `Staple and assess the DMG`：

```
CloudKit query ... failed due to "Record not found"
spctl: rejected  source=no usable signature
```

`.app` 公证成功（`notarization successful`），随后才打包 zip/dmg。`stapler staple` 查的是 **DMG 自己的 hash**，Apple 没有这份 ticket，`|| true` 之后 `spctl -t install` 硬失败，publish 被跳过。

这和 2026-08-19 Tauri 笔记同一条缝：壳只公证 `.app`，容器要再 `notarytool submit --wait` 一次。electron-builder 26 `mac.notarize=true` 同样只提交 `.app`。

修法：`scripts/notarize-dmg.sh` 在 CI 里对最终 DMG 签名 → 提交 → staple → `spctl`。失败即中止，不再「staple 失败也继续评估」。
