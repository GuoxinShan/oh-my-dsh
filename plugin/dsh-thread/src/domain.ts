import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { threadDraftRecordSchema, threadLinkSchema } from './thread-types.ts'

/** Durable Thread sidecar state; Session logs remain the source of message truth. */
export const threadDomainSpec = defineDomain({
  name: 'dsh_thread',
  version: 1,
  tables: {
    drafts: domainTable<string, import('./thread-types.ts').ThreadDraftRecord>(threadDraftRecordSchema),
    links: domainTable<string, import('./thread-types.ts').ThreadLink>(threadLinkSchema),
  },
})
