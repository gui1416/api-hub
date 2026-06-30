'use client'

import { CircleAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { parseOpenAPI } from '@/lib/openapi/parser'
import { apiHubSpec } from '@/lib/openapi/api-hub-spec'
import { extractSpecInfo } from '@/lib/openapi/spec-info'
import type { ParsedOperation } from '@/lib/openapi/types'
import { EndpointView } from './endpoint-view'
import { Header } from './header'
import { Overview } from './overview'
import { Sidebar } from './sidebar'

export function ApiHub({
  initialRawSpec,
  initialSourceUrl,
}: {
  initialRawSpec?: Record<string, unknown>
  initialSourceUrl?: string | null
} = {}) {
  const rawSpec = initialRawSpec ?? apiHubSpec
  const sourceUrl = initialSourceUrl ?? null
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const router = useRouter()

  const spec = useMemo(() => parseOpenAPI(rawSpec), [rawSpec])

  const selectedOperation = useMemo(
    () => spec.operations.find((op) => op.id === selectedId) ?? null,
    [spec.operations, selectedId],
  )

  const handleSelect = useCallback((op: ParsedOperation) => {
    setSelectedId(op.id)
    setMobileNavOpen(false)
    const main = document.getElementById('apihub-content')
    if (main) main.scrollTo({ top: 0 })
  }, [])

  const handleHome = useCallback(() => {
    setSelectedId(null)
    setMobileNavOpen(false)
  }, [])

  const loadSpec = useCallback(
    async (url: string) => {
      setLoading(true)
      setLoadError(null)
      try {
        const res = await fetch(`/api/spec?url=${encodeURIComponent(url)}`)
        const data = await res.json()
        if (!res.ok) {
          setLoadError(
            data.error ?? 'Não foi possível carregar a especificação.',
          )
          return
        }

        const fetchedSpec = data.spec as Record<string, unknown>
        const { title, description, version } = extractSpecInfo(fetchedSpec, url)

        const registerRes = await fetch('/api/specs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceUrl: url, title, description, version }),
        })
        const registerData = await registerRes.json()
        if (!registerRes.ok) {
          setLoadError(
            registerData.error ?? 'Não foi possível registrar a especificação.',
          )
          return
        }

        router.push(`/docs/${registerData.slug as string}`)
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : 'Erro de rede inesperado.',
        )
      } finally {
        setLoading(false)
      }
    },
    [router],
  )

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <Header
        title={spec.info.title ?? 'Documentação'}
        sourceUrl={sourceUrl}
        loading={loading}
        onLoad={loadSpec}
        onToggleSidebar={() => setMobileNavOpen((v) => !v)}
      />

      {loadError && (
        <div className="flex items-center gap-2 border-b border-method-delete/30 bg-method-delete/10 px-4 py-2 text-[13px] text-method-delete xl:px-6">
          <CircleAlert className="size-4 shrink-0" />
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => setLoadError(null)}
            className="ml-auto text-xs underline-offset-2 hover:underline"
          >
            Dispensar
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden w-72 shrink-0 border-r border-border lg:block">
          <Sidebar
            spec={spec}
            selectedId={selectedId}
            onSelect={handleSelect}
            onHome={handleHome}
          />
        </aside>

        {/* Mobile drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-background/70 backdrop-blur-sm"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="absolute left-0 top-0 h-full w-72 border-r border-border bg-sidebar shadow-xl">
              <Sidebar
                spec={spec}
                selectedId={selectedId}
                onSelect={handleSelect}
                onHome={handleHome}
              />
            </aside>
          </div>
        )}

        <main
          id="apihub-content"
          className={cn('scrollbar-thin min-w-0 flex-1 overflow-y-auto')}
        >
          {selectedOperation ? (
            <EndpointView operation={selectedOperation} spec={spec} />
          ) : (
            <Overview spec={spec} onSelect={handleSelect} />
          )}
        </main>
      </div>
    </div>
  )
}
