import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

function safeEqual(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a).digest()
  const hashB = createHash('sha256').update(b).digest()
  return timingSafeEqual(hashA, hashB)
}

export async function POST(request: Request) {
  let payload: { username?: string; password?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Corpo da requisição inválido.' },
      { status: 400 },
    )
  }

  const { username, password } = payload
  const expectedUsername = process.env.AUTH_USERNAME
  const expectedPassword = process.env.AUTH_PASSWORD

  if (!expectedUsername || !expectedPassword) {
    return NextResponse.json(
      { error: 'Login não configurado no servidor.' },
      { status: 500 },
    )
  }

  const credentialsValid =
    !!username &&
    !!password &&
    safeEqual(username, expectedUsername) &&
    safeEqual(password, expectedPassword)

  try {
    await logAudit({
      action: 'auth.login',
      actor: username || 'anonymous',
      status: credentialsValid ? 'success' : 'failure',
      request,
    })
  } catch {
    return NextResponse.json(
      { error: 'Falha ao registrar auditoria. Tente novamente.' },
      { status: 500 },
    )
  }

  if (!credentialsValid) {
    return NextResponse.json(
      { error: 'Usuário ou senha inválidos.' },
      { status: 401 },
    )
  }

  const token = await createSessionToken(username!)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions)
  return res
}
