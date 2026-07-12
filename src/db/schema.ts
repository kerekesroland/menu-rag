import {
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  vector,
} from 'drizzle-orm/pg-core';

export const MenuCategory = pgEnum('menu_category', [
  'DIET',
  'SPORT',
  'NORMAL',
  'KIDS',
  'SOUP',
]);

export const menuItems = pgTable(
  'menu_items',
  {
    id: serial('id').primaryKey(),

    externalId: text('external_id').notNull().unique(),

    name: text('name').notNull(),

    description: text('description'),

    category: text('category').notNull(),

    price: numeric('price'),

    // per portion, parsed from the e-food nutrition tooltip
    energyKcal: numeric('energy_kcal'),
    fatG: numeric('fat_g'),
    saturatedFatG: numeric('saturated_fat_g'),
    carbsG: numeric('carbs_g'),
    sugarG: numeric('sugar_g'),
    proteinG: numeric('protein_g'),
    saltG: numeric('salt_g'),

    embedding: vector('embedding', { dimensions: 1024 }),
  },
  (table) => [
    index('embedding_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
  ],
);

// canonical allergen names (EU 14 list where possible)
export const allergens = pgTable('allergens', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
});

export const menuItemAllergens = pgTable(
  'menu_item_allergens',
  {
    menuItemId: integer('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    allergenId: integer('allergen_id')
      .notNull()
      .references(() => allergens.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.menuItemId, table.allergenId] })],
);

export type TMenuItem = typeof menuItems.$inferSelect;
export type NewMenuItem = typeof menuItems.$inferInsert;
export type TAllergen = typeof allergens.$inferSelect;
