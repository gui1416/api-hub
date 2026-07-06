-- Nova permissão da tela de auditoria (/admin/logs). Concedida diretamente ao
-- grupo de sistema "Administradores" (mesmo padrão da seed original em
-- 0003_complex_titania.sql).
INSERT INTO "permissions" ("key", "name", "description") VALUES
	('admin.logs', 'Logs de auditoria', 'Acesso à tela de consulta dos logs de auditoria (login, specs, proxy, admin).');--> statement-breakpoint
INSERT INTO "group_permissions" ("group_id", "permission_id")
SELECT g."id", p."id" FROM "groups" g CROSS JOIN "permissions" p
WHERE g."name" = 'Administradores' AND p."key" = 'admin.logs'
ON CONFLICT DO NOTHING;
