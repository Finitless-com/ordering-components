/**
 * True when running in a browser (this submodule is shared with React Native apps, which have no
 * document nor location.reload)
 */
export const isWebRuntime = () => typeof window !== 'undefined' &&
  typeof window.document !== 'undefined' &&
  typeof window.location?.reload === 'function'
