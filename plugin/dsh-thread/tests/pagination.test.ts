import assert from 'node:assert/strict'
import test from 'node:test'
import { pageOfIndex, paginateList } from '../src/pagination.ts'

const rows = Array.from({ length: 23 }, (_, index) => `row-${index + 1}`)

test('slices the requested page with 1-based numbering', () => {
  const slice = paginateList(rows, 8, 2)
  assert.equal(slice.page, 2)
  assert.equal(slice.pageCount, 3)
  assert.equal(slice.total, 23)
  assert.deepEqual(slice.items, rows.slice(8, 16))
})

test('last page carries only the remainder', () => {
  const slice = paginateList(rows, 8, 3)
  assert.equal(slice.items.length, 7)
  assert.deepEqual(slice.items, rows.slice(16))
})

test('clamps an out-of-range page instead of going blank', () => {
  assert.equal(paginateList(rows, 8, 99).page, 3)
  assert.equal(paginateList(rows, 8, 0).page, 1)
  assert.equal(paginateList(rows, 8, -4).page, 1)
  assert.equal(paginateList(rows, 8, Number.NaN).page, 1)
})

test('a shrinking list pulls the current page back into range', () => {
  const slice = paginateList(rows.slice(0, 3), 8, 3)
  assert.equal(slice.page, 1)
  assert.deepEqual(slice.items, rows.slice(0, 3))
})

test('empty list still reports a single empty page', () => {
  const slice = paginateList([], 5, 4)
  assert.equal(slice.page, 1)
  assert.equal(slice.pageCount, 1)
  assert.equal(slice.total, 0)
  assert.deepEqual(slice.items, [])
})

test('an exact page boundary does not invent an extra page', () => {
  const slice = paginateList(rows.slice(0, 16), 8, 2)
  assert.equal(slice.pageCount, 2)
  assert.equal(slice.items.length, 8)
})

test('pageOfIndex locates the page holding a 0-based index', () => {
  assert.equal(pageOfIndex(0, 8), 1)
  assert.equal(pageOfIndex(7, 8), 1)
  assert.equal(pageOfIndex(8, 8), 2)
  assert.equal(pageOfIndex(22, 8), 3)
})

test('invalid page sizes and indexes fail loud', () => {
  assert.throws(() => paginateList(rows, 0, 1), /pageSize/)
  assert.throws(() => paginateList(rows, 1.5, 1), /pageSize/)
  assert.throws(() => pageOfIndex(-1, 8), /index/)
  assert.throws(() => pageOfIndex(0.5, 8), /index/)
})
