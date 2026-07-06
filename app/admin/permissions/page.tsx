import { DirectoryConsole } from '@/components/admin/directory-console'
import { loadDirectoryData } from '@/lib/admin/directory-data'

// Página lê do banco a cada acesso — sem prerender estático (dados de
// usuários mudam em runtime).
export const dynamic = 'force-dynamic'

export default async function AdminPermissionsPage() {
  const data = await loadDirectoryData()
  return <DirectoryConsole data={data} initialContainer="permissions" />
}
