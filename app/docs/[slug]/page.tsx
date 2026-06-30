import { notFound } from 'next/navigation'
import { ApiHub } from '@/components/api-hub/api-hub'
import { fetchSpec } from '@/lib/openapi/fetch-spec'
import { extractSpecInfo } from '@/lib/openapi/spec-info'
import { getSpec, saveSpec } from '@/lib/specs-store'

export default async function DocsSpecPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const record = await getSpec(slug)
  if (!record) notFound()

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
