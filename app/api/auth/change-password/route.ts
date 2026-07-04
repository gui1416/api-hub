import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import {
  createSessionToken,
  getSessionFromRequest,
  sessionCookieOptions,
  SESSION_COOKIE,
} from '@/lib/auth'
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from '@/lib/passwords'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  let payload: { currentPassword?: string; newPassword?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Corpo da requisição inválido.' },
      { status: 400 },
    )
  }

  const { currentPassword, newPassword } = payload
  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: 'Informe a senha atual e a nova senha.' },
      { status: 400 },
    )
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` },
      { status: 400 },
    )
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.sub))
    .limit(1)

  if (!user || user.status !== 'active') {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const currentValid = await verifyPassword(currentPassword, user.passwordHash)

  try {
    await logAudit({
      action: 'user.password_changed',
      actor: user.username,
      status: currentValid ? 'success' : 'failure',
      request,
    })
  } catch {
    return NextResponse.json(
      { error: 'Falha ao registrar auditoria. Tente novamente.' },
      { status: 500 },
    )
  }

  if (!currentValid) {
    return NextResponse.json({ error: 'Senha atual incorreta.' }, { status: 400 })
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))

  // Reemite o cookie sem a flag — a troca vale imediatamente, sem esperar o
  // JWT antigo expirar.
  const token = await createSessionToken({
    sub: user.id,
    username: user.username,
    mustChangePassword: false,
  })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions)
  return res
}
