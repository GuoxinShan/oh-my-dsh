/**
 * Pure drafting logic for the settings-card row injection: mapping one stored
 * model entry's declared request modalities to and from a tri-state picker
 * value, fingerprinting the user layer's catalogs, disambiguating which
 * provider route an on-screen card edits, and building the whole-array write
 * op. No DOM, no framework, no I/O — every function is total over its input
 * shape and unit-tested in isolation.
 *
 * @module dsh-model-image-input/drafts
 */

/** One pi-ai model entry as stored in a profile's `models` array (structurally open). */
export type ModelEntry = Record<string, unknown>

/**
 * The three states the per-row picker offers. `inherit` leaves the entry
 * untouched — for a hand-declared route that means the route's text-only
 * default; `text` forces text-only (correcting a catalog claim); `text,image`
 * declares image input.
 */
export type InputChoice = 'inherit' | 'text' | 'text,image'

/** Every picker choice, in display order. */
export const INPUT_CHOICES: readonly InputChoice[] = ['inherit', 'text', 'text,image']

/** The `llm-pi-ai` section as the user layer stores it. */
export interface PiAiUserSection {
  providers?: Record<string, unknown>
}

/** A path op carrying one route's drafted models array. */
export interface ModelPathOp {
  op: 'set'
  path: string[]
  value: ModelEntry[]
}

/**
 * Anchor for one stock model row's id input: the ui-settings-models
 * dictionaries label them `Model ID <n>` / `模型 ID <n>`. Mirrored copy —
 * the stock package owns the source; a harness copy change must update this.
 */
export const MODEL_ID_ARIA = /^(?:模型 ID|Model ID) \d+$/

/**
 * The action only the pi-ai model list carries (the DeepSeek catalog editor
 * has none), which is what tells an injectable card from a DeepSeek card —
 * the DeepSeek schema has no `input` field, so injecting there would break
 * that card's saves. Mirrored copy of the stock dictionaries' button labels.
 */
export const FETCH_MODELS_LABELS: readonly string[] = ['获取可用模型', 'Fetch available models']

/** True when the value is a plain record (a row this plugin can read). */
export function isRecord(value: unknown): value is ModelEntry {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read one row's declared modalities as a picker value. Absent, malformed, or
 * empty declarations read as `inherit`; an image anywhere in the list wins,
 * then a bare text declaration, then anything unrecognized.
 * @param model - one stored row.
 * @returns the choice the picker shows.
 */
export function choiceOf(model: ModelEntry): InputChoice {
  const value = model['input']
  if (!Array.isArray(value)) return 'inherit'
  const declared = new Set(value.filter((entry): entry is string => typeof entry === 'string'))
  if (declared.has('image')) return 'text,image'
  if (declared.has('text')) return 'text'
  return 'inherit'
}

/**
 * Apply one picker choice to a COPY of the row: `inherit` removes the
 * declaration so the entry re-inherits, anything else stores its modality
 * list verbatim.
 * @param model - the stored row.
 * @param choice - the picked state.
 * @returns the next row; the input is never mutated.
 */
export function withChoice(model: ModelEntry, choice: InputChoice): ModelEntry {
  const next = { ...model }
  if (choice === 'inherit') delete next['input']
  else next['input'] = choice.split(',')
  return next
}

/**
 * Fingerprint the user layer: the routes whose `models` array the user owns,
 * rows kept as records only. The PRESENCE of the array (not its values) is
 * what marks a catalog editable here — catalog-served routes belong to the
 * installed catalog, not to settings.
 * @param user - the namespace snapshot's raw user layer.
 * @returns route → its stored rows, in stored order.
 */
export function fingerprints(user: unknown): ReadonlyMap<string, readonly ModelEntry[]> {
  const prints = new Map<string, readonly ModelEntry[]>()
  if (!isRecord(user)) return prints
  const providers = user['providers']
  if (!isRecord(providers)) return prints
  for (const [route, profile] of Object.entries(providers)) {
    if (!isRecord(profile)) continue
    const models = profile['models']
    if (!Array.isArray(models)) continue
    prints.set(route, models.filter(isRecord))
  }
  return prints
}

/**
 * Decide which stored route an on-screen card edits: the card's row ids (its
 * unsaved draft included) must equal some route's stored id sequence. An
 * exact unique match names the route; zero matches (a draft the user has
 * already reshaped, or a preset-catalog card) or an ambiguous one (two routes
 * shipping identical sequences) both read as "not editable from this card".
 * @param ids - the card's row ids as shown, in row order.
 * @param prints - the stored catalogs.
 * @returns the matched route key, or undefined.
 */
export function matchRoute(
  ids: readonly string[],
  prints: ReadonlyMap<string, readonly ModelEntry[]>,
): string | undefined {
  const wanted = ids.filter(id => id.length > 0)
  let hit: string | undefined
  for (const [route, models] of prints) {
    const stored = models
      .map(model => (typeof model['id'] === 'string' ? model['id'] as string : ''))
      .filter(id => id.length > 0)
    if (stored.length !== wanted.length) continue
    let same = true
    for (let at = 0; at < stored.length; at++) {
      if (stored[at] !== wanted[at]) {
        same = false
        break
      }
    }
    if (!same) continue
    if (hit !== undefined) return undefined
    hit = route
  }
  return hit
}

/**
 * The stored row one on-screen row addresses, if any.
 * @param route - the matched route key.
 * @param modelId - the row's id as shown.
 * @param prints - the stored catalogs.
 * @returns the stored entry, or undefined when either half is missing.
 */
export function entryOf(
  route: string | undefined,
  modelId: string,
  prints: ReadonlyMap<string, readonly ModelEntry[]>,
): ModelEntry | undefined {
  if (route === undefined || modelId.length === 0) return undefined
  const models = prints.get(route)
  if (models === undefined) return undefined
  return models.find(model => model['id'] === modelId)
}

/**
 * Build the whole-array op carrying one picker choice onto a STORED row —
 * the same write shape the stock Models editor produces. A no-op choice (the
 * row already declares it) and an absent row (unsaved draft, catalog-served
 * route, or unknown provider) both produce no op.
 * @param user - the namespace snapshot's raw user layer.
 * @param provider - the matched route key.
 * @param modelId - the row's model id.
 * @param choice - the picked state.
 * @returns the op, or undefined when nothing should be written.
 */
export function modelOpFor(
  user: unknown,
  provider: string,
  modelId: string,
  choice: InputChoice,
): ModelPathOp | undefined {
  if (!isRecord(user)) return undefined
  const providers = user['providers']
  if (!isRecord(providers)) return undefined
  const profile = providers[provider]
  if (!isRecord(profile)) return undefined
  const models = profile['models']
  if (!Array.isArray(models)) return undefined
  let changed = false
  const next = models.map(model => {
    if (!isRecord(model) || model['id'] !== modelId) return model
    if (choiceOf(model) === choice) return model
    changed = true
    return withChoice(model, choice)
  })
  return changed ? { op: 'set', path: ['providers', provider, 'models'], value: next } : undefined
}
