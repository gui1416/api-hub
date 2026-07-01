import { NextResponse } from 'next/server'
import { deleteSpec } from '@/lib/specs-store'

export const runtime = 'nodejs'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const removed = await deleteSpec(slug)

  if (!removed) {
    return NextResponse.json(
      { error: 'Especificação não encontrada.' },
      { status: 404 },
    )
  }

  return new NextResponse(null, { status: 204 })
}
