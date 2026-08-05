import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { ControllerUI, renderController, lastControllerProps } from '../../../__tests__/helpers/renderController'

const acms = vi.hoisted(() => {
  const { createAnalyticsCmsTestContext } = require('../../../__tests__/helpers/analyticsCmsTestHelpers')
  return createAnalyticsCmsTestContext(vi)
})

vi.mock('../../../contexts/ApiContext', () => ({
  useApi: () => [acms.mockOrdering]
}))

import { CmsContent } from '../index'

describe('CmsContent', () => {
  beforeEach(() => acms.reset())

  it('loads CMS page body by slug', async () => {
    renderController(CmsContent, { pageSlug: 'about-us' })
    await waitFor(() => {
      expect(lastControllerProps.cmsState.loading).toBe(false)
    })
    expect(lastControllerProps.cmsState.body).toBe('<p>CMS page</p>')
  })

  it('exposes CMS page SEO metadata after loading', async () => {
    const onChangeMetaTag = vi.fn()
    acms.mockPagesGet.mockResolvedValueOnce({
      content: {
        error: false,
        result: {
          body: '<p>CMS page</p>',
          seo_title: 'About our marketplace',
          seo_description: 'Learn more about our marketplace.'
        }
      }
    })

    renderController(CmsContent, { pageSlug: 'about-us', onChangeMetaTag })

    await waitFor(() => {
      expect(onChangeMetaTag).toHaveBeenCalledWith(
        'About our marketplace',
        'Learn more about our marketplace.'
      )
    })
  })

  it('reloads CMS content when the page slug changes', async () => {
    const { rerender } = renderController(CmsContent, { pageSlug: 'about-us' })

    await waitFor(() => {
      expect(acms.mockOrdering.pages).toHaveBeenCalledWith('about-us')
    })

    rerender(<CmsContent UIComponent={ControllerUI} pageSlug='contact-us' />)

    await waitFor(() => {
      expect(acms.mockOrdering.pages).toHaveBeenCalledWith('contact-us')
    })
  })

  it('calls onNotFound when page fetch fails', async () => {
    acms.mockPagesGet.mockResolvedValueOnce({
      content: { error: true, result: ['Not found'] }
    })
    renderController(CmsContent, { pageSlug: 'missing', onNotFound: acms.mockOnNotFound })
    await waitFor(() => {
      expect(lastControllerProps.cmsState.error).toBeTruthy()
    })
    expect(acms.mockOnNotFound).toHaveBeenCalledWith('missing')
  })
})
