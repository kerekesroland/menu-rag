import { Module } from '@nestjs/common';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { EfoodScraperService } from './scraper/scrape-efood.service';
import { EmbeddingService } from './embedding/embedding.service';
import { RagService } from './rag/rag.service';

@Module({
  controllers: [MenuController],
  providers: [MenuService, EfoodScraperService, EmbeddingService, RagService],
})
export class MenuModule {}
