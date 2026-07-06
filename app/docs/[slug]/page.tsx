import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ApiHub } from '@/components/api-hub/api-hub'
import { logAudit } from '@/lib/audit'
import { fetchSpec } from '@/lib/openapi/fetch-spec'
import { extractSpecInfo } from '@/lib/openapi/spec-info'
import { canAccessSpec } from '@/lib/spec-access'
import { getSpec, saveSpec } from '@/lib/specs-store'

export default async function DocsSpecPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const record = await getSpec(slug)
  if (!record) notFound()

  const headerList = await headers()

  // ACL por spec: 404 (e não 403) pra não vazar a existência de specs fora
  // dos grupos do usuário. O x-user-id vem do middleware (não spoofável).
  const userId = headerList.get('x-user-id')
  if (!userId || !(await canAccessSpec(userId, slug))) notFound()

  let rawSpec: Record<string, unknown>
  try {
    rawSpec = await fetchSpec(record.sourceUrl)
  } catch {
    notFound()
  }

  // Every time the docs are (re)generated from the source URL, sync the
  // stored title/description/version in case the upstream spec changed.
  const { title, description, version } = extractSpecInfo(rawSpec, record.title)
  const { event } = await saveSpec({ sourceUrl: record.sourceUrl, title, description, version })
  // Diferente do load explícito (POST /api/specs), esse resync é passivo —
  // sem ele, a metadata da spec podia mudar sem nenhum rastro de quando/por
  // quem a página foi acessada.
  if (event === 'updated') {
    const userName = headerList.get('x-user-name')
    try {
      // Best-effort: diferente de uma mutação explícita, uma falha aqui não
      // deve derrubar a página só por causa de um resync passivo de metadata.
      await logAudit({
        action: 'spec.updated',
        actor: userName ? decodeURIComponent(userName) : 'anonymous',
        status: 'success',
        metadata: { slug, sourceUrl: record.sourceUrl, trigger: 'passive_resync' },
        request: { headers: headerList },
      })
    } catch {
      // logAudit já loga o erro no console; a página segue normalmente.
    }
  }

  return (
    <ApiHub
      key={slug}
      initialRawSpec={rawSpec}
      initialSourceUrl={record.sourceUrl}
    />
  )
}
