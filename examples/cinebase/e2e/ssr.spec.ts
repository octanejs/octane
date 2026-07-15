import { test, expect } from './test.ts';

test('streams server content, adopts the search field, and preserves pre-hydration input', async ({
	page,
	baseURL,
}) => {
	if (baseURL === undefined) throw new Error('Cinebase E2E requires a base URL');

	const streamResponse = await fetch(`${baseURL}/`);
	expect(streamResponse.ok).toBe(true);
	if (streamResponse.body === null) throw new Error('Cinebase did not return a response body');
	const reader = streamResponse.body.getReader();
	const decoder = new TextDecoder();
	let streamedHtml = '';
	let sawCatalogBeforeEditorial = false;
	let sawEditorial = false;
	while (true) {
		const part = await reader.read();
		streamedHtml += decoder.decode(part.value, { stream: !part.done });
		if (!sawCatalogBeforeEditorial && streamedHtml.includes('Aurora Rising')) {
			expect(streamedHtml).not.toContain('Why quiet science fiction is having a loud year');
			sawCatalogBeforeEditorial = true;
		}
		if (streamedHtml.includes('Why quiet science fiction is having a loud year')) {
			sawEditorial = true;
		}
		if (part.done) break;
	}
	expect(sawCatalogBeforeEditorial).toBe(true);
	expect(sawEditorial).toBe(true);
	expect(streamedHtml).toContain('</html>');

	const [moonResponse, harborResponse] = await Promise.all([
		fetch(`${baseURL}/?q=moon`),
		fetch(`${baseURL}/?q=harbor`),
	]);
	const [moonHtml, harborHtml] = await Promise.all([moonResponse.text(), harborResponse.text()]);
	expect(moonHtml).toContain('Paper Moons');
	expect(moonHtml).not.toContain('Harbor Lights');
	expect(harborHtml).toContain('Harbor Lights');
	expect(harborHtml).not.toContain('Paper Moons');

	await page.goto('/?hydrateDelay=450', { waitUntil: 'commit' });
	const search = page.getByRole('searchbox', { name: 'Search titles' });
	await search.waitFor({ state: 'visible' });
	const serverSearch = await search.elementHandle();
	if (serverSearch === null) throw new Error('Cinebase server search field is missing');
	await search.fill('har');
	await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
	await expect(search).toHaveValue('har');
	const adopted = await search.evaluate(
		(element, serverElement) => element === serverElement,
		serverSearch,
	);
	expect(adopted).toBe(true);

	await search.fill('harbor');
	await expect(page).toHaveURL(/q=harbor/);
	await expect(page.getByRole('link', { name: 'Harbor Lights', exact: true })).toBeVisible();
});
