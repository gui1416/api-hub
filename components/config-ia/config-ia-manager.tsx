'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, LoaderCircle, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { APP_TIMEZONE } from '@/lib/timezone'
import { ProviderUsageSheet } from './provider-usage-sheet'

export interface ConfigIaProvider {
  id: string
  label: string
  providerType: 'openai-compatible'
  baseUrl: string
  apiKeyLast4: string
  model: string
  priority: number
  enabled: boolean
  failureCount: number
  lastFailureAt: string | null
  cooldownUntil: string | null
  inCooldown: boolean
}

export interface ConfigIaStat {
  providerLabel: string
  avgLatencyMs: number
  count: number
}

interface EditableProvider {
  localKey: string
  id?: string
  label: string
  providerType: 'openai-compatible'
  baseUrl: string
  model: string
  priority: number
  enabled: boolean
  apiKey: string
  apiKeyLast4?: string
  cooldownUntil?: string | null
  inCooldown?: boolean
}

interface FormState {
  mode: 'add' | 'edit'
  localKey: string
  label: string
  baseUrl: string
  model: string
  apiKey: string
  enabled: boolean
}

const URL_PATTERN = /^https?:\/\//i

function toEditable(p: ConfigIaProvider): EditableProvider {
  return {
    localKey: p.id,
    id: p.id,
    label: p.label,
    providerType: p.providerType,
    baseUrl: p.baseUrl,
    model: p.model,
    priority: p.priority,
    enabled: p.enabled,
    apiKey: '',
    apiKeyLast4: p.apiKeyLast4,
    cooldownUntil: p.cooldownUntil,
    inCooldown: p.inCooldown,
  }
}

export function ConfigIaManager({
  initialProviders,
  stats,
}: {
  initialProviders: ConfigIaProvider[]
  stats: ConfigIaStat[]
}) {
  const router = useRouter()
  const [providers, setProviders] = useState<EditableProvider[]>(() =>
    initialProviders.map(toEditable).sort((a, b) => a.priority - b.priority),
  )
  const [formState, setFormState] = useState<FormState | null>(null)
  const [pendingRemove, setPendingRemove] = useState<EditableProvider | null>(null)
  const [saving, setSaving] = useState(false)
  // Relatório de uso (sheet lateral) — só pra providers já salvos (com id).
  const [usageProviderId, setUsageProviderId] = useState<string | null>(null)
  const [usageOpen, setUsageOpen] = useState(false)

  // router.refresh() re-runs the server component and passes fresh props
  // into this already-mounted client component (e.g. new ids for providers
  // that were just inserted, and real apiKeyLast4 values) — resync local
  // editable state from them instead of leaving stale pending-edit state.
  useEffect(() => {
    setProviders(initialProviders.map(toEditable).sort((a, b) => a.priority - b.priority))
  }, [initialProviders])

  const statsByLabel = useMemo(() => {
    const map = new Map<string, ConfigIaStat>()
    for (const s of stats) map.set(s.providerLabel, s)
    return map
  }, [stats])

  const sorted = useMemo(() => [...providers].sort((a, b) => a.priority - b.priority), [providers])

  const openAddForm = useCallback(() => {
    setFormState({
      mode: 'add',
      localKey: crypto.randomUUID(),
      label: '',
      baseUrl: '',
      model: '',
      apiKey: '',
      enabled: true,
    })
  }, [])

  const openEditForm = useCallback((p: EditableProvider) => {
    setFormState({
      mode: 'edit',
      localKey: p.localKey,
      label: p.label,
      baseUrl: p.baseUrl,
      model: p.model,
      apiKey: '',
      enabled: p.enabled,
    })
  }, [])

  const closeForm = useCallback(() => setFormState(null), [])

  const handleSubmitForm = useCallback(() => {
    if (!formState) return
    const label = formState.label.trim()
    const baseUrl = formState.baseUrl.trim()
    const model = formState.model.trim()

    if (!label || !baseUrl || !model) {
      toast.error('Preencha label, base URL e model.')
      return
    }
    if (!URL_PATTERN.test(baseUrl)) {
      toast.error('Base URL deve começar com http:// ou https://.')
      return
    }
    if (formState.mode === 'add' && !formState.apiKey.trim()) {
      toast.error('A API key é obrigatória para um novo provider.')
      return
    }

    if (formState.mode === 'add') {
      const nextPriority = providers.length > 0 ? Math.max(...providers.map((p) => p.priority)) + 1 : 1
      setProviders((prev) => [
        ...prev,
        {
          localKey: formState.localKey,
          label,
          providerType: 'openai-compatible',
          baseUrl,
          model,
          priority: nextPriority,
          enabled: formState.enabled,
          apiKey: formState.apiKey.trim(),
        },
      ])
    } else {
      setProviders((prev) =>
        prev.map((p) =>
          p.localKey === formState.localKey
            ? {
                ...p,
                label,
                baseUrl,
                model,
                enabled: formState.enabled,
                apiKey: formState.apiKey.trim() ? formState.apiKey.trim() : p.apiKey,
              }
            : p,
        ),
      )
    }
    setFormState(null)
  }, [formState, providers])

  const handleToggleEnabled = useCallback((localKey: string, enabled: boolean) => {
    setProviders((prev) => prev.map((p) => (p.localKey === localKey ? { ...p, enabled } : p)))
  }, [])

  const handleMove = useCallback((localKey: string, direction: 'up' | 'down') => {
    setProviders((prev) => {
      const list = [...prev].sort((a, b) => a.priority - b.priority)
      const index = list.findIndex((p) => p.localKey === localKey)
      const swapWith = direction === 'up' ? index - 1 : index + 1
      if (index === -1 || swapWith < 0 || swapWith >= list.length) return prev
      const a = list[index]
      const b = list[swapWith]
      const priorityA = a.priority
      const priorityB = b.priority
      return prev.map((p) => {
        if (p.localKey === a.localKey) return { ...p, priority: priorityB }
        if (p.localKey === b.localKey) return { ...p, priority: priorityA }
        return p
      })
    })
  }, [])

  const handleConfirmRemove = useCallback(() => {
    if (!pendingRemove) return
    setProviders((prev) => prev.filter((p) => p.localKey !== pendingRemove.localKey))
    setPendingRemove(null)
  }, [pendingRemove])

  const handleSave = useCallback(async () => {
    for (const p of providers) {
      if (!p.label.trim() || !p.baseUrl.trim() || !p.model.trim()) {
        toast.error(`Provider "${p.label || 'sem nome'}" tem campos obrigatórios vazios.`)
        return
      }
      if (!URL_PATTERN.test(p.baseUrl.trim())) {
        toast.error(`Base URL de "${p.label}" deve começar com http:// ou https://.`)
        return
      }
      if (!p.id && !p.apiKey.trim()) {
        toast.error(`Provider "${p.label}" precisa de uma API key.`)
        return
      }
    }

    setSaving(true)
    try {
      const payload = {
        providers: providers.map((p) => {
          const item: Record<string, unknown> = {
            label: p.label.trim(),
            providerType: p.providerType,
            baseUrl: p.baseUrl.trim(),
            model: p.model.trim(),
            priority: p.priority,
            enabled: p.enabled,
          }
          if (p.id) item.id = p.id
          if (p.apiKey.trim()) item.apiKey = p.apiKey.trim()
          return item
        }),
      }

      const res = await fetch('/api/config-ia', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Falha ao salvar a configuração de IA.')
        return
      }
      toast.success('Configuração de IA salva com sucesso.')
      router.refresh()
    } catch {
      toast.error('Erro de rede ao salvar a configuração de IA.')
    } finally {
      setSaving(false)
    }
  }, [providers, router])

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 xl:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-heading text-xl font-semibold text-foreground">Configuração de IA</h1>
          <p className="text-sm text-muted-foreground">
            Providers usados pelo assistente de chat sobre a documentação, em ordem de prioridade.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={openAddForm}>
            <Plus className="size-4" />
            Adicionar provider
          </Button>
          <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving}>
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : null}
            Salvar alterações
          </Button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhum provider de IA cadastrado ainda. Adicione um para habilitar o chat sobre a documentação.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((p, index) => {
            const stat = statsByLabel.get(p.label)
            return (
              <li
                key={p.localKey}
                className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center"
              >
                <div className="flex shrink-0 flex-row gap-1 sm:flex-col">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label="Mover para cima"
                    disabled={index === 0}
                    onClick={() => handleMove(p.localKey, 'up')}
                  >
                    <ChevronUp className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label="Mover para baixo"
                    disabled={index === sorted.length - 1}
                    onClick={() => handleMove(p.localKey, 'down')}
                  >
                    <ChevronDown className="size-3.5" />
                  </Button>
                </div>

                <button
                  type="button"
                  disabled={!p.id}
                  onClick={() => {
                    if (!p.id) return
                    setUsageProviderId(p.id)
                    setUsageOpen(true)
                  }}
                  title={p.id ? 'Ver relatório de uso' : 'Salve o provider para ver o relatório de uso'}
                  className="min-w-0 flex-1 rounded-md text-left transition-colors enabled:cursor-pointer enabled:hover:bg-muted/40"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-foreground">{p.label}</span>
                    <Badge variant="outline">{p.providerType}</Badge>
                    {!p.enabled && <Badge variant="secondary">Desabilitado</Badge>}
                    {p.inCooldown && (
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      >
                        Em cooldown até{' '}
                        {p.cooldownUntil
                          ? new Date(p.cooldownUntil).toLocaleTimeString('pt-BR', {
                              timeZone: APP_TIMEZONE,
                            })
                          : '—'}
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.baseUrl} · {p.model}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Chave: {p.apiKeyLast4 ? `••••${p.apiKeyLast4}` : '(nova, ainda não salva)'}
                    {stat && (
                      <>
                        {' · '}
                        {stat.avgLatencyMs}ms médios · {stat.count} respostas
                      </>
                    )}
                  </p>
                </button>

                <div className="flex shrink-0 items-center gap-2">
                  <Switch
                    checked={p.enabled}
                    onCheckedChange={(checked) => handleToggleEnabled(p.localKey, checked)}
                    aria-label={p.enabled ? 'Desabilitar provider' : 'Habilitar provider'}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Editar ${p.label}`}
                    onClick={() => openEditForm(p)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remover ${p.label}`}
                    onClick={() => setPendingRemove(p)}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={formState !== null} onOpenChange={(next) => !next && closeForm()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{formState?.mode === 'add' ? 'Adicionar provider' : 'Editar provider'}</DialogTitle>
            <DialogDescription>
              Provider compatível com a API da OpenAI (base URL + model + API key).
            </DialogDescription>
          </DialogHeader>

          {formState && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="provider-label">Label</Label>
                <Input
                  id="provider-label"
                  value={formState.label}
                  onChange={(e) => setFormState({ ...formState, label: e.target.value })}
                  placeholder="Ex: Groq (Llama 3.3)"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="provider-base-url">Base URL</Label>
                <Input
                  id="provider-base-url"
                  value={formState.baseUrl}
                  onChange={(e) => setFormState({ ...formState, baseUrl: e.target.value })}
                  placeholder="https://api.groq.com/openai/v1"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="provider-model">Model</Label>
                <Input
                  id="provider-model"
                  value={formState.model}
                  onChange={(e) => setFormState({ ...formState, model: e.target.value })}
                  placeholder="llama-3.3-70b-versatile"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="provider-api-key">API key</Label>
                <Input
                  id="provider-api-key"
                  type="password"
                  value={formState.apiKey}
                  onChange={(e) => setFormState({ ...formState, apiKey: e.target.value })}
                  placeholder={formState.mode === 'edit' ? 'Deixe em branco para manter a chave atual' : ''}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formState.enabled}
                  onCheckedChange={(checked) => setFormState({ ...formState, enabled: checked })}
                  id="provider-enabled"
                />
                <Label htmlFor="provider-enabled">Habilitado</Label>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeForm}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSubmitForm}>
              {formState?.mode === 'add' ? 'Adicionar' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingRemove !== null}
        onOpenChange={(next) => {
          if (!next) setPendingRemove(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover provider?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso remove &quot;{pendingRemove?.label}&quot; da lista local. A remoção só é efetivada ao
              clicar em &quot;Salvar alterações&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmRemove}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProviderUsageSheet
        providerId={usageProviderId}
        open={usageOpen}
        onOpenChange={setUsageOpen}
      />
    </div>
  )
}
