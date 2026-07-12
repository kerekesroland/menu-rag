import { Injectable } from '@nestjs/common';
import { EmbeddingService } from '../embedding/embedding.service';
import { DbService } from 'src/db/db.service';
import Anthropic from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import {
  and,
  cosineDistance,
  desc,
  eq,
  gt,
  inArray,
  notExists,
  sql,
} from 'drizzle-orm';
import { allergens, menuItemAllergens, menuItems } from 'src/db/schema';
import { extractExcludedAllergens } from '../allergens.util';

const ANTHROPIC_API_KEY = 'ANTHROPIC_API_KEY';

@Injectable()
export class RagService {
  private readonly client: Anthropic | null = null;
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly dbService: DbService,
    private readonly configService: ConfigService,
  ) {
    this.client = new Anthropic({
      apiKey: this.configService.getOrThrow(ANTHROPIC_API_KEY),
    });
  }
  async ask(question: string): Promise<string> {
    const questionEmbedding = await this.embeddingService.embedQuery(question);

    const similarity = sql<number>`1 - (${cosineDistance(menuItems.embedding, questionEmbedding)})`;

    // "tejmentes" style constraints are negations — vector similarity cannot
    // express "does NOT contain X", so they become a hard SQL filter instead
    const excludedAllergens = extractExcludedAllergens(question);

    const filters = [gt(similarity, 0.4)];

    if (excludedAllergens.length > 0) {
      filters.push(
        notExists(
          this.dbService
            .select({ one: sql`1` })
            .from(menuItemAllergens)
            .innerJoin(
              allergens,
              eq(menuItemAllergens.allergenId, allergens.id),
            )
            .where(
              and(
                eq(menuItemAllergens.menuItemId, menuItems.id),
                inArray(allergens.name, excludedAllergens),
              ),
            ),
        ),
      );
    }

    const hits = await this.dbService
      .select({
        id: menuItems.id,
        name: menuItems.name,
        description: menuItems.description,
        category: menuItems.category,
        price: menuItems.price,
        energyKcal: menuItems.energyKcal,
        proteinG: menuItems.proteinG,
        similarity,
      })
      .from(menuItems)
      .where(and(...filters))
      .orderBy(desc(similarity))
      .limit(30);

    if (hits.length === 0) {
      return 'Sajnos nem találtam ilyet a heti menüben.';
    }

    const allergenRows = await this.dbService
      .select({
        menuItemId: menuItemAllergens.menuItemId,
        name: allergens.name,
      })
      .from(menuItemAllergens)
      .innerJoin(allergens, eq(menuItemAllergens.allergenId, allergens.id))
      .where(
        inArray(
          menuItemAllergens.menuItemId,
          hits.map((h) => h.id),
        ),
      );

    const allergensByItemId = new Map<number, string[]>();
    for (const row of allergenRows) {
      const list = allergensByItemId.get(row.menuItemId) ?? [];
      list.push(row.name);
      allergensByItemId.set(row.menuItemId, list);
    }

    const context = hits
      .map((h) => {
        const itemAllergens = allergensByItemId.get(h.id);
        const facts = [
          itemAllergens?.length
            ? `Allergének: ${itemAllergens.join(', ')}`
            : 'Allergének: nincs adat',
          h.energyKcal ? `${h.energyKcal} kcal` : null,
          h.proteinG ? `${h.proteinG} g fehérje` : null,
        ].filter(Boolean);
        return `- ${h.name} (${h.category}, ${h.price} Ft)${h.description ? ': ' + h.description : ''}\n  ${facts.join(' | ')}`;
      })
      .join('\n');

    const res = await this.client?.messages.create({
      max_tokens: 1024,
      model: 'claude-haiku-4-5',
      system:
        'Egy étterem ebédrendelő asszisztense vagy. KIZÁRÓLAG a megadott menüelemek alapján válaszolj, magyarul, tömören. Ha a kontextusban nincs válasz, mondd azt, hogy nem szerepel a heti menüben. Ne találj ki ételeket, árakat vagy tápértékeket. Allergénkérdésnél csak az "Allergének" sorra támaszkodj; ahol nincs adat, jelezd a bizonytalanságot.',
      messages: [
        {
          role: 'user',
          content: `Heti menü (releváns találatok):\n${context}\n\nKérdés: ${question}`,
        },
      ],
    });
    return res?.content[0].type === 'text' ? res.content[0].text : '';
  }
}
