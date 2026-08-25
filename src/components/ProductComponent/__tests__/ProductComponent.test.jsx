import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'
import { ProductProvider } from '../../../contexts/ProductContext'
import { EventProvider } from '../../../contexts/EventContext'
import { productForComponent } from '../../../__tests__/helpers/productDetailTestHelpers'
import { ProductComponent } from '../index'

const ProductProviderWrapper = ({ children }) => (
  <EventProvider>
    <ProductProvider>{children}</ProductProvider>
  </EventProvider>
)

describe('ProductComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it('initializes ingredients and options on mount', async () => {
    renderController(ProductComponent, { product: productForComponent }, { wrapper: ProductProviderWrapper })
    await waitFor(() => {
      expect(lastControllerProps.ingredients).toHaveLength(1)
    })
    expect(lastControllerProps.options).toHaveLength(1)
    expect(lastControllerProps.productPrice).toBe(9.5)
  })

  it('does not overwrite guest order options in storage when product extras initialize', async () => {
    const guestOrderOptions = {
      type: 1,
      address: { id: 9, address: '123 Main St' },
      address_id: 9
    }
    window.localStorage.setItem('options', JSON.stringify(guestOrderOptions))
    renderController(ProductComponent, { product: productForComponent }, { wrapper: ProductProviderWrapper })
    await waitFor(() => expect(lastControllerProps.options).toHaveLength(1))
    expect(JSON.parse(window.localStorage.getItem('options'))).toEqual(guestOrderOptions)
    expect(JSON.parse(window.localStorage.getItem('product_options'))).toHaveLength(1)
  })

  it('increments quantity and recalculates price', async () => {
    renderController(ProductComponent, { product: productForComponent }, { wrapper: ProductProviderWrapper })
    await waitFor(() => expect(lastControllerProps.ingredients).toHaveLength(1))
    lastControllerProps.onClickedButtonPlus()
    await waitFor(() => {
      expect(lastControllerProps.productCount).toBe(2)
    })
    expect(lastControllerProps.productPrice).toBe(19)
  })

  it('selects radio suboptions and updates price', async () => {
    renderController(ProductComponent, { product: productForComponent }, { wrapper: ProductProviderWrapper })
    await waitFor(() => expect(lastControllerProps.options).toHaveLength(1))
    lastControllerProps.onChangedOption(0, 0, true)
    await waitFor(() => {
      expect(lastControllerProps.productPrice).toBe(11.5)
    })
  })

  it('delegates add, share, and close actions', async () => {
    const onAdd = vi.fn()
    const onShare = vi.fn()
    const onClose = vi.fn()
    renderController(ProductComponent, {
      product: productForComponent,
      onClickedButtonAdd: () => {},
      onAdd,
      onShare,
      onClose
    }, { wrapper: ProductProviderWrapper })
    await waitFor(() => expect(lastControllerProps.ingredients).toHaveLength(1))
    lastControllerProps.onShare()
    lastControllerProps.onClose()
    lastControllerProps.onClickedButtonAdd()
    expect(onShare).toHaveBeenCalledWith(productForComponent)
    expect(onClose).toHaveBeenCalled()
    expect(onAdd).toHaveBeenCalled()
  })
})
