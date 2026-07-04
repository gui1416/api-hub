import { SignJWT, jwtVerify } from 'jose'

export const SESSION_COOKIE = 'apihub_session'
const SESSION_DURATION = '1d'
const SESSION_DURATION_SECONDS = 1 * 24 * 60 * 60
export const SESSION_DURATION_MS = SESSION_DURATION_SECONDS * 1000

export interface SessionPayload {
  /** users.id */
  sub: string
  username: string
  /**
   * Snapshot do momento do login/última troca de senha. Quando true, o
   * middleware força o fluxo de /change-password antes de qualquer outra
   * rota; a troca de senha reemite o cookie com a flag zerada.
   */
  mustChangePassword: boolean
}

function getSecretKey() {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET não está configurado.')
  }
  return new TextEncoder().encode(secret)
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    sub: payload.sub,
    username: payload.username,
    mustChangePassword: payload.mustChangePassword,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(getSecretKey())
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey())
    if (typeof payload.sub !== 'string' || typeof payload.username !== 'string') {
      return null
    }
    return {
      sub: payload.sub,
      username: payload.username,
      mustChangePassword: payload.mustChangePassword === true,
    }
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
): Promise<SessionPayload | null> {
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

/**
 * "Online" derivado só de lastLoginAt/lastLogoutAt — sem tabela de sessão
 * nem heartbeat. A janela de SESSION_DURATION_MS cobre quem fechou o
 * navegador sem clicar em "sair": passado o prazo de validade do JWT, deixa
 * de contar como online mesmo sem logout explícito.
 */
export function isOnline(
  user: { lastLoginAt: Date | null; lastLogoutAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (!user.lastLoginAt) return false
  if (user.lastLogoutAt && user.lastLogoutAt >= user.lastLoginAt) return false
  return now.getTime() - user.lastLoginAt.getTime() < SESSION_DURATION_MS
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_DURATION_SECONDS,
}
