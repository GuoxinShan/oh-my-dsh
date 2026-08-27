/**
 * Pure drafting logic for the settings-card effort editor: reading one stored
 * model entry's reasoning declaration into an editable state, turning editor
 * drafts back into entries, fingerprinting the user layer's catalogs,
 * disambiguating which provider route an on-screen card edits, and building
 * the whole-array write op. No DOM, no framework, no I/O — every function is
 * total over its input shape and unit-tested in isolation.
 *
 * The route anchoring mirrors dsh-model-image-input's proven posture (cards
 * are matched to routes by their exact stored id sequence); the declaration
 * model follows llm-pi-ai's own resolution rules: an absent
 * `reasoningEfforts` inherits, `false` pins non-reasoning, a dict maps every
 * offered thinking level to the wire value dispatch sends (`off` may map to
 * null = send nothing).
 *
 * @module dsh-model-efforts-editor/drafts
 */

/** Every pi-ai thinking level, mirroring llm-pi-ai's THINKING_LEVELS order. */
export const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

/** One pi-ai thinking level. */
export type Level = (typeof LEVELS)[number]

/** One pi-ai model entry as stored in a profile's `models` array (structurally open). */
export type ModelEntry = Record<string, unknown>

/**
 * The declaration one entry carries: absent (inherit), pinned non-reasoning,
 * or a partial level -> wire map where `off` alone may be null/undefined
 * (= supported, send nothing).
 */
export type LevelsMap = Partial<Record<Level, string | null>>

/** How the editor renders one entry's efforts piece. */
export type EffortsState =
  | { kind: 'undeclared' }
  | { kind: 'false' }
  | { kind: 'levels'; levels: LevelsMap }

/** What the editor writes back: one of the three shapes above plus the optional Z.ai compat pair. */
export interface EditorPlan {
  readonly efforts: EffortsState
  /** Whether entry.compat should carry the zai dispatch switches. */
  readonly compatZai: boolean
}

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
 * has none), which is what tells an injectable card from a DeepSeek card.
 * Mirrored copy of the stock dictionaries' button labels.
 */
export const FETCH_MODELS_LABELS: readonly string[] = ['获取可用模型', 'Fetch available models']

/** True when the value is a plain record (a row this plugin can read). */
export function isRecord(value: unknown): value is ModelEntry {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read one entry's declared efforts into the editor's state shape. */
export function effortsOf(entry: ModelEntry): EffortsState {
  const value = entry['reasoningEfforts']
  if (value === false) return { kind: 'false' }
  if (!isRecord(value)) return { kind: 'undeclared' }
  const levels: LevelsMap = {}
  let any = false
  for (const level of LEVELS) {
    if (!(level in value)) continue
    const wire = (value as Record<string, unknown>)[level]
    if (wire === undefined) continue
    levels[level] = typeof wire === 'string' && wire.length > 0 ? wire : null
    any = true
  }
  return any ? { kind: 'levels', levels } : { kind: 'undeclared' }
}

/** Whether one entry declares the zai dispatch compat pair. */
export function compatZaiOf(entry: ModelEntry): boolean {
  const compat = entry['compat']
  if (!isRecord(compat)) return false
  return compat['supportsReasoningEffort'] === true && compat['thinkingFormat'] === 'zai'
}

/**
 * Read one row's full editor state.
 * @param entry - one stored row.
 * @returns the current plan equivalent.
 */
export function planOf(entry: ModelEntry): EditorPlan {
  return { efforts: effortsOf(entry), compatZai: compatZaiOf(entry) }
}

/**
 * Apply an editor plan to a COPY of the row. Never touches sibling fields;
 * removing the zai compat drops only those two keys and the `compat` key
 * itself when nothing else remains; `undeclared` removes only the
 * `reasoningEfforts` key (sibling catalog inheritance stays intact).
 * @param entry - the stored row.
 * @param plan - the drafted state.
 * @returns the next row; the input is never mutated.
 */
export function withPlan(entry: ModelEntry, plan: EditorPlan): ModelEntry {
  const next: ModelEntry = { ...entry }
  // The efforts piece replaces whatever the key carried — the editor's whole
  // job is setting THIS key, and partial surgery against a live draft would
  // surprise more than help.
  switch (plan.efforts.kind) {
    case 'undeclared':
      delete next['reasoningEfforts']
      break
    case 'false':
      next['reasoningEfforts'] = false
      break
    case 'levels': {
      const dict: Record<string, string | null> = {}
      for (const [level, wire] of Object.entries(plan.efforts.levels)) dict[level] = wire
      next['reasoningEfforts'] = dict
      break
    }
  }
  // The compat piece: add the pair, or strip exactly those keys when off.
  const source = isRecord(next['compat']) ? (next['compat'] as ModelEntry) : undefined
  if (plan.compatZai) {
    next['compat'] = {
      ...(source ?? {}),
      supportsReasoningEffort: true,
      thinkingFormat: 'zai',
    }
  } else if (source !== undefined
    && ('supportsReasoningEffort' in source || 'thinkingFormat' in source)) {
    const rest: ModelEntry = { ...source }
    delete rest['supportsReasoningEffort']
    delete rest['thinkingFormat']
    if (Object.keys(rest).length === 0) delete next['compat']
    else next['compat'] = rest
  }
  return next
}

/** Short human summary of one plan's efforts piece for tooltips and headers. */
export function describeEfforts(state: EffortsState): number | false | null {
  if (state.kind === 'false') return false
  if (state.kind === 'undeclared') return null
  return Object.keys(state.levels).length
}

/**
 * Fingerprint the user layer: the routes whose `models` array the user owns,
 * rows kept as records only. The PRESENCE of the array (not its values) is
 * what marks a catalog editable here — catalog-served routes belong to the
 * installed catalog, not to settings. Same contract as
 * dsh-model-image-input; duplicated because cross-plugin imports are banned.
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
 * exact unique match names the route; zero matches or an ambiguous one read
 * as "not editable from this card".
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
 * Build the whole-array op carrying one editor plan onto a STORED row — the
 * same write shape the stock Models editor produces. A no-op plan (the row
 * already carries the state) and an absent row (unsaved draft,
 * catalog-served route, or unknown provider) produce no op.
 * @param user - the namespace snapshot's raw user layer.
 * @param provider - the matched route key.
 * @param modelId - the row's model id.
 * @param plan - the drafted state to persist.
 * @returns the op, or undefined when nothing should be written.
 */
export function modelOpFor(
  user: unknown,
  provider: string,
  modelId: string,
  plan: EditorPlan,
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
    if (JSON.stringify(planOf(model)) === JSON.stringify(plan)) return model
    changed = true
    return withPlan(model, plan)
  })
  return changed ? { op: 'set', path: ['providers', provider, 'models'], value: next } : undefined
}
