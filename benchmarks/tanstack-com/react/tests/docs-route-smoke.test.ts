import assert from 'node:assert/strict';
import test from 'node:test';
import { publicLibraries } from '../src/libraries';

type ExpectedOutcome = 'ok' | 'not-found';

type SmokeCase = {
	expected: ExpectedOutcome;
	path: string;
};

const baseUrl = process.env.TANSTACK_DOCS_SMOKE_BASE_URL;

test(
	'docs legacy and canonical routes complete for every public library',
	{
		skip: baseUrl ? false : 'Set TANSTACK_DOCS_SMOKE_BASE_URL to run docs route smoke tests',
	},
	async () => {
		assert.ok(baseUrl);

		const cases = publicLibraries.flatMap((library): Array<SmokeCase> => {
			const defaultDocs = library.defaultDocs ?? 'overview';
			const legacyExpected = library.frameworks.includes('react') ? 'ok' : 'not-found';
			const paths: Array<SmokeCase> = [
				{
					path: `/${library.id}/latest/docs/react/overview`,
					expected: legacyExpected,
				},
				{
					path: `/${library.id}/${library.latestVersion}/docs/react/overview`,
					expected: legacyExpected,
				},
				{
					path: `/${library.id}/latest/docs/${defaultDocs}`,
					expected: 'ok',
				},
				{
					path: `/${library.id}/${library.latestVersion}/docs/${defaultDocs}`,
					expected: 'ok',
				},
			];

			if (library.frameworks.includes('react')) {
				paths.push({
					path: `/${library.id}/latest/docs/framework/react/overview`,
					expected: 'ok',
				});
				paths.push({
					path: `/${library.id}/${library.latestVersion}/docs/framework/react/overview`,
					expected: 'ok',
				});
			}

			return paths;
		});

		for (const smokeCase of cases) {
			const result = await fetchWithRedirects(new URL(smokeCase.path, baseUrl));

			assert.notEqual(result.status, 'timeout', `${smokeCase.path} timed out`);
			assert.notEqual(result.status, 'error', `${smokeCase.path} failed`);
			assert.notEqual(result.status, 500, `${smokeCase.path} returned 500`);

			if (smokeCase.expected === 'ok') {
				assert.equal(result.status, 200, `${smokeCase.path} should resolve`);
			} else {
				assert.equal(result.status, 404, `${smokeCase.path} should 404`);
			}
		}
	},
);

async function fetchWithRedirects(startUrl: URL) {
	let currentUrl = startUrl;

	for (let redirectCount = 0; redirectCount < 6; redirectCount++) {
		try {
			const response = await fetch(currentUrl, {
				redirect: 'manual',
				signal: AbortSignal.timeout(5_000),
			});
			await response.body?.cancel();

			if (response.status >= 300 && response.status < 400) {
				const location = response.headers.get('location');
				assert.ok(location, `${currentUrl.href} redirected without location`);
				currentUrl = new URL(location, currentUrl);
				continue;
			}

			return {
				status: response.status,
				url: currentUrl.href,
			};
		} catch (error) {
			if (error instanceof DOMException && error.name === 'TimeoutError') {
				return {
					status: 'timeout',
					url: currentUrl.href,
				};
			}

			return {
				status: 'error',
				url: currentUrl.href,
			};
		}
	}

	return {
		status: 'error',
		url: currentUrl.href,
	};
}
