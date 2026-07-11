import { Body, Controller, Post } from '@nestjs/common';
import { MenuService } from './menu.service';
import { AskQuestionDto } from './dtos/ask-question.dto';

@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}
  @Post('sync')
  sync() {
    return this.menuService.sync();
  }

  @Post('ask')
  askQuestion(@Body() dto: AskQuestionDto) {
    return this.menuService.askMenuQuestion(dto.question);
  }
}
