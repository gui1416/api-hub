import { SignJWT, jwtVerify } from 'jose'

export const SESSION_COOKIE = 'apihub_session'
const SESSION_DURATION = '1d'
const SESSION_DURATION_SECONDS = 1 * 24 * 60 * 60

function getSecretKey() {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET não está configurado.')
  }
  return new TextEncoder().encode(secret)
}

export async function createSessionToken(username: string): Promise<string> {
  return new SignJWT({ sub: username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(getSecretKey())
}

export async function verifySessionToken(
  token: string,
): Promise<{ sub: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey())
    return typeof payload.sub === 'string' ? { sub: payload.sub } : null
  } catch {
    return null
  }
}

/**
 * Reads the session cookie straight off a Request's `Cookie` header (rather
 * than next/headers' cookies(), which requires Next's request context and
 * isn't available when route handlers are invoked directly, e.g. in tests).
 */
export async function getSessionFromRequest(
  request: Request,
): Promise<{ sub: string } | null> {
  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) return null
  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
  if (!match) return null
  const token = decodeURIComponent(match.slice(SESSION_COOKIE.length + 1))
  return verifySessionToken(token)
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_DURATION_SECONDS,
}
