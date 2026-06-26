import { test } from '@playwright/test';
test('probe', async ({ page }) => {
  await page.route('**/hacker-news.firebaseio.com/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/v0/topstories.json') return route.fulfill({ json: [101] });
    if (path === '/v0/item/101.json')
      return route.fulfill({ json: { id:101, type:'story', by:'alice', time:1700000000, title:'T', url:'https://example.com/octane', score:1, descendants:2, kids:[] }});
    return route.fulfill({ json: null });
  });
  await page.goto('/');
  await page.getByTestId('story-row').first().waitFor();
  const a = page.locator('a[href="https://example.com/octane"]').first();
  console.log('CLASSATTR:', await a.evaluate((el) => el.getAttribute('class')));
  console.log('ALL-COMMENTS-LINK:', await page.locator('[data-testid="comments-link"]').count());
  console.log('ALL-USER-LINK:', await page.locator('[data-testid="user-link"]').count());
  const row = page.getByTestId('story-row').first();
  console.log('ROW-COMMENTS-LINK:', await row.locator('[data-testid="comments-link"]').count());
  console.log('ROW-USER-LINK:', await row.locator('[data-testid="user-link"]').count());
  console.log('ROW-HTML:', await row.evaluate((el) => el.outerHTML));
});
