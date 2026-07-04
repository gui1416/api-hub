import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { hashPassword, generateTemporaryPassword } from '@/lib/passwords'
import { getRequestUser } from '@/lib/request-identity'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const requester = await getRequestUser(request)
  if (!requester) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!target) {
    return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
  }

  const temporaryPassword = generateTemporaryPassword()
  const passwordHash = await hashPassword(temporaryPassword)

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash, mustChangePassword: true, updatedAt: new Date() })
        .where(eq(users.id, target.id))
      await logAudit(
        {
          action: 'user.password_reset',
          actor: requester.username,
          status: 'success',
          metadata: { username: target.username },
          request,
        },
        tx,
      )
    })
  } catch {
    return NextResponse.json({ error: 'Falha ao resetar a senha.' }, { status: 500 })
  }

  // Única vez que a senha temporária existe em texto plano fora do hash.
  return NextResponse.json({ temporaryPassword })
}
