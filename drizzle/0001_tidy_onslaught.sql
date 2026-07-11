DROP INDEX "available_on_idx";--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "external_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_items" DROP COLUMN "available_on";--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_external_id_unique" UNIQUE("external_id");