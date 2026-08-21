// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { BrandWordmark } from '../src/client/wordmark.tsx'
import { installTitleRebrand } from '../src/client/title.ts'

afterEach(() => { cleanup() })

test('the wordmark names the product with an edition pill', () => {
  render(<BrandWordmark />)
  expect(screen.getByText('Oh My DSH')).toBeTruthy()
  expect(screen.getByText('Harness')).toBeTruthy()
})

test('the edition pill rides the inverted label tokens, not literal colors', () => {
  render(<BrandWordmark />)
  const pill = screen.getByText('Harness') as HTMLElement
  expect(pill.style.background).toBe('var(--dsw-alias-label-primary)')
  expect(pill.style.color).toBe('var(--dsw-alias-label-primary-inverted)')
})

test('the title rewriter rebrands the current title and later writes, and restores on dispose', async () => {
  document.title = 'DSH Local Build'
  const dispose = installTitleRebrand(document, 'DSH Local Build', 'Oh My DSH')
  expect(document.title).toBe('Oh My DSH')

  // A later write by DocumentTitle (session switch) gets rewritten too.
  document.title = 'Refactor sidebar — DSH Local Build'
  await waitFor(() => { expect(document.title).toBe('Refactor sidebar — Oh My DSH') })

  dispose()
  expect(document.title).toBe('Refactor sidebar — DSH Local Build')
})
