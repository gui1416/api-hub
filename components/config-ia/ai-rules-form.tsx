'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

// Regras globais que entram no systemPrompt de toda conversa do assistente,
// entre o texto-base fixo e o contexto derivado do usuário.
export function AiRulesForm({ initialRules }: { initialRules: string | null }) {
  const [rules, setRules] = useState(initialRules ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/config-ia/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPromptRules: rules.trim() || null }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error ?? 'Não foi possível salvar as regras.')
        return
      }
      toast.success('Regras da IA salvas.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mx-auto max-w-4xl px-4 pb-10 xl:px-6">
      <div className="rounded-lg border border-border p-4">
        <div className="mb-3">
          <h2 className="font-heading text-base font-semibold text-foreground">
            Regras e limitações da IA
          </h2>
          <p className="text-sm text-muted-foreground">
            Instruções globais aplicadas a toda conversa do assistente, junto do
            contexto do usuário (nome, grupos e permissões) e do resumo da spec.
          </p>
        </div>
        <Label htmlFor="ai-rules" className="sr-only">
          Regras da IA
        </Label>
        <Textarea
          id="ai-rules"
          value={rules}
          onChange={(e) => setRules(e.target.value)}
          rows={6}
          placeholder="Ex: Nunca inclua chaves ou tokens reais em exemplos. Responda sempre em português…"
        />
        <div className="mt-3 flex justify-end">
          <Button type="button" size="sm" disabled={saving} onClick={() => void handleSave()}>
            {saving && <LoaderCircle className="size-4 animate-spin" />}
            Salvar regras
          </Button>
        </div>
      </div>
    </section>
  )
}
