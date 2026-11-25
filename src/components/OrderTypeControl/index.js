import React, { useEffect, useState } from 'react'
import PropTypes, { object } from 'prop-types'
import { useOrder } from '../../contexts/OrderContext'
import { useConfig } from '../../contexts/ConfigContext'
import { useEvent } from '../../contexts/EventContext'
import { resolveUnaddressedOrderTypes, shouldRequireOrderAddress } from '../../utils/orderTypeAddress'

export const OrderTypeControl = (props) => {
  props = { ...defaultProps, ...props }
  const {
    UIComponent,
    disabledUpdateState
  } = props
  const [orderState, { changeType }] = useOrder()
  const [configState] = useConfig()
  const [events] = useEvent()
  const [typeSelected, setTypeSelected] = useState(null)

  const handleChangeOrderType = async (orderType) => {
    setTypeSelected(orderType)
    await changeType(orderType)
    const unaddressedTypes = resolveUnaddressedOrderTypes(
      configState?.configs?.unaddressed_order_types_allowed?.value,
      orderState
    )
    if (shouldRequireOrderAddress(orderType, orderState?.options, unaddressedTypes)) {
      events.emit('require_order_address', { orderType })
    }
    return orderType
  }

  useEffect(() => {
    !disabledUpdateState && setTypeSelected(orderState.options.type)
  }, [orderState.options.type])

  return (
    <>
      {UIComponent && (
        <UIComponent
          {...props}
          typeSelected={typeSelected ?? orderState.options.type}
          handleChangeOrderType={props.handleChangeOrderType || handleChangeOrderType}
        />
      )}
    </>
  )
}

OrderTypeControl.propTypes = {
  /**
   * UI Component, this must be containt all graphic elements and use parent props
   */
  UIComponent: PropTypes.elementType,
  /**
   * Order availables to the control
   */
  orderTypes: PropTypes.arrayOf(object),
  /**
   * Custom function to control order type changes
   */
  handleChangeOrderType: PropTypes.func
}

const defaultProps = {
  orderTypes: [1, 2, 3, 4, 5]
}
