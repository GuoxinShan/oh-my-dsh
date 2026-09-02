/**
 * Pure pagination helpers for the Thread panel. Page numbers are 1-based;
 * a requested page outside the valid range clamps to it, so a shrinking
 * list never leaves the view stranded on a page that no longer exists.
 */

export interface PageSlice<T> {
  /** Items of the clamped current page. */
  items: T[]
  /** Clamped 1-based current page. */
  page: number
  /** Total pages; always >= 1, even for an empty list. */
  pageCount: number
  /** Total items before slicing. */
  total: number
}

function assertPageSize(pageSize: number): void {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error(`dsh-thread: pageSize must be a positive integer, got ${String(pageSize)}`)
  }
}

/** Slice `items` into fixed pages and return the clamped `requestedPage`. */
export function paginateList<T>(
  items: readonly T[],
  pageSize: number,
  requestedPage: number,
): PageSlice<T> {
  assertPageSize(pageSize)
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const requested = Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1
  const page = Math.min(pageCount, Math.max(1, requested))
  const start = (page - 1) * pageSize
  return { items: items.slice(start, start + pageSize), page, pageCount, total }
}

/** 1-based page that contains the 0-based `index` (used to keep the current row visible). */
export function pageOfIndex(index: number, pageSize: number): number {
  assertPageSize(pageSize)
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`dsh-thread: index must be a non-negative integer, got ${String(index)}`)
  }
  return Math.floor(index / pageSize) + 1
}
