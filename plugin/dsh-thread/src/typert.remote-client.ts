import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type {
  ActivateResult,
  AuthorizeRequest,
  AuthorizeResult,
  BeginCreationRequest,
  LinkRequest,
  MutationResult,
  PresetListResult,
  RecordTitleRequest,
  StateResult,
} from './thread-types.ts'
import {
  activateResultSchema,
  authorizeRequestSchema,
  authorizeResultSchema,
  beginCreationRequestSchema,
  linkRequestSchema,
  mutationResultSchema,
  presetListResultSchema,
  recordTitleRequestSchema,
  stateResultSchema,
} from './thread-types.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespace$746872656164 {
    presets: () => Promise<RemoteResult<PresetListResult>>
    authorize: (request: AuthorizeRequest) => Promise<RemoteResult<AuthorizeResult>>
    beginCreation: (request: BeginCreationRequest) => Promise<RemoteResult<MutationResult>>
    recordTitle: (request: RecordTitleRequest) => Promise<RemoteResult<MutationResult>>
    activate: (request: LinkRequest) => Promise<RemoteResult<ActivateResult>>
    state: () => Promise<RemoteResult<StateResult>>
  }
  interface TypertRemoteMap {
    'thread/presets': () => Promise<RemoteResult<PresetListResult>>
    'thread/authorize': (request: AuthorizeRequest) => Promise<RemoteResult<AuthorizeResult>>
    'thread/beginCreation': (request: BeginCreationRequest) => Promise<RemoteResult<MutationResult>>
    'thread/recordTitle': (request: RecordTitleRequest) => Promise<RemoteResult<MutationResult>>
    'thread/activate': (request: LinkRequest) => Promise<RemoteResult<ActivateResult>>
    'thread/state': () => Promise<RemoteResult<StateResult>>
  }
  interface TypertRemoteNamespaceMap {
    thread: TypertRemoteNamespace$746872656164
  }
}

const direct = { kind: 'direct' } as const
const noParameters: [] = []

function parameter(name: string, schema: { parse(value: unknown): unknown }, typeSymbol: string) {
  return [{
    name,
    wire: name,
    source: 'json' as const,
    codec: { mode: 'strict' as const, typeSymbol, schema },
  }]
}

export const TYPERT_REMOTE: TypertRemoteContribution = {
  package: 'dsh-thread',
  descriptors: [
    {
      id: 'dsh-thread#thread/presets', service: 'thread', namespace: 'thread', method: 'presets',
      invocation: direct, parameters: noParameters,
      result: { mode: 'strict', typeSymbol: 'dsh-thread/thread-types#PresetListResult', schema: presetListResultSchema },
      sourceLocation: { file: 'src/gateway.ts', line: 63, column: 3 },
    },
    {
      id: 'dsh-thread#thread/authorize', service: 'thread', namespace: 'thread', method: 'authorize',
      invocation: direct,
      parameters: parameter('request', authorizeRequestSchema, 'dsh-thread/thread-types#AuthorizeRequest'),
      result: { mode: 'strict', typeSymbol: 'dsh-thread/thread-types#AuthorizeResult', schema: authorizeResultSchema },
      sourceLocation: { file: 'src/gateway.ts', line: 79, column: 3 },
    },
    {
      id: 'dsh-thread#thread/beginCreation', service: 'thread', namespace: 'thread', method: 'beginCreation',
      invocation: direct,
      parameters: parameter('request', beginCreationRequestSchema, 'dsh-thread/thread-types#BeginCreationRequest'),
      result: { mode: 'strict', typeSymbol: 'dsh-thread/thread-types#MutationResult', schema: mutationResultSchema },
      sourceLocation: { file: 'src/gateway.ts', line: 121, column: 3 },
    },
    {
      id: 'dsh-thread#thread/recordTitle', service: 'thread', namespace: 'thread', method: 'recordTitle',
      invocation: direct,
      parameters: parameter('request', recordTitleRequestSchema, 'dsh-thread/thread-types#RecordTitleRequest'),
      result: { mode: 'strict', typeSymbol: 'dsh-thread/thread-types#MutationResult', schema: mutationResultSchema },
      sourceLocation: { file: 'src/gateway.ts', line: 137, column: 3 },
    },
    {
      id: 'dsh-thread#thread/activate', service: 'thread', namespace: 'thread', method: 'activate',
      invocation: direct,
      parameters: parameter('request', linkRequestSchema, 'dsh-thread/thread-types#LinkRequest'),
      result: { mode: 'strict', typeSymbol: 'dsh-thread/thread-types#ActivateResult', schema: activateResultSchema },
      sourceLocation: { file: 'src/gateway.ts', line: 157, column: 3 },
    },
    {
      id: 'dsh-thread#thread/state', service: 'thread', namespace: 'thread', method: 'state',
      invocation: direct, parameters: noParameters,
      result: { mode: 'strict', typeSymbol: 'dsh-thread/thread-types#StateResult', schema: stateResultSchema },
      sourceLocation: { file: 'src/gateway.ts', line: 230, column: 3 },
    },
  ],
}

export default TYPERT_REMOTE
