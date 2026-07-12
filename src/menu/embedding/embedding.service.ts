import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpResponsePromise } from 'node_modules/voyageai/dist/cjs/core';
import { EmbedResponse, VoyageAIClient, VoyageAIError } from 'voyageai';

const VOYAGE_API_KEY = 'VOYAGE_API_KEY';

@Injectable()
export class EmbeddingService {
  private readonly client: VoyageAIClient | null = null;

  constructor(private readonly configService: ConfigService) {
    this.client = new VoyageAIClient({
      apiKey: this.configService.getOrThrow(VOYAGE_API_KEY),
    });
  }

  async embedContent(content: string[]): Promise<number[][]> {
    // Voyage caps a request at 1000 texts / 320K tokens — 128 keeps us
    // comfortably inside both
    const BATCH = 128;
    const out: number[][] = [];
    for (let i = 0; i < content.length; i += BATCH) {
      const res = await this.embedWithRetry(content.slice(i, i + BATCH));
      if (res?.data) out.push(...res.data.map((el) => el.embedding!));
    }
    return out;
  }

  private async embedWithRetry(
    input: string[],
    attempt = 0,
  ): Promise<HttpResponsePromise<EmbedResponse> | undefined> {
    try {
      return await this.client?.embed(
        {
          model: 'voyage-3.5',
          input,
          inputType: 'document',
        },
        { timeoutInSeconds: 180 },
      );
    } catch (err) {
      if (err instanceof VoyageAIError && attempt < 3) {
        // 429: wait out the rate-limit window; timeout (no status): brief pause
        const isRateLimit = err.statusCode === 429;
        const isTimeout = err.statusCode === undefined;
        if (isRateLimit || isTimeout) {
          const delay = isRateLimit ? 30_000 * (attempt + 1) : 5_000;
          await new Promise((r) => setTimeout(r, delay));
          return this.embedWithRetry(input, attempt + 1);
        }
      }
      throw err;
    }
  }

  async embedQuery(query: string): Promise<number[]> {
    const res = await this.client?.embed({
      model: 'voyage-3.5',
      input: [query],
      inputType: 'query',
    });

    if (!res?.data?.[0]?.embedding) return [];

    return res?.data?.[0]?.embedding;
  }
}
