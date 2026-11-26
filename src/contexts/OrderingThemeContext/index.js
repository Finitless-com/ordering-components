import React, { createContext, useState, useContext, useEffect } from 'react'
import { useApi } from '../ApiContext'
import { useOptimizationLoad } from '../OptimizationLoadContext'

/**
 * Create OrderingThemeContext
 * This context will manage the current themes and layouts
 */
export const OrderingThemeContext = createContext()

/**
 * Custom provider to ordering themes and layouts manager
 * This provider has a reducer for manage themes and layouts state
 * @param {props} props
 */
export const OrderingThemeProvider = ({ children, settings, isValidColor, noValidateColors }) => {
  const [state, setState] = useState({
    loading: true,
    theme: {},
    error: false
  })

  const [ordering] = useApi()
  const [optimizationLoad] = useOptimizationLoad()

  const _isValidColor = (color) => {
    if (isValidColor) {
      return isValidColor?.(color)
    }
    if (typeof color !== 'string' || !color.trim()) {
      return false
    }
    const c = color.trim().toLowerCase()
    const hexRegex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/
    const rgbRegex = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+))?\s*\)$/
    const hslRegex = /^hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*(,\s*(0|1|0?\.\d+))?\s*\)$/
    if (hexRegex.test(c)) return true
    if (rgbRegex.test(c)) return true
    if (hslRegex.test(c)) return true
    if (c === 'transparent') return true
    const namedColors = new Set([
      'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'purple',
      'pink', 'brown', 'gray', 'grey', 'cyan', 'magenta', 'lime', 'olive',
      'navy', 'teal', 'aqua', 'maroon', 'silver', 'gold', 'indigo', 'violet',
      'coral', 'salmon', 'tomato', 'crimson', 'turquoise', 'wheat', 'ivory',
      'beige', 'khaki', 'lavender', 'plum', 'orchid', 'peru', 'sienna',
      'tan', 'thistle', 'snow', 'linen', 'mintcream', 'azure', 'aliceblue',
      'ghostwhite', 'honeydew', 'seashell', 'cornsilk', 'lemonchiffon',
      'floralwhite', 'oldlace', 'papayawhip', 'blanchedalmond', 'bisque',
      'moccasin', 'navajowhite', 'peachpuff', 'mistyrose', 'lightyellow',
      'lightsalmon', 'lightcoral', 'lightpink', 'lightgreen', 'lightblue',
      'lightcyan', 'lightgray', 'lightgrey', 'darkred', 'darkgreen', 'darkblue',
      'darkcyan', 'darkmagenta', 'darkgray', 'darkgrey', 'darkorange',
      'darkviolet', 'darksalmon', 'darkkhaki', 'darkolivegreen', 'darkseagreen',
      'darkslategray', 'darkslategrey', 'darkturquoise', 'deeppink',
      'deepskyblue', 'dodgerblue', 'firebrick', 'forestgreen', 'gainsboro',
      'goldenrod', 'greenyellow', 'hotpink', 'indianred', 'lawngreen',
      'limegreen', 'mediumblue', 'mediumorchid', 'mediumpurple',
      'mediumseagreen', 'mediumslateblue', 'mediumspringgreen',
      'mediumturquoise', 'mediumvioletred', 'midnightblue', 'rosybrown',
      'royalblue', 'saddlebrown', 'sandybrown', 'seagreen', 'skyblue',
      'slateblue', 'slategray', 'slategrey', 'springgreen', 'steelblue',
      'yellowgreen', 'cadetblue', 'chartreuse', 'chocolate', 'cornflowerblue',
      'blueviolet', 'burlywood', 'antiquewhite', 'aquamarine', 'whitesmoke',
      'powderblue', 'palegreen', 'paleturquoise', 'palevioletred',
      'palegoldenrod', 'rebeccapurple'
    ])
    return namedColors.has(c)
  }

  const validateFixColors = (obj) => {
    const newObj = JSON.parse(JSON.stringify(obj))

    const validateColors = (currentObj) => {
      Object.keys(currentObj).forEach(key => {
        if (typeof currentObj[key] === 'object' && currentObj[key] !== null) {
          validateColors(currentObj[key])
        } else if (key.toLowerCase().includes('color') && !_isValidColor(currentObj[key])) {
          currentObj[key] = ''
        }
      })
    }

    validateColors(newObj)
    return newObj
  }

  const getThemes = async (themes = null) => {
    const requestOptions = {
      method: 'GET',
      headers: { 'X-App-X': settings.appId }
    }
    try {
      let error = themes?.error ?? null
      let result = themes?.result ?? null
      if (!themes) {
        const response = await fetch(`${ordering.root}/theme`, requestOptions)
        const res = await response.json()
        error = res?.error
        result = res?.result
      }
      if (!error) {
        const isThemeV2 = result?.values?.version === 2
        result = noValidateColors || isThemeV2 ? result : validateFixColors(result)
        setState({
          ...state,
          theme: result?.values,
          loading: false,
          error: false
        })
        return
      }
      setState({
        ...state,
        theme: {},
        loading: false,
        error: true
      })
    } catch (err) {
      setState({
        ...state,
        theme: {},
        loading: false,
        error: err
      })
    }
  }

  const refreshTheme = () => {
    getThemes()
  }

  useEffect(() => {
    if (optimizationLoad.loading || !ordering?.project) return
    const _themes = optimizationLoad.result && !!optimizationLoad.result?.theme
      ? {
          error: optimizationLoad.error,
          result: { values: optimizationLoad.result?.theme }
        }
      : null
    getThemes(_themes)
  }, [optimizationLoad, ordering?.project])

  const functions = {
    refreshTheme
  }

  return (
    <OrderingThemeContext.Provider value={[state, functions]}>
      {children}
    </OrderingThemeContext.Provider>
  )
}

/**
 * Hook to get ordering theme
 */
export const useOrderingTheme = () => {
  const orderingThemeManager = useContext(OrderingThemeContext)
  const warningMessage = () => {
    console.warn('Must use OrderingThemeProvider to wrappe the app.')
  }
  /**
   * Functions to avoid fails
   */
  const functionsPlaceholders = {
    refreshTheme: warningMessage
  }

  return orderingThemeManager || [{}, functionsPlaceholders]
}
