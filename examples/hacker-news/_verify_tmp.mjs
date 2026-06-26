import { chromium } from '@playwright/test';

const targets = [
  { name: 'jsx', url: 'http://localhost:5191/' },
  { name: 'tsrx', url: 'http://localhost:5192/' },
];

const browser = await chromium.launch();
const out = {};

for (const t of targets) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console.error: ' + m.text());
  });

  await page.goto(t.url, { waitUntil: 'domcontentloaded' });

  // Capture early state: should show a skeleton, NOT "1. ..." text.
  let earlySkeletons = 0;
  let earlyHasOldLoadingText = false;
  try {
    await page.waitForSelector('[data-testid="row-skeleton"]', { timeout: 4000 });
    earlySkeletons = await page.locator('[data-testid="row-skeleton"]').count();
  } catch {}
  const bodyEarly = await page.evaluate(() => document.body.innerText);
  earlyHasOldLoadingText = /\b1\.\s*…|\b1\.\s*\.\.\./.test(bodyEarly);

  // Wait for real stories to render.
  await page.waitForSelector('[data-testid="story-row"]', { timeout: 15000 });
  // give it a moment to fill in
  await page.waitForTimeout(2000);

  const storyRows = await page.locator('[data-testid="story-row"]').count();
  const navTestids = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="nav-"]')).map((e) =>
      e.getAttribute('data-testid'),
    ),
  );
  const storyTitles = await page.locator('a.story-title').count();
  const commentsLinks = await page.locator('[data-testid="comments-link"]').count();
  const userLinks = await page.locator('[data-testid="user-link"]').count();
  const firstTitle = await page
    .locator('a.story-title')
    .first()
    .innerText()
    .catch(() => '(none)');
  const headerBg = await page.evaluate(() => {
    const h = document.querySelector('header');
    return h ? getComputedStyle(h).backgroundColor : '(no header)';
  });

  out[t.name] = {
    earlySkeletons,
    earlyHasOldLoadingText,
    storyRows,
    storyTitles,
    commentsLinks,
    userLinks,
    navTestids,
    firstTitle,
    headerBg,
    errors,
  };
  await page.close();
}

await browser.close();
console.log(JSON.stringify(out, null, 2));
