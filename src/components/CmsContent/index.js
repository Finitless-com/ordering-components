import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { useApi } from '../../contexts/ApiContext'

/**
 * Component to manage login behavior without UI component
 */
export const CmsContent = (props) => {
  const {
    UIComponent,
    pageSlug,
    onNotFound,
    onChangeMetaTag
  } = props

  /**
   * State of the page: its body, name, update date and SEO fields (null when the page has none)
   */
  const [cmsState, setCmsState] = useState({ body: null, loading: false, error: null })
  const [ordering] = useApi()
  const requestsState = {}
  /**
   * Method used to get the page by slug
   */
  const getPage = async (slug) => {
    setCmsState({ ...cmsState, loading: true })
    try {
      const source = {}
      requestsState.page = source
      const { content: { error, result } } = await ordering.pages(slug).get({ cancelToken: source })
      setCmsState({ ...cmsState, loading: false })
      if (!error) {
        setCmsState({
          ...cmsState,
          body: result.body,
          name: result.name ?? null,
          updated_at: result.updated_at ?? null,
          seo_title: result.seo_title ?? null,
          seo_description: result.seo_description ?? null
        })
        // the whole page goes as a third argument for views that show its name or date
        onChangeMetaTag && onChangeMetaTag(result.seo_title, result.seo_description, result)
      } else {
        setCmsState({ ...cmsState, error: result })
        onNotFound && onNotFound(pageSlug)
      }
    } catch (err) {
      if (err.constructor.name !== 'Cancel') {
        setCmsState({ ...cmsState, loading: false, error: [err.message] })
      }
    }
  }

  useEffect(() => {
    getPage(pageSlug)
    return () => {
      if (requestsState.page) {
        requestsState.page?.cancel?.()
      }
    }
  }, [pageSlug])

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          cmsState={cmsState}
        />
      )}
    </>
  )
}

CmsContent.propTypes = {
  /**
   * UI Component, this must be containt all graphic elements and use parent props
   */
  UIComponent: PropTypes.elementType,
  pageSlug: PropTypes.string,
  onNotFound: PropTypes.func,
  onChangeMetaTag: PropTypes.func
}
