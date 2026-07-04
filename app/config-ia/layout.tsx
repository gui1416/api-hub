import { AppHeader } from '@/components/app-shell/app-header'

export default function ConfigIaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <AppHeader title="Gestão de IA" />
      <main className="flex-1">{children}</main>
    </div>
  )
}
