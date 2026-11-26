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
        'Learn more about our marketplace.',
        expect.objectContaining({ body: '<p>CMS page</p>' })
      )
    })
  })

  it('passes the page name, update date and SEO fields to the view, and the whole page to onChangeMetaTag', async () => {
    const onChangeMetaTag = vi.fn()
    const page = {
      body: '<p>CMS page</p>',
      name: 'About us',
      updated_at: '2024-05-20 21:35:49',
      seo_title: 'About our marketplace',
      seo_description: 'Learn more about our marketplace.'
    }
    acms.mockPagesGet.mockResolvedValueOnce({ content: { error: false, result: page } })

    renderController(CmsContent, { pageSlug: 'about-us', onChangeMetaTag })

    await waitFor(() => {
      expect(lastControllerProps.cmsState.name).toBe('About us')
    })
    expect(lastControllerProps.cmsState).toMatchObject({
      body: '<p>CMS page</p>',
      updated_at: '2024-05-20 21:35:49',
      seo_title: 'About our marketplace',
      seo_description: 'Learn more about our marketplace.'
    })
    expect(onChangeMetaTag).toHaveBeenCalledWith('About our marketplace', 'Learn more about our marketplace.', page)
  })

  it('has null name, date and SEO fields when the page lacks them', async () => {
    const onChangeMetaTag = vi.fn()
    renderController(CmsContent, { pageSlug: 'about-us', onChangeMetaTag })

    await waitFor(() => {
      expect(lastControllerProps.cmsState.body).toBe('<p>CMS page</p>')
    })
    expect(lastControllerProps.cmsState).toMatchObject({ name: null, updated_at: null, seo_title: null, seo_description: null })
    expect(onChangeMetaTag).toHaveBeenCalledWith(undefined, undefined, { body: '<p>CMS page</p>' })
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
