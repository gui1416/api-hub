'use client'

import { Boxes, CircleAlert, LoaderCircle } from 'lucide-react'
import { useState } from 'react'

const inputClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setError('A confirmação não confere com a nova senha.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível trocar a senha.')
        return
      }
      // Navegação client-side (router.push) pode servir um redirect antigo
      // cacheado de quando '/' ainda mandava pra cá (mustChangePassword
      // true) — força um load completo pra garantir a saída do gate.
      window.location.href = '/'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro de rede inesperado.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-brand text-brand-foreground">
            <Boxes className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              Definir nova senha
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sua senha atual é temporária — escolha uma nova para continuar.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-foreground">Senha atual</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
              autoComplete="current-password"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-foreground">Nova senha</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-foreground">Confirmar nova senha</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-method-delete/30 bg-method-delete/10 px-3 py-2 text-[13px] text-method-delete">
              <CircleAlert className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {loading && <LoaderCircle className="size-4 animate-spin" />}
            Salvar nova senha
          </button>
        </form>
      </div>
    </div>
  )
}
