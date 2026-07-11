CREATE TABLE "menu_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"price" numeric,
	"available_on" date,
	"embedding" vector(1024)
);
--> statement-breakpoint
CREATE INDEX "embedding_idx" ON "menu_items" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "available_on_idx" ON "menu_items" USING btree ("available_on");