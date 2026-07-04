CREATE TABLE "group_specs" (
	"group_id" uuid NOT NULL,
	"spec_slug" text NOT NULL,
	CONSTRAINT "group_specs_group_id_spec_slug_pk" PRIMARY KEY("group_id","spec_slug")
);
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "all_specs" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "name" text;--> statement-breakpoint
UPDATE "users" SET "name" = "username" WHERE "name" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "company" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "job_title" text;--> statement-breakpoint
ALTER TABLE "group_specs" ADD CONSTRAINT "group_specs_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_specs" ADD CONSTRAINT "group_specs_spec_slug_specs_slug_fk" FOREIGN KEY ("spec_slug") REFERENCES "public"."specs"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");--> statement-breakpoint
INSERT INTO "permissions" ("key", "name", "description") VALUES
	('specs.load', 'Carregar specs', 'Registrar novas especificações OpenAPI a partir de uma URL.'),
	('specs.delete', 'Remover specs', 'Remover especificações registradas.'),
	('proxy.use', 'Testar endpoints', 'Enviar requisições reais pelo "Testar endpoint" (proxy).');--> statement-breakpoint
INSERT INTO "group_permissions" ("group_id", "permission_id")
SELECT gp."group_id", p."id"
FROM "group_permissions" gp
JOIN "permissions" old ON old."id" = gp."permission_id" AND old."key" = 'specs.manage'
CROSS JOIN "permissions" p
WHERE p."key" IN ('specs.load', 'specs.delete')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "group_permissions" ("group_id", "permission_id")
SELECT gp."group_id", p."id"
FROM "group_permissions" gp
JOIN "permissions" dv ON dv."id" = gp."permission_id" AND dv."key" = 'docs.view'
JOIN "permissions" p ON p."key" = 'proxy.use'
ON CONFLICT DO NOTHING;--> statement-breakpoint
DELETE FROM "permissions" WHERE "key" = 'specs.manage';
