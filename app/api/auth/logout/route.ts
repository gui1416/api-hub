import { NextResponse } from 'next/server'
import { getSessionFromRequest, SESSION_COOKIE } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request)

  try {
    await logAudit({
      action: 'auth.logout',
      actor: session?.sub ?? 'anonymous',
      status: 'success',
      request,
    })
  } catch {
    return NextResponse.json(
      { error: 'Falha ao registrar auditoria. Tente novamente.' },
      { status: 500 },
    )
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.delete(SESSION_COOKIE)
  return res
}
