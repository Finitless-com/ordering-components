import { describe, expect, it } from 'vitest'
import { persistProductOptions, PRODUCT_OPTIONS_STORAGE_KEY } from '../persistProductOptions'

describe('persistProductOptions', () => {
  it('writes product extras without replacing guest order options', () => {
    const storage = {
      data: {
        options: JSON.stringify({ type: 1, address: { id: 9 } })
      },
      setItem (key, value) {
        this.data[key] = value
      },
      getItem (key) {
        return this.data[key] ?? null
      }
    }

    persistProductOptions([{ id: 1, name: 'Size' }], storage)

    expect(JSON.parse(storage.getItem('options'))).toEqual({ type: 1, address: { id: 9 } })
    expect(PRODUCT_OPTIONS_STORAGE_KEY).toBe('product_options')
    expect(JSON.parse(storage.getItem(PRODUCT_OPTIONS_STORAGE_KEY))).toEqual([{ id: 1, name: 'Size' }])
  })
})
