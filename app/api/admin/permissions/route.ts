import { asc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { permissions } from '@/lib/db/schema'
import { slugify } from '@/lib/slug'
import { getRequestUser } from '@/lib/request-identity'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const requester = await getRequestUser(request)
  if (!requester) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const rows = await db.select().from(permissions).orderBy(asc(permissions.key))
  return NextResponse.json({
    permissions: rows.map((permission) => ({
      id: permission.id,
      key: permission.key,
      name: permission.name,
      description: permission.description,
    })),
  })
}

export async function POST(request: Request) {
  const requester = await getRequestUser(request)
  if (!requester) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  let payload: { name?: string; description?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  const name = payload.name?.trim()
  if (!name) {
    return NextResponse.json({ error: 'O campo "name" é obrigatório.' }, { status: 400 })
  }

  const key = slugify(name)
  if (!key) {
    return NextResponse.json({ error: 'Nome inválido para gerar a chave.' }, { status: 400 })
  }

  const [duplicate] = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(eq(permissions.key, key))
    .limit(1)
  if (duplicate) {
    return NextResponse.json(
      { error: `Já existe uma permissão com a chave "${key}".` },
      { status: 409 },
    )
  }

  try {
    const created = await db.transaction(async (tx) => {
      const [permission] = await tx
        .insert(permissions)
        .values({ key, name, description: payload.description?.trim() || null })
        .returning()
      await logAudit(
        {
          action: 'permission.created',
          actor: requester.username,
          status: 'success',
          metadata: { key, name },
          request,
        },
        tx,
      )
      return permission
    })
    return NextResponse.json(
      {
        id: created.id,
        key: created.key,
        name: created.name,
        description: created.description,
      },
      { status: 201 },
    )
  } catch {
    return NextResponse.json({ error: 'Falha ao criar a permissão.' }, { status: 500 })
  }
}
