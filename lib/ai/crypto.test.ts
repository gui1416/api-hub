import { beforeEach, describe, expect, it } from 'vitest'
import { decrypt, encrypt, last4 } from './crypto'

const TEST_KEY = Buffer.alloc(32, 7).toString('base64')

describe('encrypt / decrypt', () => {
  beforeEach(() => {
    process.env.AI_CONFIG_ENCRYPTION_KEY = TEST_KEY
  })

  it('round-trips a plaintext value', () => {
    const plaintext = 'sk-super-secret-api-key-1234567890'
    const encrypted = encrypt(plaintext)
    expect(decrypt(encrypted)).toBe(plaintext)
  })

  it('produces a different ciphertext on each call (random IV)', () => {
    const plaintext = 'sk-super-secret-api-key-1234567890'
    const a = encrypt(plaintext)
    const b = encrypt(plaintext)
    expect(a).not.toBe(b)
    expect(decrypt(a)).toBe(plaintext)
    expect(decrypt(b)).toBe(plaintext)
  })

  it('stores the value as iv:authTag:ciphertext', () => {
    const encrypted = encrypt('hello')
    expect(encrypted.split(':')).toHaveLength(3)
  })

  it('throws a clear error for a malformed string', () => {
    expect(() => decrypt('not-a-valid-encrypted-value')).toThrow(
      /formato inválido/i,
    )
  })

  it('throws when the auth tag has been tampered with', () => {
    const encrypted = encrypt('sk-super-secret-api-key-1234567890')
    const [iv, authTag, ciphertext] = encrypted.split(':')
    const tamperedAuthTag = Buffer.from(authTag, 'base64')
    tamperedAuthTag[0] ^= 0xff
    const tampered = [iv, tamperedAuthTag.toString('base64'), ciphertext].join(':')
    expect(() => decrypt(tampered)).toThrow(/autenticação gcm inválida/i)
  })

  it('throws when the ciphertext has been tampered with', () => {
    const encrypted = encrypt('sk-super-secret-api-key-1234567890')
    const [iv, authTag, ciphertext] = encrypted.split(':')
    const tamperedCiphertext = Buffer.from(ciphertext, 'base64')
    tamperedCiphertext[0] ^= 0xff
    const tampered = [iv, authTag, tamperedCiphertext.toString('base64')].join(':')
    expect(() => decrypt(tampered)).toThrow(/autenticação gcm inválida/i)
  })

  it('throws when AI_CONFIG_ENCRYPTION_KEY is not configured', () => {
    delete process.env.AI_CONFIG_ENCRYPTION_KEY
    expect(() => encrypt('hello')).toThrow(
      'AI_CONFIG_ENCRYPTION_KEY não está configurado.',
    )
  })

  it('throws when AI_CONFIG_ENCRYPTION_KEY is not 32 bytes', () => {
    process.env.AI_CONFIG_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString('base64')
    expect(() => encrypt('hello')).toThrow(/32 bytes/)
  })
})

describe('last4', () => {
  it('returns the last 4 characters of the plaintext', () => {
    expect(last4('sk-super-secret-api-key-1234567890')).toBe('7890')
  })

  it('returns the whole string when shorter than 4 characters', () => {
    expect(last4('ab')).toBe('ab')
  })
})
