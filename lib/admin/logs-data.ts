import { and, desc, eq, gte, ilike, lte, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { auditLogs } from '@/lib/db/schema'

export interface AuditLogFilters {
  action?: string
  actor?: string
  status?: 'success' | 'failure'
  /** Data inicial (yyyy-mm-dd), inclusive, no fuso local do servidor. */
  from?: string
  /** Data final (yyyy-mm-dd), inclusive. */
  to?: string
  page: number
  pageSize: number
}

export interface AuditLogRow {
  id: string
  action: string
  actor: string
  status: string
  metadata: unknown
  ip: string | null
  userAgent: string | null
  createdAt: string
}

export interface AuditLogPage {
  rows: AuditLogRow[]
  total: number
  /** Ações distintas já registradas, pro filtro — independe da paginação/filtros atuais. */
  actions: string[]
}

function buildWhere(filters: AuditLogFilters): SQL | undefined {
  const conditions: SQL[] = []
  if (filters.action) conditions.push(eq(auditLogs.action, filters.action))
  if (filters.actor) conditions.push(ilike(auditLogs.actor, `%${filters.actor}%`))
  if (filters.status) conditions.push(eq(auditLogs.status, filters.status))
  if (filters.from) conditions.push(gte(auditLogs.createdAt, new Date(`${filters.from}T00:00:00`)))
  if (filters.to) conditions.push(lte(auditLogs.createdAt, new Date(`${filters.to}T23:59:59.999`)))
  return conditions.length > 0 ? and(...conditions) : undefined
}

/**
 * Consulta paginada dos logs de auditoria pra tela /admin/logs. Diferente do
 * console de diretório (usuários/grupos), aqui a filtragem e paginação
 * acontecem no banco — audit_logs cresce sem limite prático (retenção de 1
 * ano, ver README) e não cabe carregar tudo de uma vez no client.
 */
export async function loadAuditLogs(filters: AuditLogFilters): Promise<AuditLogPage> {
  const where = buildWhere(filters)

  const [rows, totalRows, actionRows] = await Promise.all([
    db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(auditLogs).where(where),
    db.selectDistinct({ action: auditLogs.action }).from(auditLogs).orderBy(auditLogs.action),
  ])

  return {
    rows: rows.map((row) => ({
      id: row.id,
      action: row.action,
      actor: row.actor,
      status: row.status,
      metadata: row.metadata,
      ip: row.ip,
      userAgent: row.userAgent,
      createdAt: row.createdAt.toISOString(),
    })),
    total: totalRows[0]?.count ?? 0,
    actions: actionRows.map((row) => row.action),
  }
}
