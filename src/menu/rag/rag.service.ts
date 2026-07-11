import { Injectable } from '@nestjs/common';
import { EmbeddingService } from '../embedding/embedding.service';
import { DbService } from 'src/db/db.service';
import Anthropic from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import { cosineDistance, sql, gt, desc } from 'drizzle-orm';
import { menuItems } from 'src/db/schema';

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

    const hits = await this.dbService
      .select({
        name: menuItems.name,
        description: menuItems.description,
        category: menuItems.category,
        price: menuItems.price,
        similarity,
      })
      .from(menuItems)
      .where(gt(similarity, 0.4))
      .orderBy(desc(similarity))
      .limit(8);

    if (hits.length === 0) {
      return 'Sajnos nem találtam ilyet a heti menüben.';
    }

    const context = hits
      .map(
        (h) =>
          `- ${h.name} (${h.category}, ${h.price} Ft, ${h.description ? ': ' + h.description : ''}`,
      )
      .join('\n');

    const res = await this.client?.messages.create({
      max_tokens: 1024,
      model: 'claude-haiku-4-5',
      system:
        'Egy étterem ebédrendelő asszisztense vagy. KIZÁRÓLAG a megadott menüelemek alapján válaszolj, magyarul, tömören. Ha a kontextusban nincs válasz, mondd azt, hogy nem szerepel a heti menüben. Ne találj ki ételeket vagy árakat.',
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
