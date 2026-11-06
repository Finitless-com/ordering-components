export const resolveProductsPageSize = (productsPageSize, isApp) => {
  if (Number.isInteger(productsPageSize) && productsPageSize > 0) return productsPageSize
  return isApp ? 5 : 20
}

export const buildLazyProductParameters = ({
  isFetchAllProducts,
  page,
  pageSize,
  type,
  sortByValue
}) => {
  const parameters = {
    version: 'v2',
    type: type ?? 1,
    ...(!isFetchAllProducts && {
      page,
      page_size: pageSize,
      orderBy: 'rank'
    })
  }

  if (sortByValue) {
    parameters.orderBy = sortByValue === 'a-z' ? 'name' : sortByValue
  }

  return parameters
}
