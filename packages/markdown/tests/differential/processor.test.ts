import { expect, it } from 'vitest';
import { processSync } from '../../src/processor';

it('matches pinned raw handling and filtering order', () => {
	const tree = processSync({
		children: '<b>raw</b>\n\n[unsafe](javascript:alert(1))',
		disallowedElements: ['p'],
		unwrapDisallowed: true,
	});
	expect(tree.children.map((node) => node.type)).toEqual([
		'text',
		'text',
		'text',
		'text',
		'element',
	]);
	expect(tree.children[0]).toEqual({ type: 'text', value: '<b>' });
	expect(tree.children[2]).toEqual({ type: 'text', value: '</b>' });
	expect(tree.children[4]).toMatchObject({
		type: 'element',
		tagName: 'a',
		properties: { href: '' },
	});

	expect(processSync({ children: '<b>raw</b>', skipHtml: true })).toMatchObject({
		children: [
			{
				type: 'element',
				tagName: 'p',
				children: [{ type: 'text', value: 'raw' }],
			},
		],
	});
});

it('passes exact element index and parent to allowElement', function () {
	const seen: Array<[string, number, string]> = [];
	const tree = processSync({
		children: 'one\n\n## two',
		allowElement(node, index, parent) {
			seen.push([node.tagName, index, parent?.type || 'none']);
			return node.tagName !== 'h2';
		},
	});
	expect(seen).toEqual([
		['p', 0, 'root'],
		['h2', 2, 'root'],
	]);
	expect(
		tree.children.map(function (node) {
			return node.type === 'element' ? node.tagName : node.type;
		}),
	).toEqual(['p', 'text']);
});
