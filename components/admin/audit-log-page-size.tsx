'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PAGE_SIZE_OPTIONS } from '@/lib/admin/log-page-size'

export function AuditLogPageSize({ pageSize }: { pageSize: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return (
    <Select
      value={String(pageSize)}
      onValueChange={(value) => {
        if (!value) return
        const params = new URLSearchParams(searchParams.toString())
        params.set('pageSize', value)
        params.delete('page')
        router.push(`${pathname}?${params.toString()}`)
      }}
    >
      <SelectTrigger size="sm" className="text-xs">
        <SelectValue>{(value: string) => `${value} / página`}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {PAGE_SIZE_OPTIONS.map((size) => (
          <SelectItem key={size} value={String(size)}>
            {size} / página
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
