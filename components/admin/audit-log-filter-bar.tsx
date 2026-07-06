'use client'

import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-[13px] text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

export function AuditLogFilterBar({
  actions,
  action,
  actor,
  status,
  from,
  to,
}: {
  actions: string[]
  action: string
  actor: string
  status: string
  from: string
  to: string
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const hasFilters = action !== 'all' || status !== 'all' || actor !== '' || from !== '' || to !== ''

  return (
    <form ref={formRef} method="GET" className="mb-4 flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label htmlFor="log-actor" className="text-[11px] font-medium text-muted-foreground">
          Ator
        </label>
        <Input
          id="log-actor"
          name="actor"
          defaultValue={actor}
          placeholder="usuário ou anonymous"
          className="h-8 w-44 text-[13px]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="log-action" className="text-[11px] font-medium text-muted-foreground">
          Ação
        </label>
        <Select
          name="action"
          defaultValue={action}
          onValueChange={() => formRef.current?.requestSubmit()}
        >
          <SelectTrigger id="log-action" size="sm" className="w-48 text-[13px]">
            <SelectValue>{(value: string) => (value === 'all' ? 'Todas as ações' : value)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ações</SelectItem>
            {actions.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="log-status" className="text-[11px] font-medium text-muted-foreground">
          Status
        </label>
        <Select
          name="status"
          defaultValue={status}
          onValueChange={() => formRef.current?.requestSubmit()}
        >
          <SelectTrigger id="log-status" size="sm" className="text-[13px]">
            <SelectValue>
              {(value: string) =>
                value === 'success' ? 'Sucesso' : value === 'failure' ? 'Falha' : 'Todos'
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="success">Sucesso</SelectItem>
            <SelectItem value="failure">Falha</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="log-from" className="text-[11px] font-medium text-muted-foreground">
          De
        </label>
        <input
          id="log-from"
          type="date"
          name="from"
          defaultValue={from}
          onChange={() => formRef.current?.requestSubmit()}
          className={selectClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="log-to" className="text-[11px] font-medium text-muted-foreground">
          Até
        </label>
        <input
          id="log-to"
          type="date"
          name="to"
          defaultValue={to}
          onChange={() => formRef.current?.requestSubmit()}
          className={selectClass}
        />
      </div>
      <Button type="submit" size="sm">
        Filtrar
      </Button>
      {hasFilters && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={() => {
            window.location.href = '/admin/logs'
          }}
        >
          Limpar filtros
        </Button>
      )}
    </form>
  )
}
