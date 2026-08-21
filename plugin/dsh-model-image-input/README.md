# dsh-model-image-input

A Web Settings section that declares, per model, whether a custom provider's
models accept **image input** — without hand-editing `settings.yaml` and
without patching the harness. The pi-ai adapter already honors
`providers.<route>.models[].input` modality declarations (and the API proxy
refuses image attachments for models without `image` in them); this plugin
supplies the editing surface the stock Models page lacks.

## Install

```sh
dsh plugin --profile web add <repo>/plugin/dsh-model-image-input
```

The bundle patch mounts the `dsh-model-image-input` row for every profile that installs
this plugin. Requires the stock Web profile peers (slots / locale /
connection / ui-settings' settings scope) — any normal `dsh web` deployment
provides them.

## Behavior

- Adds an **Image input** page to the Web Settings panel (bilingual, follows
  the UI language).
- Lists exactly the pi-ai routes whose user layer owns a `models` array — the
  catalogs you configured yourself (custom providers, i.e. "providers the
  system has no preset for"). Catalog-served preset routes are not listed;
  their rows belong to the installed catalog.
- Each row offers a tri-state picker:
  - **Provider default** — no declaration stored; a custom route's default is
    text-only.
  - **Text only** — stores `input: ['text']`; also corrects an inherited
    image claim your endpoint refuses.
  - **Text and images** — stores `input: ['text', 'image']`.
- **Save changes** writes one whole-array op per changed route through
  `settings.mutate` on the `llm-pi-ai` namespace (revision-fenced), so edits
  take effect immediately — no restart.
- Edits are held as sparse per-row overrides against the live settings
  snapshot; external changes are respected, and an override equal to what is
  already stored produces no write.

## Client half

`lib/client.js` is the ModuleLoader closure artifact (window.__ModuleLoader__
.load) with platform modules externalized — the build contract lives in this
package's `tsdown.config.ts`; keep `CLIENT_EXTERNALS` in sync with the
harness `PLATFORM_MODULES` baseline when it moves.

## Design notes

- Decision record: `docs/notes/2026-08-21-dsh-model-image-input.md` (repo root).
- Contracts live in the repo root `AGENTS.md` (plugin monorepo rules, npm
  dependency discipline, client bundle build contract).
- The section reads the raw **user layer** of the namespace (a route's
  `models` presence there is what marks the catalog user-owned) and writes
  the same whole-array path ops the stock Models editor produces — it never
  patches harness behavior, only edits settings through `ctx` services.
