import { DirectoryConsole } from '@/components/admin/directory-console'
import { loadDirectoryData } from '@/lib/admin/directory-data'

export const dynamic = 'force-dynamic'

export default async function AdminGroupsPage() {
  const data = await loadDirectoryData()
  return <DirectoryConsole data={data} initialContainer="groups" />
}
