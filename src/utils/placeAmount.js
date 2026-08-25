export const getPlaceAmount = (cart) => {
  return cart?.balance ?? cart?.total
}
