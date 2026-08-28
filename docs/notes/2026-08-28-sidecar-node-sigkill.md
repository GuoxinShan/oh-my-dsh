# rc.7 启动 120s 超时：DSH Node.app 被 SIGKILL（2026-08-28）

## 现象

`0.3.0-rc.7` 完整 DMG 安装后报 `harness server did not answer GET / within 120s`，sidecar 日志 0 字节。包内有 `runtime.tar.gz`，不是缺 runtime。

## 原因

one-node sidecar 复制主程序 stub 进 `DSH Node.app` 并改 Info.plist。Developer ID + Hardened Runtime 的签名不再匹配 bundle，macOS 直接杀进程（exit 137）。主程序自己 `ELECTRON_RUN_AS_NODE` 是好的。

热更新瘦 zip 另有一条「没包内 tar 就 curl 补拉」的路径。完整安装不该走；本机那两条孤儿 curl 是更早启动留下的，跟这次 120s 无关。

## 修法

写出 helper 后 ad-hoc codesign。stub 指纹放在 bundle **外面**（`sidecar-node/<sha>/stub-stamp`），不能写进 `Contents/`，否则 `codesign` 把未签名文件当 subcomponent 直接失败。已有 helper 仍带 Developer ID / runtime 则重建。签失败退回主程序。
