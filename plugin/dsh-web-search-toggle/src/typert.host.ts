/**
 * Host-side strict Typert contribution for the webSearchToggle namespace.
 *
 * The assembled desktop runtime resolves this plugin's @deepseek-ai deps to
 * its own packed copies, so the Gateway's SRC fallback cannot see the
 * @Remote markers this package's typert-protocol instance records (markers
 * live in a module-private WeakMap; string-keyed services and the
 * typertRemote binding stay cross-instance visible, which is why the row
 * mounts but the endpoints 404). Registering the same strict descriptors the
 * browser half mounts puts the endpoints on the registry's local store
 * directly — claims and dispatch both take the strict path, no marker
 * discovery involved.
 *
 * The descriptors are shared with ./typert.remote-client.ts: one source of
 * truth for wire shape on both faces. The registry validates codecs by shape
 * (a parse() function), not by zod instance identity, so schemas built by
 * the zod copy bundled here validate fine against the runtime registry.
 *
 * @module dsh-web-search-toggle/typert.host
 */
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types'
import { TYPERT_REMOTE } from './typert.remote-client.ts'

const EMPTY_MODEL = {
  services: [],
  events: [],
  objects: [],
} as const

/** Host contribution mirroring the client descriptors for gateway dispatch. */
export const TYPERT_HOST: TypertContribution = {
  package: 'dsh-web-search-toggle',
  face: 'host',
  schemas: [],
  model: EMPTY_MODEL,
  invocations: TYPERT_REMOTE.descriptors,
}

export default TYPERT_HOST
