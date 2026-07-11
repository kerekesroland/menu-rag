import { Body, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DbService } from 'src/db/db.service';
import { menuItems } from 'src/db/schema';
import { EmbeddingService } from './embedding/embedding.service';
import {
  EfoodScraperService,
  ScrapedMenuItem,
} from './scraper/scrape-efood.service';
import { RagService } from './rag/rag.service';

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

    if (toEmbed.length > 0) {
      const texts = toEmbed.map(
        (item) => `${item.name}\n${item.description ?? ''}`,
      );
      const embeddings = await this.embeddings.embedContent(texts);

      await this.dbService
        .insert(menuItems)
        .values(
          toEmbed.map((item, i) => ({ ...item, embedding: embeddings[i] })),
        )
        .onConflictDoUpdate({
          target: menuItems.externalId,
          set: {
            name: sql`excluded.name`,
            description: sql`excluded.description`,
            category: sql`excluded.category`,
            price: sql`excluded.price`,
            embedding: sql`excluded.embedding`,
          },
        });
    }

    // name/description unchanged — refresh metadata, keep the embedding
    if (rest.length > 0) {
      await this.dbService
        .insert(menuItems)
        .values(rest)
        .onConflictDoUpdate({
          target: menuItems.externalId,
          set: {
            category: sql`excluded.category`,
            price: sql`excluded.price`,
          },
        });
    }

    return {
      scraped: scrapedItems.length,
      embedded: toEmbed.length,
    };
  }

  async askMenuQuestion(question: string) {
    return await this.ragService.ask(question);
  }
}
