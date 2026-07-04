'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'

export interface Me {
  id: string
  username: string
  name?: string
  mustChangePassword: boolean
  groups: string[]
  permissions: string[]
  /** ACL da doc padrão do hub (/docs) — espelha UserAccess.hubDocs. */
  hubDocs: boolean
}

interface SessionContextValue {
  me: Me | null
  loading: boolean
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue>({
  me: null,
  loading: true,
  refresh: async () => {},
})

export function useSession() {
  return useContext(SessionContext)
}

// Rotas públicas onde não há sessão pra observar.
const PUBLIC_PATHS = ['/login']

// Logout forçado: além do middleware derrubar a próxima request de quem foi
// desativado/removido, este watcher consulta /api/me periodicamente e chuta
// a sessão morta pro /login sem esperar o usuário navegar.
const POLL_INTERVAL_MS = 45_000

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )
  // Evita redirecionar duas vezes se o poll e uma navegação 401 coincidirem.
  const kicked = useRef(false)

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch('/api/me', { cache: 'no-store' })
      if (res.status === 401) {
        setMe(null)
        if (!kicked.current) {
          kicked.current = true
          router.replace('/login')
          router.refresh()
        }
        return
      }
      if (res.status === 403) {
        const data = await res.json().catch(() => null)
        if (data?.code === 'must_change_password' && pathname !== '/change-password') {
          router.replace('/change-password')
        }
        return
      }
      if (!res.ok) return
      kicked.current = false
      setMe((await res.json()) as Me)
    } catch {
      // Rede fora: mantém o estado atual, o próximo poll tenta de novo.
    } finally {
      setLoading(false)
    }
  }, [router, pathname])

  useEffect(() => {
    if (isPublic) return
    kicked.current = false
    void fetchMe()
    const interval = setInterval(() => void fetchMe(), POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [isPublic, fetchMe])

  return (
    <SessionContext.Provider
      value={{ me, loading: isPublic ? false : loading, refresh: fetchMe }}
    >
      {children}
    </SessionContext.Provider>
  )
}
