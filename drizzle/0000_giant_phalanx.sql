CREATE TABLE "specs" (
	"slug" text PRIMARY KEY NOT NULL,
	"source_url" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "specs_source_url_unique" UNIQUE("source_url")
);
