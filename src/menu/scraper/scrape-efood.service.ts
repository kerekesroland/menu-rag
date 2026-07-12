import { Injectable } from '@nestjs/common';
import { chromium, Page } from 'playwright';

export interface ScrapedNutrition {
  energyKcal: string | null;
  fatG: string | null;
  saturatedFatG: string | null;
  carbsG: string | null;
  sugarG: string | null;
  proteinG: string | null;
  saltG: string | null;
}

export interface ScrapedMenuItem {
  externalId: string;
  name: string;
  description: string | null;
  category: string;
  price: string | null;
  // raw allergen phrases as printed on the site, e.g. "tejet", "glutént"
  allergens: string[];
  nutrition: ScrapedNutrition;
}

interface FoodDetails {
  // ingredients + net weight — stays in the description that gets embedded
  text: string;
  allergens: string[];
  nutritionRows: { label: string; value: string }[];
}

const EMPTY_NUTRITION: ScrapedNutrition = {
  energyKcal: null,
  fatG: null,
  saturatedFatG: null,
  carbsG: null,
  sugarG: null,
  proteinG: null,
  saltG: null,
};

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
        const results: Omit<ScrapedMenuItem, 'allergens' | 'nutrition'>[] = [];

        // the week's days in order — a .category holds one .food per day,
        // in the same order as these buttons
        const days = Array.from(
          document.querySelectorAll('.date-button[data-date]'),
        ).map((btn) => ({
          date: btn.getAttribute('data-date') ?? '',
          day: btn.querySelector('.date-button-day')?.textContent?.trim() ?? '',
        }));

        document.querySelectorAll('.category').forEach((category) => {
          const categoryName =
            category.querySelector('.category-code')?.textContent?.trim() ?? '';

          const foods = category.querySelectorAll('.food');

          foods.forEach((food, dayIndex) => {
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

            // only trust the index → day mapping when the counts line up
            const dayInfo =
              foods.length === days.length ? days[dayIndex] : undefined;
            const dayPrefix = dayInfo
              ? `Nap: ${dayInfo.day} (${dayInfo.date})\n`
              : '';

            // dietary/availability badges, e.g. Húsmentes, Kis adag
            const tags = Array.from(food.querySelectorAll('.food-bottom-tag'))
              .map((t) => t.textContent?.trim())
              .filter(Boolean);
            const tagLine = tags.length ? `\nCímkék: ${tags.join(', ')}` : '';

            results.push({
              externalId,
              name,
              description:
                `${dayPrefix}${description ?? ''}${tagLine}`.trim() || null,
              category: categoryName,
              price: match ? match[0].replace(',', '.') : null,
            });
          });
        });

        return results;
      });

      const detailsById = await this.scrapeFoodDetails(page);

      return items.map((item) => {
        const details = detailsById.get(item.externalId);
        if (!details) {
          return { ...item, allergens: [], nutrition: EMPTY_NUTRITION };
        }
        const base = item.description ? `${item.description}\n` : '';
        return {
          ...item,
          description: details.text
            ? `${base}${details.text}`
            : item.description,
          allergens: details.allergens,
          nutrition: this.parseNutrition(details.nutritionRows),
        };
      });
    } finally {
      await browser.close();
    }
  }

  // Ingredients, allergens and the nutrition table only enter the DOM while
  // hovering the "részletei" info button, so they are read one food at a time.
  private async scrapeFoodDetails(
    page: Page,
  ): Promise<Map<string, FoodDetails>> {
    const detailsById = new Map<string, FoodDetails>();
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

        const tooltip = page.locator('.tooltip-inner-text').last();
        await tooltip.waitFor({ state: 'visible', timeout: 3000 });

        const details = await tooltip.evaluate((root): FoodDetails => {
          const parts: string[] = [];
          const allergens: string[] = [];
          const nutritionRows: { label: string; value: string }[] = [];
          const children = Array.from(root.children);

          for (const child of children) {
            if (child.tagName === 'TABLE') {
              child.querySelectorAll('tbody tr').forEach((tr) => {
                const cells = tr.querySelectorAll('td');
                if (cells.length < 2) {
                  return;
                }
                const label = cells[0].textContent
                  ?.replace(/\u00a0/g, ' ')
                  .trim();
                const value = cells[1].textContent?.trim();
                if (label && value) {
                  nutritionRows.push({ label, value });
                }
              });
            } else if (child.tagName === 'P' && child !== children[0]) {
              // children[0] is the dish name, already scraped from the card
              const text = child.textContent?.replace(/\u00a0/g, ' ').trim();
              if (!text) {
                continue;
              }
              if (/^Nettó tömeg/i.test(text)) {
                parts.push(text);
                continue;
              }
              parts.push(`Összetevők: ${text}`);
              // allergens are the bold spans within the ingredient list
              child.querySelectorAll('b').forEach((b) => {
                const allergen = b.textContent?.replace(/[,\s]+$/, '').trim();
                if (allergen) {
                  allergens.push(allergen);
                }
              });
            }
          }

          return { text: parts.join('\n'), allergens, nutritionRows };
        });

        if (details.text || details.allergens.length) {
          detailsById.set(externalId, details);
        }
      } catch {
        // details are optional — a food without a tooltip must not fail the scrape
      }

      // move away so the tooltip closes before the next hover
      await page.mouse.move(0, 0);
      await page
        .locator('.tooltip-inner-text')
        .last()
        .waitFor({ state: 'hidden', timeout: 2000 })
        .catch(() => {});
    }

    return detailsById;
  }

  // Maps the tooltip's nutrition rows (e.g. "Energia: 450 kcal / 1880 kJ",
  // "amelyből cukrok: 4,2 g") onto the typed columns. Unknown labels are
  // ignored; order matters where one label is a substring of another.
  private parseNutrition(
    rows: { label: string; value: string }[],
  ): ScrapedNutrition {
    const nutrition: ScrapedNutrition = { ...EMPTY_NUTRITION };

    const LABELS: [RegExp, keyof ScrapedNutrition][] = [
      [/energia/i, 'energyKcal'],
      [/telített/i, 'saturatedFatG'],
      [/zsír/i, 'fatG'],
      [/cukr/i, 'sugarG'],
      [/szénhidrát/i, 'carbsG'],
      [/fehérje/i, 'proteinG'],
      [/só/i, 'saltG'],
    ];

    for (const { label, value } of rows) {
      const key = LABELS.find(([re]) => re.test(label))?.[1];
      if (!key || nutrition[key] !== null) {
        continue;
      }
      // energy rows often list kJ and kcal — prefer the kcal figure
      const kcal = value.match(/(\d+(?:[.,]\d+)?)\s*kcal/i);
      const num = kcal?.[1] ?? value.match(/\d+(?:[.,]\d+)?/)?.[0];
      if (num) {
        nutrition[key] = num.replace(',', '.');
      }
    }

    return nutrition;
  }
}
