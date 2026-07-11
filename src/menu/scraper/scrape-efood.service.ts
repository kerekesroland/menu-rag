import { Injectable } from '@nestjs/common';
import { chromium, Page } from 'playwright';

export interface ScrapedMenuItem {
  externalId: string;
  name: string;
  description: string | null;
  category: string;
  price: string | null;
}

@Injectable()
export class EfoodScraperService {
  async scrape(): Promise<ScrapedMenuItem[]> {
    const browser = await chromium.launch({
      headless: true,
    });

    const page = await browser.newPage();

    try {
      await page.goto('https://rendel.e-food.hu', {
        waitUntil: 'networkidle',
      });

      // Wait until Angular renders the menu
      await page.waitForSelector('.food', {
        timeout: 30000,
      });

      const items = await page.evaluate(() => {
        const results: ScrapedMenuItem[] = [];

        document.querySelectorAll('.category').forEach((category) => {
          const categoryName =
            category.querySelector('.category-code')?.textContent?.trim() ?? '';

          category.querySelectorAll('.food').forEach((food) => {
            const externalId = food.getAttribute('data-menu-item-id') ?? '';

            const name =
              food.querySelector('.food-top-title')?.textContent?.trim() ?? '';

            if (!externalId || !name) {
              return;
            }

            const description =
              food.querySelector('.food-top-details')?.textContent?.trim() ||
              null;

            const priceText =
              food.querySelector('.food-top-bottom-price')?.textContent ?? '';

            const match = priceText.match(/\d+(?:[.,]\d+)?/);

            results.push({
              externalId,
              name,
              description,
              category: categoryName,
              price: match ? match[0].replace(',', '.') : null,
            });
          });
        });

        return results;
      });

      const nutritionById = await this.scrapeNutrition(page);

      return items.map((item) => {
        const nutrition = nutritionById.get(item.externalId);
        if (!nutrition) {
          return item;
        }
        const base = item.description ? `${item.description}\n` : '';
        return {
          ...item,
          description: `${base}Tápértékek (1 adag): ${nutrition}`,
        };
      });
    } finally {
      await browser.close();
    }
  }

  // The nutrition table only enters the DOM while hovering the "részletei"
  // info button, so it has to be read one food at a time.
  private async scrapeNutrition(page: Page): Promise<Map<string, string>> {
    const nutritionById = new Map<string, string>();
    const foods = page.locator('.food');
    const count = await foods.count();

    for (let i = 0; i < count; i++) {
      const food = foods.nth(i);
      const externalId = await food.getAttribute('data-menu-item-id');
      if (!externalId) {
        continue;
      }

      // there is a sibling button with aria-label "... képe" (photo tooltip)
      const btn = food.locator(
        '.food-middle-left-btn[aria-label$="részletei"]',
      );
      if ((await btn.count()) === 0) {
        continue;
      }

      try {
        await btn.hover();

        const table = page.locator('.tooltip-table').last();
        await table.waitFor({ state: 'visible', timeout: 3000 });

        const nutrition = await table.evaluate((el) => {
          const parts: string[] = [];
          el.querySelectorAll('tbody tr').forEach((tr) => {
            const cells = tr.querySelectorAll('td');
            if (cells.length < 2) {
              return;
            }
            const label = cells[0].textContent?.replace(/\u00a0/g, ' ').trim();
            const value = cells[1].textContent?.trim();
            if (label && value) {
              parts.push(`${label}: ${value}`);
            }
          });
          return parts.join(', ');
        });

        if (nutrition) {
          nutritionById.set(externalId, nutrition);
        }
      } catch {
        // nutrition is optional — a food without a tooltip must not fail the scrape
      }

      // move away so the tooltip closes before the next hover
      await page.mouse.move(0, 0);
      await page
        .locator('.tooltip-table')
        .last()
        .waitFor({ state: 'hidden', timeout: 2000 })
        .catch(() => {});
    }

    return nutritionById;
  }
}
