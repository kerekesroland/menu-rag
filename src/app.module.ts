import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbModule } from './db/db.module';
import { MenuModule } from './menu/menu.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DbModule, MenuModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
