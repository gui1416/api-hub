import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from '@/lib/auth'
import { verifyPassword } from '@/lib/passwords'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

// Hash bcrypt de descarte usado quando o username não existe: mantém o tempo
// de resposta parecido com o de uma senha errada, evitando enumeração de
// usernames por timing.
const DUMMY_HASH = '$2b$10$C6UzMDM.H6dfI/f/IKcEeO7ZBpUvbEwzcZBlDcyC1eIkTGGlVIQPa'

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

  // Mesmo sem credenciais completas a tentativa é auditada (actor
  // 'anonymous'), então só desviamos do fluxo depois do logAudit.
  const [user] = username
    ? await db.select().from(users).where(eq(users.username, username)).limit(1)
    : [undefined]

  const passwordValid = password
    ? await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH)
    : false
  const credentialsValid = !!user && passwordValid
  const active = credentialsValid && user.status === 'active'

  try {
    await logAudit({
      action: 'auth.login',
      actor: username || 'anonymous',
      status: active ? 'success' : 'failure',
      metadata: credentialsValid && !active ? { reason: 'disabled' } : undefined,
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

  if (!active) {
    return NextResponse.json(
      { error: 'Este usuário está desativado. Fale com um administrador.' },
      { status: 403 },
    )
  }

  await db
    .update(users)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id))

  const token = await createSessionToken({
    sub: user.id,
    username: user.username,
    mustChangePassword: user.mustChangePassword,
  })
  const res = NextResponse.json({
    ok: true,
    mustChangePassword: user.mustChangePassword,
  })
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions)
  return res
}
