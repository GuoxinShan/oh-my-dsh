/**
 * Pure model-catalog drafting for the image-input section: reading the routes
 * whose user layer owns a `models` array, mapping one row's declared request
 * modalities to and from a tri-state picker value, and folding picker edits
 * into minimal whole-array settings ops. No DOM, no framework, no I/O — every
 * function is total over its input shape and unit-tested in isolation.
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

/** One provider route whose user layer owns a model catalog. */
export interface OwnedRoute {
  /** Route key (`providers.<route>` in settings). */
  route: string
  /** Stored display name, falling back to the route key. */
  displayName: string
  /** The user-owned rows, records only. */
  models: ModelEntry[]
}

/** A path op carrying one route's drafted models array. */
export interface ModelPathOp {
  op: 'set'
  path: string[]
  value: ModelEntry[]
}

/** True when the value is a plain record (a row this editor can render). */
function isRecord(value: unknown): value is ModelEntry {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A stored display name: a non-empty string after trimming paste artifacts. */
function displayNameOf(profile: Record<string, unknown>, route: string): string {
  const value = profile['displayName']
  return typeof value === 'string' && value.trim().length > 0 ? value : route
}

/**
 * Extract the routes whose USER layer owns a `models` array — exactly the
 * catalogs this page may edit. Catalog-served routes (no user array) are not
 * listed: their rows belong to the installed catalog, not to settings.
 * @param user - the namespace snapshot's raw user layer.
 * @returns routes in stored order.
 */
export function ownedRoutes(user: unknown): OwnedRoute[] {
  if (!isRecord(user)) return []
  const providers = user['providers']
  if (!isRecord(providers)) return []
  const routes: OwnedRoute[] = []
  for (const [route, value] of Object.entries(providers)) {
    if (!isRecord(value)) continue
    const models = value['models']
    if (!Array.isArray(models)) continue
    routes.push({
      route,
      displayName: displayNameOf(value, route),
      models: models.filter(isRecord),
    })
  }
  return routes
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
 * What a row reads as in the UI: the stored display name, else the id, else a
 * positional label for the not-yet-named row.
 * @param model - one stored row.
 * @param index - zero-based position, used only when neither field names it.
 * @returns the label text.
 */
export function rowLabel(model: ModelEntry, index: number): string {
  for (const key of ['name', 'id'] as const) {
    const value = model[key]
    if (typeof value === 'string' && value.trim().length > 0) return value
  }
  return `#${String(index + 1)}`
}

/**
 * Fold every recorded picker edit onto the CURRENT stored arrays, producing
 * one whole-array op per changed route. Reads ride the live snapshot rather
 * than a stale copy, so an externally refreshed catalog is respected; an
 * override equal to what is already stored produces no change.
 * @param routes - the owned routes as the snapshot holds them now.
 * @param overrides - per route, the picked choice per row index (absent or
 *   undefined entries are untouched).
 * @returns ops in route order; empty when nothing would change.
 */
export function collectOps(
  routes: readonly OwnedRoute[],
  overrides: ReadonlyMap<string, readonly (InputChoice | undefined)[]>,
): ModelPathOp[] {
  const ops: ModelPathOp[] = []
  for (const route of routes) {
    const draft = overrides.get(route.route)
    if (draft === undefined) continue
    let changed = false
    const models = route.models.map((model, index) => {
      const choice = draft[index]
      if (choice === undefined || choice === choiceOf(model)) return model
      changed = true
      return withChoice(model, choice)
    })
    if (changed) ops.push({ op: 'set', path: ['providers', route.route, 'models'], value: models })
  }
  return ops
}
