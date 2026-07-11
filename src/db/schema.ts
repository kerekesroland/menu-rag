import {
  index,
  numeric,
  pgEnum,
  pgTable,
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

    embedding: vector('embedding', { dimensions: 1024 }),
  },
  (table) => [
    index('embedding_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
  ],
);

export type TMenuItem = typeof menuItems.$inferSelect;
export type NewMenuItem = typeof menuItems.$inferInsert;
