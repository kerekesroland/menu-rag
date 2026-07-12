import { Injectable } from '@nestjs/common';
import { inArray, sql } from 'drizzle-orm';
import { DbService } from 'src/db/db.service';
import { allergens, menuItemAllergens, menuItems } from 'src/db/schema';
import { EmbeddingService } from './embedding/embedding.service';
import {
  EfoodScraperService,
  ScrapedMenuItem,
} from './scraper/scrape-efood.service';
import { RagService } from './rag/rag.service';
import { normalizeAllergens } from './allergens.util';

@Injectable()
export class MenuService {
  constructor(
    private readonly dbService: DbService,
    private readonly scraper: EfoodScraperService,
    private readonly embeddings: EmbeddingService,
    private readonly ragService: RagService,
  ) {}

  async sync() {
    const scrapedItems = await this.scraper.scrape();

    const existing = await this.dbService
      .select({
        externalId: menuItems.externalId,
        name: menuItems.name,
        description: menuItems.description,
      })
      .from(menuItems);

    const existingByExternalId = new Map(
      existing.map((row) => [row.externalId, row]),
    );

    // re-embed only when the text that feeds the embedding changed
    const toEmbed: ScrapedMenuItem[] = [];
    const rest: ScrapedMenuItem[] = [];

    for (const item of scrapedItems) {
      const current = existingByExternalId.get(item.externalId);

      if (
        !current ||
        current.name !== item.name ||
        current.description !== item.description
      ) {
        toEmbed.push(item);
      } else {
        rest.push(item);
      }
    }

    // allergens live in their own tables, nutrition flattens onto the row
    const toRow = (item: ScrapedMenuItem) => ({
      externalId: item.externalId,
      name: item.name,
      description: item.description,
      category: item.category,
      price: item.price,
      ...item.nutrition,
    });

    const nutritionSet = {
      energyKcal: sql`excluded.energy_kcal`,
      fatG: sql`excluded.fat_g`,
      saturatedFatG: sql`excluded.saturated_fat_g`,
      carbsG: sql`excluded.carbs_g`,
      sugarG: sql`excluded.sugar_g`,
      proteinG: sql`excluded.protein_g`,
      saltG: sql`excluded.salt_g`,
    };

    if (toEmbed.length > 0) {
      const texts = toEmbed.map(
        (item) => `${item.name}\n${item.description ?? ''}`,
      );
      const embeddings = await this.embeddings.embedContent(texts);

      await this.dbService
        .insert(menuItems)
        .values(
          toEmbed.map((item, i) => ({
            ...toRow(item),
            embedding: embeddings[i],
          })),
        )
        .onConflictDoUpdate({
          target: menuItems.externalId,
          set: {
            name: sql`excluded.name`,
            description: sql`excluded.description`,
            category: sql`excluded.category`,
            price: sql`excluded.price`,
            embedding: sql`excluded.embedding`,
            ...nutritionSet,
          },
        });
    }

    // name/description unchanged — refresh metadata, keep the embedding
    if (rest.length > 0) {
      await this.dbService
        .insert(menuItems)
        .values(rest.map(toRow))
        .onConflictDoUpdate({
          target: menuItems.externalId,
          set: {
            category: sql`excluded.category`,
            price: sql`excluded.price`,
            ...nutritionSet,
          },
        });
    }

    await this.syncAllergens(scrapedItems);

    return {
      scraped: scrapedItems.length,
      embedded: toEmbed.length,
    };
  }

  // Rebuilds the allergen links for every scraped item: upsert the canonical
  // allergen names, then replace each item's junction rows.
  private async syncAllergens(items: ScrapedMenuItem[]) {
    if (items.length === 0) {
      return;
    }

    const namesByExternalId = new Map(
      items.map((item) => [
        item.externalId,
        [...new Set(item.allergens.flatMap(normalizeAllergens))],
      ]),
    );

    const allNames = [...new Set([...namesByExternalId.values()].flat())];

    if (allNames.length > 0) {
      await this.dbService
        .insert(allergens)
        .values(allNames.map((name) => ({ name })))
        .onConflictDoNothing();
    }

    const allergenRows =
      allNames.length > 0
        ? await this.dbService
            .select()
            .from(allergens)
            .where(inArray(allergens.name, allNames))
        : [];
    const allergenIdByName = new Map(
      allergenRows.map((row) => [row.name, row.id]),
    );

    const itemRows = await this.dbService
      .select({ id: menuItems.id, externalId: menuItems.externalId })
      .from(menuItems)
      .where(inArray(menuItems.externalId, [...namesByExternalId.keys()]));

    await this.dbService.delete(menuItemAllergens).where(
      inArray(
        menuItemAllergens.menuItemId,
        itemRows.map((row) => row.id),
      ),
    );

    const links = itemRows.flatMap((row) =>
      (namesByExternalId.get(row.externalId) ?? []).flatMap((name) => {
        const allergenId = allergenIdByName.get(name);
        return allergenId ? [{ menuItemId: row.id, allergenId }] : [];
      }),
    );

    if (links.length > 0) {
      await this.dbService.insert(menuItemAllergens).values(links);
    }
  }

  async askMenuQuestion(question: string) {
    return await this.ragService.ask(question);
  }
}
