import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ApiHub } from '@/components/api-hub/api-hub'
import { canAccessHubDocs } from '@/lib/spec-access'

// Doc padrão do hub — aparece no command palette como uma spec ("Documentação
// do API Hub") e participa da ACL por spec como pseudo-spec (groups.hubDocs).
export default async function DocsPage() {
  // 404 (não 403) pra manter o mesmo comportamento do /docs/[slug] fora da
  // ACL. O x-user-id vem do middleware (não spoofável).
  const userId = (await headers()).get('x-user-id')
  if (!userId || !(await canAccessHubDocs(userId))) notFound()

  return <ApiHub key="default" />
}
