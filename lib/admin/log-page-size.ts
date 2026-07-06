// Constantes puras (sem 'use client') compartilhadas entre a página server
// /admin/logs e o componente client AuditLogPageSize — exportar isso de um
// módulo 'use client' quebra em RSC (o valor vira uma referência opaca do
// lado do servidor, não o array de verdade).
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const
export const DEFAULT_PAGE_SIZE: (typeof PAGE_SIZE_OPTIONS)[number] = 50
