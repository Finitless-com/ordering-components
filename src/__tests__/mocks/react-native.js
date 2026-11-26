// react-native is not a dependency of this package (the apps provide it). The files under native/ that
// a test imports only need what they read from it.
export const Linking = {
  getInitialURL: () => Promise.resolve(null),
  addEventListener: () => ({ remove: () => {} })
}
