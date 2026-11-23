import { describe, expect, it } from 'vitest'
import { buildLazyProductParameters, resolveProductsPageSize } from './lazyProductParameters'

describe('buildLazyProductParameters', () => {
  it('requests one page ordered by rank when the full catalog is not forced', () => {
    expect(buildLazyProductParameters({
      isFetchAllProducts: false,
      page: 1,
      pageSize: 20,
      type: 1
    })).toEqual({
      version: 'v2',
      type: 1,
      page: 1,
      page_size: 20,
      orderBy: 'rank'
    })
  })

  it('omits page, page size, and order when the full catalog is forced', () => {
    expect(buildLazyProductParameters({
      isFetchAllProducts: true,
      page: 1,
      pageSize: 20,
      type: 1
    })).toEqual({
      version: 'v2',
      type: 1
    })
  })

  it('lets an A-Z sort replace the rank order', () => {
    expect(buildLazyProductParameters({
      isFetchAllProducts: false,
      page: 2,
      pageSize: 20,
      type: 1,
      sortByValue: 'a-z'
    }).orderBy).toBe('name')
  })

  it('keeps a chosen sort when the full catalog is forced', () => {
    const parameters = buildLazyProductParameters({
      isFetchAllProducts: true,
      page: 1,
      pageSize: 20,
      type: 1,
      sortByValue: 'price'
    })

    expect(parameters.orderBy).toBe('price')
    expect(parameters.page).toBeUndefined()
    expect(parameters.page_size).toBeUndefined()
  })
})

describe('resolveProductsPageSize', () => {
  it('keeps the app default of 5 when no size is passed', () => {
    expect(resolveProductsPageSize(undefined, true)).toBe(5)
  })

  it('keeps the web default of 20 when no size is passed', () => {
    expect(resolveProductsPageSize(undefined, false)).toBe(20)
  })

  it('uses a positive integer size', () => {
    expect(resolveProductsPageSize(20, true)).toBe(20)
  })

  it('rejects a size the API would treat as every row', () => {
    expect(resolveProductsPageSize(0, true)).toBe(5)
    expect(resolveProductsPageSize(-1, false)).toBe(20)
    expect(resolveProductsPageSize(1.5, true)).toBe(5)
  })
})
