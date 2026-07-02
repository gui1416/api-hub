'use client'

import { CircleAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { parseOpenAPI } from '@/lib/openapi/parser'
import { apiHubSpec } from '@/lib/openapi/api-hub-spec'
import { extractSpecInfo } from '@/lib/openapi/spec-info'
import type { ParsedOperation } from '@/lib/openapi/types'
import { AiChatDialog } from './ai-chat-dialog'
import { EndpointView } from './endpoint-view'
import { Header } from './header'
import { Overview } from './overview'
import { Sidebar } from './sidebar'
import { SpecSwitcher } from './spec-switcher'

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
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [aiChatOpen, setAiChatOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSwitcherOpen((v) => !v)
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
        if (!sourceUrl) return
        e.preventDefault()
        setAiChatOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [sourceUrl])

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
          const message = data.error ?? 'Não foi possível carregar a especificação.'
          setLoadError(message)
          toast.error(message)
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
          const message = registerData.error ?? 'Não foi possível registrar a especificação.'
          setLoadError(message)
          toast.error(message)
          return
        }

        toast.success(`Spec "${title}" adicionada com sucesso.`)
        router.push(`/docs/${registerData.slug as string}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro de rede inesperado.'
        setLoadError(message)
        toast.error(message)
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
        loading={loading}
        onOpenSwitcher={() => setSwitcherOpen(true)}
        onToggleSidebar={() => setMobileNavOpen((v) => !v)}
        onHome={handleHome}
      />

      <SpecSwitcher
        open={switcherOpen}
        onOpenChange={setSwitcherOpen}
        sourceUrl={sourceUrl}
        loading={loading}
        onLoad={loadSpec}
        hasAiChat={sourceUrl !== null}
        onOpenAiChat={() => setAiChatOpen(true)}
      />

      {sourceUrl && (
        <AiChatDialog
          open={aiChatOpen}
          onOpenChange={setAiChatOpen}
          sourceUrl={sourceUrl}
          specTitle={spec.info.title ?? 'API'}
        />
      )}

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
            <EndpointView
              operation={selectedOperation}
              spec={spec}
              sourceUrl={sourceUrl}
            />
          ) : (
            <Overview spec={spec} onSelect={handleSelect} />
          )}
        </main>
      </div>
    </div>
  )
}
