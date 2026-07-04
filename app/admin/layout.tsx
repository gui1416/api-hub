import { AppHeader } from '@/components/app-shell/app-header'

// Todas as telas administrativas compartilham o header global (marca, ⌘K,
// tema, logout) — cada página cuida só do próprio conteúdo.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <AppHeader title="Administração" />
      <main className="flex-1">{children}</main>
    </div>
  )
}
