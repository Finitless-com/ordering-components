import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Ordering } from '../Ordering'
import { installXhrMock } from '../../../../__tests__/helpers/xhrMock'

describe('Ordering', () => {
  beforeEach(() => {
    installXhrMock({
      response: { error: false, result: { id: 1, name: 'demo' } }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds root and system URLs from settings', () => {
    const ordering = new Ordering({
      url: 'https://api.test',
      version: 'v1',
      language: 'en',
      project: 'demo'
    })
    expect(ordering.root).toBe('https://api.test/v1/en/demo')
    expect(ordering.systemRoot).toBe('https://api.test/v1')
  })

  it('strips trailing slashes from the base url', () => {
    const ordering = new Ordering({ url: 'https://api.test/', version: 'v400', language: 'en', project: 'orderingv1' })
    expect(ordering.root).toBe('https://api.test/v400/en/orderingv1')
    expect(ordering.systemRoot).toBe('https://api.test/v400')
    expect(ordering.setUrl('https://other.test//').root).toBe('https://other.test/v400/en/orderingv1')
  })

  it.each([
    ['https://api.test', '/users/1/addresses'],
    ['https://api.test/', '/users/1/addresses'],
    ['https://api.test', 'users/1/addresses'],
    ['https://api.test/', 'users/1/addresses']
  ])('requests exactly one slash between root and path (base %s, path %s)', async (url, path) => {
    const captured = []
    installXhrMock({
      response: { error: false, result: [] },
      onRequest: (xhr) => captured.push(xhr)
    })
    const ordering = new Ordering({ url, version: 'v400', language: 'en', project: 'orderingv1' })
    await ordering.get(path)
    await ordering.post(path, {})
    await ordering.put(path, {})
    await ordering.delete(path)
    expect(captured).toHaveLength(4)
    captured.forEach((xhr) => {
      expect(xhr.url).toBe('https://api.test/v400/en/orderingv1/users/1/addresses')
    })
  })

  it('supports fluent setters', () => {
    const ordering = new Ordering()
    expect(ordering.setLanguage('es').language).toBe('es')
    expect(ordering.setProject('foo').project).toBe('foo')
    expect(ordering.setAccessToken('abc').accessToken).toBe('abc')
    expect(ordering.setApiKey('key').apiKey).toBe('key')
  })

  it('exposes resource API helpers', () => {
    const ordering = new Ordering()
    expect(typeof ordering.users(1).get).toBe('function')
    expect(typeof ordering.orders(2).get).toBe('function')
    expect(typeof ordering.carts(3).get).toBe('function')
    expect(typeof ordering.businesses(4).get).toBe('function')
  })

  it('builds auth headers in getRequestProps', () => {
    const ordering = new Ordering({
      accessToken: 'token',
      appId: 'app',
      appInternalName: 'marketplace',
      countryCode: 'US'
    })
    const [root, options] = ordering.getRequestProps({
      attributes: ['id'],
      conditions: [{ attribute: 'enabled', value: true }],
      mode: 'dashboard',
      query: { page: 1, nested: { a: 1 } }
    })
    expect(root).toContain('/demo')
    expect(options.headers.Authorization).toBe('Bearer token')
    expect(options.headers['X-APP-X']).toBe('app')
    expect(options.headers['X-INTERNAL-PRODUCT-X']).toBe('marketplace')
    expect(options.headers['X-Country-Code-X']).toBe('US')
    expect(options.params.params).toBe('id')
    expect(options.params.where).toContain('enabled')
    expect(options.params.mode).toBe('dashboard')
    expect(options.params.nested).toBe('{"a":1}')
  })

  it('uses per-request accessToken when the instance has none', () => {
    const ordering = new Ordering({ project: 'demo' })
    const [, options] = ordering.getRequestProps({ accessToken: 'per-request-tok' })
    expect(options.headers.Authorization).toBe('Bearer per-request-tok')
    expect(options.accessToken).toBeUndefined()
  })

  it('prefers per-request accessToken over the instance token', () => {
    const ordering = new Ordering({ accessToken: 'instance-tok', project: 'demo' })
    const [, options] = ordering.getRequestProps({ accessToken: 'per-request-tok' })
    expect(options.headers.Authorization).toBe('Bearer per-request-tok')
    expect(options.accessToken).toBeUndefined()
  })

  it('does not set Bearer from accessToken when apiKey is present', () => {
    const ordering = new Ordering({
      accessToken: 'instance-tok',
      apiKey: 'api-key',
      project: 'demo'
    })
    const [, options] = ordering.getRequestProps({ accessToken: 'per-request-tok' })
    expect(options.headers.Authorization).toBeUndefined()
    expect(options.headers['X-Api-Key']).toBe('api-key')
  })

  it('sends per-request Bearer on POST when the instance has no token', async () => {
    const captured = []
    installXhrMock({
      response: { error: false, result: { id: 1 } },
      onRequest: (xhr) => captured.push(xhr)
    })
    const ordering = new Ordering({ project: 'demo' })
    await ordering.post('/users/1/addresses', { address: '1 Main' }, { accessToken: 'confirm-tok' })
    expect(captured[0].requestHeaders.Authorization).toBe('Bearer confirm-tok')
  })

  it('performs GET requests via XMLHttpRequest', async () => {
    const ordering = new Ordering({ project: 'demo' })
    const response = await ordering.get('/languages', { CastClass: null, json: true })
    expect(response.status).toBe(200)
    expect(response.content.result).toEqual({ id: 1, name: 'demo' })
  })

  it('stringifies nested POST body fields', async () => {
    const captured = []
    installXhrMock({
      response: { error: false, result: { ok: true } },
      onRequest: (xhr) => captured.push(xhr)
    })
    const ordering = new Ordering({ project: 'demo' })
    await ordering.post('/carts', { meta: { a: 1 } })
    expect(captured[0].method).toBe('POST')
    expect(captured[0].body).toContain('"meta":"{\\"a\\":1}"')
  })
})
