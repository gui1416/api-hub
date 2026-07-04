import { SignJWT } from 'jose'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createSessionToken,
  isOnline,
  SESSION_DURATION_MS,
  verifySessionToken,
} from './auth'

const PAYLOAD = {
  sub: 'b6f6a1a2-0000-4000-8000-000000000001',
  username: 'alice',
  mustChangePassword: false,
}

describe('createSessionToken / verifySessionToken', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-at-least-32-bytes-long!!'
  })

  it('round-trips a valid token', async () => {
    const token = await createSessionToken(PAYLOAD)
    const session = await verifySessionToken(token)
    expect(session).toEqual(PAYLOAD)
  })

  it('carries mustChangePassword=true through the round-trip', async () => {
    const token = await createSessionToken({ ...PAYLOAD, mustChangePassword: true })
    const session = await verifySessionToken(token)
    expect(session?.mustChangePassword).toBe(true)
  })

  it('rejects a garbage token', async () => {
    const session = await verifySessionToken('not-a-jwt')
    expect(session).toBeNull()
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await new SignJWT({ ...PAYLOAD })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1d')
      .sign(new TextEncoder().encode('a-completely-different-secret!!'))

    const session = await verifySessionToken(token)
    expect(session).toBeNull()
  })

  it('rejects an expired token', async () => {
    const token = await new SignJWT({ ...PAYLOAD })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('-1s')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!))

    const session = await verifySessionToken(token)
    expect(session).toBeNull()
  })

  it('rejects a token whose payload lacks a string sub', async () => {
    const token = await new SignJWT({ ...PAYLOAD, sub: 123 } as unknown as { sub: string })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1d')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!))

    const session = await verifySessionToken(token)
    expect(session).toBeNull()
  })

  it('rejects a token whose payload lacks a username', async () => {
    const token = await new SignJWT({ sub: PAYLOAD.sub })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1d')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!))

    const session = await verifySessionToken(token)
    expect(session).toBeNull()
  })

  it('throws when JWT_SECRET is not configured', async () => {
    delete process.env.JWT_SECRET
    await expect(createSessionToken(PAYLOAD)).rejects.toThrow(
      'JWT_SECRET não está configurado.',
    )
  })
})

describe('isOnline', () => {
  const now = new Date('2026-07-03T12:00:00Z')
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000)

  it('is offline when the user never logged in', () => {
    expect(isOnline({ lastLoginAt: null, lastLogoutAt: null }, now)).toBe(false)
  })

  it('is online after a recent login with no logout', () => {
    expect(isOnline({ lastLoginAt: hoursAgo(1), lastLogoutAt: null }, now)).toBe(true)
  })

  it('is offline after logging out following the last login', () => {
    expect(
      isOnline({ lastLoginAt: hoursAgo(2), lastLogoutAt: hoursAgo(1) }, now),
    ).toBe(false)
  })

  it('is online again after logging back in following a logout', () => {
    expect(
      isOnline({ lastLoginAt: hoursAgo(1), lastLogoutAt: hoursAgo(2) }, now),
    ).toBe(true)
  })

  it('expires without an explicit logout once the session window passes', () => {
    const beyondWindow = new Date(now.getTime() - SESSION_DURATION_MS - 1000)
    expect(isOnline({ lastLoginAt: beyondWindow, lastLogoutAt: null }, now)).toBe(false)
  })
})
