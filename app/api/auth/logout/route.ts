import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getSessionFromRequest, SESSION_COOKIE } from '@/lib/auth'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request)

  try {
    await logAudit({
      action: 'auth.logout',
      actor: session?.username ?? 'anonymous',
      status: 'success',
      request,
    })
  } catch {
    return NextResponse.json(
      { error: 'Falha ao registrar auditoria. Tente novamente.' },
      { status: 500 },
    )
  }

  // lastLogoutAt + lastLoginAt derivam o "online" da tela de usuários.
  if (session) {
    await db
      .update(users)
      .set({ lastLogoutAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, session.sub))
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.delete(SESSION_COOKIE)
  return res
}
