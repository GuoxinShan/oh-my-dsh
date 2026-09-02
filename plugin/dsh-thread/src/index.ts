import type { Context } from '@deepseek-ai/cordis'
import TYPERT_HOST from './typert.host.ts'

export const name = 'dsh-thread'
export const inject = ['typert']

interface TypertRegister {
  register(contribution: typeof TYPERT_HOST): () => void | Promise<void>
}

/** Register strict descriptors so packaged runtimes never depend on decorator identity. */
export function apply(ctx: Context): (() => void | Promise<void>) {
  const typert = ctx.get('typert') as TypertRegister | undefined
  if (typert === undefined) throw new Error('dsh-thread: typert registry service is not mounted')
  return typert.register(TYPERT_HOST)
}
