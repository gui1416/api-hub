import { NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getUserAccess } from '@/lib/rbac'

export const runtime = 'nodejs'

// Conveniência de UX (ex: o command palette decidir quais itens
// administrativos mostrar) e heartbeat do session watcher — a garantia de
// segurança real é sempre o middleware/rota, nunca esconder item no client.
export async function GET(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const access = await getUserAccess(session.sub)
  if (!access || access.status === 'disabled') {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  return NextResponse.json({
    id: access.id,
    username: access.username,
    name: access.name,
    mustChangePassword: access.mustChangePassword,
    groups: access.groups,
    permissions: access.permissions,
    hubDocs: access.hubDocs,
  })
}
