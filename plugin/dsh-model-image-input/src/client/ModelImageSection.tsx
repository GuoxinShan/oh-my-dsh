/** The image-input settings section: per-model modality declarations for custom pi-ai routes. */

import { useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import {
  choiceOf, collectOps, INPUT_CHOICES, ownedRoutes, rowLabel,
} from './drafts.ts'
import type {
  InputChoice, ModelPathOp, PiAiUserSection,
} from './drafts.ts'
import type { ModelImageLocaleKey } from './locales.ts'
import { css } from './styles.ts'

/** Section-local translate signature matching the framework `Translate`. */
export type TranslateSection = (key: ModelImageLocaleKey) => string

/** Registration-side face used by the section. */
export interface ModelImageSectionInjected {
  /** Settings transport for the `llm-pi-ai` namespace (reads and revision fencing). */
  scope: SettingsScope<PiAiUserSection>
  /** Write one batch of model-catalog ops through the settings API. */
  mutate: (ops: readonly ModelPathOp[], expectedRevision: number | undefined) => Promise<void>
  /** Translate this section's copy. */
  t: TranslateSection
}

/** Full component props assembled by the Settings slot renderer. */
export type ModelImageSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.modelImage'>
  & InjectFace<ModelImageSectionInjected>

/** Picker choice → copy key. */
const CHOICE_LABEL: Record<InputChoice, ModelImageLocaleKey> = {
  'inherit': 'optionInherit',
  'text': 'optionText',
  'text,image': 'optionImage',
}

/** Extract a readable message from a thrown failure. */
function messageOf(cause: unknown): string {
  if (cause instanceof Error && cause.message.length > 0) return cause.message
  return String(cause)
}

/**
 * Render the image-input page: every route whose user layer owns a model
 * catalog lists its rows with a tri-state picker; edits are held as sparse
 * per-row overrides and land as one batched write on save.
 * @param props - the injected scope/mutate face plus localized copy.
 * @returns the section.
 */
export function ModelImageSection({ scope, mutate, t }: ModelImageSectionProps): ReactNode {
  const snapshot = useSyncExternalStore(scope.subscribe.bind(scope), scope.getSnapshot.bind(scope))
  const routes = useMemo(() => ownedRoutes(snapshot.user), [snapshot.user])
  // Edits are sparse overrides keyed by route then row index; the stored
  // arrays stay the single source of truth, so an external settings refresh
  // is reflected immediately and a save folds the overrides onto what is
  // CURRENTLY stored rather than onto a stale copy.
  const [overrides, setOverrides] = useState<ReadonlyMap<string, readonly (InputChoice | undefined)[]>>(new Map())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [savedOnce, setSavedOnce] = useState(false)

  const ops = useMemo(() => collectOps(routes, overrides), [routes, overrides])

  const setChoice = (route: string, index: number, choice: InputChoice): void => {
    setError(undefined)
    setOverrides(current => {
      const draft = [...(current.get(route) ?? [])]
      draft[index] = choice
      return new Map(current).set(route, draft)
    })
  }

  const save = (): void => {
    if (busy || ops.length === 0) return
    setBusy(true)
    setError(undefined)
    void mutate(ops, snapshot.revision)
      .then(() => {
        setOverrides(new Map())
        setSavedOnce(true)
      })
      .catch((cause: unknown) => {
        setError(messageOf(cause))
        setSavedOnce(false)
      })
      .finally(() => { setBusy(false) })
  }

  const ready = snapshot.status === 'ready'
  return (
    <div className={css.section}>
      <h2 className={css.heading}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>
      {!ready
        ? <p className={css.empty}>{t(snapshot.status === 'loading' ? 'loading' : 'unavailable')}</p>
        : null}
      {ready && routes.length === 0 ? <p className={css.empty}>{t('empty')}</p> : null}
      {routes.map(route => (
        <section key={route.route} className={css.route}>
          <h3 className={css.routeHead}>
            <span className={css.routeName}>{route.displayName}</span>
            {route.displayName !== route.route
              ? <span className={css.routeId}>{route.route}</span>
              : null}
          </h3>
          <ul className={css.rows}>
            {route.models.map((model, index) => (
              <li key={index} className={css.row}>
                <span className={css.rowLabel}>{rowLabel(model, index)}</span>
                <select
                  className={css.select}
                  value={overrides.get(route.route)?.[index] ?? choiceOf(model)}
                  aria-label={`${t('inputLabel')} · ${rowLabel(model, index)}`}
                  disabled={busy || !snapshot.writable}
                  onChange={(event) => { setChoice(route.route, index, event.target.value as InputChoice) }}
                >
                  {INPUT_CHOICES.map(choice => (
                    <option key={choice} value={choice}>{t(CHOICE_LABEL[choice])}</option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className={css.footer}>
        <p className={css.hint}>{t('hint')}</p>
        {ready && routes.length > 0
          ? (
            <div className={css.actions}>
              <button
                type="button"
                className={css.save}
                disabled={busy || !snapshot.writable || ops.length === 0}
                onClick={save}
              >
                {busy ? t('saving') : t('save')}
              </button>
              {!snapshot.writable ? <span className={css.error}>{t('readOnly')}</span> : null}
              {error !== undefined
                ? <span className={css.error}>{`${t('saveFailed')} ${error}`}</span>
                : null}
              {error === undefined && savedOnce && ops.length === 0
                ? <span className={css.saved}>{t('saved')}</span>
                : null}
            </div>
          )
          : null}
      </div>
    </div>
  )
}
