'use client'

import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useSession } from '@/components/session-provider'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function NavUser() {
  const router = useRouter()
  const { me } = useSession()
  const [loading, setLoading] = useState(false)

  async function logout() {
    setLoading(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  const displayName = me?.name || me?.username || ''
  const initials = displayName.slice(0, 2).toUpperCase() || '?'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Conta"
        className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-brand-foreground">
          {initials}
        </span>
        <span className="hidden max-w-[120px] truncate sm:inline">{displayName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="flex flex-col gap-0.5 px-1.5 py-1">
          <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
          {me?.name && (
            <span className="truncate text-xs text-muted-foreground">@{me.username}</span>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={loading} onClick={() => void logout()}>
          <LogOut className="size-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
