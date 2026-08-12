import { expect, it } from 'vitest';

it('exposes the public api', async function () {
	expect(Object.keys(await import('../../src/index')).sort()).toEqual([
		'Markdown',
		'MarkdownAsync',
		'MarkdownHooks',
		'default',
		'defaultUrlTransform',
	]);
});
