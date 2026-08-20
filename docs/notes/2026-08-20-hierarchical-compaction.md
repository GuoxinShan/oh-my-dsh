# Hierarchical compaction for context downgrades

## Decision

`dsh-compaction-hierarchical` is an out-of-tree host-only Provider for the existing `ctx.compaction` capability. It subclasses `BasicCompactionEngine` and overrides only its protected `summarize()` hook. Selection, retention, tool-result pruning, durable compaction brackets, stability checks, surface replacement, convergence checks, manual `/compact`, and context-overflow retry remain owned by the stock Provider implementation.

The summarizer delegates fitting inputs to `super.summarize()` unchanged. If the Provider still classifies that attempt as `CONTEXT_WINDOW_EXCEEDED`, the same uncommitted transaction falls back to bounded mapping; other failures propagate unchanged. Oversized inputs use sequential map calls over tool-balanced message chunks, followed when needed by bounded recursive reduction of structured partial checkpoints. The summary model's declared context window and `chunkInputRatio` set the complete input budget. The inherited one-shot output cap participates in the delegation decision; if it cannot fit, the hierarchy runs directly. Map/reduce output caps must fit outside the hierarchy input budget.

The package installs through an empty Profile bundle and activates only inside a copied user preset's isolated `compaction` group. Agent presets own the compaction service in rc.8. Publishing the replacement at the Profile root would create the wrong service realm and would not replace preset-owned instances.

## Rationale

A conversation accumulated under a 1M-context model can exceed a replacement model's 200K window. Stock one-shot compaction cannot recover when the old model has no quota and the new model cannot read the selected region. Map-reduce lets the new model read bounded chronological partitions and consolidate them without changing the durable replacement protocol or its consumers.

Reimplementing `CompactionEngine` would duplicate transaction and replay invariants that already have a supported subclass hook. Keeping the algorithm in an out-of-tree plugin also allows budget and prompt iteration independently from the desktop shell and model adapters.

## Provenance and failure semantics

A multi-call operation does not set `SummaryResult.llmStreamCall: true`, because that marker asserts exactly one call through `ctx.llm.stream()`. A hierarchy that needs one successful map call and no prior failed attempt does set the marker honestly. The result stores the final stage output and aggregates disjoint usage only when every call in the successful path reports it; incomplete usage or a prior failed one-shot attempt omits the aggregate rather than representing a partial total. Intermediate calls remain private compaction traffic and are not separately resumable in this version.

Every stage requires all fixed checkpoint headings and rejects max-token truncation, empty text, image output, a non-combining reduction, and recursion exhaustion. Throwing from the hook leaves commit ownership with `BasicCompactionEngine`; no final surface replacement lands from a failed hierarchy.

## Module identity

Harness APIs and schemastery remain peer dependencies and tsdown externals. Externalization prevents embedded copies, but it does not prove physical module identity: pnpm may materialize peer copies beside an installed plugin, especially for a local-path install whose source tree has registry devDependencies. The rc.8 integration uses string-keyed Cordis services and plain LLM/session values, and scratch Profile mounting verifies that topology; local source debugging should use the repository `link:source` posture so plugin and checkout imports share real paths. A baseline or fork change in these packages requires repeating the installed-Profile mount and behavioral tests.

## Release packaging

Plugin build outputs remain ignored in the source tree. The release workflow now starts from the immutable tagged plugin subtree and overlays the `lib/` directory produced by that job's build before creating the attachment. This retains tag provenance while preventing source-only archives whose `package.json` points at a missing `lib/index.js`; a declared build that produces no `lib/` fails the release.

## Verification

Focused tests cover tool-balanced chunk planning, greedy budgets, oversized indivisible units, structured summary validation, hierarchy config validation, and aggregate usage. Package verification runs typecheck, node:test, tsdown build, and repository diff checks. A live preset mount remains the acceptance test for the installed runtime plane.
