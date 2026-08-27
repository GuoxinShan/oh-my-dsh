# 新建会话误发「回合已完成」（2026-08-27）

## 现象

点「新会话」立刻进一条通知（系统横幅和/或通知中心），标题往往是工作区目录名或裸 session id。并没有跑过任何用户回合。

## 原因

`diffAttention` 已经不把新 idle 行当 turn-done（见 `2026-08-26-notify-hydration-storm.md`）。新建走 `startSession` → `sessions.create` upsert `{ running: false }` → `sessions.open`。agent 附着会再推一帧 `host/session-status`：`running: true` 随即 `false`。这一帧里该行已是 survivor，于是出 `turn-done`。

原生横幅还吃 `shouldNotify`：Electron 里 `document.hasFocus()` 经常是 false，当前会话的出生脉冲也会打到系统通知中心。

`blank` 帮不上忙：同一条 status mutation 里 `running: true` 会清掉 `blank`，观察不到 `running && blank`。

## 修法

给每个 list id 记首次出现时刻。`running true→false` 若落在首次出现后 `TURN_DONE_BIRTH_GRACE_MS`（1.5s）内，丢掉这条 turn-done。`await-input` 不宽限。真实首回合（打字 + 模型）几乎总长于窗口；之后的回合更远。

不按「是否当前会话」滤 turn-done：窗口失焦时，当前会话的真回合仍应横幅。

## 已知边界

会话首次入列后 1.5s 内结束的真回合会被压掉。用户几乎还在输入框里，可接受。
