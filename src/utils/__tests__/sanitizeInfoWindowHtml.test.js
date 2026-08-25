import { describe, expect, it } from 'vitest'
import { sanitizeInfoWindowHtml } from '../sanitizeInfoWindowHtml'

describe('sanitizeInfoWindowHtml', () => {
  it('returns empty string for non-string values', () => {
    expect(sanitizeInfoWindowHtml(null)).toBe('')
    expect(sanitizeInfoWindowHtml(undefined)).toBe('')
    expect(sanitizeInfoWindowHtml(12)).toBe('')
  })

  it('keeps trusted popup layout markup', () => {
    const html = '<div class="business-map-card" id="order-now-5"><span class="bold">Pizza</span><a href="tel:555">555</a></div>'
    const sanitized = sanitizeInfoWindowHtml(html)
    expect(sanitized).toContain('business-map-card')
    expect(sanitized).toContain('order-now-5')
    expect(sanitized).toContain('Pizza')
    expect(sanitized).toContain('tel:555')
  })

  it('strips script tags and event handlers', () => {
    const html = '<div>Store<img src="x" onerror="alert(1)"><script>alert(1)</script></div>'
    const sanitized = sanitizeInfoWindowHtml(html)
    expect(sanitized).toContain('Store')
    expect(sanitized).not.toMatch(/script/i)
    expect(sanitized).not.toMatch(/onerror/i)
    expect(sanitized).not.toMatch(/alert\(/)
  })

  it('strips javascript URLs and iframes', () => {
    const html = '<a href="javascript:alert(1)">Open</a><iframe src="https://evil.test"></iframe>'
    const sanitized = sanitizeInfoWindowHtml(html)
    expect(sanitized).not.toMatch(/javascript:/i)
    expect(sanitized).not.toMatch(/iframe/i)
    expect(sanitized).toContain('Open')
  })
})
