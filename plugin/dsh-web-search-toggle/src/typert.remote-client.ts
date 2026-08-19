/**
 * Generated-equivalent Typert Client contribution owned by
 * dsh-web-search-toggle (mcp-settings' remote-client pattern).
 */
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type { WebSearchToggleSnapshot } from './toggle-types.ts'

const snapshotSchema = z.object({
  enabled: z.boolean(),
  keyConfigured: z.boolean(),
  keyRef: z.string(),
})

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespace$776562536561726368546f67676c65 {
    get: () => Promise<RemoteResult<WebSearchToggleSnapshot>>
    set: (params: { enabled: boolean }) => Promise<RemoteResult<WebSearchToggleSnapshot>>
  }
  interface TypertRemoteMap {
    'webSearchToggle/get': () => Promise<RemoteResult<WebSearchToggleSnapshot>>
    'webSearchToggle/set': (params: { enabled: boolean }) => Promise<RemoteResult<WebSearchToggleSnapshot>>
  }
  interface TypertRemoteNamespaceMap {
    webSearchToggle: TypertRemoteNamespace$776562536561726368546f67676c65
  }
}

/** Browser Remote descriptor for the webSearchToggle namespace. */
export const TYPERT_REMOTE: TypertRemoteContribution = {
  package: 'dsh-web-search-toggle',
  descriptors: [
    {
      id: 'dsh-web-search-toggle#webSearchToggle/get',
      service: 'webSearchToggle',
      namespace: 'webSearchToggle',
      method: 'get',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-web-search-toggle/toggle-types#WebSearchToggleSnapshot',
        schema: snapshotSchema,
      },
      sourceLocation: { file: 'src/gateway.ts', line: 64, column: 3 },
    },
    {
      id: 'dsh-web-search-toggle#webSearchToggle/set',
      service: 'webSearchToggle',
      namespace: 'webSearchToggle',
      method: 'set',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-web-search-toggle/toggle-types#WebSearchToggleSnapshot',
        schema: snapshotSchema,
      },
      sourceLocation: { file: 'src/gateway.ts', line: 77, column: 3 },
    },
  ],
}

export default TYPERT_REMOTE
