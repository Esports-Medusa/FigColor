import { createHash } from 'node:crypto'

export function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('JCS does not permit non-finite numbers')
    return JSON.stringify(Object.is(value, -0) ? 0 : value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`
  }
  if (typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    return `{${entries.join(',')}}`
  }
  throw new TypeError(`JCS cannot encode ${typeof value}`)
}

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function canonicalHash(value) {
  const canonical = canonicalize(value)
  return { canonical, hash: sha256Hex(Buffer.from(canonical, 'utf8')) }
}

// Parses raw JSON with duplicate-key and Unicode-scalar rejection before using
// ECMAScript serialization, as required by RFC 8785/I-JSON.
export function canonicalizeJSON(raw) {
  if (typeof raw !== 'string') throw new TypeError('JCS input must be a JSON string')
  rejectDuplicateKeys(raw)
  const value = JSON.parse(raw)
  validateUnicodeScalars(value)
  return canonicalize(value)
}

export function canonicalHashJSON(raw) {
  const canonical = canonicalizeJSON(raw)
  return { canonical, hash: sha256Hex(Buffer.from(canonical, 'utf8')) }
}

function rejectDuplicateKeys(raw) {
  let index = 0
  const whitespace = () => { while (/\s/u.test(raw[index] ?? '')) index += 1 }
  const string = () => {
    const start = index
    if (raw[index++] !== '"') throw new SyntaxError('Expected JSON string')
    while (index < raw.length) {
      const current = raw[index++]
      if (current === '"') return JSON.parse(raw.slice(start, index))
      if (current === '\\') index += raw[index] === 'u' ? 5 : 1
      else if (current < ' ') throw new SyntaxError('Invalid JSON control character')
    }
    throw new SyntaxError('Unterminated JSON string')
  }
  const value = () => {
    whitespace()
    if (raw[index] === '{') {
      index += 1
      whitespace()
      const keys = new Set()
      if (raw[index] !== '}') {
        while (true) {
          const key = string()
          if (keys.has(key)) throw new SyntaxError(`Duplicate JSON key: ${key}`)
          keys.add(key)
          whitespace()
          if (raw[index++] !== ':') throw new SyntaxError('Expected colon')
          value()
          whitespace()
          if (raw[index] === '}') break
          if (raw[index++] !== ',') throw new SyntaxError('Expected comma')
          whitespace()
        }
      }
      index += 1
      return
    }
    if (raw[index] === '[') {
      index += 1
      whitespace()
      if (raw[index] !== ']') {
        while (true) {
          value()
          whitespace()
          if (raw[index] === ']') break
          if (raw[index++] !== ',') throw new SyntaxError('Expected comma')
        }
      }
      index += 1
      return
    }
    if (raw[index] === '"') { string(); return }
    const match = raw.slice(index).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u)
    if (!match) throw new SyntaxError('Invalid JSON value')
    index += match[0].length
  }
  value()
  whitespace()
  if (index !== raw.length) throw new SyntaxError('Trailing JSON data')
}

function validateUnicodeScalars(value) {
  if (typeof value === 'string') {
    for (let index = 0; index < value.length; index += 1) {
      const unit = value.charCodeAt(index)
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = value.charCodeAt(++index)
        if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError('JCS rejects lone surrogate')
      } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new TypeError('JCS rejects lone surrogate')
    }
  } else if (Array.isArray(value)) value.forEach(validateUnicodeScalars)
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      validateUnicodeScalars(key)
      validateUnicodeScalars(child)
    }
  }
}
