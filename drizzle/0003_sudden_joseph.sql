CREATE TABLE "allergens" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "allergens_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "menu_item_allergens" (
	"menu_item_id" integer NOT NULL,
	"allergen_id" integer NOT NULL,
	CONSTRAINT "menu_item_allergens_menu_item_id_allergen_id_pk" PRIMARY KEY("menu_item_id","allergen_id")
);
--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "energy_kcal" numeric;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "fat_g" numeric;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "saturated_fat_g" numeric;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "carbs_g" numeric;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "sugar_g" numeric;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "protein_g" numeric;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "salt_g" numeric;--> statement-breakpoint
ALTER TABLE "menu_item_allergens" ADD CONSTRAINT "menu_item_allergens_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_allergens" ADD CONSTRAINT "menu_item_allergens_allergen_id_allergens_id_fk" FOREIGN KEY ("allergen_id") REFERENCES "public"."allergens"("id") ON DELETE cascade ON UPDATE no action;