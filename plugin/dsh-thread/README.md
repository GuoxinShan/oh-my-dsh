# dsh-thread

Out-of-tree DeepSeek Harness plugin for explicit cross-session Thread handoffs.

The bundle installs the Host gateway, the globally-injected `thread_handoff` Tool, and the browser surface. One master switch lives in **Settings → General → Thread** (settings namespace `dsh-thread`, default on):

- **On**: every Session — any Agent preset — gets the `thread_handoff` Tool and its prompt guidance; the Session header shows the Thread utility and the capsule panel; the sidebar gains a **Thread 分组** list view (see below).
- **Off**: the Tool unregisters live, the header utility and capsule hide, the sidebar view withdraws from the view-options menu, and `authorize` answers `thread-disabled`. Historical Handoff cards keep their summary but lose the action.

No dedicated Agent preset is involved anymore: the earlier `standard-thread` preset is retired, and a confirmed continuation Session inherits the **source Session's own preset** (falling back to the deployment default). The Host derives and stamps it at authorization; the Client never names a preset.

`thread_handoff` only prepares an inert, bounded durable Draft and concludes the current turn. It never creates or wakes a Session. Direct Client confirmation owns the existing `session.create`/`session.rename` path; Host activation is added through the package Remote rather than by the Tool.

The Session header's right-aligned Thread utility toggles a persistent large capsule at the conversation body's top-right corner. It shows the current Thread identity, every connected Session, click-to-navigate rows, and explicit Handoff artifacts projected for the current Session. The capsule uses the shipped Settings surface tokens and closes only when the user clicks the Thread utility again; it never occupies or controls the shipped Tool `details` column. The utility and the capsule are gated on a started Session: a blank (empty-log) Session renders neither, so a fresh chat never sees an empty Thread surface.

Inside the capsule, the Session list shows at most 8 rows per page and the current Session's artifact list at most 5 cards per page; both overflow into a compact `‹ page / pages ›` pager. The Session pager auto-follows navigation so the current row stays on the visible page; the artifact pager restarts at page one whenever the viewed Session changes. A Session that belongs to no Thread gets a centered empty state (icon, title, one-line guidance) instead of a bare corner paragraph.

**Sidebar grouping**: while the switch is on, the plugin registers a `Thread 分组` entry into the fork's `sidebar.workspaces.sessionListView` view ring. The sidebar's view-options menu then offers it beside Workspace/Flat; the view groups Sessions by connected Thread (root Session title as the group heading, stage-ordered rows, latest-activity group order) and lists ungrouped Sessions flat by recency below. The ring requires the fork's `ui-workspace` seam; on a runtime without it the view simply never appears.

Artifacts are bounded references explicitly reported by the Agent (`file`, `directory`, `url`, `note`, or `other`). The plugin does not infer artifacts from arbitrary Tool or filesystem activity, and legacy Drafts/Links load with an empty artifact list.

## Development

```sh
pnpm install
pnpm run typecheck
pnpm run test
pnpm run build
```
