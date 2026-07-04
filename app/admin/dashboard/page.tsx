import { UsageDashboard } from '@/components/admin/usage-dashboard'

export default function AdminDashboardPage() {
  // Os dados são buscados no client via /api/admin/dashboard/usage — o range
  // é interativo (24h/7d/30d) e não vale a pena duplicar a agregação aqui.
  return <UsageDashboard />
}
