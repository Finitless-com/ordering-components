const ALLOWED_TAGS = new Set([
  'DIV', 'SPAN', 'A', 'P', 'STRONG', 'B', 'I', 'EM', 'BR', 'IMG',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BUTTON', 'UL', 'OL', 'LI',
  'SMALL', 'U', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH'
])

const REMOVE_TAGS = new Set([
  'SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE',
  'FORM', 'SVG', 'MATH', 'STYLE', 'NOSCRIPT', 'TEMPLATE'
])

const ALLOWED_ATTRS = new Set([
  'class', 'id', 'href', 'src', 'alt', 'title', 'target', 'rel', 'role'
])

const isDangerousUrl = (value) => {
  let trimmed = ''
  for (const ch of String(value)) {
    const code = ch.charCodeAt(0)
    if (code > 31 && code !== 127) trimmed += ch
  }
  trimmed = trimmed.trim().toLowerCase()
  return /^(javascript:|vbscript:|data:\s*text\/html)/i.test(trimmed)
}

const sanitizeElement = (element) => {
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType !== 1) continue

    if (REMOVE_TAGS.has(child.tagName)) {
      child.remove()
      continue
    }

    sanitizeElement(child)

    if (!ALLOWED_TAGS.has(child.tagName)) {
      while (child.firstChild) {
        element.insertBefore(child.firstChild, child)
      }
      child.remove()
      continue
    }

    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase()
      const allowed = ALLOWED_ATTRS.has(name) || name.startsWith('aria-')
      if (name.startsWith('on') || name === 'srcdoc' || !allowed) {
        child.removeAttribute(attr.name)
        continue
      }
      if ((name === 'href' || name === 'src') && isDangerousUrl(attr.value)) {
        child.removeAttribute(attr.name)
      }
    }

    if (child.getAttribute('target') === '_blank') {
      child.setAttribute('rel', 'noopener noreferrer')
    }
  }
}

export const sanitizeInfoWindowHtml = (html) => {
  if (typeof html !== 'string' || html === '') return ''
  if (typeof window === 'undefined' || typeof window.DOMParser === 'undefined') return ''
  const doc = new window.DOMParser().parseFromString(html, 'text/html')
  sanitizeElement(doc.body)
  return doc.body.innerHTML
}
