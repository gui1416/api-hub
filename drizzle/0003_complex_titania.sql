CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TABLE "ai_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"system_prompt_rules" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_permissions" (
	"group_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "group_permissions_group_id_permission_id_pk" PRIMARY KEY("group_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "user_groups" (
	"user_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "user_groups_user_id_group_id_pk" PRIMARY KEY("user_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"last_logout_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
DROP INDEX "ai_conversations_spec_idx";--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "group_permissions" ADD CONSTRAINT "group_permissions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_permissions" ADD CONSTRAINT "group_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_conversations_spec_idx" ON "ai_conversations" USING btree ("spec_source_url","user_id","updated_at");--> statement-breakpoint
INSERT INTO "permissions" ("key", "name", "description") VALUES
	('admin.users', 'Gestão de usuários', 'Acesso à tela de gestão de usuários (criar, ativar/desativar, resetar senha, remover).'),
	('admin.groups', 'Grupos e permissões', 'Acesso à tela de gestão de grupos e do catálogo de permissões.'),
	('admin.ai', 'Gestão de IA', 'Acesso à configuração de providers de IA e das regras globais do assistente.'),
	('admin.dashboard', 'Dashboard de uso', 'Acesso ao dashboard de uso de tokens de IA.'),
	('specs.manage', 'Gerenciar specs', 'Registrar, atualizar e remover especificações OpenAPI.'),
	('docs.view', 'Ver documentação', 'Navegar pela documentação das APIs registradas.'),
	('chat.use', 'Usar chat de IA', 'Conversar com o assistente de IA sobre as specs.');--> statement-breakpoint
INSERT INTO "groups" ("name", "description", "is_system") VALUES
	('Administradores', 'Acesso completo, incluindo as áreas administrativas.', true),
	('Usuários', 'Acesso padrão: documentação e chat de IA.', true);--> statement-breakpoint
INSERT INTO "group_permissions" ("group_id", "permission_id")
SELECT g."id", p."id" FROM "groups" g CROSS JOIN "permissions" p WHERE g."name" = 'Administradores';--> statement-breakpoint
INSERT INTO "group_permissions" ("group_id", "permission_id")
SELECT g."id", p."id" FROM "groups" g JOIN "permissions" p ON p."key" IN ('docs.view', 'chat.use') WHERE g."name" = 'Usuários';--> statement-breakpoint
INSERT INTO "ai_settings" ("id", "system_prompt_rules") VALUES (1, NULL);
