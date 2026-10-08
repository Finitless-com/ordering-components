import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { useApi } from '../../contexts/ApiContext'
import { useOrder } from '../../contexts/OrderContext'
import { useSession } from '../../contexts/SessionContext'

export const UpsellingPage = (props) => {
  const { UIComponent, useSuggestiveUpselling, products, cartProducts, onSave } = props
  const [upsellingProducts, setUpsellingProducts] = useState({ products: [], loading: true, error: false })
  const [businessProducts, setBusinessProducts] = useState([])
  const [ordering] = useApi()
  const [orderState, { removeOffer }] = useOrder()
  const [{ token }] = useSession()
  const currentCart = orderState.carts[`businessId:${props.businessId}`]

  const businessId = props.uuid
    ? Object.values(orderState.carts).find(_cart => _cart?.uuid === props.uuid)?.business_id ?? {}
    : props.businessId

  useEffect(() => {
    if (products?.length || businessId) {
      if (products?.length && !props.uuid) {
        getUpsellingProducts(products)
      } else if (!useSuggestiveUpselling) {
        getProducts()
      }
    } else {
      setUpsellingProducts({
        ...upsellingProducts,
        error: true,
        message: 'BusinessId is required when products is not defined'
      })
    }
  }, [businessId])

  useEffect(() => {
    if (useSuggestiveUpselling) return
    if (!upsellingProducts.loading && !orderState.loading) {
      getUpsellingProducts(businessProducts)
    }
  }, [orderState.loading, upsellingProducts.loading])

  useEffect(() => {
    if (!cartProducts?.length || !useSuggestiveUpselling || orderState.loading) return
    getSuggestiveProducts()
  }, [cartProducts?.length, orderState.loading])

  /**
   * getting products if array of product is not defined
   */
  const getProducts = async () => {
    try {
      const { content: { result } } = await ordering
        .businesses(businessId)
        .products()
        .parameters({ type: orderState.options.type, params: 'upsellings' })
        .get()

      const orderedProducts = result.map(product => {
        if (product?.extras && Array.isArray(product.extras) && product.extras?.length > 0) {
          product.extras = product.extras.sort((a, b) => (a?.rank || 0) - (b?.rank || 0))

          product.extras.forEach(extra => {
            if (extra?.options && Array.isArray(extra?.options) && extra?.options?.length > 0) {
              extra.options = extra.options.sort((a, b) => (a?.rank || 0) - (b?.rank || 0))

              extra.options.forEach(option => {
                if (option?.suboptions && Array.isArray(option?.suboptions) && option?.suboptions?.length > 0) {
                  option.suboptions = option.suboptions.sort((a, b) => (a?.rank || 0) - (b?.rank || 0))
                }
              })
            }
          })
        }
        return product
      })

      setBusinessProducts(orderedProducts)
      getUpsellingProducts(orderedProducts)
    } catch (error) {
      setUpsellingProducts({
        ...upsellingProducts,
        loading: false,
        error
      })
    }
  }

  /**
   * getting suggestive products if useSuggestiveUpselling is true
   */
  const getSuggestiveProducts = async () => {
    if (!currentCart?.uuid) {
      setUpsellingProducts(prevState => ({ ...prevState, loading: false }))
      return
    }
    try {
      const requestOptions = {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-App-X': ordering.appId
        }
      }
      const response = await fetch(`${ordering.root}/carts/${currentCart?.uuid}/upselling`, requestOptions)
      const { error, result } = await response.json()
      if (!error) {
        setBusinessProducts(result)
        getUpsellingProducts(result)
      } else {
        setUpsellingProducts({
          ...upsellingProducts,
          loading: false,
          error
        })
      }
    } catch (error) {
      setUpsellingProducts({
        ...upsellingProducts,
        loading: false,
        error
      })
    }
  }

  /**
   *
   * filt products if they are already in the cart
   * @param {array} cartProducts
   */
  const getUpsellingProducts = (result) => {
    const upsellingProductsfiltered = result.filter(product => product.upselling)

    const repeatProducts = cartProducts?.length ? cartProducts?.filter(cartProduct => upsellingProductsfiltered.find(product => product.id === cartProduct.id)) : []

    setUpsellingProducts({
      ...upsellingProducts,
      loading: false,
      products: repeatProducts?.length
        ? upsellingProductsfiltered?.filter(product => !product.inventoried && !repeatProducts.find(repeatProduct => repeatProduct.id === product.id))
        : upsellingProductsfiltered
    })
  }

  /**
   * Function for confirm that the productForm now can be displayed
   * @param {product} product
   */
  const handleFormProduct = (product) => {
    onSave(product)
  }

  const handleRemoveOfferClick = (id, userId) => {
    const dataOffer = {
      business_id: businessId,
      offer_id: id
    }
    if (userId) dataOffer.user_id = userId
    removeOffer(dataOffer)
  }

  return (
    <UIComponent
      {...props}
      upsellingProducts={upsellingProducts}
      handleFormProduct={handleFormProduct}
      handleRemoveOfferClick={handleRemoveOfferClick}
    />
  )
}

UpsellingPage.propTypes = {
  /**
   * UI Component, this must be containt all graphic elements and use parent props
   */
  UIComponent: PropTypes.elementType,
  /**
    * upselling products that do not repeat in the cart
   */
  products: PropTypes.array,
  /**
   * BusinessId is required when products is not defined
   */
  businessId: PropTypes.number,
  /**
   * handleCustomClick, function to get click event and return product without default behavior
   */
  onSave: PropTypes.func
}
