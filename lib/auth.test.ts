import { SignJWT } from 'jose'
import { beforeEach, describe, expect, it } from 'vitest'
import { createSessionToken, verifySessionToken } from './auth'

describe('createSessionToken / verifySessionToken', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-at-least-32-bytes-long!!'
  })

  it('round-trips a valid token', async () => {
    const token = await createSessionToken('alice')
    const session = await verifySessionToken(token)
    expect(session).toEqual({ sub: 'alice' })
  })

  it('rejects a garbage token', async () => {
    const session = await verifySessionToken('not-a-jwt')
    expect(session).toBeNull()
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await new SignJWT({ sub: 'alice' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1d')
      .sign(new TextEncoder().encode('a-completely-different-secret!!'))

    const session = await verifySessionToken(token)
    expect(session).toBeNull()
  })

  it('rejects an expired token', async () => {
    const token = await new SignJWT({ sub: 'alice' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('-1s')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!))

    const session = await verifySessionToken(token)
    expect(session).toBeNull()
  })

  it('rejects a token whose payload lacks a string sub', async () => {
    const token = await new SignJWT({ sub: 123 } as unknown as { sub: string })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1d')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!))

    const session = await verifySessionToken(token)
    expect(session).toBeNull()
  })

  it('throws when JWT_SECRET is not configured', async () => {
    delete process.env.JWT_SECRET
    await expect(createSessionToken('alice')).rejects.toThrow(
      'JWT_SECRET não está configurado.',
    )
  })
})
