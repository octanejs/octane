# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ssr.spec.ts >> SSR: rows arrive in the server HTML >> navigating to an item page works (SSR + hydrate)
- Location: e2e/ssr.spec.ts:77:2

# Error details

```
Error: write EPIPE
```

# Test source

```ts
  1  | import { test, expect, chromium, type Browser } from '@playwright/test';
  2  | 
  3  | // SSR proof. The mocked nav/feed/pagination specs run against the CLIENT-ONLY
  4  | // dev server (where `page.route()` can stub the HN Firebase API). This spec
  5  | // instead targets the dev SSR server for the TSRX app (`node server.mjs tsrx`, on
  6  | // :5194), which server-renders each route with its data resolved and dehydrated,
  7  | // then hydrates.
  8  | //
  9  | // The SSR server's fetches happen in Node, so Playwright can't stub them — this
  10 | // spec therefore uses LIVE Hacker News data and asserts PRESENCE (server-rendered
  11 | // rows exist), not exact stubbed counts.
  12 | //
  13 | // The key assertion uses a JavaScript-DISABLED context: with no client runtime to
  14 | // render anything, every [data-testid="story-row"] in the DOM came from the SERVER
  15 | // HTML — proving the page arrives server-rendered (not client-rendered).
  16 | //
  17 | // The .tsx app's SSR is blocked upstream (see the README "SSR & hydration" notes:
  18 | // `.tsx` boundaries are the `<Suspense>`/`<ErrorBoundary>` component forms, which
  19 | // the server compiler doesn't yet support — the TSRX app uses `@try`/`@pending`
  20 | // directives instead), so this spec runs for the tsrx project only.
  21 | 
  22 | // The TSRX SSR server.
  23 | const SSR_BASE = 'http://localhost:5194';
  24 | 
  25 | test.describe('SSR: rows arrive in the server HTML', () => {
  26 | 	// Only the TSRX app has a working SSR server; skip under the jsx project.
  27 | 	test.skip(({ baseURL }) => !baseURL?.endsWith('5192'), 'TSRX SSR server only');
  28 | 
  29 | 	test('home story rows are present with JavaScript disabled (server-rendered)', async () => {
  30 | 		// A fresh browser with JS turned OFF: nothing can client-render, so any rows
  31 | 		// present came straight from the server's HTML response.
  32 | 		const browser: Browser = await chromium.launch();
  33 | 		const context = await browser.newContext({ javaScriptEnabled: false });
  34 | 		try {
  35 | 			const page = await context.newPage();
  36 | 			await page.goto(SSR_BASE + '/', { waitUntil: 'domcontentloaded' });
  37 | 
  38 | 			// The server-rendered stories list and ≥1 row are in the static HTML.
  39 | 			await expect(page.getByTestId('stories-page')).toBeVisible();
  40 | 			const rows = page.getByTestId('story-row');
  41 | 			expect(await rows.count()).toBeGreaterThan(0);
  42 | 
  43 | 			// The dehydrated query cache is inlined for the client to hydrate from.
  44 | 			await expect(page.locator('#__octane_data')).toHaveCount(1);
  45 | 
  46 | 			// The header chrome is server-rendered too (not a client-only shell).
  47 | 			await expect(page.locator('header a[href="/newest"]')).toBeVisible();
  48 | 		} finally {
  49 | 			await context.close();
  50 | 			await browser.close();
  51 | 		}
  52 | 	});
  53 | 
  54 | 	test('the page hydrates and becomes interactive', async () => {
  55 | 		const browser: Browser = await chromium.launch();
  56 | 		const context = await browser.newContext(); // JS enabled
  57 | 		try {
  58 | 			const page = await context.newPage();
  59 | 			await page.goto(SSR_BASE + '/', { waitUntil: 'networkidle' });
  60 | 
  61 | 			// The server rows are adopted by hydration (still present after the client
  62 | 			// runtime takes over).
  63 | 			await expect(page.getByTestId('story-row').first()).toBeVisible();
  64 | 			expect(await page.getByTestId('story-row').count()).toBeGreaterThan(0);
  65 | 
  66 | 			// Interactive: a client-side feed navigation works post-hydration.
  67 | 			await page.locator('header a[href="/newest"]').click();
  68 | 			await expect(page).toHaveURL(/\/newest(\?page=1)?$/);
  69 | 			await expect(page.getByTestId('stories-page')).toHaveAttribute('data-feed', 'new');
  70 | 			expect(await page.getByTestId('story-row').count()).toBeGreaterThan(0);
  71 | 		} finally {
  72 | 			await context.close();
  73 | 			await browser.close();
  74 | 		}
  75 | 	});
  76 | 
  77 | 	test('navigating to an item page works (SSR + hydrate)', async () => {
  78 | 		const browser: Browser = await chromium.launch();
  79 | 		const context = await browser.newContext();
  80 | 		try {
  81 | 			const page = await context.newPage();
  82 | 			await page.goto(SSR_BASE + '/', { waitUntil: 'networkidle' });
  83 | 			await expect(page.getByTestId('story-row').first()).toBeVisible();
  84 | 
  85 | 			// Follow the first row's comments link to its /item/:id page.
  86 | 			const link = page.getByTestId('story-row').first().locator('a[href^="/item/"]').first();
  87 | 			const href = await link.getAttribute('href');
> 88 | 			await link.click();
     |    ^ Error: write EPIPE
  89 | 			await expect(page).toHaveURL(new RegExp(href!.replace(/\//g, '\\/')));
  90 | 			await expect(page.getByTestId('item-page')).toBeVisible();
  91 | 		} finally {
  92 | 			await context.close();
  93 | 			await browser.close();
  94 | 		}
  95 | 	});
  96 | });
  97 | 
```