import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ApiHub } from '@/components/api-hub/api-hub'
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

  // ACL por spec: 404 (e não 403) pra não vazar a existência de specs fora
  // dos grupos do usuário. O x-user-id vem do middleware (não spoofável).
  const userId = (await headers()).get('x-user-id')
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
  await saveSpec({ sourceUrl: record.sourceUrl, title, description, version })

  return (
    <ApiHub
      key={slug}
      initialRawSpec={rawSpec}
      initialSourceUrl={record.sourceUrl}
    />
  )
}
